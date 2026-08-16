/**
 * 天道锻造大师 v2.5.1 - 2D WebGL 锻造全息大世界
 * 还原：熔岩地脉 + 动力活塞 + 全息蓝图 + 黑金巨砧 + 符文剑胚 + 重锤打击冲击波
 */
import { snap, invoke } from './core.js';
import { layers, layout } from './engine.js';
import { isCurrentlyInCrit, resetLocalCycle } from './forge.js';

let worldContainer = null;
let anvilContainer = null;
let bladeGfx = null;
let bladeRuneGfx = null;
let hammerGfx = null;
let shockwaveContainer = null;
let crystalContainer = null;
let lavaGfx = null;
let hologramGfx = null;

let isReady = false;
let hammerAngle = -0.3; // 锤子自然悬垂角度
let hammerTargetAngle = -0.3;
let screenShake = 0;

// 冲击波环粒子池
let shockwaves = [];

export function initForgeWorld() {
    if (isReady || !layers.world) return;
    const PIXI = window.PIXI;

    worldContainer = new PIXI.Container();
    layers.world.addChild(worldContainer);

    // 1. 背景熔岩与地脉
    lavaGfx = new PIXI.Graphics();
    worldContainer.addChild(lavaGfx);

    // 2. 全息蓝图浮窗
    hologramGfx = new PIXI.Graphics();
    worldContainer.addChild(hologramGfx);

    // 3. 灵晶簇
    crystalContainer = new PIXI.Container();
    worldContainer.addChild(crystalContainer);

    // 4. 铁砧与剑胚容器（支持鼠标直接点击挥锤）
    anvilContainer = new PIXI.Container();
    anvilContainer.eventMode = 'static';
    anvilContainer.cursor = 'pointer';
    anvilContainer.on('pointerdown', handleManualStrike);
    worldContainer.addChild(anvilContainer);

    // 5. 砧面剑胚
    bladeGfx = new PIXI.Graphics();
    bladeRuneGfx = new PIXI.Graphics();
    anvilContainer.addChild(bladeGfx);
    anvilContainer.addChild(bladeRuneGfx);

    // 6. 重锤
    hammerGfx = new PIXI.Graphics();
    worldContainer.addChild(hammerGfx);

    // 7. 冲击波与特效层
    shockwaveContainer = new PIXI.Container();
    worldContainer.addChild(shockwaveContainer);

    // 注册主世界渲染 Ticker
    window.PIXI.Ticker.shared.add(updateWorld);

    buildStaticWorldElements();
    isReady = true;
    console.log("【2D 锻造大世界】全息场景构建完成，支持显卡高刷与直接点击！");
}

// 手动点击铁砧挥锤
async function handleManualStrike() {
    const isCrit = isCurrentlyInCrit();
    triggerHammerImpact(isCrit);
    resetLocalCycle();

    try {
        const t = await invoke('player_strike');
        if (t && window.applySnap) window.applySnap(t);
    } catch (_) {}
}

// 🌟 触发挥锤下砸与冲击波爆发
export function triggerHammerImpact(isCrit) {
    hammerTargetAngle = 0.45; // 瞬间砸向剑胚
    screenShake = isCrit ? 6 : 3;

    // 生成扩散冲击波光环
    const center = getAnvilCenter();
    shockwaves.push({
        x: center.x,
        y: center.y - 10,
        radius: 5,
        maxRadius: isCrit ? 70 : 40,
        alpha: 1.0,
        color: isCrit ? 0xff4d7a : 0xffd700,
        width: isCrit ? 3 : 2
    });
}

function getAnvilCenter() {
    const p = layout.midPanel;
    return {
        x: p.x + p.w * 0.5,
        y: p.y + 75
    };
}

// 构建场景静态艺术构件
function buildStaticWorldElements() {
    if (!crystalContainer) return;
    crystalContainer.removeChildren();
    const PIXI = window.PIXI;
    const p = layout.midPanel;

    // 左右两侧的蓝色天道灵晶
    const leftX = p.x + 25;
    const rightX = p.x + p.w - 25;
    const groundY = p.y + 110;

    drawCrystal(leftX, groundY, 0x00e5ff, 1.2);
    drawCrystal(leftX + 12, groundY + 5, 0x50f0ff, 0.8);
    drawCrystal(rightX, groundY, 0x00e5ff, 1.2);
    drawCrystal(rightX - 12, groundY + 5, 0x50f0ff, 0.8);
}

function drawCrystal(x, y, color, scale) {
    const PIXI = window.PIXI;
    const g = new PIXI.Graphics();
    g.poly([
        0, -25 * scale,
        8 * scale, -10 * scale,
        6 * scale, 5 * scale,
        -6 * scale, 5 * scale,
        -8 * scale, -10 * scale
    ])
    .fill({ color, alpha: 0.75 })
    .stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
    g.x = x;
    g.y = y;
    crystalContainer.addChild(g);
}

