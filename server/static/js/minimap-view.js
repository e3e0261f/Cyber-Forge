// ui/js/minimap-view.js
/**
 * 模块功能: 右下角赛博全息小地图与实时坐标罗盘 (Minimap & World Radar)
 * 深度集成 Albion 3 级导航系统（第 1 级：视口雷达与方向指针）
 */

import { playerPos } from './input.js';
import { gameState, uiState } from './state.js';
import { camera } from './camera.js';
import { WORLD_ZONES, PLAYER_SPEED } from './world/world-topology.js';
import { setActiveTab } from './world-map.js';

export const minimapState = {
  collapsed: false,
  showLandmarks: true,
  showRadarSweep: true,
  radarAngle: 0,
  hoveredLandmark: null,

  toggleCollapse() {
    this.collapsed = !this.collapsed;
  }
};

/**
 * 获取小地图在屏幕上的绝对边界 (供绘制与点击命中检测)
 */
export function getMinimapBounds(w, h) {
  const mw = 220;
  const mh = minimapState.collapsed ? 32 : 210;
  const mx = w - mw - 16;
  const my = h - 38 - mh - 10; // 停靠在底部Dock栏上方
  return { mx, my, mw, mh };
}

/**
 * 绘制右下角小地图与坐标罗盘
 */
