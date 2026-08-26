/*
 * 模块功能: 矩阵锦囊 (超大背包视口 + 鼠标悬停神兵四维详情 Tooltip)
 * 修改时间: 2026-08-16 20:40
 */

import { gameState, uiState, registerStashLayoutHook, gameStore } from './state.js';
import { drawHoloModalFrame } from './hud.js';
import { getModalBounds } from './input.js';
import { audio } from './audio.js';
import { auditReporter } from './security/audit-reporter.js';
import { storageAdapter } from './adapters/storage-adapter.js';
import { SUB_LEVEL_COLORS, normalizeGatherItemNames, deriveGatherFields } from './world/world-topology.js';
import { getTradeGlyph } from './trade-view.js';

/** 🌟 从名字解析采集物品阶信息 (新命名 <产出名>·T<品阶>.<子品阶>):
 *  银行取出/刷新后服务端不存 subLevel 字段, 靠名字后缀推导恢复四圆点 */
export function parseGatherSubInfo(item) {
    if (!item) return null;
    const m = /·T(\d+)\.(\d+)/.exec(item.name || '');
    if (m) return { tier: Number(m[1]), subLv: Number(m[2]) };
    const subLv = Number(item.subLevel) || 0;
    if (subLv >= 1) return { tier: Number(item.tier) || 0, subLv };
    return null;
}

/** 🌟 判定是否为采集物 (只有采集物图标下方才渲染子品阶四圆点)。
 *  优先看 isGatherMat 标记; 兼容旧数据: 非工具且带子品阶的材料视为采集物 */
export function isGatheredMaterial(item) {
    if (!item) return false;
    if (item.isGatherMat === true) return true;
    if (item.isGatherMat === false) return false;
    // 名字含 ·T品阶.子品阶 后缀的必为采集物 (可从名字推导, 抗字段丢失)
    if (/·T\d+\.\d+/.test(item.name || '')) return true;
    const subLv = Number(item.subLevel) || 0;
    if (subLv < 1) return false;
    if (item.is_tool || item.itemType === 'Tool') return false;
    return !item.itemType || item.itemType === 'Material';
}

const SORT_MODES = ['默认', '品质', '价格', '时间', '关闭'];
const SORT_OFF = 4;
const STASH_SORT_KEY = 'cyber_forge_stash_sort_mode';
// 🌟 排序模式不再跨会话恢复: 刷新后一律回到"关闭"(手动布局), 手动布局由 STASH_LAYOUT_KEY 持久化;
//    此前从 localStorage 恢复非关闭模式会导致刷新后背包被自动排序 (用户手动布局丢失)
let currentSortMode = SORT_OFF;

// 🌟 手动布局持久化: 刷新页面后按保存的槽位/空格恢复, 不再重排压实
const STASH_LAYOUT_KEY = 'cyber_forge_stash_layout';

/** 保存当前背包布局 (每槽存 {id, name} 占位或 null 空格), 供刷新后恢复 */
export function saveStashLayout(bag) {
    try {
        const layout = (bag || []).map((it) => (it ? { id: it.id || null, name: it.name || null } : null));
        storageAdapter.set(STASH_LAYOUT_KEY, layout);
    } catch (e) { /* 存储失败不阻断渲染 */ }
}

/** 读取已保存布局, 构造占位骨架 (供合并函数按 id/name 匹配回真实物品); 空格保留为 null。
 *  占位带 _layoutOnly 标记: 未匹配到服务端物品时必须丢弃, 不得按 split_/fur_ 前缀本地复活 */
export function loadStashLayout() {
    const layout = storageAdapter.get(STASH_LAYOUT_KEY, null);
    if (!Array.isArray(layout) || layout.length === 0) return [];
    return layout.map((e) => (e && (e.id || e.name)) ? { id: e.id, name: e.name, _layoutOnly: true } : null);
}

export let stashScrollY = 0;
export let stashMaxScroll = 0;
export let stashHoveredItem = null;
let _lastStashItemsKey = ''; // 用于背包变化检测，避免每帧刷屏日志
let _lastStashLayoutKey = ''; // 手动布局落盘变化检测

