/*
 * 模块功能: 右下角赛博全息小地图与实时坐标罗盘 (Minimap & World Radar)
 * 深度集成实时角色坐标显示、场景地标雷达、点击寻路/瞬移与缩放折叠
 */

import { playerPos } from './input.js';
import { gameState, uiState } from './state.js';
import { invoke } from './core.js';
import { debugState } from './debug-view.js';

export const minimapState = {
    collapsed: false,
    showLandmarks: true,
    showRadarSweep: true,
    zoom: 1.0, // 1.0 = 全场景视口
    radarAngle: 0,
    hoveredLandmark: null,

    toggleCollapse() {
        this.collapsed = !this.collapsed;
    }
};

/**
 * 场景关键地标定义 (与 workshop.js 和 environment.js 场景元素对齐)
 */
export function getLandmarks(w, h) {
    return [
        { id: 'furnace', name: '九天神炉', icon: '🔥', color: '#ef4444', x: w * 0.5, y: h * 0.35, r: 18 },
        { id: 'anvil', name: '天道铁砧', icon: '🔨', color: '#f59e0b', x: w * 0.5, y: h * 0.58, r: 18 },
        { id: 'blueprint', name: '全息图谱', icon: '📜', color: '#38bdf8', x: w * 0.78, y: h * 0.38, r: 16 },
        { id: 'apprentice', name: '铸器学徒', icon: '🛠️', color: '#fb923c', x: w * 0.32, y: h * 0.58, r: 14 },
        { id: 'crystals', name: '聚能晶簇', icon: '💎', color: '#c084fc', x: w * 0.86, y: h * 0.65, r: 14 },
        { id: 'spawn', name: '工坊正门', icon: '🏠', color: '#10b981', x: 400, y: 300, r: 12 },
    ];
}

/**
 * 获取小地图在屏幕上的绝对边界 (供绘制与点击命中检测)
 */
export function getMinimapBounds(w, h) {
    const mw = 180;
    const mh = minimapState.collapsed ? 32 : 160;
    const mx = w - mw - 16;
    const my = h - 38 - mh - 10; // 停靠在底部Dock栏上方，间距 10px
    return { mx, my, mw, mh };
}

/**
 * 绘制右下角小地图与坐标罗盘
 */
