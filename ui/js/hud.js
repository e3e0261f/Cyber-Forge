/*
 * 模块功能: 顶部 HUD、底部恢复 [T]熔炼/[G]上架/[X]突破/[K]挂机 按钮、神兵详情 Tooltip 悬浮窗
 * 修改时间: 2026-08-16 20:15
 */

import { gameState, uiState } from './state.js';
import { formatNum } from './core.js';
import { gameConfig } from './config.js';
import { drawStashModal, stashHoveredItem } from './stash-view.js';
import { drawAuctionModal, auctionHoveredLot } from './auction-view.js';
import { drawApprenticeModal } from './apprentice-view.js';
import { getModalBounds, isAutoStrikeActive } from './input.js';

export const hudState = {
    fps: 60,
    frameCount: 0,
    lastFpsTime: performance.now(),
    /** @type {null | { x:number, y:number, item:object, items: Array<{id:string,label:string,disabled?:boolean}>, hover:number }} */
    contextMenu: null,
    /** 出生证弹窗当前展示的物品 */
    inspectItem: null,

    updateFps(now) {
        this.frameCount++;
        if (now - this.lastFpsTime >= 500) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }
};

export function closeContextMenu() {
    hudState.contextMenu = null;
}

export function openItemContextMenu(x, y, item) {
    if (!item) return;
    const tool = !!item.is_tool;
    hudState.contextMenu = {
        x,
        y,
        item,
        hover: -1,
        items: [
            { id: 'inspect', label: '📜 查看出生证' },
            { id: 'list', label: '🏛️ 上架藏宝阁', disabled: tool },
            { id: 'melt', label: '🔥 熔炼成铁浆', disabled: tool },
            { id: 'cancel', label: '关闭' },
        ],
    };
}

export function hitTestContextMenu(x, y) {
    const menu = hudState.contextMenu;
    if (!menu) return -1;
    const mw = 168, rowH = 28, pad = 6;
    const mh = pad * 2 + menu.items.length * rowH;
    let mx = menu.x, my = menu.y;
    if (mx + mw > window.innerWidth - 8) mx = window.innerWidth - mw - 8;
    if (my + mh > window.innerHeight - 8) my = window.innerHeight - mh - 8;
    if (x < mx || x > mx + mw || y < my || y > my + mh) return -2; // 菜单外
    const idx = Math.floor((y - my - pad) / rowH);
    if (idx < 0 || idx >= menu.items.length) return -1;
    return idx;
}

export function getContextMenuBounds() {
    const menu = hudState.contextMenu;
    if (!menu) return null;
    const mw = 168, rowH = 28, pad = 6;
    const mh = pad * 2 + menu.items.length * rowH;
    let mx = menu.x, my = menu.y;
    if (mx + mw > window.innerWidth - 8) mx = window.innerWidth - mw - 8;
    if (my + mh > window.innerHeight - 8) my = window.innerHeight - mh - 8;
    return { mx, my, mw, mh, rowH, pad };
}

export let logsScrollY = 0;
export let logsMaxScroll = 0;
let logsStickBottom = true;

export function scrollLogs(deltaY) {
    logsScrollY = Math.max(0, Math.min(logsMaxScroll, logsScrollY + deltaY * 0.8));
    logsStickBottom = logsScrollY >= logsMaxScroll - 1;
}