export const stashDrag = {
    active: false,
    fromIndex: -1,
    item: null,
    mouseX: 0,
    mouseY: 0,
    // 🌟 本次拖拽数量 (拆分拖拽: Shift=1个 / Ctrl=半堆; 0 表示整堆)
    count: 0,
};

export const dropConfirmState = {
    active: false,
    item: null,
    fromIndex: -1,
    // 🌟 本次丢弃数量 (0 表示整堆丢弃)
    count: 0,
};

export function openDropConfirm(item, fromIndex, count = 0) {
    if (!item) return;
    dropConfirmState.active = true;
    dropConfirmState.item = item;
    dropConfirmState.fromIndex = fromIndex;
    dropConfirmState.count = count || 0;
}

export function closeDropConfirm() {
    dropConfirmState.active = false;
    dropConfirmState.item = null;
    dropConfirmState.fromIndex = -1;
}

export async function executeDropConfirm() {
    if (!dropConfirmState.active || !dropConfirmState.item) return;
    const item = dropConfirmState.item;
    const idx = dropConfirmState.fromIndex;
    closeDropConfirm();

    audio.playUI();

    // 🌟 维度二：客户端乐观授权与即时销毁 (Instant Optimistic Local Execution)
    const bag = gameState.backpack || [];
    let bagIdx = -1;
    if (idx >= 0 && idx < bag.length && bag[idx] && (bag[idx].id === item.id || bag[idx].itemId === item.itemId)) {
        bagIdx = idx;
    } else {
        bagIdx = bag.findIndex(it => it && (it.id === item.id || it.itemId === item.itemId || it.name === item.name));
    }
    if (bagIdx === -1) return;

    // 🌟 部分丢弃支持 (拆分拖拽: Shift=1个 / Ctrl=半堆): count 为 0 或 ≥ 堆叠数时整堆丢弃
    const stackTotal = Number(bag[bagIdx].stack_count || bag[bagIdx].stackCount || 1);
    const dropCount = dropConfirmState.count > 0 ? Math.min(dropConfirmState.count, stackTotal) : stackTotal;
    const isFullDrop = dropCount >= stackTotal;
    if (isFullDrop) {
        bag.splice(bagIdx, 1);
    } else {
        bag[bagIdx].stack_count = stackTotal - dropCount;
        bag[bagIdx].stackCount = bag[bagIdx].stack_count;
    }

    // 立即在本地刷新负重计算
    let totalW = 0.0;
    for (const it of bag) {
        if (!it) continue;
        const w = it.weight || (it.attributes && it.attributes.unit_weight) || 1.0;
        totalW += w * (it.stack_count || it.stackCount || 1);
    }
    gameState.current_weight = Math.round(totalW * 10) / 10;
    gameStore.state.current_weight = gameState.current_weight;

    // 异步审计上报与区块链入账 (Asynchronous Audit & Blockchain Recording)
    auditReporter.reportItemDrop(item, dropCount);

    // 发送后端处理 (部分丢弃仅本地扣堆, 整堆丢弃才通知服务端销毁)
    if (isFullDrop) {
        await gameStore.dispatchAction('drop_item', {
            item_id: item.id || item.item_id,
            index: bagIdx,
        });
    }
}

export function handleDropConfirmClick(x, y, w, h) {
    if (!dropConfirmState.active) return false;
    const dw = 380, dh = 220;
    const dx = (w - dw) / 2, dy = (h - dh) / 2;

    const btnW = 120, btnH = 34;
    const confirmX = dx + 45, confirmY = dy + 152;
    if (x >= confirmX && x <= confirmX + btnW && y >= confirmY && y <= confirmY + btnH) {
        executeDropConfirm();
        return true;
    }

    const cancelX = dx + dw - 45 - btnW, cancelY = dy + 152;
    if (x >= cancelX && x <= cancelX + btnW && y >= cancelY && y <= cancelY + btnH) {
        closeDropConfirm();
        return true;
    }

    return true; // 拦截背景点击
}

