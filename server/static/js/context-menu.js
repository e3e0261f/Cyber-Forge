import { gameState, uiState } from './state.js';
import { UI_WINDOW_CONFIG } from './ui-window-config.js';

export const contextMenuState = { current: null };

export function closeContextMenu() { contextMenuState.current = null; }

/**
 * 严格判定物品是否为装备 (仅装备可进行装备回收炼铁返金)
 */
export function isEquipmentItem(item) {
    if (!item) return false;
    if (item.is_tool || item.isGatherMat) return false;
    const itemType = (item.itemType || item.item_type || item.type || '').toLowerCase();
    if (itemType === 'equipment') return true;
    if (item.category === 'equipment' || item.category === 'Equipment') return true;
    if (item.is_equipment === true) return true;
    if (['tool', 'tradegood', 'material', 'currency', 'herb', 'ore', 'wood', 'hide', 'stone'].includes(itemType)) {
        return false;
    }
    const name = item.name || '';
    const eqKeywords = ['剑', '刀', '枪', '甲', '盔', '靴', '盾', '佩', '袍', '冠', '戒', '履', '刃', '杖', '弓', '神兵', '法器', '道袍', '铠'];
    const matKeywords = ['矿', '木', '草', '花', '皮', '石', '麻', '棉', '渣', '特产', '商票', '铜钱', '金币', '仙玉', '纳玉', '玄晶', '神晶', '镐', '锤', '斧'];
    if (matKeywords.some(k => name.includes(k))) return false;
    return eqKeywords.some(k => name.includes(k));
}

/**
 * 🌟 自动识别物品可用性与使用模式
 * @param {Object} item 背包物品对象
 * @returns {Object|null}
 */
export function getItemUsageInfo(item) {
    if (!item) return null;
    const name = item.name || '';
    const itemType = (item.itemType || item.item_type || item.type || '').toLowerCase();
    const count = Number(item.stack_count || item.stackCount || 1) || 1;

    // 1. 货币类道具 (铜钱、金币、仙玉、天道纳玉、银票、商票、银两、灵石等)
    const isCurrency = item.currencyKey || item.source === 'currency' || itemType === 'currency' ||
        ['铜钱', '金币', '仙玉', '纳玉', '银票', '商票', '银两', '灵石'].some(c => name.includes(c));
    
    if (isCurrency) {
        let currKey = item.currencyKey;
        if (!currKey) {
            if (name.includes('铜钱')) currKey = 'copper';
            else if (name.includes('金币')) currKey = 'coins';
            else if (name.includes('仙玉') || name.includes('纳玉')) currKey = 'jade';
            else currKey = 'copper';
        }
        const currName = currKey === 'copper' ? '铜钱' : currKey === 'coins' ? '金币' : '仙玉';
        return {
            usable: true,
            type: 'currency',
            currencyKey: currKey,
            currencyName: currName,
            amt: count,
            label: `✨ 存入${currName} (+${count})`
        };
    }

    // 2. 丹药/药品/消耗品
    const isConsumable = itemType === 'consumable' || itemType === 'medicine' || itemType === 'potion' || item.category === 'medicine' ||
        ['丹', '药', '草', '丸', '散', '酒', '露', '膏', '灵参', '灵芝', '回春'].some(k => name.includes(k) && !name.includes('采') && !name.includes('斧') && !name.includes('镐'));
    
    if (isConsumable) {
        return {
            usable: true,
            type: 'consumable',
            label: '🧪 吞服丹药 / 使用'
        };
    }

    // 3. 宝箱/福袋/礼盒/锦囊/玄晶/神晶/奇珍
    const isChestOrGem = itemType === 'chest' || itemType === 'gem' || itemType === 'treasure' ||
        ['神晶', '玄晶', '宝箱', '福袋', '锦囊', '礼包', '礼盒', '秘宝', '藏宝图'].some(k => name.includes(k));
    
    if (isChestOrGem) {
        return {
            usable: true,
            type: 'chest',
            label: name.includes('晶') ? '🔮 吸收晶核 / 聚气' : '📦 开启宝箱 / 使用'
        };
    }

    // 4. 秘籍/功法/心法/图纸/配方
    const isBook = itemType === 'book' || itemType === 'recipe' ||
        ['秘籍', '功法', '心法', '残卷', '图纸', '配方', '真经'].some(k => name.includes(k));
    
    if (isBook) {
        return {
            usable: true,
            type: 'book',
            label: '📖 研读领悟'
        };
    }

    return null;
}

