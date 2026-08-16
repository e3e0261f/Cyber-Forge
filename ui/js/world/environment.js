// 文件路径：ui/js/world/environment.js

/** 工坊环境系统：太古灵石神坛背景 (无损铺满，清除悬空旧构件) */
import { textures } from './assets.js';

export const bgMetrics = {
    x: 0, y: 0, w: 0, h: 0,
    get daisX() { return this.x + this.w * 0.5; },
    get daisY() { return this.y + this.h * 0.59; }
};

export function drawBackground(ctx, w, h, time) {
    if (!textures.bg) {
        ctx.fillStyle = '#05070c';
        ctx.fillRect(0, 0, w, h);
        return;
    }

    const img = textures.bg;
    const imgRatio = img.width / img.height;
    const screenRatio = w / h;

    let rw, rh, ox, oy;
    if (screenRatio > imgRatio) {
        rw = w;
        rh = w / imgRatio;
        ox = 0;
        oy = (h - rh) / 2;
    } else {
        rh = h;
        rw = h * imgRatio;
        ox = (w - rw) / 2;
        oy = 0;
    }

    bgMetrics.x = ox;
    bgMetrics.y = oy;
    bgMetrics.w = rw;
    bgMetrics.h = rh;

    ctx.drawImage(img, ox, oy, rw, rh);

    // 柔和暗角
    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.55, w * 0.25, w * 0.5, h * 0.55, w * 0.75);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(2, 4, 8, 0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
}

export function drawPipes(ctx, w, h, time) {}
export function drawFurnace(ctx, w, h, time) {}