export function drawDropConfirmModal(ctx, w, h, time) {
    if (!dropConfirmState.active || !dropConfirmState.item) return;

    const item = dropConfirmState.item;
    const dw = 380;
    const dh = 220;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    // 1. 全屏半透明遮罩
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 15, 0.8)';
    ctx.fillRect(0, 0, w, h);

    // 2. 全息弹窗外框 (赤霄红)
    drawHoloModalFrame(ctx, dx, dy, dw, dh, '#ef4444', '【丢弃销毁确认】', time);

    // 3. 提示文案
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('是否永久丢弃并销毁以下物品？', dx + dw / 2, dy + 62);

    // 物品展示卡片
    const itemBoxW = 290, itemBoxH = 48;
    const ibx = dx + (dw - itemBoxW) / 2, iby = dy + 78;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = item.color || '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(ibx, iby, itemBoxW, itemBoxH, 6);
    ctx.fill();
    ctx.stroke();

    // 物品图标
    ctx.fillStyle = item.color || '#e2e8f0';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(item.glyph || '💎', ibx + 28, iby + 30);

    // 物品名称与数量 (🌟 拆分拖拽时显示本次丢弃数量而非整堆)
    ctx.textAlign = 'left';
    ctx.fillStyle = item.color || '#f8fafc';
    ctx.font = 'bold 13px sans-serif';
    const dropCnt = dropConfirmState.count > 0 ? dropConfirmState.count : Number(item.stack_count || item.stackCount || 1);
    const countStr = dropCnt > 1 ? ` x${dropCnt}` : '';
    ctx.fillText(`${item.name || '物品'}${countStr}`, ibx + 52, iby + 24);

    // 释放负重展示 (按本次丢弃数量计算)
    const unitW = item.weight || (item.attributes && item.attributes.unit_weight) || 1.0;
    const totalW = (unitW * dropCnt).toFixed(1);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`释放负重: -${totalW} KG  (单件 ${unitW}KG)`, ibx + 52, iby + 40);

    // 4. 按钮绘制
    // 确认丢弃按钮 (赤红)
    const btnW = 120, btnH = 34;
    const confirmX = dx + 45, confirmY = dy + 152;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(confirmX, confirmY, btnW, btnH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('确认销毁 [Y]', confirmX + btnW / 2, confirmY + 21);

    // 取消按钮 (灰蓝)
    const cancelX = dx + dw - 45 - btnW, cancelY = dy + 152;
    ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(cancelX, cancelY, btnW, btnH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.fillText('取消 [ESC]', cancelX + btnW / 2, cancelY + 21);

    ctx.restore();
}

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
    return { mx, my, mw, mh, gridX, gridY, cols, gap, cellW, cellH, clipH: mh - 105 };
}

export function hitTestStashSlot(x, y, bounds) {
    const m = getStashGridMetrics(bounds);
    // 🌟 超容量溢出格也参与命中检测 (服务端允许超容量入包)
    const max = Math.max(gameState.max_backpack || 20, (gameState.backpack || []).length);
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
    // 🌟 超容量保护: 仅修剪末尾多余的空槽, 绝不截断真实物品
    //    (服务端允许超容量入包最高 10 倍, 超重仅减速不阻止入包)
    while (bag.length > max && bag[bag.length - 1] === null) bag.pop();
}

