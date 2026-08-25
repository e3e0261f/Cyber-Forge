/**
 * 跑商系统 - 商票领取、特产赊购、驿馆售货、异地交割
 * 🌟 货物直接入背包占取负重; 可存银行但存入银行的货物无法在驿馆卖出 (NPC 只识别背包内商品)
 */

import { uiState } from './state.js';
import { gameState } from './state.js';
import { gameStore } from './store/game-store.js';
import { getModalBounds } from './input.js';
import { drawHoloModalFrame } from './modal-frame.js';

// 🌟 商票规则常量 (与服务端 GameConfig 一致)
export const TICKET_INITIAL_LIMIT = 30000;   // 初始信用额度 3 万
export const TICKET_SETTLE_TARGET = 100000;  // 交割目标: 累计回款 10 万
export const TICKET_SELL_RATIO = 0.92;       // 驿馆收购价 = 行情价 × 92%

// 各城市特产数据 (与后端 commerce.rs 基准价表对应)
export const CITY_TRADE_GOODS = {
    beijing: [
        { id: 'bj_silk', name: '皇极龙缎', basePrice: 280, icon: '🧵' },
        { id: 'bj_tea', name: '紫禁御茶', basePrice: 150, icon: '🍵' },
        { id: 'bj_jade', name: '燕京玉雕', basePrice: 420, icon: '🪨' },
    ],
    hebei: [
        { id: 'hb_iron', name: '丙火精铁', basePrice: 180, icon: '⚒️' },
        { id: 'hb_coal', name: '燕赵石炭', basePrice: 80, icon: '🪨' },
        { id: 'hb_grain', name: '冀州粟米', basePrice: 45, icon: '🌾' },
    ],
    shanghai: [
        { id: 'sh_salt', name: '东海海盐', basePrice: 120, icon: '🧂' },
        { id: 'sh_pearl', name: '申江明珠', basePrice: 680, icon: '💎' },
        { id: 'sh_spice', name: '番邦香料', basePrice: 320, icon: '🌶️' },
    ],
    yunnan: [
        { id: 'yn_herb', name: '滇南灵草', basePrice: 200, icon: '🌿' },
        { id: 'yn_gem', name: '翡翠原石', basePrice: 550, icon: '💠' },
        { id: 'yn_pu_er', name: '普洱陈茶', basePrice: 160, icon: '🍵' },
    ],
    qinghai: [
        { id: 'qh_fur', name: '雪域狐裘', basePrice: 380, icon: '🦊' },
        { id: 'qh_musk', name: '麝香灵脂', basePrice: 480, icon: '🧪' },
        { id: 'qh_crystal', name: '昆仑冰晶', basePrice: 620, icon: '❄️' },
    ],
};

// 🌟 全货物索引 (good_id -> 货物定义): 背包里跨城采购的货物也能查到行情与图标
export const ALL_TRADE_GOODS = {};
for (const goods of Object.values(CITY_TRADE_GOODS)) {
    for (const g of goods) ALL_TRADE_GOODS[g.id] = g;
}

// 🌟 商票货物身份前缀与商票物品身份 (与服务端 commerce.rs 一致)
export const TRADE_ITEM_PREFIX = 'trade_';
export const TICKET_ITEM_ID = 'merchant_ticket';

/** 服务端回传的商票/货物不带图标: 按 item_id 补渲染字形与类型色 (供背包格子渲染) */
export function getTradeGlyph(item) {
    if (!item) return null;
    const iid = item.item_id || item.itemId || item.id || '';
    if (iid === TICKET_ITEM_ID) return '📜';
    if (typeof iid === 'string' && iid.startsWith(TRADE_ITEM_PREFIX)) {
        const g = ALL_TRADE_GOODS[iid.slice(TRADE_ITEM_PREFIX.length)];
        return g ? g.icon : '📦';
    }
    return null;
}

