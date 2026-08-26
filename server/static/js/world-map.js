// ui/js/world-map.js
/**
 * 🗺️ Albion-Like 三级地图导航系统：
 * 1. 小地图 (Minimap - 视口雷达与方向指针)
 * 2. 区域地图 (Zone Map - [M] 键：27000x27000 区域俯视图、固定传送门与资源点)
 * 3. 九州拓扑图谱 (World Map - [L] 键：7 主城 + 60 野外节点、Dijkstra 最短路径、跨城贸易与天空之城)
 */

import { gameState, uiState, syncState, gameStore } from './state.js';
import { formatNum } from './core.js';
import { playerPos, getModalBounds } from './input.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { audio } from './audio.js';
import { camera } from './camera.js';
import { triggerWarpEffect } from './world.js';
import { WORLD_ZONES, findShortestPath, MAP_SIZE, PLAYER_SPEED } from './world/world-topology.js';

export let activeTab = 'zone'; // 'zone' | 'world' | 'trade' | 'sky_city'
export let selectedZoneId = 'beijing';

export function setActiveTab(tab) {
  if (['zone', 'world', 'trade', 'sky_city'].includes(tab)) {
    activeTab = tab;
  }
}

export const CITIES_CONFIG = {
  beijing: { id: 'beijing', name: '北京', alias: '红皇城', color: '#ef4444', weather: '风沙', desc: '帝京皇威赫赫，回收神兵与熔铁。' },
  hebei: { id: 'hebei', name: '河北', alias: '火城', color: '#f97316', weather: '烈阳', desc: '燕赵地脉涌动九幽地火，百炼名匠之都。' },
  yunnan: { id: 'yunnan', name: '云南', alias: '木城', color: '#10b981', weather: '多雨', desc: '十万大山古木参天，盛产灵木与奇蕈。' },
  zhejiang: { id: 'zhejiang', name: '浙江', alias: '水城', color: '#06b6d4', weather: '微澜', desc: '江南水乡灵泉遍布，学徒工坊云集。' },
  shanghai: { id: 'shanghai', name: '上海', alias: '金城', color: '#f59e0b', weather: '商晴', desc: '东海通商口岸，拍卖行与钱庄总舵。' },
  qinghai: { id: 'qinghai', name: '青海', alias: '土城', color: '#eab308', weather: '晴雪', desc: '极西高原圣境，盛产大地母石与天晶。' },
  sky_city: { id: 'sky_city', name: '天空之城', alias: '迷雾神境', color: '#a855f7', weather: '极光', desc: '太虚浮空秘岛，需百枚灵玉破封。' },
};

export const TRADE_ROUTES_CONFIG = [
  { id: 1, from: 'yunnan', to: 'beijing', goods: '十万大山千年灵木', mult: 2.0, cost: 5000, profit: 12000 },
  { id: 2, from: 'hebei', to: 'zhejiang', goods: '九幽丙火玄铁原矿', mult: 1.8, cost: 4000, profit: 8800 },
  { id: 3, from: 'zhejiang', to: 'shanghai', goods: '龙泉古胚与水淬名剑', mult: 1.6, cost: 6000, profit: 11000 },
  { id: 4, from: 'qinghai', to: 'shanghai', goods: '西域坤灵母石与天晶', mult: 2.2, cost: 8000, profit: 21000 },
  { id: 5, from: 'sky_city', to: 'beijing', goods: '太虚玄晶与星辰神铁', mult: 3.0, cost: 15000, profit: 52000 },
];

/**
 * 绘制主弹窗 (带全局状态保存与隔离)
 */
