/**
 * 2D 赛博大世界渲染器 - ui/js/world.js
 * 包含：平滑跟随、独立地貌瓦片、异构自然特征、矿物感应悬浮标牌、GM空间隔离
 */

import { fx, initMotes, drawParticles } from './world/fx.js';
import { textures } from './world/assets.js';
import { uiState, gameState, clock } from './state.js';
import { playerPos, getNearbyInteractable, gatheringState, kneelingState, monsterCorpseState } from './input.js';
import { camera } from './camera.js';
import { settingsState } from './settings-view.js';
import { WORLD_ZONES, SUB_LEVEL_COLORS, RESOURCE_TOOL_MAP, canToolMine, minToolTierFor, checkT4Refresh, formatT4LockRemain } from './world/world-topology.js';
import { ANVIL_CONFIG, setHammerTarget } from './world/workshop.js';

export { fx, initMotes };

export let screenShake = 0; // 必须导出，防止其他地方找不到
let flashLightIntensity = 0;
let warpEffectTimer = 0;

// 🌟 紧急加入：强行重置所有震动和特效，防止卡死在震动状态
export function forceStopShake() {
  screenShake = 0;
  flashLightIntensity = 0;
  warpEffectTimer = 0;
  if (fx) {
    fx.breakthroughTick = 0;
    fx.timeScale = 1.0;
    fx.timeFrames = 0;
  }
}

let lastZoneId = null;
let zoneBanner = {
  active: false,
  name: '',
  weather: '',
  buff: '',
  biome: '',
  color: '#00ffc8',
  startTime: 0,
};

export function triggerWarpEffect() {
  warpEffectTimer = 1.0;
}

export function resetImpactFX() {
  screenShake = 0;
  flashLightIntensity = 0;
  fx.clearTransient();
}

export function triggerStrikeImpact(isCrit, w, h) {
  setHammerTarget(0.42);
  screenShake = Math.max(isCrit ? 9.0 : 3.5, screenShake);
  flashLightIntensity = Math.min(0.28, flashLightIntensity + (isCrit ? 0.16 : 0.08));
  fx.triggerStrikeFX(isCrit, w, h);
}

export function triggerBreakthroughJuice() {
  screenShake = 24;
  fx.triggerBreakthroughJuice();
}

if (typeof window !== 'undefined') {
  window.addEventListener('game:breakthrough', () => {
    triggerBreakthroughJuice();
  });
}

export function getCurrentCityZone() {
  const zoneId = gameState.current_zone_id || gameState.current_city_id || 'beijing';
  return WORLD_ZONES[zoneId] || WORLD_ZONES.beijing;
}


