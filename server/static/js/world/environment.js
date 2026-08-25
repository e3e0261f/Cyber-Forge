// 文件路径：ui/js/world/environment.js

/** 工坊环境系统：太古灵石神坛背景 (无损铺满，清除悬空旧构件) */
import { textures } from './assets.js';

export const bgMetrics = {
  x: 0, y: 0, w: 0, h: 0,
  get daisX() { return this.x + this.w * 0.5; },
  get daisY() { return this.y + this.h * 0.59; }
};

export function drawBackground(ctx, w, h, time) {
  if (!ctx || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

  if (!textures.bg) {
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const img = textures.bg;
  const imgW = (img.width && Number.isFinite(img.width) && img.width > 0) ? img.width : 1600;
  const imgH = (img.height && Number.isFinite(img.height) && img.height > 0) ? img.height : 900;
  const imgRatio = imgW / imgH;
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

  // 柔和暗角 (严格防御 non-finite)
  const cx = w * 0.5;
  const cy = h * 0.55;
  const r0 = Math.max(1, w * 0.25);
  const r1 = Math.max(r0 + 10, w * 0.75);

  if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r0) && Number.isFinite(r1)) {
    const vignette = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(2, 4, 8, 0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawPipes(ctx, w, h, time) {}
export function drawFurnace(ctx, w, h, time) {}
