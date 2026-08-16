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

export { fx, initMotes };

let screenShake = 0;
let flashLightIntensity = 0;

export function triggerStrikeImpact(isCrit, w, h) {
    setHammerTarget(0.42);
    screenShake = isCrit ? 9.0 : 4.0;
    flashLightIntensity = isCrit ? 1.0 : 0.6;
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

    // 3. 漫反射强光
    if (flashLightIntensity > 0) {
        const flashGrad = ctx.createRadialGradient(w * 0.5, h * 0.60, 20, w * 0.5, h * 0.60, w * 0.45);
        flashGrad.addColorStop(0, `rgba(255, 240, 200, ${flashLightIntensity * 0.4})`);
        flashGrad.addColorStop(0.4, `rgba(255, 140, 40, ${flashLightIntensity * 0.15})`);
        flashGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = flashGrad;
        ctx.fillRect(0, 0, w, h);
        flashLightIntensity -= 0.08;
    }

    // 4. 特效层
    drawParticles(ctx, w, h);

    ctx.restore();
}