/** 关闭自动排序时：保留本地空位布局，用服务端数据刷新同 id/name 物品 */
export function mergeBackpackPreservingLayout(localBag, serverBag, maxSlots) {
    const max = maxSlots || 20;
    // 🌟 旧采集物命名迁移 + 字段推导先行: 无品阶后缀改名, 服务端回传物品从名字后缀推导 subLevel/isGatherMat
    //    (服务端 GameItem 无这两个字段), 否则采集乐观入包按子品阶找堆失败 → 反复新开 mat_ 堆 → 同步又丢弃 → 背包震荡
    const fix = (it) => deriveGatherFields(normalizeGatherItemNames(it));
    const serverItems = (serverBag || []).filter(Boolean).map(fix);
    const used = new Set();
    const result = new Array(max).fill(null);

    const local = (localBag || []).map((it) => (it ? fix(it) : it));
    const stackNum = (v) => Number(v.stack_count || v.stackCount) || 1;
    // 🌟 同名组服务端总量 (权威值): 竞态双堆折叠后总数 = 服务端同名堆之和, 全程不变
    const serverTotalByName = new Map();
    for (const s of serverItems) {
        serverTotalByName.set(s.name, (serverTotalByName.get(s.name) || 0) + stackNum(s));
    }

    // 🌟 同名组分配: 本地所有含服务端同名物的真实槽位 (含超容量溢出格, 不含布局占位) 为一组,
    //    共享服务端总量。这样 Ctrl 拆分拖拽的视觉拆分堆得以保留:
    //    本地合计 == 服务端总量 → 每槽保留各自显示量 (拆分包不动);
    //    本地合计 <  服务端总量 → 各槽保留, 差额补到首槽 (服务端新增产量);
    //    本地合计 >  服务端总量 → 按槽序依次灌满至服务端总量, 溢出的槽丢弃 (服务端已消耗)
    const localSameSlots = new Map(); // name -> [{ i, it }]
    for (let i = 0; i < local.length; i++) {
        const it = local[i];
        if (it && !it._layoutOnly && serverTotalByName.has(it.name)) {
            if (!localSameSlots.has(it.name)) localSameSlots.set(it.name, []);
            localSameSlots.get(it.name).push({ i, it });
        }
    }
    const allocByName = new Map(); // name -> 分配量数组 (与 localSameSlots 顺序对应)
    for (const [name, slots] of localSameSlots) {
        const S = serverTotalByName.get(name);
        const sumLocal = slots.reduce((a, s) => a + stackNum(s.it), 0);
        let remaining = S;
        const allocs = [];
        if (sumLocal <= S) {
            slots.forEach((s, idx) => allocs.push(stackNum(s.it) + (idx === 0 ? S - sumLocal : 0)));
        } else {
            for (const s of slots) {
                const c = Math.min(stackNum(s.it), remaining);
                remaining -= c;
                allocs.push(c); // 0 = 服务端总量已耗尽, 丢弃该槽
            }
        }
        allocByName.set(name, allocs);
    }
    const allocCursor = new Map(); // name -> 已分配到的组内槽位游标
    const place = (i, v) => { if (i >= result.length) result.push(v); else result[i] = v; };

    // 🌟 遍历全部本地槽位 (含超容量溢出格), 不得只扫前 max 格导致溢出物品丢失
    for (let i = 0; i < local.length; i++) {
        const it = local[i];
        if (!it) continue;

        if (it._layoutOnly) {
            // 🌟 布局占位 (仅首次同步): 按 id/name 回填服务端物品到占位原格, 未匹配即丢弃;
            //    已被同名组接管的名字不再重复占位, 避免与真实槽位争抢服务端堆
            const matched = serverItems.find((s) => !used.has(s.id) && !allocByName.has(s.name) && (s.id === it.id || (s.name && s.name === it.name)));
            if (matched) {
                place(i, matched);
                used.add(matched.id);
            }
            continue;
        }

        if (allocByName.has(it.name)) {
            // 🌟 同名组槽位: 数量由分配表决定 (总量恒等于服务端权威总量),
            //    对象优先取 id/itemId 对应的服务端权威实例; 服务端堆数少于本地槽数时用本地实例打底 (保留 split_ 身份)
            const k = allocCursor.get(it.name) || 0;
            allocCursor.set(it.name, k + 1);
            const alloc = allocByName.get(it.name)[k];
            if (!alloc) continue; // 分配量为 0: 服务端总量已被前面槽位耗尽, 本槽丢弃 (杜绝数量膨胀)
            const sameNameUnused = serverItems.filter((s) => !used.has(s.id) && s.name === it.name);
            const matched = sameNameUnused.find((s) => s.id === it.id)
                || sameNameUnused.find((s) => s.itemId && s.itemId === it.itemId)
                || sameNameUnused[0];
            const placedItem = matched ? { ...matched } : { ...it };
            if (matched) used.add(matched.id);
            placedItem.stack_count = alloc;
            placedItem.stackCount = alloc;
            place(i, placedItem);
            continue;
        }

        // 🌟 仅保留本地独有物品: 确定性本地 id (调试生成/拖拽拆分/尸体兽皮) 且服务端账本无同名;
        //    乐观采集的 mat_ 随机 id 不得保留——否则服务端已删除的物品 (如整堆存入银行) 会本地复活, 存入后 UI 不刷新
        const lid = it.id || '';
        const keepAllowed = lid === 'dbg_' + (it.name || '') || lid.startsWith('split_') || lid.startsWith('fur_');
        if (keepAllowed) place(i, it);
    }

    // 🌟 同名组总量已定案: 剩余同名服务端堆 (数量已计入分配表) 全部标记消费, 防止下方循环重复入格造成膨胀
    for (const s of serverItems) {
        if (allocByName.has(s.name)) used.add(s.id);
    }

    // 将服务端新增但本地尚未占据格子的物品放入第一个空格; 格满时追加到末尾 (超容量)
    // 🌟 绝不丢弃服务端物品: 旧实现 break 会静默丢包, 导致物品反复消失 + 每秒误报"新物品"音效死循环;
    //    同名堆不在此处自动归并: 堆叠合并全权由"整理"按钮处理, 同步只负责入格不合并 (允许多同名堆共存)
    for (const it of serverItems) {
        if (used.has(it.id)) continue;
        const empty = result.findIndex((slot) => !slot);
        if (empty === -1) {
            result.push(it);
        } else {
            result[empty] = it;
        }
        used.add(it.id);
    }
    return result;
}

