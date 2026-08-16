/*
 * 模块功能: 矩阵锦囊 (超大背包视口 + 鼠标悬停神兵四维详情 Tooltip)
 * 修改时间: 2026-08-16 20:40
 */

import { gameState, uiState, registerStashLayoutHook } from './state.js';
import { drawHoloModalFrame } from './hud.js';
import { getModalBounds } from './input.js';

const SORT_MODES = ['默认', '品质', '价格', '时间', '关闭'];
const SORT_OFF = 4;
let currentSortMode = 0;

export let stashScrollY = 0;
export let stashMaxScroll = 0;
export let stashHoveredItem = null;

export const stashDrag = {
    active: false,
    fromIndex: -1,
    item: null,
    mouseX: 0,
    mouseY: 0,
};

export function isStashSortOff() {
    return currentSortMode === SORT_OFF;
}

/** 与绘制一致的格子几何（含滚轮偏移） */
export function getStashGridMetrics(bounds) {
    const { mx, my, mw, mh } = bounds;
    const gridX = mx + 16;
    const gridY = my + 54;
    const cols = 10;
    const gap = 6;
    const cellW = (mw - 44 - (cols - 1) * gap) / cols;
    const cellH = cellW;
    return { mx, my, mw, mh, gridX, gridY, cols, gap, cellW, cellH, clipH: mh - 85 };
}

export function hitTestStashSlot(x, y, bounds) {
    const m = getStashGridMetrics(bounds);
    const max = gameState.max_backpack || 20;
    for (let i = 0; i < max; i++) {
        const col = i % m.cols;
        const row = Math.floor(i / m.cols);
        const cx = m.gridX + col * (m.cellW + m.gap);
        const cy = m.gridY - stashScrollY + row * (m.cellH + m.gap);
        if (x >= cx && x <= cx + m.cellW && y >= cy && y <= cy + m.cellH) return i;
    }
    return -1;
}

export function padBackpackSlots() {
    const max = gameState.max_backpack || 20;
    if (!Array.isArray(gameState.backpack)) gameState.backpack = [];
    const bag = gameState.backpack;
    while (bag.length < max) bag.push(null);
    if (bag.length > max) bag.length = max;
}

/** 关闭自动排序时：保留本地空位布局，用服务端数据刷新同 id 物品 */
export function mergeBackpackPreservingLayout(localBag, serverBag, maxSlots) {
    const max = maxSlots || 20;
    const serverItems = (serverBag || []).filter(Boolean);
    const byId = new Map(serverItems.map((it) => [it.id, it]));
    const used = new Set();
    const result = new Array(max).fill(null);

    const local = localBag || [];
    for (let i = 0; i < Math.min(local.length, max); i++) {
        const it = local[i];
        if (it && byId.has(it.id)) {
            result[i] = byId.get(it.id);
            used.add(it.id);
        }
    }

    for (const it of serverItems) {
        if (used.has(it.id)) continue;
        const empty = result.findIndex((slot) => !slot);
        if (empty === -1) break;
        result[empty] = it;
        used.add(it.id);
    }
    return result;
}

registerStashLayoutHook({
    isOff: isStashSortOff,
    merge: mergeBackpackPreservingLayout,
});

export function scrollStash(deltaY) {
    stashScrollY = Math.max(0, Math.min(stashMaxScroll, stashScrollY + deltaY * 0.8));
}

