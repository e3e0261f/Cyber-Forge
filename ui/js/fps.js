/** 实时帧率 (FPS) 无限制真实统计 */
import { $ } from './core.js';

export function initFpsMeter() {
    const fpsEl = $('fpsDisplay');
    if (!fpsEl) return;

    let frameCount = 0;
    let lastTime = performance.now();

    function update() {
        frameCount++;
        const now = performance.now();
        const delta = now - lastTime;

        // 每过 250 毫秒统计一次当前的瞬时极限帧率
        if (delta >= 250) {
            const fps = Math.round((frameCount * 1000) / delta);

            let color = '#00ffc8';
            if (fps < 30) color = '#ff4d7a';
            else if (fps < 60) color = '#ffd700';

            fpsEl.style.color = color;
            // 真实展示不设上限的帧率数字
            fpsEl.textContent = `FPS: ${fps}`;

            frameCount = 0;
            lastTime = now;
        }

        // 使用 setTimeout(..., 0) 或者 requestAnimationFrame 压榨极限渲染
        requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}