export function drawWorld(ctx, w, h, now) {
  if (!ctx || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

  // 🌟 4 级采集物世界级刷新检查 (6 小时纪元切换时自动换批, 开销仅为一次整除比较)
  checkT4Refresh();

  const validNow = Number.isFinite(now) ? now : performance.now();
  const time = validNow * 0.003;
  const zone = getCurrentCityZone();

  if (zone.id !== lastZoneId) {
    lastZoneId = zone.id;
    zoneBanner = {
      active: true,
      name: zone.name,
      weather: gameState.current_weather || zone.weather,
      buff: gameState.current_weather_effect || zone.weatherBuff,
      biome: zone.biome,
      color: zone.color || '#00ffc8',
      startTime: validNow,
    };
  }

  camera.update(playerPos.x, playerPos.y, zone.width || 27000, zone.height || 27000, w, h);

  ctx.save();

  if (!Number.isFinite(screenShake) || screenShake < 0.1) {
    screenShake = 0;
  }

  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    screenShake *= (fx.breakthroughTick > 0) ? 0.93 : 0.86;
    if (screenShake < 0.4) screenShake = 0;
    if (fx.breakthroughTick > 0) fx.breakthroughTick--;
  }

  const camZoom = (Number.isFinite(camera.zoom) && camera.zoom > 0) ? camera.zoom : 1.0;
  const camX = Math.round(Number.isFinite(camera.x) ? camera.x : 13500);
  const camY = Math.round(Number.isFinite(camera.y) ? camera.y : 13500);

  ctx.translate(Math.round(w * 0.5), Math.round(h * 0.5));
  ctx.scale(camZoom, camZoom);
  ctx.translate(-camX, -camY);

  drawCityTilemap(ctx, zone, validNow, time);
  drawHeterogeneousTerrain(ctx, zone, time);
  drawCityObstacles(ctx, zone, time);
  drawCityPortals(ctx, zone, validNow, time);

  // 🌟 绘制资源矿点（自带靠近 Proximity 感应光标）
  drawCityGatherNodes(ctx, zone, validNow, time);

  // 🌟 绘制怪物尸体 (可采集兽皮)
  drawMonsterCorpses(ctx, zone, validNow, time);

  // 🏦 绘制地标建筑 (银行、商馆等)
  drawCityLandmarks(ctx, zone, validNow, time);

  // 仅在 zone_gm_test 时渲染铁砧
  drawCityPlazaWorkshop(ctx, zone, validNow, time);

  drawPlayer(ctx, validNow, time);
  drawCityWeatherParticles(ctx, zone, validNow, time);

  ctx.restore();

  if (flashLightIntensity > 0 && w > 0 && h > 0) {
    ctx.save();
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r0 = 20;
    const r1 = Math.max(30, Math.min(w, h) * 0.6);
    if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r1)) {
      const flashGrad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      flashGrad.addColorStop(0, `rgba(16, 185, 129, ${flashLightIntensity * 0.22})`);
      flashGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flashGrad;
      ctx.fillRect(0, 0, w, h);
    }
    flashLightIntensity *= 0.88;
    if (flashLightIntensity < 0.01) flashLightIntensity = 0;
    ctx.restore();
  }

  if (warpEffectTimer > 0 && w > 0 && h > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(168, 85, 247, ${warpEffectTimer * 0.45})`;
    ctx.fillRect(0, 0, w, h);
    warpEffectTimer -= 0.04;
    if (warpEffectTimer < 0) warpEffectTimer = 0;
    ctx.restore();
  }

  drawZoneBannerOverlay(ctx, w, h, validNow);

  // 🌟 绘制粒子特效 (采集浮动提示、冲击波、蒸汽等)
  drawParticles(ctx, w, h);

  // 🌟 采集读条置顶渲染 (屏幕空间，永远在最上层)
  drawGatheringBarOverlay(ctx, w, h, validNow, time);

  // 🌟 安全区蓝色叠加层 (屏幕空间)
  if (zone.safeZone && w > 0 && h > 0) {
    ctx.save();
    // 蓝色边缘晕影
    const safeGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    safeGrad.addColorStop(0, 'transparent');
    safeGrad.addColorStop(1, 'rgba(59, 130, 246, 0.08)');
    ctx.fillStyle = safeGrad;
    ctx.fillRect(0, 0, w, h);
    // 安全区标识
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.fillText('🛡️ 安全区域 · 禁止PK', 16, h - 16);
    ctx.restore();
  }

  // 🌟 跪地状态渲染 (屏幕空间)
  if (kneelingState && kneelingState.active && w > 0 && h > 0) {
    ctx.save();
    const elapsed = validNow - kneelingState.startTime;
    const remaining = Math.max(0, 15000 - elapsed);
    const remainingSec = Math.ceil(remaining / 1000);

    // 红色警告晕影
    const kneelGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.6);
    kneelGrad.addColorStop(0, 'transparent');
    kneelGrad.addColorStop(1, `rgba(239, 68, 68, ${0.12 + 0.05 * Math.sin(validNow * 0.005)})`);
    ctx.fillStyle = kneelGrad;
    ctx.fillRect(0, 0, w, h);

    // 跪地状态面板
    const panelW = 360;
    const panelH = 60;
    const panelX = (w - panelW) * 0.5;
    const panelY = h * 0.35;

    ctx.fillStyle = 'rgba(6, 11, 20, 0.95)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('☠️ 你已被击败 · 跪地中…', panelX + panelW * 0.5, panelY + 22);

    // 倒计时进度条
    const barW = panelW - 40;
    const barH = 10;
    const barX = panelX + 20;
    const barY = panelY + 40;
    const progress = 1 - (remaining / 15000);

    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 5);
    ctx.fill();

    const fillW = Math.max(0, barW * progress);
    if (fillW > 0) {
      const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
      barGrad.addColorStop(0, '#ef4444');
      barGrad.addColorStop(1, '#f97316');
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, 5);
      ctx.fill();
    }

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`${remainingSec}s 后自动站起`, panelX + panelW * 0.5, panelY + panelH + 16);

    ctx.restore();
  }
}

function drawZoneBannerOverlay(ctx, w, h, now) {
  if (!zoneBanner.active) return;
  const elapsed = now - zoneBanner.startTime;
  const totalDuration = 3600;

  if (elapsed > totalDuration) {
    zoneBanner.active = false;
    return;
  }

  let alpha = 1.0;
  let slideY = 0;
  if (elapsed < 400) {
    const t = elapsed / 400;
    alpha = t;
    slideY = (1 - t) * -30;
  } else if (elapsed > 3000) {
    alpha = Math.max(0, (totalDuration - elapsed) / 600);
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  const bw = Math.min(520, w * 0.9);
  const bh = 56;
  const bx = (w - bw) * 0.5;
  const by = 64 + slideY;

  ctx.fillStyle = 'rgba(6, 11, 20, 0.92)';
  ctx.strokeStyle = zoneBanner.color || '#00ffc8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.fillText(`⛩️ 踏入新境：${zoneBanner.name}`, bx + 16, by + 24);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`🌤️ 气候：【${zoneBanner.weather}】 · ${zoneBanner.buff}`, bx + 16, by + 44);

  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = zoneBanner.color || '#00ffc8';
  ctx.textAlign = 'right';
  ctx.fillText('90s 广袤域界', bx + bw - 16, by + 24);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`${(zoneBanner.biome || 'TERRAIN').toUpperCase()} BIOME`, bx + bw - 16, by + 44);

  ctx.restore();
}

/**
 * 🌟 采集读条置顶渲染 (屏幕空间，永远在最上层)
 * 位于屏幕底部居中，HUD 上方，确保任何场景元素都不会遮挡
 */
function drawGatheringBarOverlay(ctx, w, h, now, time) {
  if (!gatheringState || !gatheringState.active) return;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

  const progress = Math.max(0, Math.min(1, gatheringState.progress));
  const nodeId = gatheringState.targetNodeId;
  const rem = gatheringState.getNodeRemaining(nodeId);

  // 读条尺寸 (比世界空间更大更醒目)
  const barW = 320;
  const barH = 32;
  const barX = (w - barW) * 0.5;
  const barY = h - 120; // HUD 上方

  ctx.save();

  // 半透明底板背景 (突出读条区域)
  ctx.fillStyle = 'rgba(2, 6, 14, 0.75)';
  ctx.beginPath();
  ctx.roundRect(barX - 16, barY - 28, barW + 32, barH + 52, 14);
  ctx.fill();

  // 读条外框背景
  ctx.fillStyle = 'rgba(6, 11, 20, 0.98)';
  ctx.strokeStyle = '#00ffc8';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#00ffc8';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 读条渐变填充
  if (progress > 0) {
    const fillW = Math.max(10, (barW - 6) * progress);
    const barGrad = ctx.createLinearGradient(barX + 3, barY + 3, barX + fillW, barY + 3);
    barGrad.addColorStop(0, '#059669');
    barGrad.addColorStop(0.7, '#10b981');
    barGrad.addColorStop(1, '#00ffc8');
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect(barX + 3, barY + 3, fillW, barH - 6, 10);
    ctx.fill();

    // 扫光高光点
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(barX + fillW - 3, barY + barH * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // QTE 黄金暴击区高亮 (76%~88%)
  if (settingsState.qteHelperEnabled) {
    const goldStart = barX + 3 + (barW - 6) * 0.76;
    const goldEnd = barX + 3 + (barW - 6) * 0.88;
    const goldW = goldEnd - goldStart;
    ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
    ctx.beginPath();
    ctx.roundRect(goldStart, barY + 3, goldW, barH - 6, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(goldStart, barY + 3, goldW, barH - 6, 5);
    ctx.stroke();

    // QTE 完美一击区 (85%~87%)
    const perfectStart = barX + 3 + (barW - 6) * 0.85;
    const perfectEnd = barX + 3 + (barW - 6) * 0.87;
    const perfectW = perfectEnd - perfectStart;
    ctx.fillStyle = 'rgba(255, 77, 122, 0.45)';
    ctx.beginPath();
    ctx.roundRect(perfectStart, barY + 3, perfectW, barH - 6, 4);
    ctx.fill();
    const perfectAlpha = 0.6 + 0.4 * Math.sin(time * 0.008);
    ctx.strokeStyle = `rgba(255, 77, 122, ${perfectAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(perfectStart, barY + 3, perfectW, barH - 6, 4);
    ctx.stroke();
  }

  // 读条中央文本
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const inPerfectZone = settingsState.qteHelperEnabled && progress >= 0.85 && progress <= 0.87;
  const inGoldenZone = settingsState.qteHelperEnabled && progress >= 0.76 && progress <= 0.88;
  if (inPerfectZone) {
    ctx.fillStyle = '#ff4d7a';
    ctx.fillText(`🌟 完美！按空格 [${Math.floor(progress * 100)}%]`, barX + barW * 0.5, barY + barH * 0.5);
  } else if (inGoldenZone) {
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`⚡ 暴击！按空格 [${Math.floor(progress * 100)}%]`, barX + barW * 0.5, barY + barH * 0.5);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`⛏️ 采掘中 ${Math.floor(progress * 100)}%  (${rem}/8)`, barX + barW * 0.5, barY + barH * 0.5);
  }

  // 顶部资源名称标签
  const resName = gatheringState.targetResource?.name || '资源';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00ffc8';
  ctx.fillText(`⛏️ ${resName}`, barX + barW * 0.5, barY - 10);

  ctx.restore();
}

