import { gameState, uiState } from './state.js';

export const contextMenuState = { current: null };

export function closeContextMenu() { contextMenuState.current = null; }

export function openItemContextMenu(x, y, item) {
    if (!item) return;
    const tool = !!item.is_tool;
    const isBeijing = gameState.current_city_id === 'beijing';
    contextMenuState.current = {
        x, y, item, hover: -1,
        items: [
            { id: 'inspect', label: '📜 查看出生证' },
            { id: 'recycle', label: isBeijing ? '♻️ 红皇城回收 (2.0x特惠)' : '♻️ 装备回收 (炼铁返金)', disabled: tool },
            { id: 'list', label: '🏛️ 上架藏宝阁', disabled: tool },
            { id: 'melt', label: '🔥 熔炼成铁渣', disabled: tool },
            { id: 'cancel', label: '关闭' },
        ],
    };
}

export function hitTestContextMenu(x, y) {
    const menu = contextMenuState.current;
    if (!menu) return -1;
    const mw = 168, rowH = 28, pad = 6, mh = pad * 2 + menu.items.length * rowH;
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
    const mw = 168, rowH = 28, pad = 6, mh = pad * 2 + menu.items.length * rowH;
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