// 🌟 确定性浮动价格系统 (30 秒一格行情 + 5 分钟正弦波, 显示与成交共用杜绝实付不一致)
const TRADE_PRICE_TICK_MS = 30 * 1000;
const TRADE_PRICE_WAVE_MS = 5 * 60 * 1000;

function _tradePriceHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** 某商品在某城的当前行情价 (浮动) */
export function getTradeGoodPrice(good, cityId, now = Date.now()) {
    const tick = Math.floor(now / TRADE_PRICE_TICK_MS);
    const phase = _tradePriceHash(good.id) % 1000;
    const wave = Math.sin(((now % TRADE_PRICE_WAVE_MS) / TRADE_PRICE_WAVE_MS) * Math.PI * 2 + phase);
    const noise = ((_tradePriceHash(`${good.id}_${cityId}_${tick}`) % 101) - 50) / 1000;
    const factor = Math.max(0.6, Math.min(1.4, 1 + wave * 0.15 + noise));
    return Math.max(1, Math.round(good.basePrice * factor));
}

/** 驿馆收购价 (行情 × 92%) */
export function getTradeSellPrice(good, cityId, now = Date.now()) {
    return Math.max(1, Math.round(getTradeGoodPrice(good, cityId, now) * TICKET_SELL_RATIO));
}

function getCityName(cityId) {
    const names = { beijing: '北京', hebei: '河北', shanghai: '上海', yunnan: '云南', qinghai: '青海', zhejiang: '浙江', sky_city: '天空之城' };
    return names[cityId] || cityId;
}

/** 背包内商票货物汇总: [{ goodId, name, icon, count, good }] (存入银行的不在此列 → 无法卖出) */
function collectBackpackCargo() {
    const merged = new Map();
    for (const it of (gameState.backpack || [])) {
        if (!it) continue;
        const iid = it.item_id || it.itemId || it.id || '';
        if (typeof iid !== 'string' || !iid.startsWith(TRADE_ITEM_PREFIX)) continue;
        const goodId = iid.slice(TRADE_ITEM_PREFIX.length);
        const good = ALL_TRADE_GOODS[goodId];
        const e = merged.get(goodId) || { goodId, name: good ? good.name : it.name, icon: good ? good.icon : '📦', count: 0, good };
        e.count += Number(it.stack_count || it.stackCount || 1);
        merged.set(goodId, e);
    }
    return [...merged.values()];
}