registerStashLayoutHook({
    isOff: isStashSortOff,
    merge: mergeBackpackPreservingLayout,
    loadLayout: loadStashLayout,
});

export function scrollStash(deltaY) {
    stashScrollY = Math.max(0, Math.min(stashMaxScroll, stashScrollY + deltaY * 0.8));
}

export function setStashScroll(value) {
    stashScrollY = Math.max(0, Math.min(stashMaxScroll, value));
}

export function drawStashModal(ctx, w, h, time) {
    if (!uiState.isOpen('stash')) return;

    const bounds = getModalBounds('stash', w, h);
    const { mx, my, mw, mh } = bounds;

    if (isStashSortOff()) padBackpackSlots();

    const items = gameState.backpack || [];
    const filled = items.filter(Boolean).length;
    // 仅在背包内容变化时输出日志，避免每帧刷屏
    const curKey = items.filter(Boolean).map(it => `${it.name}x${it.stack_count || it.stackCount || 1}`).join(',');
    if (curKey !== _lastStashItemsKey) {
        _lastStashItemsKey = curKey;
        console.log('[Stash] 背包变化: filled=', filled, 'total=', items.length, 'items=', curKey || '(空)');
    }
    // 🌟 手动布局持久化: 槽位占位 (含空格) 变化时落盘, 刷新后按原位恢复不重排
    const layoutKey = items.map((it) => (it ? (it.id || it.name) : '_')).join('|');
    if (layoutKey !== _lastStashLayoutKey) {
        _lastStashLayoutKey = layoutKey;
        saveStashLayout(items);
    }
    // 🌟 格数取 上限 与 实际物品数 的较大值: 超容量溢出格也渲染 (滚动条自动延长)
    const totalSlots = Math.max(gameState.max_backpack || 20, items.length);
    const curW = Number(gameState.current_weight) || 0;
    const maxW = Number(gameState.max_weight) || 50.0;
    const weightColor = curW > maxW ? '#ef4444' : curW > maxW * 0.8 ? '#f59e0b' : '#38bdf8';

    // 1. 全息外框
    drawHoloModalFrame(ctx, mx, my, mw, mh, '#38bdf8', `【矩阵锦囊】 ${filled}/${totalSlots} ｜ 负重 ${curW.toFixed(1)} / ${maxW.toFixed(1)} KG`, time);

    // 2. 标题栏排序按钮已移除: 排序开关整合至左下角提示小字 (点击循环, 命中检测见 hitTestSortHint)
    const sortOff = isStashSortOff();

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
        const itemColor = item ? (item.color || item.colorHex || '#38bdf8') : '#1e293b';

        ctx.fillStyle = item && !isBeingDragged ? 'rgba(15, 23, 42, 0.95)' : 'rgba(10, 14, 20, 0.6)';
        ctx.strokeStyle = item && !isBeingDragged ? itemColor : '#1e293b';
        ctx.lineWidth = item && !isBeingDragged ? 1.2 : 1.0;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cellW, cellH, 4);
        ctx.fill(); ctx.stroke();

        if (item && !isBeingDragged) {
            // 🌟 1. 物品图标居中渲染 (商票/商票货物服务端不存字形, 按 item_id 补图标)
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = itemColor;
            ctx.font = 'bold 15px sans-serif';
            ctx.shadowColor = itemColor;
            ctx.shadowBlur = 6;
            ctx.fillText(item.glyph || getTradeGlyph(item) || '💎', cx + cellW / 2, cy + cellH / 2 - 2);
            ctx.shadowBlur = 0;
            ctx.restore();

            // 🌟 2. 物品右下角数量角标 (Quantity Badge)
            const count = Number(item.stackCount || item.stack_count || 1);
            if (count >= 1) {
                const countStr = count > 999 ? '999+' : `${count}`;
                ctx.save();
                ctx.font = 'bold 9px monospace';
                const textW = ctx.measureText(countStr).width;
                const bw = Math.max(13, textW + 5);
                const bh = 11;
                const bx = cx + cellW - bw - 2;
                const by = cy + cellH - bh - 2;

                // 角标底板
                ctx.fillStyle = 'rgba(4, 9, 18, 0.92)';
                ctx.strokeStyle = count > 1 ? itemColor : '#475569';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.roundRect(bx, by, bw, bh, 3);
                ctx.fill();
                ctx.stroke();

                // 数量文字
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = count > 1 ? '#00ffc8' : '#e2e8f0';
                ctx.fillText(countStr, bx + bw / 2, by + bh / 2 + 0.5);
                ctx.restore();
            }

            // 🌟 3. 左上角品阶角标 (如 T2, T5)
            if (item.tier && item.tier > 1) {
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.font = 'bold 8px monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(`T${item.tier}`, cx + 3, cy + 3);
                ctx.restore();
            }

            // 🌟 4. 底部子品阶四圆点 (仅采集物: 亮几个点 = 几级采集物，颜色对应子品阶)
            //    subLevel 优先取字段, 丢失时从名字后缀 ·T5.1 推导恢复 (银行取出/刷新场景)
            const gatherInfo = isGatheredMaterial(item) ? parseGatherSubInfo(item) : null;
            const subLv = gatherInfo ? gatherInfo.subLv : 0;
            if (subLv >= 1 && isGatheredMaterial(item)) {
                ctx.save();
                const dotColor = SUB_LEVEL_COLORS[subLv] || SUB_LEVEL_COLORS[1];
                const dotN = 4;
                const dotR = 2;
                const dotGap = 7;
                const dotsW = (dotN - 1) * dotGap;
                // 🌟 点阵整体左移 8px (避免第 4 点被右下角数量徽标遮挡)
                const dotStartX = cx + cellW / 2 - dotsW / 2 - 8;
                const dotY = cy + cellH - 6;
                for (let d = 0; d < dotN; d++) {
                    ctx.beginPath();
                    ctx.arc(dotStartX + d * dotGap, dotY, dotR, 0, Math.PI * 2);
                    if (d < subLv) {
                        ctx.fillStyle = dotColor;
                        ctx.shadowColor = dotColor;
                        ctx.shadowBlur = 3;
                    } else {
                        ctx.fillStyle = 'rgba(71, 85, 105, 0.45)';
                        ctx.shadowBlur = 0;
                    }
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                ctx.restore();
            }

            // 🌟 5. 特产买入价极小字标识 (记账无忧: 自动在格底标注当初买入价)
            const isTrade = item.isTradeGood || item.itemType === 'TradeGood' || (typeof item.id === 'string' && item.id.startsWith('trade_')) || (typeof item.itemId === 'string' && item.itemId.startsWith('trade_'));
            const buyP = item.attributes?.buy_price ?? item.buy_price ?? item.buyPrice;
            if (isTrade && buyP !== undefined) {
                ctx.save();
                ctx.font = 'bold 8px sans-serif';
                ctx.fillStyle = '#fde047';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.shadowColor = 'rgba(0,0,0,0.9)';
                ctx.shadowBlur = 3;
                ctx.fillText(`${buyP}铜`, cx + 3, cy + cellH - 2);
                ctx.restore();
            }

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
        ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.beginPath();
        ctx.roundRect(mx + mw - 11, gridY, 6, trackH, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.beginPath();
        ctx.roundRect(mx + mw - 11, thumbY, 6, thumbH, 3);
        ctx.fill();
    }

    // 5. 拖拽悬浮物品 (🌟 拆分拖拽时角标显示本次拖拽数量)
    if (stashDrag.active && stashDrag.item) {
        const it = stashDrag.item;
        const itColor = it.color || it.colorHex || '#38bdf8';
        const itCount = stashDrag.count > 0 ? stashDrag.count : Number(it.stackCount || it.stack_count || 1);
        const bx = stashDrag.mouseX - cellW / 2;
        const by = stashDrag.mouseY - cellH / 2;

        ctx.save();
        ctx.fillStyle = 'rgba(24, 36, 58, 0.95)';
        ctx.strokeStyle = itColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = itColor;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(bx, by, cellW, cellH, 6);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = itColor;
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(it.glyph || '💎', stashDrag.mouseX, stashDrag.mouseY - 2);

        if (itCount > 1) {
            ctx.font = 'bold 9px monospace';
            const countStr = itCount > 999 ? '999+' : `${itCount}`;
            const tw = ctx.measureText(countStr).width;
            const bw = Math.max(13, tw + 5);
            const bh = 11;
            const bBadgeX = bx + cellW - bw - 2;
            const bBadgeY = by + cellH - bh - 2;

            ctx.fillStyle = 'rgba(4, 9, 18, 0.92)';
            ctx.strokeStyle = itColor;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.roundRect(bBadgeX, bBadgeY, bw, bh, 3);
            ctx.fill(); ctx.stroke();

            ctx.fillStyle = '#00ffc8';
            ctx.fillText(countStr, bBadgeX + bw / 2, bBadgeY + bh / 2 + 0.5);
        }
        ctx.restore();
    }

    // 货币中心
    const hubY = my + mh - 46;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx + 16, hubY, mw - 32, 28, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#d97706'; // copper
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`铜钱 ${gameState.copper}`, mx + 24, hubY + 19);

    ctx.fillStyle = '#fbbf24'; // gold
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`金币 ${gameState.coins}`, mx + 190, hubY + 19);

    ctx.fillStyle = '#10b981'; // jade
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`仙玉 ${gameState.jade}`, mx + 320, hubY + 19);

    ctx.fillStyle = weightColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`⚖️ 负重: ${curW.toFixed(1)}/${maxW.toFixed(1)} KG`, mx + mw - 180, hubY + 19);

    // 🌟 左下角"整理"按钮 + 排序开关 (整合进提示小字): 整理 = 压实空位 + 同名堆叠合并, 全权由整理按钮负责,
    //    排序只管重排不参与堆叠合并; 不点整理背包万年不整理 (同步/刷新均不自动合并压实)。
    //    命中区与 input.js 的 hitTestTidyButton / hitTestSortHint 几何一致
    ctx.fillStyle = 'rgba(52, 211, 153, 0.10)';
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx + 12, my + mh - 22, 44, 17, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#34d399';
    ctx.font = '10px sans-serif';
    ctx.fillText('整理', mx + 24, my + mh - 10);

    ctx.fillStyle = sortOff ? '#fca5a5' : '#34d399';
    ctx.fillText(`排序: ${SORT_MODES[currentSortMode]} ▾`, mx + 64, my + mh - 5);
    ctx.fillStyle = '#64748b';
    ctx.fillText(' 右键菜单 · 拖拽交换 · 拖出背包可销毁丢弃', mx + 160, my + mh - 5);
}