export function drawHUD(ctx, w, h, now) {
    hudState.updateFps(now);
    const time = now * 0.003;

    // 1. 顶部 HUD 底板
    ctx.fillStyle = 'rgba(10, 14, 22, 0.94)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(16, 12, w - 32, 44, 8);
    ctx.fill();
    ctx.stroke();

    // 标题
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('【天道锻造大师】', 34, 39);

    // 资产看板
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#c89664';
    ctx.fillText(`铜钱: ${formatNum(gameState.copper)}`, 175, 39);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`金币: ${formatNum(gameState.coins)}`, 295, 39);
    ctx.fillStyle = '#00ffc8';
    ctx.fillText(`仙玉: ${formatNum(gameState.jade)}`, 415, 39);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`LV.${gameState.level} ${gameState.hammer_name}`, 525, 39);
    ctx.fillStyle = '#ff4d7a';
    ctx.fillText(`QTE: ${Number(gameState.forge_qte_hits || 0).toFixed(1)}`, 665, 39);

    // 顶部四大功能导航按钮
    const btnW = 76, btnH = 26, btnY = 21, btnGap = 8;
    const navs = gameConfig.navButtons;
    const navStartX = w - 32 - (btnW + btnGap) * navs.length;

    navs.forEach((nav, idx) => {
        const bx = navStartX + idx * (btnW + btnGap);
        const isActive = uiState.isOpen(nav.id);

        ctx.fillStyle = isActive ? `${nav.color}33` : 'rgba(15, 23, 42, 0.8)';
        ctx.strokeStyle = isActive ? nav.color : '#475569';
        ctx.lineWidth = isActive ? 1.5 : 1.0;
        ctx.beginPath();
        ctx.roundRect(bx, btnY, btnW, btnH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isActive ? nav.color : '#cbd5e1';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(nav.label, bx + 6, btnY + 17);
    });

    // 🌟 2. 底部功能栏 (恢复 [T]熔炼 / [G]上架 / [X]突破 / [K]挂机 按钮)
    const dockY = h - 38;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.95)';
    ctx.fillRect(0, dockY, w, 38);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(0, dockY, w, 38);

    // A. [T] 自动熔炼按钮
    const meltTierName = gameState.melt_tier || '关';
    const meltColor = gameState.melt_color || '#787878';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = meltColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, dockY + 6, 120, 26, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = meltColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`[T] 熔炼: ${meltTierName}`, 24, dockY + 23);

    // B. [G] 自动上架按钮
    const listTierName = gameState.list_tier || '关';
    const listColor = gameState.list_color || '#787878';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = listColor;
    ctx.beginPath();
    ctx.roundRect(146, dockY + 6, 130, 26, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = listColor;
    ctx.fillText(`[G] 上架: ${listTierName}`, 154, dockY + 23);

    // C. [X] 突破引劫按钮 (达到10层金色发光)
    const canBreak = gameState.pending_breakthrough || (gameState.sub_level >= 10);
    const breakColor = canBreak ? '#ffd700' : '#64748b';
    ctx.fillStyle = canBreak ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = breakColor;
    ctx.beginPath();
    ctx.roundRect(286, dockY + 6, 125, 26, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = breakColor;
    ctx.fillText(canBreak ? '⚡[X] 准备引劫' : `[X] 突破(${gameState.sub_level || 1}/10)`, 294, dockY + 23);

    // D. [K] 挂机锤开关
    const isAuto = isAutoStrikeActive();
    const autoColor = isAuto ? '#22c55e' : '#64748b';
    ctx.fillStyle = isAuto ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = autoColor;
    ctx.beginPath();
    ctx.roundRect(421, dockY + 6, 95, 26, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = autoColor;
    ctx.fillText(`[K] 挂机: ${isAuto ? '开启' : '关闭'}`, 431, dockY + 23);

    // 快捷说明
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('MMO键位: [C]角色 [B]锦囊 [P]拍阁 [M]学徒 [I]日志 [ESC]关闭 | 空格挥锤', 535, dockY + 23);

    // FPS 帧率
    let fpsColor = '#00ffc8';
    if (hudState.fps < 30) fpsColor = '#ff4d7a';
    else if (hudState.fps < 50) fpsColor = '#ffd700';
    ctx.fillStyle = fpsColor;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`FPS: ${hudState.fps}`, w - 85, dockY + 23);

    // 🌟 3. 绘制并存全息弹窗
    drawStashModal(ctx, w, h, time);
    drawAuctionModal(ctx, w, h, time);
    drawApprenticeModal(ctx, w, h, time);
    drawLogsModal(ctx, w, h, time);
    drawBodyModal(ctx, w, h, time);
    drawInspectModal(ctx, w, h, time);

    // 🌟 4. 悬停查看物品详情 Tooltip (悬浮在所有窗口之上)
    if (uiState.isOpen('stash') && stashHoveredItem) {
        drawItemTooltip(ctx, stashHoveredItem, w, h);
    } else if (uiState.isOpen('auction') && auctionHoveredLot) {
        drawItemTooltip(ctx, auctionHoveredLot, w, h);
    }

    // 🌟 5. 自定义右键菜单（盖过浏览器默认菜单）
    drawContextMenu(ctx, w, h);
}

// 🌟 100% 修复：严格传入双参数 lineTo(x, y)
export function drawHoloModalFrame(ctx, mx, my, mw, mh, themeColor, title, time) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.94)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 10);
    ctx.fill();
    ctx.stroke();

    // 四角角标
    const cLen = 14;
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2.5;

    ctx.beginPath(); ctx.moveTo(mx, my + cLen); ctx.lineTo(mx, my); ctx.lineTo(mx + cLen, my); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx + mw - cLen, my); ctx.lineTo(mx + mw, my); ctx.lineTo(mx + mw, my + cLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my + mh - cLen); ctx.lineTo(mx, my + mh); ctx.lineTo(mx + cLen, my + mh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx + mw - cLen, my + mh); ctx.lineTo(mx + mw, my + mh); ctx.lineTo(mx + mw, my + mh - cLen); ctx.stroke();

    // 边框极光扫光
    const perimeter = (mw + mh) * 2;
    const sweepPos = ((time * 180) % perimeter);
    let sweepX = mx, sweepY = my;

    if (sweepPos < mw) {
        sweepX = mx + sweepPos; sweepY = my;
    } else if (sweepPos < mw + mh) {
        sweepX = mx + mw; sweepY = my + (sweepPos - mw);
    } else if (sweepPos < mw * 2 + mh) {
        sweepX = mx + mw - (sweepPos - (mw + mh)); sweepY = my + mh;
    } else {
        sweepX = mx; sweepY = my + mh - (sweepPos - (mw * 2 + mh));
    }

    const laserGrad = ctx.createRadialGradient(sweepX, sweepY, 0, sweepX, sweepY, 35);
    laserGrad.addColorStop(0, '#ffffff');
    laserGrad.addColorStop(0.3, themeColor);
    laserGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = laserGrad;
    ctx.beginPath();
    ctx.arc(sweepX, sweepY, 35, 0, Math.PI * 2);
    ctx.fill();

    // 标题栏把手
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(mx + 4, my + 4, mw - 8, 40);

    ctx.fillStyle = themeColor;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(title, mx + 20, my + 28);

    // 关闭 [✕]
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('✕', mx + mw - 26, my + 28);

    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx + 15, my + 46);
    ctx.lineTo(mx + mw - 15, my + 46);
    ctx.stroke();
}