export function drawStashModal(ctx, w, h, time) {
    if (!uiState.isOpen('stash')) return;

    const bounds = getModalBounds('stash', w, h);
    const { mx, my, mw, mh } = bounds;

    if (isStashSortOff()) padBackpackSlots();

    const items = gameState.backpack || [];
    const filled = items.filter(Boolean).length;
    const totalSlots = gameState.max_backpack || 20;

    // 1. 全息外框
    drawHoloModalFrame(ctx, mx, my, mw, mh, '#38bdf8', `【矩阵锦囊】 ${filled}/${totalSlots} [D]扩`, time);

    // 2. 排序与协议按钮
    const sortBtnX = mx + mw - 280, sortBtnY = my + 14;
    const sortOff = isStashSortOff();
    ctx.fillStyle = sortOff ? 'rgba(248, 113, 113, 0.12)' : 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = sortOff ? '#f87171' : '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(sortBtnX, sortBtnY, 80, 24, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = sortOff ? '#fca5a5' : '#cbd5e1';
    ctx.font = '10px sans-serif';
    ctx.fillText(`排序: ${SORT_MODES[currentSortMode]} ▾`, sortBtnX + 8, sortBtnY + 16);

    const protoX = mx + mw - 190, protoY = my + 14;
    const protoColor = gameState.currency_protocol_color || '#00ffc8';
    ctx.fillStyle = 'rgba(12, 20, 30, 0.9)';
    ctx.strokeStyle = protoColor;
    ctx.beginPath();
    ctx.roundRect(protoX, protoY, 110, 24, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = protoColor;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`协议: ${gameState.currency_protocol} ▾`, protoX + 6, protoY + 16);

    // 3. 10 列网格排布与裁切
    const m = getStashGridMetrics(bounds);
    const { gridX, gridY, cols, gap, cellW, cellH, clipH } = m;
    const clipW = mw - 32;

    const totalRows = Math.ceil(totalSlots / cols);
    const contentH = totalRows * (cellH + gap);
    stashMaxScroll = Math.max(0, contentH - clipH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(gridX - 2, gridY, clipW, clipH);
    ctx.clip();

    stashHoveredItem = null;

    for (let i = 0; i < totalSlots; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = gridX + col * (cellW + gap);
        const cy = gridY - stashScrollY + row * (cellH + gap);

        if (cy + cellH < gridY || cy > gridY + clipH) continue;

        const item = items[i];
        const isBeingDragged = stashDrag.active && stashDrag.fromIndex === i;

        ctx.fillStyle = item && !isBeingDragged ? 'rgba(20, 28, 45, 0.95)' : 'rgba(10, 14, 20, 0.6)';
        ctx.strokeStyle = item && item.color && !isBeingDragged ? item.color : '#1e293b';
        ctx.lineWidth = item && !isBeingDragged ? 1.2 : 1.0;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cellW, cellH, 4);
        ctx.fill(); ctx.stroke();

        if (item && !isBeingDragged) {
            ctx.fillStyle = item.color || '#e2e8f0';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(item.glyph || '剑', cx + cellW / 2 - 5, cy + cellH / 2 + 4);

            if (uiState.mouseX >= cx && uiState.mouseX <= cx + cellW &&
                uiState.mouseY >= cy && uiState.mouseY <= cy + cellH && !stashDrag.active) {
                stashHoveredItem = { item, x: cx + cellW + 8, y: cy };
            }
        } else if (!item) {
            ctx.fillStyle = '#334155';
            ctx.font = '10px sans-serif';
            ctx.fillText('·', cx + cellW / 2 - 2, cy + cellH / 2 + 3);
        }
    }

    ctx.restore();

    // 4. 滑块
    if (stashMaxScroll > 0) {
        const trackH = clipH;
        const thumbH = Math.max(24, (clipH / contentH) * trackH);
        const thumbY = gridY + (stashScrollY / stashMaxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.beginPath();
        ctx.roundRect(mx + mw - 10, thumbY, 4, thumbH, 2);
        ctx.fill();
    }

    // 5. 拖拽悬浮物品
    if (stashDrag.active && stashDrag.item) {
        const it = stashDrag.item;
        ctx.save();
        ctx.fillStyle = 'rgba(24, 36, 58, 0.95)';
        ctx.strokeStyle = it.color || '#38bdf8';
        ctx.lineWidth = 2;
        ctx.shadowColor = it.color || '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(stashDrag.mouseX - cellW / 2, stashDrag.mouseY - cellH / 2, cellW, cellH, 6);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = it.color || '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(it.glyph || '剑', stashDrag.mouseX - 6, stashDrag.mouseY + 5);
        ctx.restore();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText(
        sortOff
            ? '排序已关闭 · 右键神兵出菜单 · 可拖到空格'
            : '右键神兵：上架/熔炼/出生证 | 点排序到「关闭」可留空位',
        mx + 16, my + mh - 12
    );
}

export function cycleSortMode() {
    currentSortMode = (currentSortMode + 1) % SORT_MODES.length;
    if (!Array.isArray(gameState.backpack)) return;

    if (isStashSortOff()) {
        padBackpackSlots();
        return;
    }

    // 开启任一排序：压实空位后再排
    gameState.backpack = gameState.backpack.filter(Boolean);
    const list = gameState.backpack;
    if (currentSortMode === 1) {
        list.sort((a, b) => (b.quality_rank || 0) - (a.quality_rank || 0));
    } else if (currentSortMode === 2) {
        list.sort((a, b) => (b.price_raw || 0) - (a.price_raw || 0));
    } else if (currentSortMode === 3) {
        list.sort((a, b) => (a.forged_timestamp || 0) - (b.forged_timestamp || 0));
    }
}
