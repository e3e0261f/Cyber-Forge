/*
 * 模块功能: 藏宝阁拍卖大厅 (全量 600+ 拍品平滑滚轮浏览)
 * 修改时间: 2026-08-16 20:05
 */

import { gameState, uiState } from './state.js';
import { drawHoloModalFrame } from './hud.js';
import { getModalBounds } from './input.js';

export let auctionScrollY = 0;
export let auctionMaxScroll = 0;
export let auctionHoveredLot = null;

export function scrollAuction(deltaY) {
    auctionScrollY = Math.max(0, Math.min(auctionMaxScroll, auctionScrollY + deltaY * 0.8));
}

export function drawAuctionModal(ctx, w, h, time) {
    if (!uiState.isOpen('auction')) return;

    const bounds = getModalBounds('auction', w, h);
    const { mx, my, mw, mh } = bounds;

    const lots = gameState.lots || [];
    drawHoloModalFrame(ctx, mx, my, mw, mh, '#e0a050', `【藏宝阁拍卖大厅】 拍品 ${lots.length}/${gameState.max_pavilion || 20} [E]扩`, time);

    const listX = mx + 16;
    const listY = my + 54;
    const itemW = (mw - 44) / 2;
    const itemH = 44;
    const gap = 8;

    const clipW = mw - 24;
    const clipH = mh - 85;

    const totalRows = Math.ceil(lots.length / 2);
    const contentH = totalRows * (itemH + gap);
    auctionMaxScroll = Math.max(0, contentH - clipH);

    auctionHoveredLot = null;

    if (lots.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('藏宝阁暂无拍品上架，按 [F] 即可从锦囊上架神兵！', mx + 30, listY + 30);
        return;
    }

    // 🌟 视口硬件裁切
    ctx.save();
    ctx.beginPath();
    ctx.rect(listX - 2, listY, clipW, clipH);
    ctx.clip();

    for (let i = 0; i < lots.length; i++) {
        const col = i % 2, row = Math.floor(i / 2);
        const lx = listX + col * (itemW + 10);
        const ly = listY - auctionScrollY + row * (itemH + gap);

        // 剔除视口外节点
        if (ly + itemH < listY || ly > listY + clipH) continue;

        const lot = lots[i];
        ctx.fillStyle = lot.sold ? 'rgba(30, 41, 59, 0.35)' : 'rgba(18, 24, 38, 0.85)';
        ctx.strokeStyle = lot.color ? `${lot.color}66` : '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(lx, ly, itemW, itemH, 4);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = lot.color || '#e2e8f0';
        ctx.font = 'bold 11px sans-serif';
        const tag = lot.sold ? '[成交]' : lot.waiting ? '[候场]' : '[竞拍]';
        ctx.fillText(`${tag} ${lot.name}`, lx + 8, ly + 16);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`现价 ${lot.bid} · 估 ${lot.fair} · ${lot.time}s`, lx + 8, ly + 34);

        // 🌟 鼠标悬停检测（供 hud tooltip 使用）
        if (uiState.mouseX >= lx && uiState.mouseX <= lx + itemW &&
            uiState.mouseY >= ly && uiState.mouseY <= ly + itemH) {
            auctionHoveredLot = { lot, x: lx + itemW + 8, y: ly };
        }
    }

    ctx.restore();

    // 🌟 滑块
    if (auctionMaxScroll > 0) {
        const trackH = clipH;
        const thumbH = Math.max(24, (clipH / contentH) * trackH);
        const thumbY = listY + (auctionScrollY / auctionMaxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(224, 160, 80, 0.6)';
        ctx.beginPath();
        ctx.roundRect(mx + mw - 10, thumbY, 4, thumbH, 2);
        ctx.fill();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText('滚轮可上下滑动浏览全部拍品 | 倒计时零落槌 · 阶梯阻尼', mx + 16, my + mh - 12);
}