/** 左下角排序切换小字命中检测 (与绘制几何一致) */
export function hitTestSortHint(x, y, bounds) {
    const { mx, my, mh } = bounds;
    return x >= mx + 60 && x <= mx + 140 && y >= my + mh - 22 && y <= my + mh;
}

/** 左下角"整理"按钮命中检测 (与绘制几何一致) */
export function hitTestTidyButton(x, y, bounds) {
    const { mx, my, mh } = bounds;
    return x >= mx + 12 && x <= mx + 56 && y >= my + mh - 22 && y <= my + mh - 4;
}

/** 🌟 整理背包 (仅玩家点击"整理"按钮触发, 同步/刷新/排序绝不自动执行):
 *  ① 同名堆叠合并: 按名分组汇总总量, 尊重 max_stack 上限溢出自动分堆;
 *  ② 压实空位: 合并后的堆按槽序紧凑排到前排。完成后落盘手动布局。 */
export function tidyBackpack() {
    if (!Array.isArray(gameState.backpack)) return;
    const stackNum = (v) => Number(v.stack_count || v.stackCount) || 1;
    const groups = new Map(); // name -> { first, total }
    for (const it of gameState.backpack) {
        if (!it) continue;
        const g = groups.get(it.name);
        if (g) { g.total += stackNum(it); }
        else groups.set(it.name, { first: it, total: stackNum(it) });
    }
    const merged = [];
    for (const { first, total } of groups.values()) {
        const maxStack = Number(first.max_stack || 999);
        let rest = total;
        while (rest > 0) {
            const count = Math.min(rest, maxStack);
            // 始终基于首堆复制并写入正确数量 (多槽合并时 total > 首堆原数量, 不得直接复用原对象)
            merged.push({ ...first, stack_count: count, stackCount: count });
            rest -= count;
        }
    }
    gameState.backpack = merged;
    padBackpackSlots();
    saveStashLayout(gameState.backpack);
    _lastStashLayoutKey = gameState.backpack.map((it) => (it ? (it.id || it.name) : '_')).join('|');
    audio.playUI();
}

export function cycleSortMode() {
    currentSortMode = (currentSortMode + 1) % SORT_MODES.length;
    storageAdapter.set(STASH_SORT_KEY, currentSortMode);
    if (!Array.isArray(gameState.backpack)) return;

    if (isStashSortOff()) {
        padBackpackSlots();
        return;
    }

    // 开启任一排序：只在"有物品的槽位之间"重排, 空位原地保留、同名堆不合并;
    //    压实与堆叠合并全权由"整理"按钮负责 (不点整理背包万年不整理)
    const occupiedIdx = [];
    gameState.backpack.forEach((it, i) => { if (it) occupiedIdx.push(i); });
    const list = occupiedIdx.map((i) => gameState.backpack[i]);
    if (currentSortMode === 1) {
        list.sort((a, b) => (b.quality_rank || 0) - (a.quality_rank || 0));
    } else if (currentSortMode === 2) {
        list.sort((a, b) => (b.price_raw || 0) - (a.price_raw || 0));
    } else if (currentSortMode === 3) {
        list.sort((a, b) => (a.forged_timestamp || 0) - (b.forged_timestamp || 0));
    }
    occupiedIdx.forEach((idx, k) => { gameState.backpack[idx] = list[k]; });
}