export function openItemContextMenu(x, y, item) {
    if (!item) return;
    const tool = !!item.is_tool;
    const isEquip = isEquipmentItem(item);
    const usage = getItemUsageInfo(item);
    const isCurrency = usage && usage.type === 'currency';
    const isBeijing = gameState.current_city_id === 'beijing';

    const menuItems = [];

    // 🌟 1. 自动识别：若为可使用物品，置顶提供使用选项
    if (usage && usage.usable) {
        menuItems.push({
            id: 'use',
            label: usage.label,
            usage: usage,
            disabled: false,
        });
    }

    // 🌟 2. 自动识别：若为装备，提供穿戴装备选项
    if (isEquip) {
        menuItems.push({
            id: 'equip',
            label: '⚔️ 穿戴装备',
            disabled: false,
        });
    }

    // 3. 全物品通用: 查看出生证
    menuItems.push({ id: 'inspect', label: '📜 查看出生证' });

    // 4. 装备回收 (炼铁返金, 仅限装备)
    menuItems.push({ 
        id: 'recycle', 
        label: isEquip 
            ? (isBeijing ? '♻️ 装备回收 (红皇城2.0x特惠)' : '♻️ 装备回收 (炼铁返金)')
            : '♻️ 装备回收 (仅限装备)', 
        disabled: !isEquip 
    });

    // 5. 上架藏宝阁 / 拍卖行 (货币和工具除外)
    menuItems.push({ 
        id: 'list', 
        label: '🏛️ 上架藏宝阁 / 拍卖行', 
        disabled: tool || isCurrency 
    });

    // 6. 熔炼成渣 (货币和工具除外)
    menuItems.push({ 
        id: 'melt', 
        label: '🔥 熔炼成渣 (玄铁矿渣)', 
        disabled: tool || isCurrency 
    });

    // 7. 关闭
    menuItems.push({ id: 'cancel', label: '关闭' });

    contextMenuState.current = {
        x, y, item, hover: -1,
        items: menuItems,
    };
}

export function hitTestContextMenu(x, y) {
    const menu = contextMenuState.current;
    if (!menu) return -1;
    const cfg = UI_WINDOW_CONFIG.context_menu || { width: 168, rowHeight: 28, pad: 6 };
    const mw = cfg.width || 168, rowH = cfg.rowHeight || 28, pad = cfg.pad || 6;
    const mh = pad * 2 + menu.items.length * rowH;
    let mx = menu.x, my = menu.y;
    if (mx + mw > window.innerWidth - 8) mx = window.innerWidth - mw - 8;
    if (my + mh > window.innerHeight - 8) my = window.innerHeight - mh - 8;
    if (x < mx || x > mx + mw || y < my || y > my + mh) return -2;
    const idx = Math.floor((y - my - pad) / rowH);
    return (idx < 0 || idx >= menu.items.length) ? -1 : idx;
}

export function getContextMenuBounds() {
    const menu = contextMenuState.current;
    if (!menu) return null;
    const cfg = UI_WINDOW_CONFIG.context_menu || { width: 168, rowHeight: 28, pad: 6 };
    const mw = cfg.width || 168, rowH = cfg.rowHeight || 28, pad = cfg.pad || 6;
    const mh = pad * 2 + menu.items.length * rowH;
    let mx = menu.x, my = menu.y;
    if (mx + mw > window.innerWidth - 8) mx = window.innerWidth - mw - 8;
    if (my + mh > window.innerHeight - 8) my = window.innerHeight - mh - 8;
    return { mx, my, mw, mh, rowH, pad };
}

export function drawContextMenu(ctx, w, h) {
    const menu = contextMenuState.current;
    if (!menu) return;
    const bounds = getContextMenuBounds();
    if (!bounds) return;
    const { mx, my, mw, mh, rowH, pad } = bounds;

    menu.hover = -1;
    if (uiState.mouseX >= mx && uiState.mouseX <= mx + mw && uiState.mouseY >= my && uiState.mouseY <= my + mh) {
        const idx = Math.floor((uiState.mouseY - my - pad) / rowH);
        if (idx >= 0 && idx < menu.items.length) menu.hover = idx;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 20, 0.96)'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.35)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 6); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;

    for (let i = 0; i < menu.items.length; i++) {
        const it = menu.items[i], ry = my + pad + i * rowH;
        if (menu.hover === i && !it.disabled) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
            ctx.fillRect(mx + 2, ry, mw - 4, rowH);
        }
        ctx.fillStyle = it.disabled ? '#475569' : (menu.hover === i ? '#e2e8f0' : '#cbd5e1');
        ctx.font = '12px sans-serif'; ctx.fillText(it.label, mx + 12, ry + 18);
    }
    ctx.restore();
}