export function drawWorldMapModal(ctx, w, h, time) {
  if (!uiState.isOpen('map')) return;

  // 🌟 核心防御：完全隔离 Canvas 状态
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const bounds = getModalBounds('map', w, h);
  const { mx, my, mw, mh } = bounds;

  // 1. 弹窗基框
  drawHoloModalFrame(ctx, mx, my, mw, mh, '#00ffc8', '🗺️ Albion-Like 九州导航网络 (90秒规则 & 三级地图)', time);

  // 2. 标签页切换栏
  const tabY = my + 38;
  const tabs = [
    { id: 'zone', label: '🧭 区域地图 [Tab/M]' },
    { id: 'world', label: '🗺️ 世界地图 [S+Tab/L]' },
    { id: 'trade', label: '🚚 跑商路线与行情' },
    { id: 'sky_city', label: '✨ 天空之城解封' },
  ];
  const tabW = 160, tabH = 26;

  tabs.forEach((tab, i) => {
    const tx = mx + 20 + i * (tabW + 8);
    const isCur = activeTab === tab.id;
    ctx.fillStyle = isCur ? 'rgba(0, 255, 200, 0.2)' : 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = isCur ? '#00ffc8' : '#475569';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(tx, tabY, tabW, tabH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isCur ? '#00ffc8' : '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tab.label, tx + 10, tabY + 17);
  });

  // 3. 当前所在区域与天气 Banner
  const curZoneId = gameState.current_zone_id || gameState.current_city_id || 'beijing';
  const curZone = WORLD_ZONES[curZoneId] || WORLD_ZONES.beijing;
  const curWeather = gameState.current_weather || curZone.weather || '天朗气清';

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(mx + mw - 280, tabY - 2, 260, 30, 4);
  ctx.fill();
  ctx.stroke();

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.textAlign = 'left';
  ctx.fillText(`当前: `, mx + mw - 270, tabY + 17);
  ctx.fillStyle = curZone.color || '#00ffc8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`${curZone.name.split(' ')[0]}`, mx + mw - 235, tabY + 17);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(`[${curWeather}]`, mx + mw - 95, tabY + 17);

  // 4. 内容区域
  const contentY = tabY + 36;
  const contentH = mh - 84;
  const contentW = mw - 40;
  const contentX = mx + 20;

  if (activeTab === 'zone') {
    drawZoneMapView(ctx, contentX, contentY, contentW, contentH, time, curZone);
  } else if (activeTab === 'world') {
    drawWorldTopologyView(ctx, contentX, contentY, contentW, contentH, time, curZoneId);
  } else if (activeTab === 'trade') {
    drawTradeView(ctx, contentX, contentY, contentW, contentH, time);
  } else if (activeTab === 'sky_city') {
    drawSkyCityView(ctx, contentX, contentY, contentW, contentH, time);
  }

  // 🌟 核心防御：完全恢复 Canvas 原始状态
  ctx.restore();
}

/**
 * 【二级地图】：当前区域地图 (Zone Map)
 */
function drawZoneMapView(ctx, cx, cy, cw, ch, time, zone) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, cw, ch);
  ctx.clip();

  ctx.fillStyle = zone.bgColor || '#090d16';
  ctx.fillRect(cx, cy, cw, ch);

  const mapPad = 30;
  const mapW = cw - mapPad * 2;
  const mapH = ch - mapPad * 2 - 80;
  const scale = Math.min(mapW / MAP_SIZE, mapH / MAP_SIZE);
  const viewW = MAP_SIZE * scale;
  const viewH = MAP_SIZE * scale;
  const ox = cx + mapPad + (mapW - viewW) * 0.5;
  const oy = cy + mapPad + (mapH - viewH) * 0.5;

  const toScreenX = (wx) => ox + wx * scale;
  const toScreenY = (wy) => oy + wy * scale;

  ctx.fillStyle = zone.tileColor1 || '#141e2e';
  ctx.fillRect(ox, oy, viewW, viewH);
  ctx.strokeStyle = zone.borderColor || '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, viewW, viewH);

  // 坐标网格
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const gx = ox + viewW * (i / 10);
    const gy = oy + viewH * (i / 10);
    ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, oy + viewH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + viewW, gy); ctx.stroke();
  }

  // 障碍物
  for (const obs of (zone.obstacles || [])) {
    const sx = toScreenX(obs.minX);
    const sy = toScreenY(obs.minY);
    const sw = (obs.maxX - obs.minX) * scale;
    const sh = (obs.maxY - obs.minY) * scale;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.strokeStyle = zone.color || '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(obs.name, sx + sw * 0.5, sy + sh * 0.5 + 3);
  }

  // 资源点
  for (const res of (zone.resources || [])) {
    const rx = toScreenX(res.x);
    const ry = toScreenY(res.y);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(rx, ry, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`💎 ${res.name} (T${res.tier})`, rx, ry - 8);
  }

  // 固定星轨传送门
  const gates = zone.gates || zone.portals || [];
  for (const gate of gates) {
    const gx = toScreenX(gate.x);
    const gy = toScreenY(gate.y);

    const distPx = Math.hypot(playerPos.x - gate.x, playerPos.y - gate.y);
    const etaSecs = Math.round(distPx / PLAYER_SPEED);

    ctx.fillStyle = gate.color || '#38bdf8';
    ctx.beginPath();
    ctx.arc(gx, gy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = gate.color || '#38bdf8';
    ctx.lineWidth = 1;
    const label = `🌀 ${gate.name.split('➔')[0].trim()} [${etaSecs}秒]`;
    ctx.font = 'bold 10px sans-serif';
    const lw = ctx.measureText(label).width + 12;
    ctx.beginPath();
    ctx.roundRect(gx - lw * 0.5, gy + 10, lw, 18, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(label, gx, gy + 22);
  }

  // 玩家自身位置
  const px = toScreenX(playerPos.x);
  const py = toScreenY(playerPos.y);
  const pulse = Math.sin(time * 6) * 3;

  ctx.strokeStyle = 'rgba(0, 255, 200, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 10 + pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#00ffc8';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📍 当前位置', px, py - 12);

  ctx.restore();

  // 底部详情与神行归位
  const cardY = cy + ch - 75;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(cx + 10, cardY, cw - 20, 68, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = zone.color || '#00ffc8';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`【${zone.name}】 区域尺寸: 27,000 × 27,000 px | 默认移速: 300 px/s (横跨全图刚好 90 秒)`, cx + 24, cardY + 22);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.fillText(`当前坐标: (${Math.round(playerPos.x)}, ${Math.round(playerPos.y)}) | 气候: 【${zone.weather}】 (${zone.weatherBuff || '无特别增益'})`, cx + 24, cardY + 42);
  ctx.fillText(`出口数量: ${gates.length} 个固定星轨门 (坐标锁定于边界 25%~75% 黄金通道)`, cx + 24, cardY + 58);

  const isCarryingTicket = !!(gameState.merchant_ticket && gameState.merchant_ticket.is_active);
  const tpCenterBtnX = cx + cw - 170;
  const tpCenterBtnY = cardY + 16;
  ctx.fillStyle = isCarryingTicket ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0, 255, 200, 0.2)';
  ctx.strokeStyle = isCarryingTicket ? '#ef4444' : '#00ffc8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tpCenterBtnX, tpCenterBtnY, 140, 36, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isCarryingTicket ? '#f87171' : '#00ffc8';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isCarryingTicket ? '🚫 押运中(禁归位)' : '⚡ 神行归位 (中心点)', tpCenterBtnX + 70, tpCenterBtnY + 22);
  ctx.textAlign = 'left'; // 🌟 严谨复位
}