function drawCityTilemap(ctx, zone, now, time) {
  const mapW = zone.width || 27000;
  const mapH = zone.height || 27000;

  ctx.fillStyle = '#020408';
  ctx.fillRect(-2000, -2000, mapW + 4000, mapH + 4000);

  ctx.fillStyle = zone.bgColor || '#040b14';
  ctx.fillRect(0, 0, mapW, mapH);

  const tileSize = 200;
  const camZoom = (Number.isFinite(camera.zoom) && camera.zoom > 0) ? camera.zoom : 1.0;
  const camX = Number.isFinite(camera.x) ? camera.x : 13500;
  const camY = Number.isFinite(camera.y) ? camera.y : 13500;

  const viewLeft = Math.max(0, camX - (window.innerWidth * 0.6) / camZoom);
  const viewRight = Math.min(mapW, camX + (window.innerWidth * 0.6) / camZoom);
  const viewTop = Math.max(0, camY - (window.innerHeight * 0.6) / camZoom);
  const viewBottom = Math.min(mapH, camY + (window.innerHeight * 0.6) / camZoom);

  const startCol = Math.floor(viewLeft / tileSize);
  const endCol = Math.ceil(viewRight / tileSize);
  const startRow = Math.floor(viewTop / tileSize);
  const endRow = Math.ceil(viewBottom / tileSize);

  ctx.save();
  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const x = c * tileSize;
      const y = r * tileSize;
      const isAlt = (r + c) % 2 === 0;

      ctx.fillStyle = isAlt ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(x, y, tileSize, tileSize);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.018)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, tileSize, tileSize);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = zone.color || '#00ffc8';
  ctx.lineWidth = 12;
  ctx.shadowColor = zone.color || '#00ffc8';
  ctx.shadowBlur = 24;
  ctx.strokeRect(40, 40, mapW - 80, mapH - 80);
  ctx.restore();
}

