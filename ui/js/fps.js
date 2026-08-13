/** 实时帧率 (FPS) 计算与显示 */
import { $ } from './core.js';

export function initFpsMeter() {
    const fpsEl = $('fpsDisplay');
    if (!fpsEl) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 0;

    function loop() {
        frameCount++;
        const now = performance.now();

        // 每过 500 毫秒刷新一次显示，避免数字跳动太快看不清
        if (now - lastTime >= 500) {
            fps = Math.round((frameCount * 1000) / (now - lastTime));

            // 动态颜色：流畅(>50)为绿色，一般(>30)为黄色，卡顿(<30)为红色
            let color = '#00ffc8';
            if (fps < 30) color = '#ff4d7a';
            else if (fps < 50) color = '#ffd700';

            fpsEl.style.color = color;
            fpsEl.textContent = `FPS: ${fps}`;

            frameCount = 0;
            lastTime = now;
        }

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
}