// 🌟 绘制悬浮查看神兵属性与四维天道出生证明 Tooltip
export function drawItemTooltip(ctx, info, w, h) {
    const item = info.item || info.lot;
    if (!item) return;

    const tw = 240, th = 170;
    let tx = info.x, ty = info.y;
    if (tx + tw > w - 10) tx = w - tw - 15;
    if (ty + th > h - 45) ty = h - th - 50;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.96)';
    ctx.strokeStyle = item.color || '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = item.color || '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = item.color || '#ffd700';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(item.name, tx + 12, ty + 22);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`估价: ${item.price || item.fair || '0'} 金币`, tx + 12, ty + 40);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(tx + 8, ty + 48); ctx.lineTo(tx + tw - 8, ty + 48);
    ctx.stroke();

    // 四维指纹信息
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('📜【天道出生证明】', tx + 12, ty + 66);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '10px monospace';
    ctx.fillText(`• 时辰: ${item.cert_time || '甲辰年·子时三刻'}`, tx + 12, ty + 85);
    ctx.fillText(`• 地轴: ${item.cert_location || '离火九五·阳极'}`, tx + 12, ty + 104);
    ctx.fillText(`• 始祖: ${item.cert_creator || '道友李逍遥'}`, tx + 12, ty + 123);
    ctx.fillText(`• 印记: [${item.cert_stamp || '玄之又玄·众妙'}]`, tx + 12, ty + 142);
    ctx.fillText(`• 短码: ${item.cert_code || '#Z7kQ-9mA3'}`, tx + 12, ty + 160);

    ctx.restore();
}

