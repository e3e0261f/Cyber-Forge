/*
 * 模块功能: 顶部 HUD、底部快捷操作栏与各模块全局渲染总闸 (轻量瘦身版)
 * 文件路径: ui/js/hud.js
 */

import { gameState, uiState } from './state.js';
import { formatNum } from './core.js';
import { gameConfig } from './config.js';
import { isAutoStrikeActive, getModalBounds } from './input.js';
import { drawStashModal, stashHoveredItem, drawDropConfirmModal } from './stash-view.js';
import { drawAuctionModal, auctionHoveredLot } from './auction-view.js';
import { drawApprenticeModal } from './apprentice-view.js';
import { drawQuestModal } from './quest-view.js';
import { drawDebugModal, drawDebugOverlays } from './debug-view.js';
import { isDevMode } from './config.js';
import { getWeightSpeedMultiplier } from './input.js';
import { drawMinimap } from './minimap-view.js';
import { drawWorldMapModal } from './world-map.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { drawItemTooltip } from './tooltip-view.js';
import { contextMenuState, drawContextMenu, openItemContextMenu, closeContextMenu, hitTestContextMenu } from './context-menu.js';
import { drawLogsModal, scrollLogs, setLogsScroll, logsScrollY, logsMaxScroll } from './logs-view.js';
import { drawBodyModal, scrollBody, bodyScrollY, bodyMaxScroll } from './body-view.js';
import { drawInspectModal, inspectState } from './inspect-view.js';
import { drawSettingsModal, settingsState } from './settings-view.js';
import { drawTradeModal } from './trade-view.js';
import { drawBankModal } from './bank-view.js';

export { drawHoloModalFrame, drawItemTooltip, openItemContextMenu, closeContextMenu, hitTestContextMenu, scrollLogs, setLogsScroll, logsScrollY, logsMaxScroll, scrollBody, bodyScrollY, bodyMaxScroll };

export const hudState = {
    fps: 60, frameCount: 0, lastFpsTime: performance.now(),
    get contextMenu() { return contextMenuState.current; },
    set contextMenu(v) { contextMenuState.current = v; },
    get inspectItem() { return inspectState.inspectItem; },
    set inspectItem(v) { inspectState.inspectItem = v; },
    updateFps(now) {
        this.frameCount++;
        if (now - this.lastFpsTime >= 500) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
            this.frameCount = 0; this.lastFpsTime = now;
        }
    },
    resetFps(now = performance.now()) { this.fps = 60; this.frameCount = 0; this.lastFpsTime = now; }
};

