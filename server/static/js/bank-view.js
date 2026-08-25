/**
 * 银行系统 - 万宝金库，永久存储个人物品
 * 🌟 银行(左栏)与背包(右栏)各自独立滚动条: 滚轮按鼠标所在半区滚动, 滑块可拖拽
 */

import { uiState } from './state.js';
import { gameState } from './state.js';
import { gameStore } from './store/game-store.js';
import { getModalBounds } from './input.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { isGatheredMaterial, parseGatherSubInfo } from './stash-view.js';
import { SUB_LEVEL_COLORS } from './world/world-topology.js';

// 当前选中索引 (背包/银行)
let selectedBankIdx = -1;
let selectedBackpackIdx = -1;

// ==================== 🌟 双区独立滚动状态 ====================
const bankScroll = { left: 0, right: 0 };
const bankMaxScroll = { left: 0, right: 0 };

export function scrollBank(side, deltaY) {
    if (side !== 'left' && side !== 'right') return;
    bankScroll[side] = Math.max(0, Math.min(bankMaxScroll[side], bankScroll[side] + deltaY * 0.8));
}

export function setBankScroll(side, value) {
    if (side !== 'left' && side !== 'right') return;
    bankScroll[side] = Math.max(0, Math.min(bankMaxScroll[side], value));
}

// 列表视口几何 (与绘制/点击命中共用)
const ITEM_H = 28;
function listViewport(bounds) {
    const startY = bounds.my + 98;
    const viewH = Math.max(60, bounds.mh - 130);
    return { startY, viewH };
}

/** 滚动条几何 (左栏: 中缝内侧; 右栏: 窗口右缘内侧), 无内容溢出返回 null */
export function getBankScrollbarMetrics(side, bounds) {
    if (bankMaxScroll[side] <= 0) return null;
    const { startY, viewH } = listViewport(bounds);
    const contentH = viewH + bankMaxScroll[side];
    const thumbH = Math.max(24, (viewH / contentH) * viewH);
    const travel = viewH - thumbH;
    const thumbY = startY + (bankScroll[side] / bankMaxScroll[side]) * travel;
    const trackX = side === 'left' ? bounds.mx + bounds.mw / 2 - 14 : bounds.mx + bounds.mw - 14;
    return { hitX: trackX - 4, hitW: 14, trackX, trackY: startY, trackH: viewH, thumbY, thumbH, travel, maxScroll: bankMaxScroll[side] };
}

/** 命中哪一侧滚动条 ('left' | 'right' | null) */
export function hitBankScrollbar(x, y, bounds) {
    for (const side of ['left', 'right']) {
        const m = getBankScrollbarMetrics(side, bounds);
        if (m && x >= m.hitX && x <= m.hitX + m.hitW && y >= m.trackY && y <= m.trackY + m.trackH) return side;
    }
    return null;
}

/** 🌟 可见背包列表: 背包是 null 填充的定长槽位数组 (排序关闭时),
 *  压平出实际物品并携带原始槽位索引, 彻底消灭空白条与 undefined 渲染崩溃 */
function getVisibleBackpack() {
    const bag = gameState.backpack || [];
    const list = [];
    for (let i = 0; i < bag.length; i++) {
        if (bag[i]) list.push({ item: bag[i], origIndex: i });
    }
    return list;
}

/** 堆叠数量宽容读取 (本地驼峰/下划线双字段) */
function stackOf(item) {
    return Number(item.stack_count || item.stackCount || 1);
}

/** 🌟 列表行内绘制采集物子品阶四圆点 (圆点右缘对齐 rightEdge, 竖直行中心)。
 *  subLevel 丢失时从名字后缀 ·T5.1 推导恢复, 银行库存旧物品也能显示标识 */
function drawRowDots(ctx, item, rightEdge, rowCenterY) {
    if (!isGatheredMaterial(item)) return;
    const info = parseGatherSubInfo(item);
    if (!info || info.subLv < 1) return;
    const dotColor = SUB_LEVEL_COLORS[info.subLv] || SUB_LEVEL_COLORS[1];
    const gap = 7;
    const startX = rightEdge - (4 - 1) * gap;
    for (let d = 0; d < 4; d++) {
        ctx.beginPath();
        ctx.arc(startX + d * gap, rowCenterY, 2, 0, Math.PI * 2);
        ctx.fillStyle = d < info.subLv ? dotColor : 'rgba(71, 85, 105, 0.45)';
        ctx.fill();
    }
}

