import { uiState } from './state.js';

/** 通用全息弹窗边框与极光扫描特效 */
export function drawHoloModalFrame(ctx, mx, my, mw, mh, themeColor, title, time, modalId = null) {
    ctx.fillStyle = modalId && uiState.isMaximized(modalId) ? 'rgba(8, 12, 20, 0.88)' : 'rgba(8, 12, 20, 0.94)';
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 10); ctx.fill(); ctx.stroke();

    const cLen = 14;
    ctx.strokeStyle = themeColor; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(mx, my + cLen); ctx.lineTo(mx, my); ctx.lineTo(mx + cLen, my); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx + mw - cLen, my); ctx.lineTo(mx + mw, my); ctx.lineTo(mx + mw, my + cLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my + mh - cLen); ctx.lineTo(mx, my + mh); ctx.lineTo(mx + cLen, my + mh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx + mw - cLen, my + mh); ctx.lineTo(mx + mw, my + mh); ctx.lineTo(mx + mw, my + mh - cLen); ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(mx + 4, my + 4, mw - 8, 40);

    ctx.fillStyle = themeColor; ctx.font = 'bold 15px sans-serif'; ctx.fillText(title, mx + 20, my + 28);
    ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 13px sans-serif';
    if (modalId) {
        ctx.fillText(uiState.isMaximized(modalId) ? '❐' : '□', mx + mw - 52, my + 28);
    }
    ctx.fillText('✕', mx + mw - 26, my + 28);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx + 15, my + 46); ctx.lineTo(mx + mw - 15, my + 46); ctx.stroke();
}