export function drawTradeModal(ctx, w, h, time) {
    if (!uiState.isOpen('trade')) return;

    const bounds = getModalBounds('trade', w, h);
    const { mx, my, mw, mh } = bounds;

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#f59e0b', '📜 商票驿馆', time);

    const currentCity = gameState.current_city_id || gameState.current_zone_id || 'beijing';
    const goods = CITY_TRADE_GOODS[currentCity] || [];
    const ticket = gameState.merchant_ticket;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (!ticket) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText(`您尚未持有商票。向驿馆使者免费领取, 获得 ${TICKET_INITIAL_LIMIT / 10000} 万铜信用额度,`, mx + 20, my + 60);
        ctx.fillText(`赊购本城特产运往他城出售, 累计回款达 ${TICKET_SETTLE_TARGET / 10000} 万铜即可交割商票。`, mx + 20, my + 78);
        ctx.fillStyle = '#64748b';
        ctx.font = '11px sans-serif';
        ctx.fillText('货物买入背包并占取负重, 可存银行但存入银行的货物无法在驿馆卖出。', mx + 20, my + 102);

        const btnX = mx + mw / 2 - 110, btnY = my + 136;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, 220, 38, 6);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`免费领取商票 (额度 ${TICKET_INITIAL_LIMIT.toLocaleString()} 铜)`, btnX + 110, btnY + 12);
        ctx.restore();
        return;
    }

    // === 商票信息栏 ===
    const creditFree = Math.max(0, Number(ticket.credit_limit || TICKET_INITIAL_LIMIT) - Number(ticket.used_credit || 0));
    const earned = Number(ticket.earned_total || 0);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`📜 签发城: ${getCityName(ticket.issue_city)} ｜ 信用额度: ${Number(ticket.credit_limit).toLocaleString()} 铜`, mx + 20, my + 54);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`已用 ${Number(ticket.used_credit || 0).toLocaleString()} ｜ 可用 ${creditFree.toLocaleString()} 铜 (赊购消费额度, 不扣铜钱)`, mx + 20, my + 72);

    // 交割进度条
    const prog = Math.min(1, earned / TICKET_SETTLE_TARGET);
    const barX = mx + 20, barY = my + 92, barW = mw - 170, barH = 10;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 5); ctx.fill();
    ctx.fillStyle = prog >= 1 ? '#34d399' : '#f59e0b';
    if (prog > 0) { ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(6, barW * prog), barH, 5); ctx.fill(); }
    ctx.fillStyle = prog >= 1 ? '#34d399' : '#cbd5e1';
    ctx.font = '10px sans-serif';
    ctx.fillText(`累计回款 ${earned.toLocaleString()} / ${TICKET_SETTLE_TARGET.toLocaleString()} (交割目标)`, barX, barY + 14);

    // === 左半: 本城特产采购 ===
    const colW = mw / 2 - 26;
    const listY = my + 128;
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`🏪 ${getCityName(currentCity)}特产 (赊购)`, mx + 20, listY);

    let gy = listY + 22;
    for (let i = 0; i < goods.length; i++) {
        const g = goods[i];
        const price = getTradeGoodPrice(g, currentCity);
        const affordable = price <= creditFree;
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx + 16, gy, colW, 44, 4);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${g.icon} ${g.name}`, mx + 26, gy + 7);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '11px sans-serif';
        ctx.fillText(`${price} 铜/件`, mx + 26, gy + 25);

        // 采购按钮组
        for (const [label, cnt] of [['购1', 1], ['购5', 5]]) {
            const bw = 42, bh = 22;
            const bx = mx + 16 + colW - (label === '购1' ? 96 : 48);
            const by = gy + 11;
            const canBuy = affordable && (cnt === 1 || price <= Math.floor(creditFree / cnt));
            ctx.fillStyle = canBuy ? 'rgba(16, 185, 129, 0.18)' : 'rgba(51, 65, 85, 0.3)';
            ctx.strokeStyle = canBuy ? '#10b981' : '#475569';
            ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = canBuy ? '#10b981' : '#64748b';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, bx + bw / 2, by + 6);
            ctx.textAlign = 'left';
        }
        gy += 50;
    }

    // === 右半: 背包货物出售 (NPC 只识别背包内商品) ===
    const rx = mx + mw / 2 + 6;
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('🎒 背包货物 (出售价 = 行情 × 92%)', rx, listY);

    const cargo = collectBackpackCargo();
    if (cargo.length === 0) {
        ctx.fillStyle = '#475569';
        ctx.font = '11px sans-serif';
        ctx.fillText('背包中没有商票货物 (存银行的不可售)', rx + 4, listY + 26);
    }
    let sy = listY + 22;
    for (const c of cargo) {
        const sellPrice = c.good ? getTradeSellPrice(c.good, currentCity) : 0;
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(rx - 4, sy, colW, 44, 4);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${c.icon} ${c.name} x${c.count}`, rx + 6, sy + 7);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '11px sans-serif';
        ctx.fillText(`收购 ${sellPrice} 铜/件`, rx + 6, sy + 25);

        for (const [label, kind] of [['售1', 1], ['全售', 0]]) {
            const bw = 42, bh = 22;
            const bx = rx - 4 + colW - (label === '售1' ? 96 : 48);
            const by = sy + 11;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
            ctx.strokeStyle = '#f59e0b';
            ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#f59e0b';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, bx + bw / 2, by + 6);
            ctx.textAlign = 'left';
        }
        sy += 50;
    }

    // === 交割按钮 (底部, 达标才可点) ===
    const settleReady = earned >= TICKET_SETTLE_TARGET;
    const sw = 240, sh = 34;
    const sx = mx + mw / 2 - sw / 2, syBtn = my + mh - 52;
    ctx.fillStyle = settleReady ? 'rgba(52, 211, 153, 0.2)' : 'rgba(51, 65, 85, 0.3)';
    ctx.strokeStyle = settleReady ? '#34d399' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(sx, syBtn, sw, sh, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = settleReady ? '#34d399' : '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(settleReady ? '💰 交割商票 (领取驿站奖励金)' : `交割未达标: ${earned.toLocaleString()} / ${TICKET_SETTLE_TARGET.toLocaleString()}`, sx + sw / 2, syBtn + 11);

    ctx.restore();
}

