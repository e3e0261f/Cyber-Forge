import { uiState } from './state.js';
import { drawHoloModalFrame } from './hud.js';
import { DungeonGenerator } from './world/dungeon.js';
import { getModalBounds } from './input.js';

let pixiApp = null;
let tilemap = null;
let spineBoy = null;
let dungeonMap = null;
const TILE_SIZE = 32;
const MAP_WIDTH = 40;
const MAP_HEIGHT = 40;
let initialized = false;

let player = { 
    x: 1, 
    y: 1, 
    path: [], // array of {x, y}
    state: 'idle',
    speed: 4 // tiles per second
};

let monster = {
    x: 5,
    y: 5,
    path: [],
    speed: 2, // slower than player
    graphics: null,
    lastPathCalc: 0
};

// Simple A* Pathfinding
function findPath(startX, startY, goalX, goalY, map) {
    const openSet = [{x: startX, y: startY, g: 0, f: 0, parent: null}];
    const closedSet = new Set();
    const hash = (x, y) => `${x},${y}`;
    
    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        
        if (current.x === goalX && current.y === goalY) {
            const path = [];
            let curr = current;
            while (curr.parent) {
                path.unshift({x: curr.x, y: curr.y});
                curr = curr.parent;
            }
            return path;
        }
        
        closedSet.add(hash(current.x, current.y));
        
        const neighbors = [
            {x: current.x, y: current.y - 1},
            {x: current.x, y: current.y + 1},
            {x: current.x - 1, y: current.y},
            {x: current.x + 1, y: current.y}
        ];
        
        for (const n of neighbors) {
            if (n.x < 0 || n.x >= MAP_WIDTH || n.y < 0 || n.y >= MAP_HEIGHT) continue;
            if (map[n.y][n.x] !== 0) continue; // 1 is wall
            if (closedSet.has(hash(n.x, n.y))) continue;
            
            const g = current.g + 1;
            const h = Math.abs(n.x - goalX) + Math.abs(n.y - goalY);
            const f = g + h;
            
            const existing = openSet.find(o => o.x === n.x && o.y === n.y);
            if (existing && g >= existing.g) continue;
            
            if (existing) {
                existing.g = g;
                existing.f = f;
                existing.parent = current;
            } else {
                openSet.push({x: n.x, y: n.y, g, f, parent: current});
            }
        }
    }
    return [];
}

async function initPixi() {
    if (initialized) return;
    initialized = true;

    try {
        pixiApp = new PIXI.Application();
        await pixiApp.init({
            width: 800,
            height: 600,
            backgroundAlpha: 0,
            autoStart: false,
            clearBeforeRender: true
        });
        
        const gen = new DungeonGenerator(MAP_WIDTH, MAP_HEIGHT);
        dungeonMap = gen.generate();
        
        // Draw tiles using Graphics instead of tilemap for simplicity and reliability
        const mapGraphics = new PIXI.Graphics();
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (dungeonMap[y][x] === 1) {
                    mapGraphics.fill(0x1e293b); // Wall color
                    mapGraphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    mapGraphics.stroke({ width: 1, color: 0x334155 });
                } else {
                    mapGraphics.fill(0x334155); // Floor color
                    mapGraphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    mapGraphics.stroke({ width: 1, color: 0x475569 });
                }
            }
        }
        pixiApp.stage.addChild(mapGraphics);

        // Init spineboy
        if (typeof spine !== 'undefined' && PIXI.Assets) {
            await PIXI.Assets.load({
                alias: 'spineboyData',
                src: 'assets/spineboy/spineboy-pro.json'
            });
            await PIXI.Assets.load({
                alias: 'spineboyAtlas',
                src: 'assets/spineboy/spineboy.atlas'
            });
            
            spineBoy = spine.Spine.from('spineboyData', 'spineboyAtlas');
            spineBoy.scale.set(0.12);
            spineBoy.state.setAnimation(0, 'idle', true);
            pixiApp.stage.addChild(spineBoy);
        } else {
            // Fallback player marker if spine fails
            spineBoy = new PIXI.Graphics();
            spineBoy.fill(0xef4444);
            spineBoy.circle(0, -16, 12);
            pixiApp.stage.addChild(spineBoy);
        }

        // Monster graphics (simple red square for now)
        monster.graphics = new PIXI.Graphics();
        monster.graphics.fill(0xef4444);
        monster.graphics.rect(-TILE_SIZE/2, -TILE_SIZE, TILE_SIZE, TILE_SIZE);
        pixiApp.stage.addChild(monster.graphics);

        // Set start position
        let foundPlayer = false;
        let foundMonster = false;
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (dungeonMap[y][x] === 0) {
                    if (!foundPlayer) {
                        player.x = x;
                        player.y = y;
                        spineBoy.x = x * TILE_SIZE + TILE_SIZE/2;
                        spineBoy.y = y * TILE_SIZE + TILE_SIZE;
                        foundPlayer = true;
                    } else if (!foundMonster && Math.hypot(x - player.x, y - player.y) > 10) {
                        monster.x = x;
                        monster.y = y;
                        monster.graphics.x = x * TILE_SIZE + TILE_SIZE/2;
                        monster.graphics.y = y * TILE_SIZE + TILE_SIZE;
                        foundMonster = true;
                    }
                }
            }
        }
    } catch (err) {
        console.error("Pixi/Spine initialization failed:", err);
    }
}