export function drawMinimap(ctx, w, h, time) {
    const { mx, my, mw, mh } = getMinimapBounds(w, h);
    minimapState.radarAngle = (time * 1.8) % (Math.PI * 2);

    ctx.save();

    // 1. 底板与赛博边框
    ctx.fillStyle = 'rgba(8, 14, 22, 0.92)';
    ctx.strokeStyle = '#00ffc8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 8);
    ctx.fill();
    ctx.stroke();

    // 赛博四角装饰点缀
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    // 左上
    ctx.beginPath(); ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my); ctx.lineTo(mx + 8, my); ctx.stroke();
    // 右上
    ctx.beginPath(); ctx.moveTo(mx + mw - 8, my); ctx.lineTo(mx + mw, my); ctx.lineTo(mx + mw, my + 8); ctx.stroke();
    // 左下
    ctx.beginPath(); ctx.moveTo(mx, my + mh - 8); ctx.lineTo(mx, my + mh); ctx.lineTo(mx + 8, my + mh); ctx.stroke();
    // 右下
    ctx.beginPath(); ctx.moveTo(mx + mw - 8, my + mh); ctx.lineTo(mx + mw, my + mh); ctx.lineTo(mx + mw, my + mh - 8); ctx.stroke();

    // 2. 顶部标题与折叠按钮
    const headerH = 26;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.beginPath();
    ctx.roundRect(mx + 1, my + 1, mw - 2, headerH, [7, 7, 0, 0]);
    ctx.fill();

    // 标题
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('🗺️ 神工坊罗盘', mx + 8, my + 17);

    // 折叠/展开按钮
    const foldBtnX = mx + mw - 22;
    const foldBtnY = my + 5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.roundRect(foldBtnX, foldBtnY, 16, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(minimapState.collapsed ? '+' : '−', foldBtnX + 4, foldBtnY + 12);

    // 如果折叠，只显示一行坐标
    if (minimapState.collapsed) {
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#00ffc8';
        ctx.fillText(`(${Math.round(playerPos.x)}, ${Math.round(playerPos.y)})`, mx + 90, my + 18);
        ctx.restore();
        return;
    }

    // 3. 核心小地图视口区域 (Radar Viewport)
    const mapPad = 6;
    const mapX = mx + mapPad;
    const mapY = my + headerH + 2;
    const mapW = mw - mapPad * 2;
    const mapH = mh - headerH - 24 - mapPad; // 留出底部坐标条

    // 裁剪地图区域
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapW, mapH, 4);
    ctx.clip();

    // 地图内背景网格
    ctx.fillStyle = 'rgba(2, 6, 14, 0.95)';
    ctx.fillRect(mapX, mapY, mapW, mapH);

    // 细雷达网格
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // 十字中心轴
    ctx.moveTo(mapX + mapW / 2, mapY);
    ctx.lineTo(mapX + mapW / 2, mapY + mapH);
    ctx.moveTo(mapX, mapY + mapH / 2);
    ctx.lineTo(mapX + mapW, mapY + mapH / 2);
    // 同心圆
    const maxR = Math.min(mapW, mapH) * 0.45;
    ctx.arc(mapX + mapW / 2, mapY + mapH / 2, maxR * 0.5, 0, Math.PI * 2);
    ctx.moveTo(mapX + mapW / 2 + maxR, mapY + mapH / 2);
    ctx.arc(mapX + mapW / 2, mapY + mapH / 2, maxR, 0, Math.PI * 2);
    ctx.stroke();

    // 动态雷达扫描线
    if (minimapState.showRadarSweep) {
        const rcx = mapX + mapW / 2;
        const rcy = mapY + mapH / 2;
        const sweepGrad = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, maxR);
        sweepGrad.addColorStop(0, 'rgba(0, 255, 200, 0.25)');
        sweepGrad.addColorStop(1, 'rgba(0, 255, 200, 0)');
        ctx.fillStyle = sweepGrad;
        ctx.beginPath();
        ctx.moveTo(rcx, rcy);
        ctx.arc(rcx, rcy, maxR, minimapState.radarAngle, minimapState.radarAngle + 0.4);
        ctx.closePath();
        ctx.fill();
    }

    // 比例转换函数：将世界坐标 (wx, wy) 映射到小地图视口 (mapX, mapY, mapW, mapH)
    const worldToMap = (wx, wy) => {
        const scaleX = mapW / Math.max(1, w);
        const scaleY = mapH / Math.max(1, h);
        return {
            x: mapX + wx * scaleX,
            y: mapY + wy * scaleY
        };
    };

    // 4. 绘制所有地标 (Landmarks)
    if (minimapState.showLandmarks) {
        const landmarks = getLandmarks(w, h);
        for (const lm of landmarks) {
            const pt = worldToMap(lm.x, lm.y);

            // 地标光晕
            ctx.fillStyle = `${lm.color}33`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
            ctx.fill();

            // 地标小圆点
            ctx.fillStyle = lm.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
            ctx.fill();

            // 图标
            ctx.font = '8px sans-serif';
            ctx.fillText(lm.icon, pt.x - 4, pt.y - 4);
        }
    }

    // 5. 绘制玩家自身标记 (Player Marker)
    const playerPt = worldToMap(playerPos.x, playerPos.y);

    // 玩家呼吸雷达光环
    const pulse = 4 + Math.sin(time * 6) * 2;
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(playerPt.x, playerPt.y, pulse, 0, Math.PI * 2);
    ctx.stroke();

    // 玩家实体光斑
    ctx.fillStyle = '#00ffc8';
    ctx.beginPath();
    ctx.arc(playerPt.x, playerPt.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 玩家方向指示
    if (Math.abs(playerPos.vx) > 0.1 || Math.abs(playerPos.vy) > 0.1) {
        const angle = Math.atan2(playerPos.vy, playerPos.vx);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playerPt.x, playerPt.y);
        ctx.lineTo(playerPt.x + Math.cos(angle) * 7, playerPt.y + Math.sin(angle) * 7);
        ctx.stroke();
    }

    ctx.restore(); // 结束视口裁剪

    // 6. 底部绑定坐标栏 (Bound Coordinates Bar)
    const footY = my + mh - 22;
    ctx.fillStyle = 'rgba(10, 16, 26, 0.95)';
    ctx.beginPath();
    ctx.roundRect(mx + 2, footY, mw - 4, 20, [0, 0, 6, 6]);
    ctx.fill();

    // 坐标标签
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('📍 坐标:', mx + 6, footY + 14);

    // 动态坐标数值
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#00ffc8';
    const coordText = `X:${Math.round(playerPos.x)} Y:${Math.round(playerPos.y)}`;
    ctx.fillText(coordText, mx + 44, footY + 14);

    // 调试台联动微按钮 [调测]
    const dbgBtnX = mx + mw - 42;
    ctx.fillStyle = uiState.isOpen('debug') ? 'rgba(0, 255, 200, 0.2)' : 'rgba(56, 189, 248, 0.15)';
    ctx.strokeStyle = uiState.isOpen('debug') ? '#00ffc8' : '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(dbgBtnX, footY + 2, 36, 16, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = uiState.isOpen('debug') ? '#00ffc8' : '#38bdf8';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('调测', dbgBtnX + 8, footY + 13);

    ctx.restore();
}

