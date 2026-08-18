/*
 * 模块功能: 赛博修仙调试面板与实时坐标监视器 (Debug & Coordinates Inspector)
 * 支持实时坐标、速度监控、网格辅助线、角色十字准星、一键复制坐标、场景坐标传送与移速调节
 */

import { playerPos } from './input.js';
import { gameState, uiState, clock } from './state.js';
import { hudState, drawHoloModalFrame } from './hud.js';
import { invoke } from './core.js';

export const debugState = {
    showGrid: false,
    showCrosshair: true,
    showHeadCoords: true,
    miniBadgeVisible: false,
    toastMsg: '',
    toastTimer: 0,

    setToast(msg, durationMs = 2500) {
        this.toastMsg = msg;
        this.toastTimer = performance.now() + durationMs;
    }
};

/**
 * 绘制全屏辅助网格、十字准星与头顶坐标
 */
export function drawDebugOverlays(ctx, w, h) {
    const now = performance.now();

    // 1. 赛博网格
    if (debugState.showGrid) {
        ctx.save();
        ctx.lineWidth = 1;
        const gridSize = 50;

        // 细网格线
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.08)';
        ctx.beginPath();
        for (let x = 0; x < w; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();

        // 粗网格线与坐标刻度 (每 200px)
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.22)';
        ctx.fillStyle = 'rgba(0, 255, 200, 0.45)';
        ctx.font = '10px monospace';
        ctx.beginPath();
        for (let x = 0; x < w; x += 200) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.fillText(`${x}`, x + 3, 70);
        }
        for (let y = 0; y < h; y += 200) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.fillText(`${y}`, 20, y - 4);
        }
        ctx.stroke();
        ctx.restore();
    }

    // 2. 玩家十字准星
    if (debugState.showCrosshair) {
        ctx.save();
        const px = playerPos.x;
        const py = playerPos.y;

        ctx.strokeStyle = 'rgba(0, 255, 200, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // 水平线与垂直线
        ctx.beginPath();
        ctx.moveTo(px - 40, py);
        ctx.lineTo(px + 40, py);
        ctx.moveTo(px, py - 40);
        ctx.lineTo(px, py + 40);
        ctx.stroke();
        ctx.setLineDash([]);

        // 中心圆环
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.7)';
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 3. 玩家头顶常驻实时浮动坐标
    if (debugState.showHeadCoords) {
        ctx.save();
        const px = playerPos.x;
        const py = playerPos.y - 48;

        const text = `X:${Math.round(playerPos.x)} Y:${Math.round(playerPos.y)}`;
        ctx.font = 'bold 11px monospace';
        const tw = ctx.measureText(text).width;

        // 气泡底板
        ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
        ctx.strokeStyle = '#00ffc8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(px - tw / 2 - 8, py - 12, tw + 16, 20, 4);
        ctx.fill();
        ctx.stroke();

        // 文字
        ctx.fillStyle = '#00ffc8';
        ctx.fillText(text, px - tw / 2, py + 2);
        ctx.restore();
    }

    // 4. 左下角常驻微型坐标条 (Mini Coordinate Bar)
    if (debugState.miniBadgeVisible && !uiState.isOpen('debug')) {
        ctx.save();
        const bx = 16;
        const by = h - 68;
        const bw = 240;
        const bh = 24;

        ctx.fillStyle = 'rgba(10, 16, 26, 0.88)';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 4);
        ctx.fill();
        ctx.stroke();

        ctx.font = '11px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('📍 坐标:', bx + 8, by + 16);

        ctx.fillStyle = '#00ffc8';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`(${Math.round(playerPos.x)}, ${Math.round(playerPos.y)})`, bx + 56, by + 16);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '10px sans-serif';
        ctx.fillText('[F3/点击 调测]', bx + 162, by + 16);
        ctx.restore();
    }

    // 5. 调试全局 Toast 飘字
    if (debugState.toastTimer > now && debugState.toastMsg) {
        ctx.save();
        const remain = debugState.toastTimer - now;
        const alpha = Math.min(1.0, remain / 500);
        ctx.globalAlpha = alpha;

        const msg = debugState.toastMsg;
        ctx.font = 'bold 13px sans-serif';
        const mw = ctx.measureText(msg).width;
        const tx = w / 2 - mw / 2;
        const ty = 76;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = '#00ffc8';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00ffc8';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(tx - 16, ty - 18, mw + 32, 34, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.fillText(msg, tx, ty + 4);
        ctx.restore();
    }
}