let lastTime = performance.now();

function updateDungeon() {
    if (!pixiApp || !spineBoy) return;
    
    const now = performance.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;
    
    if (player.path.length > 0) {
        const target = player.path[0];
        const dist = Math.hypot(target.x - player.x, target.y - player.y);
        const step = player.speed * delta;
        
        if (dist <= step) {
            player.x = target.x;
            player.y = target.y;
            player.path.shift();
        } else {
            player.x += ((target.x - player.x) / dist) * step;
            player.y += ((target.y - player.y) / dist) * step;
        }
        
        if (player.state !== 'run') {
            player.state = 'run';
            if (spineBoy.state) spineBoy.state.setAnimation(0, 'run', true);
        }
        
        // Face direction
        if (target.x > player.x && spineBoy.scale.x < 0) {
            spineBoy.scale.x *= -1;
        } else if (target.x < player.x && spineBoy.scale.x > 0) {
            spineBoy.scale.x *= -1;
        }
        
    } else {
        if (player.state !== 'idle') {
            player.state = 'idle';
            if (spineBoy.state) spineBoy.state.setAnimation(0, 'idle', true);
        }
    }
    
    spineBoy.x = player.x * TILE_SIZE + TILE_SIZE/2;
    spineBoy.y = player.y * TILE_SIZE + TILE_SIZE;
    
    // Camera follow
    pixiApp.stage.x = 400 - spineBoy.x;
    pixiApp.stage.y = 300 - spineBoy.y + 50; // offset a bit
    
    if (spineBoy.state) {
        spineBoy.state.update(delta);
    }

    // Monster AI Update (A* Pathfinding to Player)
    if (now - monster.lastPathCalc > 1000) { // Recalculate every 1s
        const mx = Math.round(monster.x);
        const my = Math.round(monster.y);
        const px = Math.round(player.x);
        const py = Math.round(player.y);
        if (Math.hypot(px - mx, py - my) < 15) { // Agro radius
            monster.path = findPath(mx, my, px, py, dungeonMap);
        } else {
            monster.path = [];
        }
        monster.lastPathCalc = now;
    }

    if (monster.path && monster.path.length > 0) {
        const target = monster.path[0];
        const dist = Math.hypot(target.x - monster.x, target.y - monster.y);
        const step = monster.speed * delta;
        
        if (dist <= step) {
            monster.x = target.x;
            monster.y = target.y;
            monster.path.shift();
        } else {
            monster.x += ((target.x - monster.x) / dist) * step;
            monster.y += ((target.y - monster.y) / dist) * step;
        }
    }

    if (monster.graphics) {
        monster.graphics.x = monster.x * TILE_SIZE + TILE_SIZE/2;
        monster.graphics.y = monster.y * TILE_SIZE + TILE_SIZE;
    }
    
    pixiApp.render();
}

export function drawDungeonModal(ctx, w, h, time) {
    const bounds = getModalBounds('dungeon', w, h);
    const { mx, my, mw, mh } = bounds;
    
    drawHoloModalFrame(ctx, mx, my, mw, mh, '#ef4444', '⚔️ 地牢探索 (Rogue-like 试验区)', time, 'dungeon');
    
    if (!initialized) {
        initPixi();
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '14px sans-serif';
        ctx.fillText('正在构建随机地牢与角色骨骼...', mx + mw/2 - 100, my + mh/2);
        return;
    }
    
    if (pixiApp && pixiApp.canvas) {
        updateDungeon();
        ctx.drawImage(pixiApp.canvas, mx + 20, my + 30, 800, 600);
    }
}

export function handleDungeonClick(mouseX, mouseY) {
    if (!pixiApp || !dungeonMap) return;
    
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bounds = getModalBounds('dungeon', w, h);
    
    // content area offset: 20 padding left, 30 padding top
    const canvasX = mouseX - (bounds.mx + 20);
    const canvasY = mouseY - (bounds.my + 30);
    
    if (canvasX >= 0 && canvasX < 800 && canvasY >= 0 && canvasY < 600) {
        const worldX = canvasX - pixiApp.stage.x;
        const worldY = canvasY - pixiApp.stage.y;
        
        const tileX = Math.floor(worldX / TILE_SIZE);
        const tileY = Math.floor(worldY / TILE_SIZE);
        
        if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
            if (dungeonMap[tileY][tileX] === 0) { // navigable
                const startX = Math.round(player.x);
                const startY = Math.round(player.y);
                const path = findPath(startX, startY, tileX, tileY, dungeonMap);
                if (path.length > 0) {
                    player.path = path;
                }
            }
        }
    }
}
