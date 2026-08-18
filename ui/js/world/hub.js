/** 顶部 HUD (去除了多余协议按钮) + 底部操作栏 + 全息弹窗 */
import { gameState } from './state.js';
import { formatNum } from './core.js';

export const hudState = {
    isInspectModalOpen: false,
    fps: 60,
    frameCount: 0,
    lastFpsTime: performance.now(),

    updateFps(now) {
        this.frameCount++;
        if (now - this.lastFpsTime >= 500) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }
};

export function drawHUD(ctx, w, h, now) {
    hudState.updateFps(now);

    // 1. 顶部 HUD
    ctx.fillStyle = 'rgba(10, 14, 22, 0.94)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(16, 12, w - 32, 44, 8);
    ctx.fill(); ctx.stroke();

    // 铆钉
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(24, 20, 2.5, 0, Math.PI * 2);
    ctx.arc(w - 24, 20, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('【天道锻造大师】', 34, 39);

    // 🌟 实时数值自动格式化 (随后端真实变动)
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#c89664';
    ctx.fillText(`铜钱: ${formatNum(gameState.copper)}`, 180, 39);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`金币: ${formatNum(gameState.coins)}`, 310, 39);
    ctx.fillStyle = '#00ffc8';
    ctx.fillText(`仙玉: ${formatNum(gameState.jade)}`, 450, 39);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`LV.${gameState.level} ${gameState.hammer_name}`, 580, 39);
    ctx.fillStyle = '#ff4d7a';
    ctx.fillText(`完美QTE: ${Number(gameState.forge_qte_hits || 0).toFixed(1)}`, 740, 39);

    // 2. 底部快捷栏
    const y = h - 36;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.95)';
    ctx.fillRect(0, y, w, 36);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(0, y, w, 36);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('【操作】空格/点击铁砧: 挥锤 | 点击全息蓝图: 查看神兵出生证 | U/W/N/R/D/E: 狂飙升级 | K: 挂机锤', 20, y + 22);

    let fpsColor = '#00ffc8';
    if (hudState.fps < 30) fpsColor = '#ff4d7a';
    else if (hudState.fps < 50) fpsColor = '#ffd700';
    ctx.fillStyle = fpsColor;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`FPS: ${hudState.fps}`, w - 85, y + 22);

    // 3. 全息四维出生证明弹窗
    if (hudState.isInspectModalOpen) {
        drawInspectModal(ctx, w, h);
    }
}

function drawInspectModal(ctx, w, h) {
    ctx.fillStyle = 'rgba(2, 4, 8, 0.85)';
    ctx.fillRect(0, 0, w, h);

    const mw = Math.min(480, w * 0.85);
    const mh = 320;
    const mx = w * 0.5 - mw / 2;
    const my = h * 0.5 - mh / 2;

    ctx.fillStyle = '#0b111a';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 12);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('庚金·长剑 ·【秋水长天】', mx + 24, my + 38);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText('品质: [史诗]  |  锋锐: 100  |  五行: 庚金', mx + 24, my + 60);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(mx + 20, my + 75); ctx.lineTo(mx + mw - 20, my + 75);
    ctx.stroke();

    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('📜【天道出生证明 (四维指纹)】', mx + 24, my + 105);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText('• 诞生时辰：甲辰年 · 壬申月 · 庚戌日 · 子时三刻', mx + 28, my + 132);
    ctx.fillText('• 归属地轴：离火九五 · 阳极之位 (东经121.5° 北纬31.2°)', mx + 28, my + 155);
    ctx.fillText('• 始祖铸匠：道友「纯阳真仙」 (铸剑始祖)', mx + 28, my + 178);
    ctx.fillText('• 天道印记：[玄之又玄 · 众妙之门] (取自《道德经》第一章)', mx + 28, my + 201);
    ctx.fillText('• 铭文短码：#Z7kQ-9mA3F2 (不可篡改64位哈希)', mx + 28, my + 224);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(mx + 20, my + 245); ctx.lineTo(mx + mw - 20, my + 245);
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('💰 当前估价：18.50M 金币  |  历史落槌：14 次成交', mx + 24, my + 275);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText('(点击任意空白处关闭弹窗)', mx + mw - 160, my + 300);
}
