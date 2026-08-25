import { gameState, uiState } from './state.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { getModalBounds } from './input.js';

export let logsScrollY = 0;
export let logsMaxScroll = 0;
let logsStickBottom = true;

export function scrollLogs(deltaY) {
    logsScrollY = Math.max(0, Math.min(logsMaxScroll, logsScrollY + deltaY * 0.8));
    logsStickBottom = logsScrollY >= logsMaxScroll - 1;
}

export function setLogsScroll(value) {
    logsMaxScroll = Math.max(0, value);
    logsStickBottom = logsScrollY >= logsMaxScroll - 1;
}

export function drawLogsModal(ctx, w, h, time) {
    if (!uiState.isOpen('logs')) return;
    const bounds = getModalBounds('logs', w, h);
    const { mx, my, mw, mh } = bounds;

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#a855f7', '【天道纪事 · 宗门日志】', time);

    const logs = gameState.logs || [];
    const listX = mx + 16, listY = my + 54, lineH = 20, clipW = mw - 24, clipH = mh - 85;
    const contentH = Math.max(lineH, logs.length * lineH);
    logsMaxScroll = Math.max(0, contentH - clipH);

    if (logsStickBottom) logsScrollY = logsMaxScroll;
    logsScrollY = Math.max(0, Math.min(logsMaxScroll, logsScrollY));

    if (logs.length === 0) {
        ctx.fillStyle = '#64748b'; ctx.font = '13px sans-serif';
        ctx.fillText('暂无纪事。锻造、渡劫与拍卖会写入此处。', mx + 30, listY + 30);
        return;
    }

    ctx.save(); ctx.beginPath(); ctx.rect(listX - 2, listY, clipW, clipH); ctx.clip();
    for (let i = 0; i < logs.length; i++) {
        const ly = listY - logsScrollY + i * lineH + 14;
        if (ly < listY - 4 || ly > listY + clipH + 4) continue;
        ctx.fillStyle = '#cbd5e1'; ctx.font = '11px monospace'; ctx.fillText(logs[i], mx + 20, ly);
    }
    ctx.restore();

    if (logsMaxScroll > 0) {
        const trackH = clipH, thumbH = Math.max(24, (clipH / contentH) * trackH);
        const thumbY = listY + (logsScrollY / logsMaxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
        ctx.beginPath(); ctx.roundRect(mx + mw - 11, listY, 6, trackH, 3); ctx.fill();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
        ctx.beginPath(); ctx.roundRect(mx + mw - 11, thumbY, 6, thumbH, 3); ctx.fill();
    }

    ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
    ctx.fillText(`共 ${logs.length} 条 · 滚轮浏览全部纪事`, mx + 16, my + mh - 12);
}