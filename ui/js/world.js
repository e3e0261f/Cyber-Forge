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
    fx.clearTransient();
}

export function triggerStrikeImpact(isCrit, w, h) {
    setHammerTarget(0.42);
    // 🌟 P0-2 Juice: 弹簧式震动衰减 (普通 4px / 暴击 9px)
    screenShake = Math.max(isCrit ? 9.0 : 4.0, screenShake);
    // 仅保留低强度、局部暖光，避免连续锻造造成全屏白闪。
    flashLightIntensity = Math.min(0.28, flashLightIntensity + (isCrit ? 0.16 : 0.10));
    fx.triggerStrikeFX(isCrit, w, h);
}

/** ⛩️ 渡劫大震屏 (由 state.js 境界变化时调用) */
export function triggerBreakthroughJuice() {
    screenShake = 24;
    fx.triggerBreakthroughJuice();
}

// 🌟 P0-2 Juice: 监听 state.js 派发的渡劫事件 (解耦循环依赖)
if (typeof window !== 'undefined') {
    window.addEventListener('game:breakthrough', () => {
        triggerBreakthroughJuice();
    });
}

export function drawWorld(ctx, w, h, now) {
    const time = now * 0.003;

    ctx.save();
    if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        // 🌟 P0-2 Juice: 弹簧衰减 (渡劫强震时保持更久)
        screenShake *= (fx.breakthroughTick > 0) ? 0.93 : 0.86;
        if (screenShake < 0.5) screenShake = 0;
        if (fx.breakthroughTick > 0) fx.breakthroughTick--;
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
