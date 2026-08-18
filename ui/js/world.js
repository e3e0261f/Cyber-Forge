/**
 * 2D 赛博锻造大世界 - ui/js/world.js (极简场景总装配器)
 */
import { fx, initMotes, drawParticles } from './world/fx.js';
import { drawBackground, drawPipes, drawFurnace } from './world/environment.js';
import {
    drawPiston,
    drawRunicFloor,
    drawAnvil,
    drawApprentice,
    drawHammer,
    drawCrystals,
    drawBlueprint,
    setHammerTarget
} from './world/workshop.js';
import { playerPos } from './input.js';
import { textures } from './world/assets.js';
import { uiState } from './state.js';

export { fx, initMotes };

let screenShake = 0;
let flashLightIntensity = 0;

export function resetImpactFX() {
    screenShake = 0;
    flashLightIntensity = 0;
}

export function triggerStrikeImpact(isCrit, w, h) {
    setHammerTarget(0.42);
    screenShake = isCrit ? 9.0 : 4.0;
    // 仅保留低强度、局部暖光，避免连续锻造造成全屏白闪。
    flashLightIntensity = Math.min(0.28, flashLightIntensity + (isCrit ? 0.16 : 0.10));
    fx.triggerStrikeFX(isCrit, w, h);
}

export function drawWorld(ctx, w, h, now) {
    const time = now * 0.003;

    ctx.save();
    if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        screenShake -= 0.35;
    }

    // 1. 环境层
    drawBackground(ctx, w, h, time);
    drawPipes(ctx, w, h, time);
    drawFurnace(ctx, w, h, time);

    // 2. 构件与铁砧
    drawPiston(ctx, w, h, time);
    drawRunicFloor(ctx, w, h, time);
    drawAnvil(ctx, w, h, now, time);
    drawApprentice(ctx, w, h, time);
    drawHammer(ctx, w, h);
    drawCrystals(ctx, w, h, time);
    drawBlueprint(ctx, w, h, time);

    // 📍 绘制玩家 (MVP 版本：发光方块或简单小人)
    drawPlayer(ctx, now);

    drawPortal(ctx, w, h, now);

    // 3. 漫反射强光
    if (flashLightIntensity > 0) {
        const flashGrad = ctx.createRadialGradient(w * 0.5, h * 0.60, 25, w * 0.5, h * 0.60, w * 0.28);
        flashGrad.addColorStop(0, `rgba(255, 220, 150, ${flashLightIntensity * 0.18})`);
        flashGrad.addColorStop(0.55, `rgba(255, 140, 40, ${flashLightIntensity * 0.06})`);
        flashGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = flashGrad;
        ctx.fillRect(0, 0, w, h);
        flashLightIntensity *= 0.88;
        if (flashLightIntensity < 0.01) flashLightIntensity = 0;
    }

    // 4. 特效层
    drawParticles(ctx, w, h);

    ctx.restore();
}

let wasInPortal = false;
function drawPortal(ctx, w, h, now) {
    const portalX = w * 0.9;
    const portalY = h * 0.75;
    
    const distance = Math.hypot(playerPos.x - portalX, playerPos.y - portalY);
    
    ctx.save();
    ctx.translate(portalX, portalY);
    
    const pulse = Math.sin(now * 0.003) * 0.1 + 0.9;
    const grad = ctx.createRadialGradient(0, -20, 10, 0, -20, 70 * pulse);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -20, 35 * pulse, 70 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#fca5a5';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.ellipse(0, -20, 10, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    
    if (distance < 150) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText('地牢入口', 0, -110);
        ctx.font = '12px "Courier New", monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('靠近进入', 0, -90);
    }
    ctx.restore();

    if (distance < 60) {
        if (!wasInPortal) {
            if (!uiState.isOpen('dungeon')) {
                uiState.toggleModal('dungeon');
            }
            wasInPortal = true;
        }
    } else {
        wasInPortal = false;
    }
}

function drawPlayer(ctx, now) {
    ctx.save();
    ctx.translate(playerPos.x, playerPos.y);

    // 呼吸动画
    const bounce = Math.sin(now * 0.005) * 2;
    
    // 画一个赛博风光晕底座
    const grad = ctx.createRadialGradient(0, 10, 5, 0, 10, 25);
    grad.addColorStop(0, 'rgba(0, 255, 200, 0.4)');
    grad.addColorStop(1, 'rgba(0, 255, 200, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 15, 25, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 简单的修仙者/赛博主角 (用发光的几何体代替)
    ctx.fillStyle = '#00ffc8';
    ctx.shadowColor = '#00ffc8';
    ctx.shadowBlur = 10;
    
    if (textures.player) {
        const img = textures.player;
        const imgW = 80;
        const imgH = (img.height / img.width) * imgW;
        ctx.drawImage(img, -imgW / 2, -imgH + 15 + bounce, imgW, imgH);
    } else {
        // 身体
        ctx.fillRect(-10, -20 + bounce, 20, 30);
        
        // 头
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, -30 + bounce, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}