export function drawHUD(ctx, w, h, now) {
    // ... 其余逻辑保持不变 ...
    hudState.updateFps(now);
    const time = now * 0.003;
    // 🌟 强力防御：重置字体基准与对齐方式，防止任何子模块污染全局
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (isDevMode) drawDebugOverlays(ctx, w, h);

    // 1. 顶部 HUD
    ctx.fillStyle = 'rgba(10, 14, 22, 0.94)'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(16, 12, w - 32, 44, 8); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('【天道锻造大师】', 34, 39);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#c89664'; ctx.fillText(`铜钱: ${formatNum(gameState.copper)}`, 165, 39);
    ctx.fillStyle = '#ffd700'; ctx.fillText(`金币: ${formatNum(gameState.coins)}`, 275, 39);
    ctx.fillStyle = '#00ffc8'; ctx.fillText(`仙玉: ${formatNum(gameState.jade)}`, 385, 39);
    ctx.fillStyle = '#94a3b8'; ctx.fillText(`LV.${gameState.level} ${gameState.hammer_name}`, 490, 39);

    // 负重惩罚指示器
    const weightMul = getWeightSpeedMultiplier();
    if (weightMul < 1.0) {
        const curW = (Number(gameState.current_weight) || 0).toFixed(1);
        const maxW = (Number(gameState.max_weight) || 50).toFixed(1);
        const slowPct = Math.round((1 - weightMul) * 100);
        const wColor = weightMul <= 0.01 ? '#ef4444' : weightMul < 0.3 ? '#f97316' : '#f59e0b';
        ctx.fillStyle = wColor;
        ctx.font = 'bold 12px sans-serif';
        const wText = weightMul <= 0.01 ? `⚠️ 超重! ${curW}/${maxW}KG 无法移动` : `⚖️ 减速${slowPct}% (${curW}/${maxW}KG)`;
        ctx.fillText(wText, 640, 39);
    }

    const navs = gameConfig.navButtons, btnW = 72, btnH = 26, btnY = 21, btnGap = 6;
    const navTotalW = navs.length * btnW + (navs.length - 1) * btnGap;
    const navStartX = w - 28 - navTotalW;
    navs.forEach((nav, idx) => {
        const bx = navStartX + idx * (btnW + btnGap), active = uiState.isOpen(nav.targetModal);
        ctx.fillStyle = active ? `${nav.color}33` : 'rgba(15, 23, 42, 0.8)';
        ctx.strokeStyle = active ? nav.color : '#475569'; ctx.lineWidth = active ? 1.5 : 1;
        ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = active ? nav.color : '#cbd5e1'; 
        ctx.font = 'bold 10px sans-serif'; 
        ctx.textAlign = 'center';
        ctx.fillText(nav.label, bx + btnW / 2, btnY + 17);
        ctx.textAlign = 'left';
    });

    // 2. 底部功能栏
    const dockY = h - 38;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.95)'; ctx.fillRect(0, dockY, w, 38);
    ctx.strokeStyle = '#334155'; ctx.strokeRect(0, dockY, w, 38);

    const meltColor = gameState.melt_color || '#787878';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.strokeStyle = meltColor;
    ctx.beginPath(); ctx.roundRect(16, dockY + 6, 120, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = meltColor; ctx.font = 'bold 11px sans-serif'; ctx.fillText(`[T] 熔炼: ${gameState.melt_tier || '关'}`, 24, dockY + 23);

    const listColor = gameState.list_color || '#787878'; ctx.strokeStyle = listColor;
    ctx.beginPath(); ctx.roundRect(146, dockY + 6, 130, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = listColor; ctx.fillText(`[G] 上架: ${gameState.list_tier || '关'}`, 154, dockY + 23);

    const layer = gameState.sub_level || 1, canBreak = gameState.pending_breakthrough || layer >= 10, breakColor = canBreak ? '#ffd700' : '#64748b';
    ctx.fillStyle = canBreak ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255, 255, 255, 0.03)'; ctx.strokeStyle = breakColor;
    ctx.beginPath(); ctx.roundRect(286, dockY + 6, 125, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = breakColor; ctx.fillText(canBreak ? `⚡[X] 引劫(${layer}层)` : `[X] 突破(${layer}/10)`, 294, dockY + 23);

    const isAuto = isAutoStrikeActive(), autoColor = isAuto ? '#22c55e' : '#64748b';
    ctx.fillStyle = isAuto ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.03)'; ctx.strokeStyle = autoColor;
    ctx.beginPath(); ctx.roundRect(421, dockY + 6, 95, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = autoColor; ctx.fillText(`[K] 挂机: ${isAuto ? '开启' : '关闭'}`, 431, dockY + 23);

    ctx.font = '11px sans-serif'; ctx.fillStyle = '#64748b';
    ctx.fillText('MMO快捷: [ESC]关闭/取消 [L]九州 [M]区域 [B]锦囊 [P]拍阁 [J]任务 [N]学徒 [I]日志 [C]身体 | [WASD]移动 | 空格挥锤/采矿', 535, dockY + 23);

    if (settingsState.showFPS) {
        ctx.fillStyle = hudState.fps < 30 ? '#ff4d7a' : hudState.fps < 50 ? '#ffd700' : '#00ffc8';
        ctx.font = 'bold 12px monospace'; ctx.fillText(`FPS: ${hudState.fps}`, w - 85, dockY + 23);
    }

    // 3. 模态窗口与悬浮层绘制 (按 activeModals 插入顺序绘制，后加入 = 更上层)
    drawMinimap(ctx, w, h, time);
    const modalDrawers = {
        map: (t) => drawWorldMapModal(ctx, w, h, t),
        stash: (t) => drawStashModal(ctx, w, h, t),
        auction: (t) => drawAuctionModal(ctx, w, h, t),
        quest: (t) => drawQuestModal(ctx, w, h, t),
        apprentice: (t) => drawApprenticeModal(ctx, w, h, t),
        logs: (t) => drawLogsModal(ctx, w, h, t),
        body: (t) => drawBodyModal(ctx, w, h, t),
        inspect: (t) => drawInspectModal(ctx, w, h, t),
        debug: (t) => { if (isDevMode) drawDebugModal(ctx, getModalBounds('debug', w, h), w, h, t); },
        settings: (t) => drawSettingsModal(ctx, getModalBounds('settings', w, h), w, h, t),
        trade: (t) => drawTradeModal(ctx, w, h, t),
        bank: (t) => drawBankModal(ctx, w, h, t),
    };
    for (const id of uiState.activeModals) {
        const drawer = modalDrawers[id];
        if (drawer) drawer(time);
    }

    if (uiState.isOpen('stash') && stashHoveredItem) drawItemTooltip(ctx, stashHoveredItem, w, h);
    else if (uiState.isOpen('auction') && auctionHoveredLot) drawItemTooltip(ctx, auctionHoveredLot, w, h);
    drawContextMenu(ctx, w, h);
    drawDropConfirmModal(ctx, w, h, time);
}