/**
 * 处理小地图交互 (点击小地图瞬移/导航、折叠展开、调测台开启)
 */
export function handleMinimapClick(clickX, clickY, w, h) {
    const { mx, my, mw, mh } = getMinimapBounds(w, h);

    // 1. 判断是否在小地图总边框内
    if (clickX < mx || clickX > mx + mw || clickY < my || clickY > my + mh) {
        return false;
    }

    // 2. 点击折叠/展开按钮
    const foldBtnX = mx + mw - 22;
    const foldBtnY = my + 5;
    if (clickX >= foldBtnX && clickX <= foldBtnX + 16 && clickY >= foldBtnY && clickY <= foldBtnY + 16) {
        minimapState.toggleCollapse();
        return true;
    }

    // 3. 点击顶部标题区域直接折叠/展开
    if (clickY >= my && clickY <= my + 26) {
        minimapState.toggleCollapse();
        return true;
    }

    if (minimapState.collapsed) {
        minimapState.toggleCollapse();
        return true;
    }

    // 4. 点击底部坐标栏的 [调测] 按钮
    const footY = my + mh - 22;
    if (clickY >= footY && clickY <= footY + 20) {
        uiState.toggleModal('debug');
        return true;
    }

    // 5. 点击小地图内部 -> 映射世界坐标并瞬移/移动
    const mapPad = 6;
    const headerH = 26;
    const mapX = mx + mapPad;
    const mapY = my + headerH + 2;
    const mapW = mw - mapPad * 2;
    const mapH = mh - headerH - 24 - mapPad;

    if (clickX >= mapX && clickX <= mapX + mapW && clickY >= mapY && clickY <= mapY + mapH) {
        const ratioX = (clickX - mapX) / mapW;
        const ratioY = (clickY - mapY) / mapH;
        const targetWorldX = Math.round(ratioX * w);
        const targetWorldY = Math.round(ratioY * h);

        playerPos.x = targetWorldX;
        playerPos.y = targetWorldY;
        playerPos.vx = 0;
        playerPos.vy = 0;
        invoke('action', { key: 'sync_pos', x: targetWorldX, y: targetWorldY });

        debugState.setToast(`🧭 罗盘定位: 已瞬移至 (${targetWorldX}, ${targetWorldY})`);
        return true;
    }

    return true; // 拦截事件，避免击锤穿透
}