/**
 * 【三级地图】：世界拓扑图谱 (World Graph)
 */
function drawWorldTopologyView(ctx, cx, cy, cw, ch, time, curZoneId) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, cw, ch);
  ctx.clip();

  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(cx, cy, cw, ch);

  const ox = cx + cw * 0.5;
  const oy = cy + (ch - 90) * 0.5 + 20;
  const scale = Math.min(cw / 22, (ch - 90) / 22);

  const toScreenX = (gx) => ox + gx * scale;
  const toScreenY = (gy) => oy + gy * scale;

  // 1. 绘制连线
  const drawnEdges = new Set();
  const shortest = findShortestPath(curZoneId, selectedZoneId);
  const pathSet = new Set(shortest.path);

  for (const [zid, zone] of Object.entries(WORLD_ZONES)) {
    if (!zone.gates) continue;
    const sx = toScreenX(zone.graphX);
    const sy = toScreenY(zone.graphY);

    for (const gate of zone.gates) {
      const target = WORLD_ZONES[gate.targetZoneId];
      if (!target) continue;
      const edgeKey = [zid, gate.targetZoneId].sort().join('--');
      if (drawnEdges.has(edgeKey)) continue;
      drawnEdges.add(edgeKey);

      const ex = toScreenX(target.graphX);
      const ey = toScreenY(target.graphY);

      const isPathEdge = pathSet.has(zid) && pathSet.has(gate.targetZoneId) &&
        Math.abs(shortest.path.indexOf(zid) - shortest.path.indexOf(gate.targetZoneId)) === 1;

      ctx.strokeStyle = isPathEdge ? '#00ffc8' : 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = isPathEdge ? 3 : 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      if (isPathEdge) {
        const t = (time * 0.8) % 1.0;
        const fx = sx + (ex - sx) * t;
        const fy = sy + (ey - sy) * t;
        ctx.fillStyle = '#00ffc8';
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 2. 绘制节点
  for (const [zid, zone] of Object.entries(WORLD_ZONES)) {
    const sx = toScreenX(zone.graphX);
    const sy = toScreenY(zone.graphY);
    const isCur = zid === curZoneId;
    const isSel = zid === selectedZoneId;
    const inPath = pathSet.has(zid);
    const isCity = zone.isCity;

    const r = isCity ? 14 : 5;

    if (isCur || isSel) {
      ctx.strokeStyle = isCur ? '#00ffc8' : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 4 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = isCity ? (zone.color || '#ef4444') : (inPath ? '#00ffc8' : '#334155');
    ctx.strokeStyle = isCity ? '#ffffff' : (inPath ? '#00ffc8' : '#64748b');
    ctx.lineWidth = isCity ? 2 : 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isCity) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.name.split(' ')[0], sx, sy - 18);
    }
  }

  ctx.restore();

  // 3. 底部选定节点信息
  const cardY = cy + ch - 85;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(cx + 10, cardY, cw - 20, 78, 6);
  ctx.fill();
  ctx.stroke();

  const selZone = WORLD_ZONES[selectedZoneId] || WORLD_ZONES.beijing;
  ctx.fillStyle = selZone.color || '#00ffc8';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`【${selZone.name}】 (${selZone.alias || '野外要塞'}) - 气候: 【${selZone.weather}】`, cx + 24, cardY + 22);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '11px sans-serif';
  const etaMins = (shortest.totalSeconds / 60).toFixed(1);
  ctx.fillText(`🧭 导航路线: ${shortest.path.map(id => WORLD_ZONES[id] ? WORLD_ZONES[id].name.split(' ')[0] : id).join(' ➔ ')}`, cx + 24, cardY + 40);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.fillText(`耗时: 跨越 ${shortest.steps} 张地图 | 全程总需: ${shortest.totalSeconds} 秒 (${etaMins} 分钟) | ${selZone.weatherBuff || '无特殊增益'}`, cx + 24, cardY + 58);

  const isHere = curZoneId === selectedZoneId;
  const isCarryingTicket = !!(gameState.merchant_ticket && gameState.merchant_ticket.is_active);
  const tpBtnX = cx + cw - 160;
  const tpBtnY = cardY + 18;
  ctx.fillStyle = isCarryingTicket ? 'rgba(239, 68, 68, 0.15)' : (isHere ? 'rgba(51, 65, 85, 0.5)' : 'rgba(0, 255, 200, 0.25)');
  ctx.strokeStyle = isCarryingTicket ? '#ef4444' : (isHere ? '#475569' : '#00ffc8');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tpBtnX, tpBtnY, 130, 38, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isCarryingTicket ? '#f87171' : (isHere ? '#64748b' : '#00ffc8');
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isCarryingTicket ? '🚫 押运商票(禁传送)' : (isHere ? '已在此地' : '✨ 跨界穿梭 (传送)'), tpBtnX + 65, tpBtnY + 23);
  ctx.textAlign = 'left'; // 🌟 严谨复位
}