export function drawMinimap(ctx, w, h, time) {
  const { mx, my, mw, mh } = getMinimapBounds(w, h);
  minimapState.radarAngle = (time * 1.8) % (Math.PI * 2);

  const zoneId = gameState.current_zone_id || gameState.current_city_id || 'beijing';
  const zone = WORLD_ZONES[zoneId] || WORLD_ZONES.beijing;

  ctx.save();

  // 1. 底板与赛博边框
  ctx.fillStyle = 'rgba(8, 14, 22, 0.94)';
  ctx.strokeStyle = zone.color || '#00ffc8';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 8);
  ctx.fill();
  ctx.stroke();

  // 赛博四角装饰点缀
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my); ctx.lineTo(mx + 8, my); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx + mw - 8, my); ctx.lineTo(mx + mw, my); ctx.lineTo(mx + mw, my + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx, my + mh - 8); ctx.lineTo(mx, my + mh); ctx.lineTo(mx + 8, my + mh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx + mw - 8, my + mh); ctx.lineTo(mx + mw, my + mh); ctx.lineTo(mx + mw, my + mh - 8); ctx.stroke();

  // 2. 顶部标题与世界地图快捷按键
  const headerH = 26;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(mx + 1, my + 1, mw - 2, headerH, [7, 7, 0, 0]);
  ctx.fill();

  // 标题
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`🧭 ${zone.name.split(' ')[0]} · 罗盘`, mx + 6, my + 17);

  // [M 区域] 按钮
  const zoneBtnX = mx + mw - 94;
  const zoneBtnY = my + 4;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(zoneBtnX, zoneBtnY, 34, 18, 3);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('M区域', zoneBtnX + 3, zoneBtnY + 12);

  // [K 全图] 按钮
  const worldBtnX = mx + mw - 56;
  const worldBtnY = my + 4;
  ctx.fillStyle = 'rgba(0, 255, 200, 0.15)';
  ctx.strokeStyle = '#00ffc8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(worldBtnX, worldBtnY, 34, 18, 3);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('K全图', worldBtnX + 3, worldBtnY + 12);

  // 折叠按钮
  const foldBtnX = mx + mw - 18;
  const foldBtnY = my + 5;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.roundRect(foldBtnX, foldBtnY, 14, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(minimapState.collapsed ? '+' : '−', foldBtnX + 3, foldBtnY + 12);

  if (minimapState.collapsed) {
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#00ffc8';
    ctx.fillText(`(${Math.round(playerPos.x)}, ${Math.round(playerPos.y)})`, mx + 75, my + 18);
    ctx.restore();
    return;
  }

  // 3. 核心小地图视口区域 (当前区域 27000x27000 空间投影)
  const mapPad = 6;
  const mapX = mx + mapPad;
  const mapY = my + headerH + 2;
  const mapW = mw - mapPad * 2;
  const mapH = mh - headerH - 46 - mapPad;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mapX, mapY, mapW, mapH, 4);
  ctx.clip();

  // 背景
  ctx.fillStyle = zone.bgColor || '#02060e';
  ctx.fillRect(mapX, mapY, mapW, mapH);

  // 坐标映射
  const zWidth = zone.width || 27000;
  const zHeight = zone.height || 27000;
  const toMini = (wx, wy) => {
    const scaleX = mapW / zWidth;
    const scaleY = mapH / zHeight;
    return {
      x: mapX + wx * scaleX,
      y: mapY + wy * scaleY
    };
  };

  // 绘制障碍物
  for (const obs of (zone.obstacles || [])) {
    const p1 = toMini(obs.minX, obs.minY);
    const p2 = toMini(obs.maxX, obs.maxY);
    ctx.fillStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.fillRect(p1.x, p1.y, Math.max(2, p2.x - p1.x), Math.max(2, p2.y - p1.y));
  }

  // 🌟 绘制资源节点 (仅显示 subLevel=4 的金色采集物)
  for (const res of (zone.resources || [])) {
    if ((res.subLevel || 1) < 4) continue; // 只有 4 级采集物显示在小地图
    const rpt = toMini(res.x, res.y);
    ctx.fillStyle = '#fbbf24'; // 金色
    ctx.beginPath();
    ctx.arc(rpt.x, rpt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 绘制传送门标记
  const gates = zone.gates || zone.portals || [];
  for (const gate of gates) {
    const pt = toMini(gate.x, gate.y);
    ctx.fillStyle = gate.color || '#38bdf8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 绘制视口矩形
  const camLeftTop = toMini(camera.x - (w * 0.5) / camera.zoom, camera.y - (h * 0.5) / camera.zoom);
  const camRightBottom = toMini(camera.x + (w * 0.5) / camera.zoom, camera.y + (h * 0.5) / camera.zoom);
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(camLeftTop.x, camLeftTop.y, Math.max(4, camRightBottom.x - camLeftTop.x), Math.max(4, camRightBottom.y - camLeftTop.y));

  // 绘制玩家自身标记
  const playerPt = toMini(playerPos.x, playerPos.y);
  const pulse = 3 + Math.sin(time * 6) * 1.5;
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(playerPt.x, playerPt.y, pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#00ffc8';
  ctx.beginPath();
  ctx.arc(playerPt.x, playerPt.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // 4. 底部出口方向指针与耗时提示 (第 1 级核心：雷达方向指示)
  const footY = my + mh - 44;
  ctx.fillStyle = 'rgba(10, 16, 26, 0.95)';
  ctx.beginPath();
  ctx.roundRect(mx + 2, footY, mw - 4, 42, [0, 0, 6, 6]);
  ctx.fill();

  // 找到最近的门
  let nearestGate = null;
  let nearestDist = Infinity;
  for (const gate of gates) {
    const d = Math.hypot(playerPos.x - gate.x, playerPos.y - gate.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestGate = gate;
    }
  }

  const weather = gameState.current_weather || zone.weather;
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = zone.color || '#00ffc8';
  ctx.fillText(`📍 ${zone.name}`, mx + 6, footY + 14);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(`[${weather}]`, mx + mw - 52, footY + 14);

  if (nearestGate) {
    const etaSecs = Math.round(nearestDist / PLAYER_SPEED);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`➔ 最近星轨门: ${nearestGate.name.split('➔')[0].trim()} (${etaSecs}s)`, mx + 6, footY + 28);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`坐标: (${Math.round(playerPos.x)}, ${Math.round(playerPos.y)}) 移速 300`, mx + 6, footY + 39);
  } else {
    ctx.font = '9px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`(${Math.round(playerPos.x)}, ${Math.round(playerPos.y)}) WASD 自由探索`, mx + 6, footY + 28);
  }

  ctx.restore();
}

/**
 * 处理小地图交互
 */
export function handleMinimapClick(clickX, clickY, w, h) {
  const { mx, my, mw, mh } = getMinimapBounds(w, h);

  if (clickX < mx || clickX > mx + mw || clickY < my || clickY > my + mh) {
    return false;
  }

  // 点击 [M 区域] 按钮
  const zoneBtnX = mx + mw - 94;
  const zoneBtnY = my + 4;
  if (clickX >= zoneBtnX && clickX <= zoneBtnX + 34 && clickY >= zoneBtnY && clickY <= zoneBtnY + 18) {
    setActiveTab('zone');
    uiState.openModal('map');
    return true;
  }

  // 点击 [K 全图] 按钮
  const worldBtnX = mx + mw - 56;
  const worldBtnY = my + 4;
  if (clickX >= worldBtnX && clickX <= worldBtnX + 34 && clickY >= worldBtnY && clickY <= worldBtnY + 18) {
    setActiveTab('world');
    uiState.openModal('map');
    return true;
  }

  // 折叠/展开
  const foldBtnX = mx + mw - 18;
  const foldBtnY = my + 5;
  if (clickX >= foldBtnX && clickX <= foldBtnX + 14 && clickY >= foldBtnY && clickY <= foldBtnY + 16) {
    minimapState.toggleCollapse();
    return true;
  }

  if (minimapState.collapsed) {
    minimapState.toggleCollapse();
    return true;
  }

  // 点击小地图内部 -> 默认打开区域地图
  setActiveTab('zone');
  uiState.openModal('map');
  return true;
}