function drawHeterogeneousTerrain(ctx, zone, time) {
  ctx.save();

  if (zone.biome === 'water' || zone.biome === 'marsh') {
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.lineWidth = 380;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(3000, 24000);
    ctx.bezierCurveTo(9000, 18000, 17000, 9000, 24000, 3000);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 60;
    ctx.stroke();
  } else if (zone.biome === 'forest') {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    for (let i = 0; i < 6; i++) {
      const fxPos = 4000 + ((i * 4100) % 20000);
      const fyPos = 4000 + ((i * 3900) % 20000);
      ctx.beginPath();
      ctx.arc(fxPos, fyPos, 900, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (zone.biome === 'desert' || zone.biome === 'earth') {
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.12)';
    ctx.lineWidth = 180;
    ctx.beginPath();
    ctx.moveTo(2000, 8000);
    ctx.quadraticCurveTo(13500, 18000, 25000, 8000);
    ctx.stroke();
  } else if (zone.biome === 'mountain' || zone.biome === 'forge') {
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.22)';
    ctx.lineWidth = 140;
    ctx.beginPath();
    ctx.moveTo(4000, 4000);
    ctx.lineTo(13500, 13500);
    ctx.lineTo(23000, 23000);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCityObstacles(ctx, zone, time) {
  const obstacles = zone.obstacles || [];
  if (!obstacles.length) return;

  ctx.save();
  for (const obs of obstacles) {
    const ox = Number.isFinite(obs.minX) ? obs.minX : 0;
    const oy = Number.isFinite(obs.minY) ? obs.minY : 0;
    const ow = (Number.isFinite(obs.maxX) ? obs.maxX : ox + 100) - ox;
    const oh = (Number.isFinite(obs.maxY) ? obs.maxY : oy + 100) - oy;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = zone.color || '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(ox, oy, ow, oh, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.fillRect(ox + 8, oy + 8, ow - 16, oh - 16);

    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = zone.color || '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(obs.name || '天道险隘', ox + ow * 0.5, oy + oh * 0.5 + 8);
  }
  ctx.restore();
}

function drawCityPortals(ctx, zone, now, time) {
  const portals = zone.portals || zone.gates || [];
  if (!portals.length) return;

  ctx.save();
  for (const portal of portals) {
    const px = Number.isFinite(portal.x) ? portal.x : 13500;
    const py = Number.isFinite(portal.y) ? portal.y : 13500;
    const radius = Number.isFinite(portal.radius) ? portal.radius : 320;
    const pColor = portal.color || '#38bdf8';

    const validTime = Number.isFinite(time) ? time : 0;
    const pulse = Math.sin(validTime * 3 + px * 0.001) * 30;
    const outRadius = Math.max(25, radius + pulse);

    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(outRadius)) {
      const grad = ctx.createRadialGradient(px, py, 20, px, py, outRadius);
      grad.addColorStop(0, `${pColor}aa`);
      grad.addColorStop(0.5, `${pColor}44`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, outRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(validTime * 0.8);
    ctx.strokeStyle = pColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(-radius * 0.35, -radius * 0.35, radius * 0.7, radius * 0.7);

    ctx.rotate(-validTime * 1.6);
    ctx.strokeRect(-radius * 0.25, -radius * 0.25, radius * 0.5, radius * 0.5);
    ctx.restore();

    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    const nameW = ctx.measureText(portal.name || '传送门').width + 32;

    const labelY = py - radius - 30;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.94)';
    ctx.strokeStyle = pColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px - nameW * 0.5, labelY - 20, nameW, 40, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(portal.name || '传送门', px, labelY + 8);
  }
  ctx.restore();
}

/**
 * 🌟 核心：绘制区域资源节点与轻量交互光圈（自带靠近感应）
 */
function drawCityGatherNodes(ctx, zone, now, time) {
  // 🌟 安全区 (主城) 不渲染采集物
  if (zone.safeZone) return;
  const resources = zone.resources || [];
  ctx.save();

  for (const res of resources) {
    const rx = Math.round(Number.isFinite(res.x) ? res.x : 13500);
    const ry = Math.round(Number.isFinite(res.y) ? res.y : 13500);
    const validNow = Number.isFinite(now) ? now : 0;
    const bob = Math.sin(validNow * 0.004 + rx * 0.01) * 8;

    const nodeId = res.id || `${res.x}_${res.y}`;
    const rem = gatheringState ? gatheringState.getNodeRemaining(nodeId) : 8;
    const isChannelingThis = gatheringState && gatheringState.active && gatheringState.targetNodeId === nodeId;

    // 🌟 子品阶颜色 (绿/蓝/紫/金)
    const subLevel = res.subLevel || 1;
    const subColor = SUB_LEVEL_COLORS[subLevel] || SUB_LEVEL_COLORS[1];
    const subTag = res.subLevelTag || 'Ⅰ';

    // 1. 判定玩家与该矿点的距离 (1人身位 <= 80px)
    const distToPlayer = Math.hypot(playerPos.x - rx, playerPos.y - ry);
    const isNearby = distToPlayer <= 80;

    // 2. 地面资源光晕 (使用子品阶颜色)
    if (Number.isFinite(rx) && Number.isFinite(ry)) {
      const auraR = isChannelingThis ? 110 : (isNearby ? 95 : 75);
      const grad = ctx.createRadialGradient(rx, ry, 5, rx, ry, auraR);
      if (rem <= 0) {
        grad.addColorStop(0, 'rgba(100, 116, 139, 0.3)');
      } else if (isChannelingThis) {
        grad.addColorStop(0, 'rgba(0, 255, 200, 0.85)');
        grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.3)');
      } else {
        // 使用子品阶颜色的光晕
        const r = parseInt(subColor.slice(1, 3), 16);
        const g = parseInt(subColor.slice(3, 5), 16);
        const b = parseInt(subColor.slice(5, 7), 16);
        const alpha = isNearby ? 0.75 : 0.35;
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      }
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rx, ry, auraR, 0, Math.PI * 2);
      ctx.fill();

      // 若在交互距离内或正在读条，绘制地面旋转光环 (子品阶颜色)
      if (isNearby || isChannelingThis) {
        const ringColor = isChannelingThis ? 'rgba(0, 255, 200, 0.85)' : subColor;
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = isChannelingThis ? 3 : 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(rx, ry, 55 + Math.sin(validNow * 0.006) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 3. 资源 Emoji / 图标 (若耗尽则半透明)
    ctx.save();
    if (rem <= 0) {
      ctx.globalAlpha = 0.4;
    }
    ctx.font = '42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = res.type === 'wood' ? '🌲' : res.type === 'gem' ? '💎' : res.type === 'herb' ? '🌿' : '⛏️';
    ctx.fillText(icon, rx, ry + bob);
    ctx.restore();

    // 4. 资源名称标牌与 8 格储量点阵 (使用子品阶颜色)
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const baseName = res.name || '资源';
    // 🌟 统一显示 "基础名 T{品阶}.{子品阶}" (如 铁矿脉 T2.3)，去掉名字里已有的品阶后缀避免重复
    const cleanName = baseName.replace(/·T\d+$/, '');
    // 🌟 4 级采集物采集锁期间名称前缀 🔒 标识 (每 6 小时刷新, 刷新后 2 小时不可采)
    const t4Locked = subLevel === 4 && res.lockUntil && Date.now() < res.lockUntil;
    const displayName = `${t4Locked ? '🔒 ' : ''}${cleanName} T${res.tier || 1}.${subLevel}`;
    const nameW = Math.max(140, ctx.measureText(displayName).width + 30);
    const boxH = 44;
    const boxY = ry - 78 + bob;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = isChannelingThis ? '#00ffc8' : (isNearby ? subColor : subColor);
    ctx.lineWidth = isChannelingThis ? 2.5 : (isNearby ? 2 : 1.5);
    ctx.beginPath();
    ctx.roundRect(rx - nameW * 0.5, boxY, nameW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    // 绘制资源名字 (子品阶颜色)
    ctx.fillStyle = rem <= 0 ? '#94a3b8' : subColor;
    ctx.fillText(displayName, rx, boxY + 16);

    // 绘制 8 个微型储量晶体 (使用子品阶颜色)
    const dotCount = 8;
    const dotSpacing = 11;
    const startDotX = rx - ((dotCount - 1) * dotSpacing) * 0.5;
    const dotY = boxY + 32;
    for (let i = 0; i < dotCount; i++) {
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, dotY, 3, 0, Math.PI * 2);
      if (i < rem) {
        ctx.fillStyle = subColor; // 子品阶颜色
        ctx.shadowColor = subColor;
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.4)'; // 已采掘
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 🌟 5. 采集读条已移至屏幕空间置顶渲染 (drawGatheringBarOverlay)
    // 靠近提示 & 工具需求 & 枯竭提示仍在世界空间渲染
    if (isNearby && rem > 0) {
      // 🌟 工具需求检查 (新规则: T(N)可采 T1~T(N)全部 + T(N+1).1)
      const toolType = res.toolType;
      const toolName = res.toolName || '工具';
      const playerToolLevel = toolType ? (gameState[toolType] || 0) : 0;
      const resTier = res.tier || 1;
      const resSubLevel = res.subLevel || 1;
      const hasTool = canToolMine(playerToolLevel, resTier, resSubLevel);
      const needTier = minToolTierFor(resTier, resSubLevel);
      const toolIcon = toolType === 'tool_mining_pickaxe' ? '⛏️' : toolType === 'tool_quarry_hammer' ? '🔨' : toolType === 'tool_skinning_knife' ? '🔪' : toolType === 'tool_cotton_knife' ? '🌾' : toolType === 'tool_logging_axe' ? '🪓' : '🔧';

      let qtePrompt;
      let promptColor;
      const t4LockRemain = res.subLevel === 4 && res.lockUntil ? formatT4LockRemain(res.lockUntil) : '';
      if (t4LockRemain) {
        // 🌟 4 级采集物采集锁倒计时 (刷新后 2 小时蕴养期)
        qtePrompt = `🔒 灵气蕴养中 ${t4LockRemain}后可采`;
        promptColor = '#fbbf24';
      } else if (!toolType || playerToolLevel === 0) {
        qtePrompt = `❌ 缺少${toolName}`;
        promptColor = '#ef4444';
      } else if (!hasTool) {
        qtePrompt = `⚠️ 需T${needTier}${toolName} (当前T${playerToolLevel})`;
        promptColor = '#f59e0b';
      } else {
        qtePrompt = `${toolIcon} [空格] 采掘 (${rem}/8)`;
        promptColor = '#00ffc8';
      }

      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const promptW = ctx.measureText(qtePrompt).width + 20;
      const promptY = boxY - 28;

      ctx.fillStyle = 'rgba(6, 11, 20, 0.92)';
      ctx.strokeStyle = promptColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(rx - promptW * 0.5, promptY, promptW, 22, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = promptColor;
      ctx.fillText(qtePrompt, rx, promptY + 11);
    } else if (rem <= 0) {
      // 枯竭提示
      const regenPrompt = '🌱 灵脉枯竭·再生中 (0/8)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const rW = ctx.measureText(regenPrompt).width + 16;
      const rY = boxY - 26;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(rx - rW * 0.5, rY, rW, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(regenPrompt, rx, rY + 10);
    }
  }

  ctx.restore();
}

/**
 * 🌟 绘制怪物尸体 (击杀怪物后留下，可采集获得 T1-T8 兽皮)
 */
function drawMonsterCorpses(ctx, zone, now, time) {
  if (!monsterCorpseState) return;
  monsterCorpseState.tick(now);
  const corpses = monsterCorpseState.getCorpses();
  if (corpses.length === 0) return;

  ctx.save();
  const validNow = Number.isFinite(now) ? now : 0;

  for (const corpse of corpses) {
    if (corpse.harvested) continue;
    const cx = Math.round(corpse.x);
    const cy = Math.round(corpse.y);
    const distToPlayer = Math.hypot(playerPos.x - cx, playerPos.y - cy);
    const isNearby = distToPlayer <= 120;

    // 尸体剩余时间
    const elapsed = validNow - corpse.spawnTime;
    const remaining = Math.max(0, monsterCorpseState.corpseDecayMs - elapsed);
    const decayRatio = remaining / monsterCorpseState.corpseDecayMs; // 1.0 → 0.0

    // 1. 尸体地面光晕 (橙红色，随时间衰减)
    const auraR = isNearby ? 70 : 50;
    const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, auraR);
    grad.addColorStop(0, `rgba(245, 158, 11, ${0.6 * decayRatio})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
    ctx.fill();

    // 2. 尸体图标 (随时间变暗)
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.6 * decayRatio;
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 尸体侧倒效果
    ctx.translate(cx, cy);
    ctx.rotate(-0.4);
    ctx.fillText(corpse.hideIcon, 0, 0);
    ctx.restore();

    // 3. 品阶标签
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(245, 158, 11, ${decayRatio})`;
    ctx.fillText(`T${corpse.tier} ${corpse.monsterName}`, cx, cy - 28);

    // 4. 靠近提示
    if (isNearby) {
      const prompt = `🧤 [空格] 剥取 ${corpse.hideName}`;
      ctx.font = 'bold 12px sans-serif';
      const promptW = ctx.measureText(prompt).width + 20;
      const promptY = cy - 55;

      ctx.fillStyle = 'rgba(6, 11, 20, 0.92)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx - promptW * 0.5, promptY, promptW, 22, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(prompt, cx, promptY + 11);
    }

    // 5. 腐烂倒计时条
    if (isNearby || remaining < 15000) {
      const barW = 60;
      const barH = 4;
      const barX = cx - barW * 0.5;
      const barY = cy + 24;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 2);
      ctx.fill();
      const fillW = Math.max(0, barW * decayRatio);
      if (fillW > 0) {
        const barColor = decayRatio > 0.3 ? '#f59e0b' : '#ef4444';
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, fillW, barH, 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

/**
 * 🏦 绘制城市地标建筑 (银行、商馆等可交互NPC/物体)
 */
function drawCityLandmarks(ctx, zone, now, time) {
  const landmarks = zone.landmarks || [];
  ctx.save();

  for (const lm of landmarks) {
    if (!lm.action) continue; // 只渲染可交互地标

    const lx = Math.round(lm.x || 0);
    const ly = Math.round(lm.y || 0);
    const dist = Math.hypot(playerPos.x - lx, playerPos.y - ly);
    const isNearby = dist <= 100;

    // 光晕
    const auraR = isNearby ? 60 : 45;
    const grad = ctx.createRadialGradient(lx, ly, 5, lx, ly, auraR);
    grad.addColorStop(0, lm.color ? lm.color + 'cc' : 'rgba(100, 200, 255, 0.6)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, auraR, 0, Math.PI * 2);
    ctx.fill();

    // 图标
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lm.icon || '📍', lx, ly);

    // 名称标牌
    if (isNearby) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = lm.color || '#64748b';
      ctx.fillText(lm.name || '', lx, ly - 40);

      // 交互提示
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#94a3b8';
      const hint = lm.action === 'bank' ? '按 V 存取物品' : lm.action === 'trade' ? '按 T 跑商' : '按空格交互';
      ctx.fillText(hint, lx, ly + 35);
    }
  }

  ctx.restore();
}

function drawCityPlazaWorkshop(ctx, zone, now, time) {
  if (zone.id !== 'zone_gm_test') return;

  const cx = (zone.width || 27000) * 0.5;
  const cy = (zone.height || 27000) * 0.5;

  ctx.save();
  ctx.translate(cx, cy);

  if (textures.bg) {
    const bw = 1200;
    const bh = 800;
    ctx.drawImage(textures.bg, -bw * 0.5, -bh * 0.5 - 60, bw, bh);
  }

  const ax = ANVIL_CONFIG.offsetX;
  const ay = ANVIL_CONFIG.offsetY + 40;

  if (textures.anvil) {
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ANVIL_CONFIG.angle);
    ctx.scale(ANVIL_CONFIG.scale, ANVIL_CONFIG.scale);
    ctx.drawImage(textures.anvil, -130, -110, 260, 220);
    ctx.restore();
  }

  if (textures.sword) {
    ctx.save();
    ctx.translate(ax + ANVIL_CONFIG.swordOffsetX, ay + ANVIL_CONFIG.swordOffsetY);
    ctx.rotate(ANVIL_CONFIG.swordAngle);
    ctx.scale(ANVIL_CONFIG.swordScale, ANVIL_CONFIG.swordScale);
    ctx.drawImage(textures.sword, -40, -140, 80, 280);
    ctx.restore();
  }

  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ec4899';
  ctx.fillText('【GM 开发者专属空间 · 虚空试验场】', 0, -240);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('开发测试素材隔离区 · 靠近铁砧按空格挥锤测试', 0, -210);

  ctx.restore();
}

function drawPlayer(ctx, now, time) {
  const px = Math.round(Number.isFinite(playerPos.x) ? playerPos.x : 13500);
  const py = Math.round(Number.isFinite(playerPos.y) ? playerPos.y : 13500);

  ctx.save();
  ctx.translate(px, py);

  const validNow = Number.isFinite(now) ? now : 0;
  const isKneeling = kneelingState && kneelingState.active;
  const bounce = isKneeling ? 0 : Math.sin(validNow * 0.005) * 2;

  // 1. 脚底赛博光晕 (跪地时变红色)
  const grad = ctx.createRadialGradient(0, 10, 5, 0, 10, 36);
  if (isKneeling) {
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  } else {
    grad.addColorStop(0, 'rgba(0, 255, 200, 0.55)');
    grad.addColorStop(1, 'rgba(0, 255, 200, 0)');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 15, 36, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. 绘制玩家形象 (跪地时变矮+倾斜)
  if (isKneeling) {
    ctx.save();
    ctx.translate(0, 8); // 下沉
    ctx.rotate(-0.3); // 倾斜表示跪地
  }
  if (textures.player) {
    const img = textures.player;
    const imgW = 84;
    const imgH = (img.height / img.width) * imgW;
    ctx.drawImage(img, -imgW / 2, -imgH + 18 + bounce, imgW, imgH);
  } else {
    ctx.fillStyle = isKneeling ? '#ef4444' : '#00ffc8';
    ctx.shadowColor = isKneeling ? '#ef4444' : '#00ffc8';
    ctx.shadowBlur = 12;
    ctx.fillRect(-10, -22 + bounce, 20, 32);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -32 + bounce, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (isKneeling) {
    ctx.restore();
    // 跪地标记
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('☠️', 0, -45);
  }

  // 3. 玩家头顶修仙称号与姓名标牌 (受系统设置开关控制)
  const showName = settingsState.showPlayerName;
  const showRealm = settingsState.showRealmTitle;

  if (showName || showRealm) {
    ctx.textAlign = 'center';
    const realmName = gameState.realm_name || '炼体';
    const subLvl = gameState.sub_level || 1;
    const realmStr = `【${realmName} · ${subLvl}层】`;
    const nameStr = '【天道使者】';

    // 计算显示位置：名字在上，境界在下
    let nameY = -85 + bounce;
    let realmY = -65 + bounce;

    if (showName && showRealm) {
      // 两个都显示：名字在上，境界在下
      ctx.font = 'bold 10px sans-serif';
      const nameW = ctx.measureText(nameStr).width + 10;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-nameW * 0.5, nameY - 10, nameW, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(nameStr, 0, nameY + 3);

      ctx.font = 'bold 11px sans-serif';
      const realmW = ctx.measureText(realmStr).width + 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#00ffc8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-realmW * 0.5, realmY - 10, realmW, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#00ffc8';
      ctx.fillText(realmStr, 0, realmY + 3);
    } else if (showRealm) {
      // 只显示境界
      ctx.font = 'bold 11px sans-serif';
      const realmW = ctx.measureText(realmStr).width + 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#00ffc8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-realmW * 0.5, nameY - 10, realmW, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#00ffc8';
      ctx.fillText(realmStr, 0, nameY + 3);
    } else if (showName) {
      // 只显示名字
      ctx.font = 'bold 11px sans-serif';
      const nameW = ctx.measureText(nameStr).width + 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-nameW * 0.5, nameY - 10, nameW, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(nameStr, 0, nameY + 3);
    }
  }

  ctx.restore();
}

function drawCityWeatherParticles(ctx, zone, now, time) {
  const mapW = zone.width || 27000;
  const mapH = zone.height || 27000;

  ctx.save();

  if (zone.biome === 'capital' || zone.weather === '风沙') {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const px = ((i * 680 + now * 0.8) % mapW);
      const py = ((i * 540 + Math.sin(now * 0.002 + i) * 80) % mapH);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 80, py + 16);
      ctx.stroke();
    }
  } else if (zone.biome === 'forge' || zone.weather === '烈阳') {
    ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
    for (let i = 0; i < 50; i++) {
      const px = (i * 540 + Math.sin(time + i) * 60) % mapW;
      const py = mapH - ((now * 0.3 + i * 480) % mapH);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (zone.biome === 'forest' || zone.weather === '多雨') {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 60; i++) {
      const px = (i * 450 + now * 0.2) % mapW;
      const py = (now * 1.2 + i * 510) % mapH;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - 10, py + 30);
      ctx.stroke();
    }
  } else if (zone.biome === 'mist' || zone.weather === '极光' || zone.id === 'zone_gm_test') {
    ctx.fillStyle = 'rgba(236, 72, 153, 0.4)';
    for (let i = 0; i < 45; i++) {
      const px = (i * 600 + Math.cos(time * 0.5 + i) * 80) % mapW;
      const py = (i * 480 + Math.sin(time * 0.5 + i) * 80) % mapH;
      const r = 3 + Math.sin(now * 0.003 + i) * 2;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