// 点击处理 (几何与绘制保持一致)
export function handleTradeClick(clickX, clickY, bounds) {
    const { mx, my, mw, mh } = bounds;
    const currentCity = gameState.current_city_id || gameState.current_zone_id || 'beijing';
    const goods = CITY_TRADE_GOODS[currentCity] || [];
    const ticket = gameState.merchant_ticket;

    if (!ticket) {
        const btnX = mx + mw / 2 - 110, btnY = my + 136;
        if (clickX >= btnX && clickX <= btnX + 220 && clickY >= btnY && clickY <= btnY + 38) {
            gameStore.dispatchAction('issue_merchant_ticket', {});
            return true;
        }
        return false;
    }

    const creditFree = Math.max(0, Number(ticket.credit_limit || TICKET_INITIAL_LIMIT) - Number(ticket.used_credit || 0));
    const colW = mw / 2 - 26;
    const listY = my + 128;

    // 左半采购按钮组
    let gy = listY + 22;
    for (let i = 0; i < goods.length; i++) {
        const g = goods[i];
        const price = getTradeGoodPrice(g, currentCity);
        const entries = [['购1', 1, 96], ['购5', 5, 48]];
        for (const [, cnt, off] of entries) {
            const bw = 42, bh = 22;
            const bx = mx + 16 + colW - off;
            const by = gy + 11;
            if (clickX >= bx && clickX <= bx + bw && clickY >= by && clickY <= by + bh) {
                if (price * cnt <= creditFree) {
                    gameStore.dispatchAction('buy_trade_good', { good_id: g.id, name: g.name, count: cnt, unit_price: price });
                } else {
                    gameStore.setToast('⚠️ 商票剩余额度不足, 先卖出货物释放额度');
                }
                return true;
            }
        }
        gy += 50;
    }

    // 右半出售按钮组
    const rx = mx + mw / 2 + 6;
    const cargo = collectBackpackCargo();
    let sy = listY + 22;
    for (const c of cargo) {
        const sellPrice = c.good ? getTradeSellPrice(c.good, currentCity) : 0;
        const entries = [['售1', 1, 96], ['全售', 0, 48]];
        for (const [, kind, off] of entries) {
            const bw = 42, bh = 22;
            const bx = rx - 4 + colW - off;
            const by = sy + 11;
            if (clickX >= bx && clickX <= bx + bw && clickY >= by && clickY <= by + bh) {
                const count = kind === 1 ? 1 : c.count;
                gameStore.dispatchAction('sell_trade_good', { good_id: c.goodId, count, unit_price: sellPrice });
                return true;
            }
        }
        sy += 50;
    }

    // 交割按钮
    const earned = Number(ticket.earned_total || 0);
    const sw = 240, sh = 34;
    const sx = mx + mw / 2 - sw / 2, syBtn = my + mh - 52;
    if (clickX >= sx && clickX <= sx + sw && clickY >= syBtn && clickY <= syBtn + sh) {
        if (earned >= TICKET_SETTLE_TARGET) {
            gameStore.dispatchAction('settle_merchant_ticket', {});
        } else {
            gameStore.setToast(`⚠️ 交割火候未到: 累计回款 ${earned.toLocaleString()} / ${TICKET_SETTLE_TARGET.toLocaleString()}`);
        }
        return true;
    }

    return false;
}