/** 🌟 单列物品渲染 (裁切 + 滚动偏移 + 滚动条), kind: 'bank' | 'backpack' */
function drawColumn(ctx, bounds, kind, items) {
    const { mx, my, mw } = bounds;
    const { startY, viewH } = listViewport(bounds);
    const isBank = kind === 'bank';
    const colX = isBank ? mx + 12 : mx + mw / 2 + 4;
    const colW = mw / 2 - 22;
    const accent = isBank ? '#22c55e' : '#f59e0b';

    const contentH = items.length * ITEM_H;
    bankMaxScroll[isBank ? 'left' : 'right'] = Math.max(0, contentH - viewH);
    const side = isBank ? 'left' : 'right';
    if (bankScroll[side] > bankMaxScroll[side]) bankScroll[side] = bankMaxScroll[side];
    const scrollY = bankScroll[side];

    ctx.save();
    ctx.beginPath();
    ctx.rect(colX - 2, startY, colW + 4, viewH);
    ctx.clip();

    for (let i = 0; i < items.length; i++) {
        const rowY = startY - scrollY + i * ITEM_H;
        if (rowY + ITEM_H < startY || rowY > startY + viewH) continue;
        const item = isBank ? items[i] : items[i].item;
        const isSelected = i === (isBank ? selectedBankIdx : selectedBackpackIdx);

        ctx.fillStyle = isSelected ? (isBank ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)') : 'rgba(255,255,255,0.02)';
        ctx.strokeStyle = isSelected ? accent : '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(colX, rowY, colW, ITEM_H - 4, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${item.name} x${stackOf(item)}`, colX + 8, rowY + 8);

        // 🌟 采集物子品阶四圆点 (位于操作按钮左侧)
        drawRowDots(ctx, item, colX + colW - 50, rowY + (ITEM_H - 4) / 2);

        // 操作按钮
        ctx.fillStyle = accent;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(isBank ? '[取出]' : '[存入]', colX + colW - 6, rowY + 9);
    }
    ctx.restore();

    if (items.length === 0) {
        ctx.fillStyle = '#475569';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(isBank ? '金库空空如也...' : '背包空空如也...', colX + 8, startY + 4);
    }

    // 🌟 滚动条 (轨道 + 滑块)
    const bar = getBankScrollbarMetrics(side, bounds);
    if (bar) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.beginPath();
        ctx.roundRect(bar.trackX, bar.trackY, 6, bar.trackH, 3);
        ctx.fill();
        ctx.fillStyle = isBank ? 'rgba(34, 197, 94, 0.6)' : 'rgba(245, 158, 11, 0.6)';
        ctx.beginPath();
        ctx.roundRect(bar.trackX, bar.thumbY, 6, bar.thumbH, 3);
        ctx.fill();
    }
}

export function drawBankModal(ctx, w, h, time) {
    if (!uiState.isOpen('bank')) return;

    const bounds = getModalBounds('bank', w, h);
    const { mx, my, mw, mh } = bounds;

    // 绘制模态边框
    drawHoloModalFrame(ctx, mx, my, mw, mh, '#22c55e', '🏦 万宝金库', time);

    ctx.save();

    const bankItems = (gameState.bank_items || []).filter(Boolean);
    const backpackItems = getVisibleBackpack();

    // 左栏标题: 银行存储
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📦 金库存物', mx + 16, my + 58);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`共 ${bankItems.length} 种`, mx + 16, my + 78);

    // 右栏标题: 背包物品
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('🎒 随身背包', mx + mw / 2 + 8, my + 58);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${backpackItems.length} 种物品`, mx + mw / 2 + 8, my + 78);

    // 双区各自滚动渲染
    drawColumn(ctx, bounds, 'bank', bankItems);
    drawColumn(ctx, bounds, 'backpack', backpackItems);

    // 底部提示
    ctx.fillStyle = '#475569';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('点击存入/取出 | Shift+点击 x10 | Ctrl+点击 全部 | 滚轮/滑块滚动两区', mx + mw / 2, my + mh - 16);

    ctx.restore();
}

// 点击处理 (🌟 行命中带滚动偏移补偿, 且仅在可视区内生效)
export async function handleBankClick(clickX, clickY, bounds, event) {
    const { mx, my, mw } = bounds;
    const bankItems = (gameState.bank_items || []).filter(Boolean);
    const backpackItems = getVisibleBackpack();

    const { startY, viewH } = listViewport(bounds);
    const shiftKey = event && event.shiftKey;
    const ctrlKey = event && (event.ctrlKey || event.metaKey);
    if (clickY < startY || clickY > startY + viewH) return false;

    // 左栏: 银行物品点击 (取出)
    if (clickX >= mx + 12 && clickX <= mx + mw / 2 - 18) {
        const idx = Math.floor((clickY - startY + bankScroll.left) / ITEM_H);
        if (idx >= 0 && idx < bankItems.length) {
            const item = bankItems[idx];
            if (!item) return true;
            let count = 1;
            if (ctrlKey) count = stackOf(item);
            else if (shiftKey) count = Math.min(10, stackOf(item));
            await gameStore.dispatchAction('bank_withdraw', { idx, count, item_name: item.name });
            return true;
        }
        return false;
    }

    // 右栏: 背包物品点击 (存入)
    if (clickX >= mx + mw / 2 + 4 && clickX <= mx + mw - 18) {
        const idx = Math.floor((clickY - startY + bankScroll.right) / ITEM_H);
        if (idx >= 0 && idx < backpackItems.length) {
            const { item, origIndex } = backpackItems[idx];
            let count = 1;
            if (ctrlKey) count = stackOf(item);
            else if (shiftKey) count = Math.min(10, stackOf(item));
            // 🌟 携带物品身份 (服务端按名字匹配, 槽位拖拽换位后下标错位也不会存错)
            await gameStore.dispatchAction('bank_deposit', {
                idx: origIndex,
                count,
                item_name: item.name,
                item_id: item.item_id || item.itemId || item.name,
            });
            return true;
        }
        return false;
    }

    return false;
}