/**
 * 绘制主调试面板
 */
export function drawDebugModal(ctx, w, h, time) {
    if (!uiState.isOpen('debug')) return;

    let mw = 480;
    let mh = 430;
    mw = Math.min(mw, w * 0.92);
    mh = Math.min(mh, h * 0.88);

    const pos = uiState.modalPositions.debug || { x: null, y: null };
    const mx = pos.x !== null ? pos.x : (w * 0.5 - mw / 2);
    const my = pos.y !== null ? pos.y : (h * 0.5 - mh / 2);

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#00ffc8', '🎛️【天道神识 · 坐标与系统调测台】', time);

    let cy = my + 60;

    // --- 1. 实时坐标状态卡片 ---
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx + 16, cy, mw - 32, 92, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('⚡ 实时坐标与物理引擎状态', mx + 26, cy + 20);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`角色坐标: X: `, mx + 26, cy + 42);
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${playerPos.x.toFixed(1)} px`, mx + 95, cy + 42);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText(`Y: `, mx + 205, cy + 42);
    ctx.fillStyle = '#00ffc8';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${playerPos.y.toFixed(1)} px`, mx + 225, cy + 42);

    // 速度与按键
    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`速度矢量: (vx: ${playerPos.vx.toFixed(0)}, vy: ${playerPos.vy.toFixed(0)}) | 移速: ${playerPos.speed} px/s`, mx + 26, cy + 62);
    ctx.fillText(`鼠标视口: (${uiState.mouseX}, ${uiState.mouseY}) | 画面: ${w} × ${h} | 帧率: ${hudState.fps} FPS`, mx + 26, cy + 80);

    cy += 104;

    // --- 2. 快捷功能按钮栏 (复制坐标 / 网格开关 / 准星) ---
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('🛠️ 快捷功能与辅助视图', mx + 20, cy + 12);
    cy += 20;

    const btnH = 26;
    const btnGap = 8;
    const btnW = (mw - 32 - btnGap * 2) / 3;

    // 按钮 1: 一键复制坐标
    drawDebugBtn(ctx, mx + 16, cy, btnW, btnH, '📋 复制坐标', '#00ffc8', false);

    // 按钮 2: 复制初始代码
    drawDebugBtn(ctx, mx + 16 + btnW + btnGap, cy, btnW, btnH, '📄 复制TS代码', '#38bdf8', false);

    // 按钮 3: 辅助网格切换
    drawDebugBtn(ctx, mx + 16 + (btnW + btnGap) * 2, cy, btnW, btnH, debugState.showGrid ? '🌐 网格: 开启' : '🌐 网格: 关闭', debugState.showGrid ? '#22c55e' : '#64748b', debugState.showGrid);

    cy += btnH + 8;

    // 按钮 4: 十字准星
    drawDebugBtn(ctx, mx + 16, cy, btnW, btnH, debugState.showCrosshair ? '🎯 准星: 开启' : '🎯 准星: 关闭', debugState.showCrosshair ? '#22c55e' : '#64748b', debugState.showCrosshair);

    // 按钮 5: 头顶坐标
    drawDebugBtn(ctx, mx + 16 + btnW + btnGap, cy, btnW, btnH, debugState.showHeadCoords ? '🏷️ 顶标: 开启' : '🏷️ 顶标: 关闭', debugState.showHeadCoords ? '#22c55e' : '#64748b', debugState.showHeadCoords);

    // 按钮 6: 重置回出生点
    drawDebugBtn(ctx, mx + 16 + (btnW + btnGap) * 2, cy, btnW, btnH, '🔄 回到 (400,300)', '#e0a050', false);

    cy += btnH + 16;

    // --- 3. 场景地标一键传送 (Instant Teleport) ---
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('🚀 场景关键点瞬移定位 (点击立即到达对应坐标)', mx + 20, cy + 12);
    cy += 20;

    const tBtnW = (mw - 32 - btnGap * 3) / 4;
    drawDebugBtn(ctx, mx + 16, cy, tBtnW, btnH, '🔨 铁砧台', '#f59e0b', false);
    drawDebugBtn(ctx, mx + 16 + (tBtnW + btnGap), cy, tBtnW, btnH, '🔥 熔炉旁', '#ef4444', false);
    drawDebugBtn(ctx, mx + 16 + (tBtnW + btnGap) * 2, cy, tBtnW, btnH, '📜 全息图', '#38bdf8', false);
    drawDebugBtn(ctx, mx + 16 + (tBtnW + btnGap) * 3, cy, tBtnW, btnH, '🏠 默认点', '#22c55e', false);

    cy += btnH + 16;

    // --- 4. 移动速度切换 (Speed Multiplier) ---
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('👟 移动速度设定 (Speed Px/Sec)', mx + 20, cy + 12);
    cy += 20;

    const spdW = (mw - 32 - btnGap * 3) / 4;
    drawDebugBtn(ctx, mx + 16, cy, spdW, btnH, '150 漫步', '#64748b', playerPos.speed === 150);
    drawDebugBtn(ctx, mx + 16 + (spdW + btnGap), cy, spdW, btnH, '300 正常', '#00ffc8', playerPos.speed === 300);
    drawDebugBtn(ctx, mx + 16 + (spdW + btnGap) * 2, cy, spdW, btnH, '500 疾驰', '#38bdf8', playerPos.speed === 500);
    drawDebugBtn(ctx, mx + 16 + (spdW + btnGap) * 3, cy, spdW, btnH, '800 极速', '#a855f7', playerPos.speed === 800);

    // 底部小提示
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('💡 快捷键 [F3] 或 [~] 随时开关调试台 · 鼠标可直接拖动标题栏移动窗口', mx + 20, my + mh - 14);
}