// 🌟 核心高刷世界循环
function updateWorld(ticker) {
    if (!isReady) return;
    const dt = ticker.deltaTime;
    const time = performance.now() * 0.003;
    const p = layout.midPanel;
    const center = getAnvilCenter();

    // --- 1. 屏幕微震 (Screen Shake) ---
    if (screenShake > 0) {
        worldContainer.x = (Math.random() - 0.5) * screenShake;
        worldContainer.y = (Math.random() - 0.5) * screenShake;
        screenShake -= 0.3 * dt;
        if (screenShake < 0) screenShake = 0;
    } else {
        worldContainer.x = 0;
        worldContainer.y = 0;
    }

    // --- 2. 绘制熔岩地脉与全息蓝图 ---
    lavaGfx.clear();
    // 底部熔岩微光池
    const lavaAlpha = 0.18 + Math.sin(time) * 0.06;
    lavaGfx.roundRect(p.x + 10, p.y + 115, p.w - 20, 12, 6)
    .fill({ color: 0xff4500, alpha: lavaAlpha });

    // 全息蓝图视窗 (右侧微型投影)
    hologramGfx.clear();
    const holoX = p.x + p.w - 70;
    const holoY = p.y + 15;
    hologramGfx.roundRect(holoX, holoY, 60, 40, 4)
    .fill({ color: 0x002b3d, alpha: 0.55 })
    .stroke({ width: 1, color: 0x00e5ff, alpha: 0.6 });
    // 蓝图中的小剑线框
    hologramGfx.moveTo(holoX + 10, holoY + 20).lineTo(holoX + 50, holoY + 20)
    .stroke({ width: 1.5, color: 0x00ffff, alpha: 0.8 });

    // --- 3. 绘制黑金天道铁砧 ---
    const anvilW = Math.min(180, p.w * 0.45);
    const anvilH = 36;
    const ax = center.x - anvilW / 2;
    const ay = center.y - 12;

    bladeGfx.clear();
    // 铁砧基座与阴影
    bladeGfx.roundRect(ax - 6, ay + anvilH - 6, anvilW + 12, 10, 3)
    .fill({ color: 0x080a0f, alpha: 0.95 });
    // 铁砧主体 (厚重黑金)
    bladeGfx.roundRect(ax, ay, anvilW, anvilH, 6)
    .fill({ color: 0x181c24 })
    .stroke({ width: 1.5, color: 0x4a5568, alpha: 0.8 });

    // --- 4. 砧上神兵剑胚与符文发光 ---
    const swordW = anvilW * 0.75;
    const swordH = 8;
    const sx = center.x - swordW / 2;
    const sy = ay + 4;

    const currentProg = snap.current ? (snap.current.progress || 0) : 0;
    const inCrit = isCurrentlyInCrit();

    // 剑胚底胎
    bladeGfx.roundRect(sx, sy, swordW, swordH, 2)
    .fill({ color: 0x2d3748 });

    // 随进度点亮的熔岩符文剑刃
    if (currentProg > 0) {
        const fillW = swordW * Math.min(1.0, currentProg);
        const bladeColor = inCrit ? 0xff4d7a : 0xff8c00;
        bladeGfx.roundRect(sx, sy, fillW, swordH, 2)
        .fill({ color: bladeColor, alpha: inCrit ? 0.95 : 0.85 });
    }

    // --- 5. 重锤旋转与复位物理 ---
    hammerAngle += (hammerTargetAngle - hammerAngle) * 0.25 * dt;
    if (hammerTargetAngle > -0.3) {
        hammerTargetAngle -= 0.12 * dt; // 迅速弹回蓄力姿态
    }

    hammerGfx.clear();
    const hx = center.x + 10;
    const hy = ay - 18;

    hammerGfx.x = hx;
    hammerGfx.y = hy;
    hammerGfx.rotation = hammerAngle;

    // 锤柄 (精钢)
    hammerGfx.roundRect(-4, -40, 8, 38, 2).fill({ color: 0x718096 });
    // 锤头 (重型黑金八角头)
    hammerGfx.roundRect(-16, -55, 32, 20, 3)
    .fill({ color: 0x1a202c })
    .stroke({ width: 1.5, color: 0xe2e8f0, alpha: 0.9 });

    // --- 6. 冲击波扩散光环 ---
    shockwaveContainer.removeChildren();
    const PIXI = window.PIXI;
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += 2.5 * dt;
        sw.alpha -= 0.04 * dt;

        if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
            shockwaves.splice(i, 1);
            continue;
        }

        const g = new PIXI.Graphics();
        g.circle(sw.x, sw.y, sw.radius)
        .stroke({ width: sw.width, color: sw.color, alpha: sw.alpha });
        shockwaveContainer.addChild(g);
    }
}