function drawTradeView(ctx, cx, cy, cw, ch, time) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🚚 九州跨城贸易链与动态商价行情 (基于 6 站野外拓扑距离)', cx + 20, cy + 28);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.fillText('相邻主城间跨越 6 张野外地图（通行耗时 > 9分钟），长途跋涉赋予商运极高利润与溢价回报。', cx + 20, cy + 48);

  const caravanY = cy + 60;
  const isCaravanActive = !!gameState.caravan_active;
  const progress = gameState.caravan_progress || 0;

  ctx.fillStyle = isCaravanActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 41, 59, 0.6)';
  ctx.strokeStyle = isCaravanActive ? '#10b981' : '#475569';
  ctx.beginPath();
  ctx.roundRect(cx + 20, caravanY, cw - 40, 52, 6);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = isCaravanActive ? '#34d399' : '#94a3b8';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(isCaravanActive ? `🚚 护送中：${gameState.caravan_desc || '商队正在跨越 6 驿站'}` : '⏳ 当前无护送中的车队', cx + 34, caravanY + 24);

  if (isCaravanActive) {
    const barW = cw - 120;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(cx + 34, caravanY + 32, barW, 10);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(cx + 34, caravanY + 32, barW * (progress / 100), 10);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${progress}%`, cx + barW + 42, caravanY + 41);
  }

  const listY = caravanY + 66;
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('🗺️ 可选跨城行商路线与动态溢价：', cx + 20, listY);

  TRADE_ROUTES_CONFIG.forEach((route, idx) => {
    const ry = listY + 14 + idx * 52;
    const fromCity = CITIES_CONFIG[route.from] || { name: route.from };
    const toCity = CITIES_CONFIG[route.to] || { name: route.to };

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(cx + 20, ry, cw - 40, 44, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`【${fromCity.name} ➔ ${toCity.name}】 (跨越 6 级野外链)`, cx + 34, ry + 20);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`商运物资: ${route.goods} | 溢价倍率: ${route.mult.toFixed(1)}x`, cx + 230, ry + 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText(`本金: ${route.cost} 金币 | 预期收益: +${route.profit} 金币 + 1 仙玉`, cx + 34, ry + 36);

    const btnX = cx + cw - 150;
    const btnY = ry + 8;
    const btnW = 110;
    const btnH = 28;

    const canStart = !isCaravanActive && BigInt(gameState.coins || 0) >= BigInt(route.cost);
    ctx.fillStyle = canStart ? 'rgba(245, 158, 11, 0.25)' : 'rgba(51, 65, 85, 0.3)';
    ctx.strokeStyle = canStart ? '#f59e0b' : '#475569';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = canStart ? '#fbbf24' : '#64748b';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('🚚 组建贸易车队', btnX + 12, btnY + 18);
  });
}

function drawSkyCityView(ctx, cx, cy, cw, ch, time) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 6);
  ctx.fill();
  ctx.stroke();

  const isUnlocked = !!gameState.sky_city_unlocked;
  const currentJades = gameState.sky_city_jades || 0;
  const totalRequired = 100;

  ctx.fillStyle = isUnlocked ? '#00ffc8' : '#cbd5e1';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(isUnlocked ? '🌟【九天秘境】天空之城已完全破封！' : '🌌【九天封印】天空之城解封全服大典', cx + 24, cy + 32);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText('天空之城乃失落的 Albion 迷雾之岛，需要全服修士共同采集奉纳 100 枚稀有灵玉，方可撕裂混沌迷雾。', cx + 24, cy + 54);

  const shrineY = cy + 74;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
  ctx.strokeStyle = isUnlocked ? '#00ffc8' : '#38bdf8';
  ctx.beginPath();
  ctx.roundRect(cx + 24, shrineY, cw - 48, 140, 8);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`✨ 破界灵玉归位进度: ${currentJades} / ${totalRequired}`, cx + 44, shrineY + 36);

  const barW = cw - 100;
  ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
  ctx.fillRect(cx + 44, shrineY + 54, barW, 20);
  ctx.fillStyle = isUnlocked ? '#00ffc8' : '#38bdf8';
  ctx.fillRect(cx + 44, shrineY + 54, barW * Math.min(1.0, currentJades / totalRequired), 20);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`${((currentJades / totalRequired) * 100).toFixed(0)}%`, cx + barW / 2 + 30, shrineY + 68);

  const btnX = cx + 44;
  const btnY = shrineY + 88;
  const btnW = 160;
  const btnH = 34;

  const hasJade = BigInt(gameState.jade || 0) >= 1n;
  ctx.fillStyle = isUnlocked ? 'rgba(51, 65, 85, 0.5)' : (hasJade ? 'rgba(0, 255, 200, 0.25)' : 'rgba(51, 65, 85, 0.3)');
  ctx.strokeStyle = isUnlocked ? '#475569' : (hasJade ? '#00ffc8' : '#475569');
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnW, btnH, 4);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = isUnlocked ? '#64748b' : (hasJade ? '#00ffc8' : '#64748b');
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(isUnlocked ? '已完全解封' : '💎 奉纳 1 枚稀有灵玉', btnX + 16, btnY + 22);

  const featY = shrineY + 160;
  ctx.fillStyle = '#00ffc8';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('🏛️ 天空之城专属迷雾特权与秘宝：', cx + 24, featY);

  const perks = [
    '• 混沌太虚神力加持：神兵锻造掉落【史诗 / 神话】级概率飙升 +35%',
    '• 绝版天道材料产出：天道玄晶、太虚神铁、星辰元胚高频掉落',
    '• 跨城无界贸易：太虚玄晶在上海与北京可兑换 2.5x 巨额金币与灵玉',
  ];

  perks.forEach((p, i) => {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.fillText(p, cx + 30, featY + 24 + i * 22);
  });
}

export function handleWorldMapClick(mouseX, mouseY) {
  if (!uiState.isOpen('map')) return false;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const bounds = getModalBounds('map', w, h);
  const { mx, my, mw, mh } = bounds;

  if (mouseX < mx || mouseX > mx + mw || mouseY < my || mouseY > my + mh) {
    return false;
  }

  const tabY = my + 38;
  const tabW = 160, tabH = 26;
  const tabs = ['zone', 'world', 'trade', 'sky_city'];

  tabs.forEach((tabId, i) => {
    const tx = mx + 20 + i * (tabW + 8);
    if (mouseX >= tx && mouseX <= tx + tabW && mouseY >= tabY && mouseY <= tabY + tabH) {
      activeTab = tabId;
      audio.playUI();
    }
  });

  const contentY = tabY + 36;
  const contentH = mh - 84;
  const contentW = mw - 40;
  const contentX = mx + 20;

  if (activeTab === 'zone') {
    const cardY = contentY + contentH - 75;
    const tpCenterBtnX = contentX + contentW - 170;
    const tpCenterBtnY = cardY + 16;
    if (mouseX >= tpCenterBtnX && mouseX <= tpCenterBtnX + 140 && mouseY >= tpCenterBtnY && mouseY <= tpCenterBtnY + 36) {
      if (gameState.merchant_ticket && gameState.merchant_ticket.is_active) {
        gameStore.setToast('⚠️ 持有商票期间严禁飞行与快速传送，必须脚踏实地徒步跑商！', '#ef4444');
        audio.playUI();
        return true;
      }
      playerPos.x = 13500;
      playerPos.y = 13500;
      camera.snapTo(13500, 13500);
      gameStore.updatePlayerPosition(13500, 13500, null, { persist: true, syncServer: true });
      audio.playUI();
      return true;
    }
  } else if (activeTab === 'world') {
    const ox = contentX + contentW * 0.5;
    const oy = contentY + (contentH - 90) * 0.5 + 20;
    const scale = Math.min(contentW / 22, (contentH - 90) / 22);

    for (const [zid, zone] of Object.entries(WORLD_ZONES)) {
      const sx = ox + zone.graphX * scale;
      const sy = oy + zone.graphY * scale;
      const r = zone.isCity ? 18 : 9;
      if (Math.hypot(mouseX - sx, mouseY - sy) <= r) {
        selectedZoneId = zid;
        audio.playUI();
        return true;
      }
    }

    const cardY = contentY + contentH - 85;
    const tpBtnX = contentX + contentW - 160;
    const tpBtnY = cardY + 18;
    if (mouseX >= tpBtnX && mouseX <= tpBtnX + 130 && mouseY >= tpBtnY && mouseY <= tpBtnY + 38) {
      if (gameState.merchant_ticket && gameState.merchant_ticket.is_active) {
        gameStore.setToast('⚠️ 持有商票期间严禁飞行与快速传送，必须脚踏实地徒步跑商！', '#ef4444');
        audio.playUI();
        return true;
      }
      triggerWarpEffect();
      audio.playUI();
      gameStore.dispatchAction(`teleport_zone:${selectedZoneId}`).then(snap => {
        if (snap) {
          playerPos.x = snap.player_x || 13500;
          playerPos.y = snap.player_y || 13500;
          camera.snapTo(playerPos.x, playerPos.y);
        }
      });
      return true;
    }
  } else if (activeTab === 'trade') {
    const listY = contentY + 126;
    TRADE_ROUTES_CONFIG.forEach((route, idx) => {
      const ry = listY + 14 + idx * 52;
      const btnX = contentX + contentW - 150;
      const btnY = ry + 8;
      if (mouseX >= btnX && mouseX <= btnX + 110 && mouseY >= btnY && mouseY <= btnY + 28) {
        gameStore.dispatchAction(`start_caravan:${idx}`);
        audio.playUI();
      }
    });
  } else if (activeTab === 'sky_city') {
    const shrineY = contentY + 74;
    const btnX = contentX + 44;
    const btnY = shrineY + 88;
    if (mouseX >= btnX && mouseX <= btnX + 160 && mouseY >= btnY && mouseY <= btnY + 34) {
      gameStore.dispatchAction('contribute_sky_jade');
      audio.playUI();
      return true;
    }
  }
  return true;
}