function drawDebugBtn(ctx, bx, by, bw, bh, text, color, active) {
    ctx.fillStyle = active ? `${color}33` : 'rgba(30, 41, 59, 0.7)';
    ctx.strokeStyle = active ? color : '#475569';
    ctx.lineWidth = active ? 1.5 : 1.0;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = active ? color : (color === '#64748b' ? '#94a3b8' : '#e2e8f0');
    ctx.font = 'bold 11px sans-serif';
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, bx + (bw - tw) / 2, by + bh / 2 + 4);
}

/**
 * 处理调试面板上的点击
 */
export function handleDebugClick(clickX, clickY, bounds, w, h) {
    const { mx, my, mw, mh } = bounds;
    let cy = my + 60 + 104 + 20;

    const btnH = 26;
    const btnGap = 8;
    const btnW = (mw - 32 - btnGap * 2) / 3;

    // 行 1: 复制坐标 / 复制TS代码 / 网格开关
    if (clickY >= cy && clickY <= cy + btnH) {
        if (clickX >= mx + 16 && clickX <= mx + 16 + btnW) {
            // 一键复制坐标
            const text = `{ x: ${Math.round(playerPos.x)}, y: ${Math.round(playerPos.y)} }`;
            copyToClipboard(text);
            debugState.setToast(`✅ 已复制当前坐标 ${text} 到剪贴板！`);
            return true;
        }
        if (clickX >= mx + 16 + btnW + btnGap && clickX <= mx + 16 + btnW * 2 + btnGap) {
            // 复制TS代码
            const text = `public player_x: number = ${Math.round(playerPos.x)};\npublic player_y: number = ${Math.round(playerPos.y)};`;
            copyToClipboard(text);
            debugState.setToast(`✅ 已复制 TS 初始化代码到剪贴板！`);
            return true;
        }
        if (clickX >= mx + 16 + (btnW + btnGap) * 2 && clickX <= mx + mw - 16) {
            // 网格开关
            debugState.showGrid = !debugState.showGrid;
            debugState.setToast(`🌐 辅助网格已${debugState.showGrid ? '开启' : '关闭'}`);
            return true;
        }
    }

    cy += btnH + 8;

    // 行 2: 准星 / 顶标 / 重置回 400,300
    if (clickY >= cy && clickY <= cy + btnH) {
        if (clickX >= mx + 16 && clickX <= mx + 16 + btnW) {
            debugState.showCrosshair = !debugState.showCrosshair;
            debugState.setToast(`🎯 十字准星已${debugState.showCrosshair ? '开启' : '关闭'}`);
            return true;
        }
        if (clickX >= mx + 16 + btnW + btnGap && clickX <= mx + 16 + btnW * 2 + btnGap) {
            debugState.showHeadCoords = !debugState.showHeadCoords;
            debugState.setToast(`🏷️ 头顶坐标已${debugState.showHeadCoords ? '开启' : '关闭'}`);
            return true;
        }
        if (clickX >= mx + 16 + (btnW + btnGap) * 2 && clickX <= mx + mw - 16) {
            teleportPlayer(400, 300);
            debugState.setToast(`🔄 已重置角色位置到 (400, 300)`);
            return true;
        }
    }

    cy += btnH + 16 + 20;

    // 行 3: 场景地标传送 (铁砧 / 熔炉 / 蓝图 / 默认)
    const tBtnW = (mw - 32 - btnGap * 3) / 4;
    if (clickY >= cy && clickY <= cy + btnH) {
        if (clickX >= mx + 16 && clickX <= mx + 16 + tBtnW) {
            teleportPlayer(w * 0.5, h * 0.58);
            debugState.setToast(`🔨 已瞬移到【铁砧台】(${Math.round(w * 0.5)}, ${Math.round(h * 0.58)})`);
            return true;
        }
        if (clickX >= mx + 16 + (tBtnW + btnGap) && clickX <= mx + 16 + tBtnW * 2 + btnGap) {
            teleportPlayer(w * 0.5, h * 0.35);
            debugState.setToast(`🔥 已瞬移到【神炉熔口】(${Math.round(w * 0.5)}, ${Math.round(h * 0.35)})`);
            return true;
        }
        if (clickX >= mx + 16 + (tBtnW + btnGap) * 2 && clickX <= mx + 16 + tBtnW * 3 + btnGap * 2) {
            teleportPlayer(w * 0.78, h * 0.38);
            debugState.setToast(`📜 已瞬移到【全息蓝图】(${Math.round(w * 0.78)}, ${Math.round(h * 0.38)})`);
            return true;
        }
        if (clickX >= mx + 16 + (tBtnW + btnGap) * 3 && clickX <= mx + mw - 16) {
            teleportPlayer(400, 300);
            debugState.setToast(`🏠 已瞬移到【默认工坊】(400, 300)`);
            return true;
        }
    }

    cy += btnH + 16 + 20;

    // 行 4: 移速切换
    const spdW = (mw - 32 - btnGap * 3) / 4;
    if (clickY >= cy && clickY <= cy + btnH) {
        if (clickX >= mx + 16 && clickX <= mx + 16 + spdW) {
            playerPos.speed = 150;
            debugState.setToast(`👟 移动速度已设为 150 px/s (漫步)`);
            return true;
        }
        if (clickX >= mx + 16 + (spdW + btnGap) && clickX <= mx + 16 + spdW * 2 + btnGap) {
            playerPos.speed = 300;
            debugState.setToast(`👟 移动速度已设为 300 px/s (标准)`);
            return true;
        }
        if (clickX >= mx + 16 + (spdW + btnGap) * 2 && clickX <= mx + 16 + spdW * 3 + btnGap * 2) {
            playerPos.speed = 500;
            debugState.setToast(`👟 移动速度已设为 500 px/s (疾驰)`);
            return true;
        }
        if (clickX >= mx + 16 + (spdW + btnGap) * 3 && clickX <= mx + mw - 16) {
            playerPos.speed = 800;
            debugState.setToast(`👟 移动速度已设为 800 px/s (极速调试)`);
            return true;
        }
    }

    return false;
}

function teleportPlayer(x, y) {
    playerPos.x = x;
    playerPos.y = y;
    playerPos.vx = 0;
    playerPos.vy = 0;
    invoke('action', { key: 'sync_pos', x, y });
}

function copyToClipboard(text) {
    if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }
}