function drawLogsModal(ctx, w, h, time) {
    if (!uiState.isOpen('logs')) return;
    const bounds = getModalBounds('logs', w, h);
    const { mx, my, mw, mh } = bounds;

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#a855f7', '【天道纪事 · 宗门日志】', time);

    const logs = gameState.logs || [];
    const listX = mx + 16;
    const listY = my + 54;
    const lineH = 20;
    const clipW = mw - 24;
    const clipH = mh - 85;
    const contentH = Math.max(lineH, logs.length * lineH);
    logsMaxScroll = Math.max(0, contentH - clipH);

    if (logsStickBottom) logsScrollY = logsMaxScroll;
    logsScrollY = Math.max(0, Math.min(logsMaxScroll, logsScrollY));

    if (logs.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('暂无纪事。锻造、渡劫与拍卖会写入此处。', mx + 30, listY + 30);
        return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(listX - 2, listY, clipW, clipH);
    ctx.clip();

    for (let i = 0; i < logs.length; i++) {
        const ly = listY - logsScrollY + i * lineH + 14;
        if (ly < listY - 4 || ly > listY + clipH + 4) continue;
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px monospace';
        ctx.fillText(logs[i], mx + 20, ly);
    }

    ctx.restore();

    if (logsMaxScroll > 0) {
        const trackH = clipH;
        const thumbH = Math.max(24, (clipH / contentH) * trackH);
        const thumbY = listY + (logsScrollY / logsMaxScroll) * (trackH - thumbH);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
        ctx.beginPath();
        ctx.roundRect(mx + mw - 10, thumbY, 4, thumbH, 2);
        ctx.fill();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText(`共 ${logs.length} 条 · 滚轮浏览全部纪事`, mx + 16, my + mh - 12);
}

function drawBodyModal(ctx, w, h, time) {
    if (!uiState.isOpen('body')) return;
    const bounds = getModalBounds('body', w, h);
    const { mx, my, mw } = bounds;

    drawHoloModalFrame(ctx, mx, my, mw, bounds.mh, '#22c55e', `【身体素质】${gameState.realm_name || '炼体'} ${gameState.sub_level || 1}层`, time);

    const body = gameState.body || {};
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText(`• 体魄强度: ${body.physique || 1}      • 灵气感应: ${body.qi_sense || 0}`, mx + 24, my + 80);
    ctx.fillText(`• 神识精神: ${body.spirit || 0}        • 单台并发: ×${gameState.concurrent_hammers || 1}`, mx + 24, my + 110);
    ctx.fillText(`• 化神矩阵: ${gameState.matrix_slots || 1} 台      • 铁浆凝炼: ${gameState.iron_slag || 0}`, mx + 24, my + 140);
    ctx.fillText(`• 境界底蕴: ${gameState.realm_exp || 0} / ${gameState.exp_to_next || 0}`, mx + 24, my + 170);
}

function drawContextMenu(ctx, w, h) {
    const menu = hudState.contextMenu;
    if (!menu) return;
    const bounds = getContextMenuBounds();
    if (!bounds) return;
    const { mx, my, mw, mh, rowH, pad } = bounds;

    // 更新悬停行
    menu.hover = -1;
    if (uiState.mouseX >= mx && uiState.mouseX <= mx + mw &&
        uiState.mouseY >= my && uiState.mouseY <= my + mh) {
        const idx = Math.floor((uiState.mouseY - my - pad) / rowH);
        if (idx >= 0 && idx < menu.items.length) menu.hover = idx;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 20, 0.96)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.35)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let i = 0; i < menu.items.length; i++) {
        const it = menu.items[i];
        const ry = my + pad + i * rowH;
        if (menu.hover === i && !it.disabled) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
            ctx.fillRect(mx + 2, ry, mw - 4, rowH);
        }
        ctx.fillStyle = it.disabled ? '#475569' : (menu.hover === i ? '#e2e8f0' : '#cbd5e1');
        ctx.font = '12px sans-serif';
        ctx.fillText(it.label, mx + 12, ry + 18);
    }
    ctx.restore();
}

function drawInspectModal(ctx, w, h, time) {
    if (!uiState.isOpen('inspect')) return;
    const bounds = getModalBounds('inspect', w, h);
    const { mx, my, mw, mh } = bounds;
    const item = hudState.inspectItem;

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#00e5ff', '📜【天道出生证明 (四维指纹)】', time);

    if (!item) {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('在锦囊中右键神兵 →「查看出生证」', mx + 24, my + 90);
        return;
    }

    ctx.fillStyle = item.color || '#ffd700';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(item.name || '未名神兵', mx + 24, my + 72);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(`品质: ${item.quality || '[凡]'}  |  估价: ${item.price || '0'} 金币`, mx + 24, my + 96);

    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('📜【天道出生证明】', mx + 24, my + 128);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText(`• 诞生时辰：${item.cert_time || '未知时辰'}`, mx + 28, my + 152);
    ctx.fillText(`• 归属地轴：${item.cert_location || '未知地轴'}`, mx + 28, my + 176);
    ctx.fillText(`• 始祖铸匠：${item.cert_creator || '无名道友'}`, mx + 28, my + 200);
    ctx.fillText(`• 天道印记：[${item.cert_stamp || '玄之又玄'}]`, mx + 28, my + 224);
    ctx.fillText(`• 铭文短码：${item.cert_code || '#????'}`, mx + 28, my + 248);
}
