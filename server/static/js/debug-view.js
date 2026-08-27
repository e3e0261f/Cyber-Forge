/*
 * 模块功能: 赛博修仙调试面板与实时坐标监视器 (Debug & Coordinates Inspector)
 * 支持实时坐标、速度监控、网格辅助线、角色十字准星、一键复制坐标、GM 专属维度外测试空间 (zone_gm_test) 传送与移速调节
 * 文件路径: ui/js/debug-view.js
 */

import { playerPos } from './input.js';
import { gameState, uiState, syncState, gameStore } from './state.js';
import { TOOL_LEVELS_KEY } from './store/game-store.js';
import { hudState } from './hud.js';
import { drawHoloModalFrame } from './modal-frame.js';
import { camera } from './camera.js';
import { WORLD_ZONES, RESOURCE_TOOL_MAP, SUB_LEVEL_COLORS } from './world/world-topology.js';
import { getModalBounds } from './input.js';
import { storageAdapter } from './adapters/storage-adapter.js';
import { networkAdapter } from './adapters/network-adapter.js';
import { auditReporter } from './security/audit-reporter.js';
import { localHashChain, LEDGER_VERSION, MAX_LEDGER_SEGMENT_BYTES } from './security/hash-chain.js';
import { replayEngine } from './security/replay-engine.js';
import { audio } from './audio.js';
import { isDevMode } from './config.js';

const DEBUG_SETTINGS_KEY = 'cyber_forge_debug_settings';

export const debugState = {
  showGrid: false,
  showCrosshair: false,
  showHeadCoords: false,
  miniBadgeVisible: false,
  toastMsg: '',
  toastTimer: 0,

  setToast(msg, durationMs = 2500) {
    this.toastMsg = msg;
    this.toastTimer = performance.now() + durationMs;
  }
};

/** 加载持久化的调试设置 */
function loadDebugSettings() {
  try {
    const saved = storageAdapter.get(DEBUG_SETTINGS_KEY);
    if (saved && typeof saved === 'object') {
      if (typeof saved.showGrid === 'boolean') debugState.showGrid = saved.showGrid;
      if (typeof saved.showCrosshair === 'boolean') debugState.showCrosshair = saved.showCrosshair;
      if (typeof saved.showHeadCoords === 'boolean') debugState.showHeadCoords = saved.showHeadCoords;
      if (typeof saved.speed === 'number') playerPos.speed = saved.speed;
      console.log('[Debug] 已恢复持久化设置:', saved);
    }
  } catch (_) {}
}

/** 保存调试设置到 localStorage */
function saveDebugSettings() {
  storageAdapter.set(DEBUG_SETTINGS_KEY, {
    showGrid: debugState.showGrid,
    showCrosshair: debugState.showCrosshair,
    showHeadCoords: debugState.showHeadCoords,
    speed: playerPos.speed,
  });
}

// 启动时加载持久化设置 (debugState 已声明完毕)
if (isDevMode) loadDebugSettings();

// ==================== 🌟 调试面板标签页系统 ====================
export const debugTabState = {
  activeTab: 0,     // 0=场景监视器, 1=物品库, 2=GM玩家管理, 3=本机玩家账本
  itemScrollY: 0,   // 物品库滚动偏移
  playersScrollY: 0,// 玩家页滚动偏移
  _hitAreas: [],    // 当前帧物品点击区域缓存
  _playersData: null,      // 玩家报表缓存 (服务端心跳窗口判定的真实在线/离线)
  _playersFetchedAt: 0,
  _playersLoading: false,
  _refreshBtnArea: null,
  _ledgerVerifyArea: null,
  _ledgerScrollY: 0,
  _replay: null,
  _replayPlayTimer: null,
  _playerRowHitAreas: [],
  _selectedPlayerRef: null,
  _selectedPlayerDetail: null,
  _playerDetailLoading: false,
  _playerDetailScrollY: 0,
  _playerDetailReplay: null,
  _playerDetailReplayAreas: {},
};

/** 🌟 拉取在线/离线玩家报表 (5 秒缓存; 切页自动拉一次, 刷新按钮强制重拉) */
async function _fetchPlayersReport(force = false) {
  const now = performance.now();
  if (!force && debugTabState._playersData && now - debugTabState._playersFetchedAt < 5000) return;
  if (debugTabState._playersLoading) return;
  debugTabState._playersLoading = true;
  const report = await networkAdapter.invoke('players_report', {});
  debugTabState._playersLoading = false;
  if (report) {
    debugTabState._playersData = report;
    debugTabState._playersFetchedAt = performance.now();
    debugTabState.playersScrollY = 0;
  }
}

/** 秒数 → 人性化时距 (玩家页离线时长展示) */
function _fmtAgo(secs) {
  if (!Number.isFinite(secs) || secs <= 0) return '刚刚';
  if (secs < 60) return `${Math.round(secs)}秒前`;
  if (secs < 3600) return `${Math.round(secs / 60)}分钟前`;
  if (secs < 86400) return `${(secs / 3600).toFixed(1)}小时前`;
  return `${Math.round(secs / 86400)}天前`;
}

// 🌟 全物品目录 (从 WORLD_ZONES 资源模板 + 工具 + 尸体皮 + 特殊物品 汇总)
function _buildItemCatalog() {
  const catalog = [];
  const seen = new Set();

  // 1. 从所有 biome 模板汇总资源物品 (命名与正式采集一致: <产出名>·T<品阶>.<子品阶>)
  for (const [zoneId, zone] of Object.entries(WORLD_ZONES)) {
    for (const res of (zone.resources || [])) {
      const key = `${res.yieldItem}_T${res.tier}.${res.subLevel || 1}`;
      if (!seen.has(key)) {
        seen.add(key);
        catalog.push({
          name: `${res.yieldItem}·T${res.tier}.${res.subLevel || 1}`,
          tier: res.tier,
          subLevel: res.subLevel || 1,
          type: res.type,
          icon: res.icon || '⛏️',
          category: res.type,
          source: 'gather',
        });
      }
    }
  }

  // 2. 采集工具 (T1-T8)
  const toolDefs = [
    { key: 'tool_mining_pickaxe', name: '采矿镐', icon: '⛏️' },
    { key: 'tool_quarry_hammer',  name: '采石锤', icon: '🔨' },
    { key: 'tool_skinning_knife', name: '剥皮刀', icon: '🔪' },
    { key: 'tool_cotton_knife',   name: '棉花刀', icon: '🌾' },
    { key: 'tool_logging_axe',    name: '伐木斧', icon: '🪓' },
  ];
  for (const td of toolDefs) {
    for (let t = 1; t <= 8; t++) {
      catalog.push({
        name: `T${t}${td.name}`,
        tier: t,
        subLevel: 1,
        type: 'tool',
        toolKey: td.key,
        icon: td.icon,
        category: 'tool',
        source: 'tool',
      });
    }
  }

  // 3. 怪物尸体皮 (T1-T8)
  const hideNames = ['兽皮', '粗皮', '硬皮', '灵皮', '妖皮', '魔皮', '神皮', '天道皮'];
  const hideIcons = ['🦌', '🐗', '🐊', '🦊', '🐉', '👹', '🔮', '✨'];
  for (let t = 1; t <= 8; t++) {
    catalog.push({
      name: `T${t}${hideNames[t-1]}`,
      tier: t,
      subLevel: 1,
      type: 'hide',
      icon: hideIcons[t-1],
      category: 'hide',
      source: 'corpse',
    });
  }

  // 4. 特殊物品 (含货币入包: 铜钱、金币、仙玉)
  catalog.push({ name: '铜钱', tier: 1, subLevel: 1, type: 'currency', currencyKey: 'copper', amount: 10000, icon: '🪙', category: 'special', source: 'currency' });
  catalog.push({ name: '金币', tier: 4, subLevel: 1, type: 'currency', currencyKey: 'coins', amount: 1000, icon: '💰', category: 'special', source: 'currency' });
  catalog.push({ name: '仙玉', tier: 7, subLevel: 1, type: 'currency', currencyKey: 'jade', amount: 100, icon: '💎', category: 'special', source: 'currency' });
  catalog.push({ name: '天道纳玉', tier: 1, subLevel: 1, type: 'currency', icon: '💎', category: 'special', source: 'special' });
  catalog.push({ name: '五行玄晶', tier: 5, subLevel: 1, type: 'currency', icon: '🔮', category: 'special', source: 'special' });
  catalog.push({ name: '混沌神晶', tier: 8, subLevel: 1, type: 'gem', icon: '💎', category: 'special', source: 'special' });

  return catalog;
}

let _itemCatalogCache = null;
function getItemCatalog() {
  if (!_itemCatalogCache) _itemCatalogCache = _buildItemCatalog();
  return _itemCatalogCache;
}

// 物品分类标签
const CATALOG_CATEGORIES = [
  { key: 'all',    label: '全部', color: '#f8fafc' },
  { key: 'ore',    label: '矿物', color: '#f59e0b' },
  { key: 'gem',    label: '宝石', color: '#a855f7' },
  { key: 'wood',   label: '木材', color: '#22c55e' },
  { key: 'herb',   label: '草药', color: '#10b981' },
  { key: 'hide',   label: '皮革', color: '#ef4444' },
  { key: 'tool',   label: '工具', color: '#38bdf8' },
  { key: 'special',label: '特殊', color: '#ec4899' },
];

let _activeCategory = 'all';

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

    ctx.strokeStyle = 'rgba(0, 255, 200, 0.08)';
    ctx.beginPath();
    for (let x = 0; x < w; x += gridSize) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 255, 200, 0.22)';
    ctx.fillStyle = 'rgba(0, 255, 200, 0.45)';
    ctx.font = '10px monospace';
    ctx.beginPath();
    for (let x = 0; x < w; x += 200) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.fillText(`${x}`, x + 3, 70);
    }
    for (let y = 0; y < h; y += 200) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.fillText(`${y}`, 20, y - 4);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 2. 玩家十字准星
  if (debugState.showCrosshair) {
    ctx.save();
    const screenX = Math.round(w * 0.5 + (playerPos.x - camera.x) * camera.zoom);
    const screenY = Math.round(h * 0.5 + (playerPos.y - camera.y) * camera.zoom);

    ctx.strokeStyle = 'rgba(0, 255, 200, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(0, screenY); ctx.lineTo(w, screenY);
    ctx.moveTo(screenX, 0); ctx.lineTo(screenX, h);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = '#00ffc8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 3. 玩家头顶坐标胶囊
  if (debugState.showHeadCoords) {
    ctx.save();
    const screenX = Math.round(w * 0.5 + (playerPos.x - camera.x) * camera.zoom);
    const screenY = Math.round(h * 0.5 + (playerPos.y - camera.y) * camera.zoom);

    const label = `(${Math.round(playerPos.x)}, ${Math.round(playerPos.y)})`;
    ctx.font = 'bold 11px monospace';
    const textW = ctx.measureText(label).width;

    const lx = screenX - textW / 2 - 8;
    const ly = screenY - 78;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#00ffc8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx, ly, textW + 16, 18, 9);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#00ffc8';
    ctx.fillText(label, lx + 8, ly + 13);
    ctx.restore();
  }

  // 4. Toast 提示
  if (debugState.toastTimer > now && debugState.toastMsg) {
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    const tw = ctx.measureText(debugState.toastMsg).width;
    const tx = (w - tw) / 2 - 16;
    const ty = 80;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw + 32, 34, 6);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(debugState.toastMsg, tx + 16, ty + 22);
    ctx.restore();
  }
}

/**
 * 绘制调试弹窗面板 (Debug Modal Window)
 */
export function drawDebugModal(ctx, boundsOrW, hOrTime, optTime) {
  if (!uiState.isOpen('debug')) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const bounds = getModalBounds('debug', w, h);
  const { mx, my, mw, mh } = bounds;
  const time = typeof hOrTime === 'number' && hOrTime < 1000 ? hOrTime : (optTime || performance.now() * 0.003);

  const tabTitles = ['🛠️ 天道法则调试台 · 场景监视器', '📦 天道物品库 · 点击生成到背包', '👥 GM 玩家管理', '⛓️ 玩家行为账本 · 本地录像机'];
  drawHoloModalFrame(ctx, mx, my, mw, mh, '#ec4899', tabTitles[debugTabState.activeTab], time, 'debug');

  // --- 🌟 标签页按钮 (4 tabs) ---
  const tabY = my + 36;
  const tabH = 22;
  const TAB_COUNT = 4;
  const tabW = (mw - 32 - 6 * (TAB_COUNT - 1)) / TAB_COUNT;
  const tabLabels = ['🔭 场景监视器', '📦 物品库', '👥 玩家', '⛓️ 账本'];
  for (let i = 0; i < TAB_COUNT; i++) {
    const tx = mx + 16 + i * (tabW + 6);
    const isActive = debugTabState.activeTab === i;
    ctx.fillStyle = isActive ? 'rgba(236, 72, 153, 0.25)' : 'rgba(30, 41, 59, 0.7)';
    ctx.strokeStyle = isActive ? '#ec4899' : '#475569';
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(tx, tabY, tabW, tabH, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = isActive ? '#ec4899' : '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tabLabels[i], tx + tabW / 2, tabY + 15);
    ctx.textAlign = 'left';
  }

  if (debugTabState.activeTab === 0) {
    _drawDebugSceneTab(ctx, mx, my, mw, mh, time, 'debug');
  } else if (debugTabState.activeTab === 1) {
    _drawDebugItemTab(ctx, mx, my, mw, mh, time, 'debug');
  } else if (debugTabState.activeTab === 2) {
    _drawDebugPlayersTab(ctx, mx, my, mw, mh);
  } else {
    _drawDebugLedgerTab(ctx, mx, my, mw, mh);
  }
}

// ==================== Tab 0: 场景监视器 ====================
function _drawDebugSceneTab(ctx, mx, my, mw, mh, time) {
  let cy = my + 64;

  // --- 1. 实时坐标监控卡片 ---
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(mx + 16, cy, mw - 32, 80, 6);
  ctx.fill(); ctx.stroke();

  const zoneId = gameState.current_zone_id || gameState.current_city_id || 'beijing';
  const zone = WORLD_ZONES[zoneId] || WORLD_ZONES.beijing;

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('当前所在拓扑域:', mx + 26, cy + 22);
  ctx.fillStyle = zone.color || '#00ffc8';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`${zone.name} (${zone.id})`, mx + 130, cy + 22);

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('角色世界坐标 (X, Y):', mx + 26, cy + 46);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`X: ${Math.round(playerPos.x)} px,  Y: ${Math.round(playerPos.y)} px`, mx + 160, cy + 46);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`地图尺寸: 27000×27000 px · 移速: ${playerPos.speed} px/s · 跨图时长: 90 秒`, mx + 26, cy + 68);

  cy += 88;

  // --- 2. 常用操作快捷按钮 ---
  const btnH = 26;
  const btnGap = 8;
  const btnW = (mw - 32 - btnGap * 2) / 3;

  drawDebugBtn(ctx, mx + 16, cy, btnW, btnH, '📋 复制坐标', '#00ffc8', false);
  drawDebugBtn(ctx, mx + 16 + btnW + btnGap, cy, btnW, btnH, '📄 复制TS代码', '#38bdf8', false);
  drawDebugBtn(ctx, mx + 16 + (btnW + btnGap) * 2, cy, btnW, btnH, debugState.showGrid ? '🌐 网格: 开启' : '🌐 网格: 关闭', debugState.showGrid ? '#22c55e' : '#64748b', debugState.showGrid);

  cy += btnH + 8;

  drawDebugBtn(ctx, mx + 16, cy, btnW, btnH, debugState.showCrosshair ? '🎯 准星: 开启' : '🎯 准星: 关闭', debugState.showCrosshair ? '#22c55e' : '#64748b', debugState.showCrosshair);
  drawDebugBtn(ctx, mx + 16 + btnW + btnGap, cy, btnW, btnH, debugState.showHeadCoords ? '🏷️ 顶标: 开启' : '🏷️ 顶标: 关闭', debugState.showHeadCoords ? '#22c55e' : '#64748b', debugState.showHeadCoords);
  drawDebugBtn(ctx, mx + 16 + (btnW + btnGap) * 2, cy, btnW, btnH, '🔄 回到 (13500,13500)', '#e0a050', false);

  cy += btnH + 14;

  // --- 3. GM 专属空间传送 ---
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#ec4899';
  ctx.fillText('⚡ GM 专属维度外空间 (隔离所有历史测试素材与铁砧)', mx + 20, cy + 12);
  cy += 20;

  const gmBtnW = (mw - 32 - btnGap) / 2;
  drawDebugBtn(ctx, mx + 16, cy, gmBtnW, btnH, '🪐 传送进 GM 专属空间 (zone_gm_test)', '#ec4899', zoneId === 'zone_gm_test');
  drawDebugBtn(ctx, mx + 16 + gmBtnW + btnGap, cy, gmBtnW, btnH, '⛩️ 返回中央北京红皇城', '#ef4444', zoneId === 'beijing');

  cy += btnH + 14;

  // --- 4. 移动速度切换 ---
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('👟 移动速度设定 (Speed Px/Sec)', mx + 20, cy + 12);
  cy += 20;

  const spdW = (mw - 32 - btnGap * 3) / 4;
  drawDebugBtn(ctx, mx + 16, cy, spdW, btnH, '150 漫步', '#64748b', playerPos.speed === 150);
  drawDebugBtn(ctx, mx + 16 + (spdW + btnGap), cy, spdW, btnH, '300 标准90s', '#00ffc8', playerPos.speed === 300);
  drawDebugBtn(ctx, mx + 16 + (spdW + btnGap) * 2, cy, spdW, btnH, '500 疾驰', '#38bdf8', playerPos.speed === 500);
  drawDebugBtn(ctx, mx + 16 + (spdW + btnGap) * 3, cy, spdW, btnH, '1000 极速', '#a855f7', playerPos.speed === 1000);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('💡 快捷键 [F3] 或 [~] 开关调试台 · 正常地图已全面净化测试素材', mx + 20, my + mh - 14);
}

// ==================== Tab 1: 物品库 ====================
function _drawDebugItemTab(ctx, mx, my, mw, mh, time) {
  const catalog = getItemCatalog();
  const contentY = my + 64;
  const contentH = mh - 80;
  const padX = 16;

  // --- 分类筛选栏 ---
  const catY = contentY;
  const catH = 22;
  const catGap = 4;
  const catBtnW = (mw - padX * 2 - catGap * (CATALOG_CATEGORIES.length - 1)) / CATALOG_CATEGORIES.length;

  debugTabState._catHitAreas = [];
  for (let i = 0; i < CATALOG_CATEGORIES.length; i++) {
    const cat = CATALOG_CATEGORIES[i];
    const cx = mx + padX + i * (catBtnW + catGap);
    const isActive = _activeCategory === cat.key;
    ctx.fillStyle = isActive ? `${cat.color}33` : 'rgba(30, 41, 59, 0.7)';
    ctx.strokeStyle = isActive ? cat.color : '#475569';
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(cx, catY, catBtnW, catH, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = isActive ? cat.color : '#94a3b8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cat.label, cx + catBtnW / 2, catY + 15);
    debugTabState._catHitAreas.push({ x: cx, y: catY, w: catBtnW, h: catH, key: cat.key });
  }
  ctx.textAlign = 'left';

  // 过滤物品
  const filtered = _activeCategory === 'all' ? catalog : catalog.filter(it => it.category === _activeCategory);

  // --- 物品网格 (每行 4 个卡片) ---
  const gridY = catY + catH + 8;
  const gridH = contentH - catH - 12;
  const cols = 4;
  const cardGap = 6;
  const cardW = (mw - padX * 2 - cardGap * (cols - 1)) / cols;
  const cardH = 64;

  // 🌟 不使用 ctx.clip()，改用手动可见性检查，避免裁剪干扰点击区域
  debugTabState._hitAreas = [];
  const totalRows = Math.ceil(filtered.length / cols);
  const scrollY = debugTabState.itemScrollY || 0;

  for (let idx = 0; idx < filtered.length; idx++) {
    const item = filtered[idx];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = mx + padX + col * (cardW + cardGap);
    const cy = gridY + row * (cardH + cardGap) - scrollY;

    // 可见性检查 (替代 ctx.clip)
    if (cy + cardH < gridY || cy > gridY + gridH) continue;

    // 子品阶颜色
    const subColor = (SUB_LEVEL_COLORS || {})[item.subLevel || 1] || '#22c55e';
    const tierColor = item.tier >= 6 ? '#ef4444' : item.tier >= 4 ? '#a855f7' : item.tier >= 3 ? '#38bdf8' : '#10b981';

    // 卡片背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cardW, cardH, 5);
    ctx.fill(); ctx.stroke();

    // 图标
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, cx + 18, cy + 22);

    // 名称
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f8fafc';
    const displayName = item.name.length > 8 ? item.name.slice(0, 8) + '..' : item.name;
    ctx.fillText(displayName, cx + 34, cy + 8);

    // 品阶标签
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = tierColor;
    ctx.fillText(`T${item.tier}`, cx + 34, cy + 22);

    // 子品阶颜色点
    ctx.beginPath();
    ctx.arc(cx + cardW - 10, cy + 10, 4, 0, Math.PI * 2);
    ctx.fillStyle = subColor;
    ctx.fill();

    // 类型标签
    const typeLabels = { ore: '矿', gem: '宝', wood: '木', herb: '草', hide: '皮', tool: '器', special: '殊' };
    ctx.font = '8px sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.fillText(typeLabels[item.category] || '?', cx + 34, cy + 34);

    // “+1” 按钮
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx + cardW - 26, cy + cardH - 20, 20, 14, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+1', cx + cardW - 16, cy + cardH - 10);
    ctx.textAlign = 'left';

    // 缓存点击区域
    debugTabState._hitAreas.push({
      x: cx, y: cy, w: cardW, h: cardH,
      item,
    });
  }

  // 滚动条
  if (totalRows * (cardH + cardGap) > gridH) {
    const scrollBarH = Math.max(20, gridH * gridH / (totalRows * (cardH + cardGap)));
    const scrollBarY = gridY + (scrollY / (totalRows * (cardH + cardGap) - gridH)) * (gridH - scrollBarH);
    ctx.fillStyle = 'rgba(236, 72, 153, 0.3)';
    ctx.beginPath();
    ctx.roundRect(mx + mw - 8, scrollBarY, 4, scrollBarH, 2);
    ctx.fill();
  }

  // 底部统计
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`📦 共 ${filtered.length} 种物品 · 滚轮翻页 · 点击 +1 生成到背包`, mx + 16, my + mh - 8);
}

// ==================== Tab 2: 玩家信息 (真实在线/离线) ====================
// 🌟 在线 = 最近 ONLINE_WINDOW_SECS 内有心跳 (服务端判定), 而非 players 表累计长度 (旧"在线人数"只增不减的根因)
async function _openPlayerDetail(playerRef) {
  if (!playerRef) return;
  debugTabState._selectedPlayerRef = playerRef;
  debugTabState._selectedPlayerDetail = null;
  debugTabState._playerDetailLoading = true;
  debugTabState._playerDetailScrollY = 0;
  debugTabState._playerDetailReplay = null;
  const detail = await networkAdapter.invoke('player_detail', { player_ref: playerRef });
  debugTabState._playerDetailLoading = false;
  if (detail) {
    debugTabState._selectedPlayerDetail = detail;
    debugTabState._playerDetailReplay = new (replayEngine.constructor)(detail.ledger || []);
    debugState.setToast(`👤 已打开玩家 ${detail.account || playerRef.slice(0, 8)} 的 GM 详情`);
  } else debugState.setToast('❌ 玩家详情读取失败');
}
function _closePlayerDetail() {
  debugTabState._selectedPlayerRef = null; debugTabState._selectedPlayerDetail = null;
  debugTabState._playerDetailReplay = null; debugTabState._playerDetailScrollY = 0; debugTabState._playerDetailReplayAreas = {};
}
function _fmtPlayerTime(ts) { if (!ts) return '—'; try { return new Date(Number(ts) * 1000).toLocaleString(); } catch (_) { return String(ts); } }

function _drawDebugPlayersTab(ctx, mx, my, mw, mh) {
  if (debugTabState._selectedPlayerRef) { _drawDebugPlayerDetail(ctx, mx, my, mw, mh); return; }
  const data = debugTabState._playersData, padX = 16; let cy = my + 64;
  if (!data || performance.now() - debugTabState._playersFetchedAt > 5000) _fetchPlayersReport();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'; ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(mx + padX, cy, mw - padX * 2, 30, 5); ctx.fill(); ctx.stroke();
  ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#34d399'; ctx.fillText(`🟢 在线 ${data ? data.online_count : '…'}`, mx + padX + 10, cy + 19);
  ctx.fillStyle = '#64748b'; ctx.fillText(`⚫ 离线 ${data ? data.offline_count : '…'}`, mx + padX + 90, cy + 19);
  ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.fillText(`累计注册 ${data ? data.total_registered : '…'} · GM 点选玩家查看详情`, mx + padX + 175, cy + 19);
  const rbW = 56, rbH = 20, rbX = mx + mw - padX - rbW - 6, rbY = cy + 5;
  ctx.fillStyle = debugTabState._playersLoading ? 'rgba(100, 116, 139, 0.25)' : 'rgba(52, 211, 153, 0.15)'; ctx.strokeStyle = '#34d399';
  ctx.beginPath(); ctx.roundRect(rbX, rbY, rbW, rbH, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#34d399'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(debugTabState._playersLoading ? '拉取中…' : '🔄 刷新', rbX + rbW / 2, rbY + 14); ctx.textAlign = 'left';
  debugTabState._refreshBtnArea = { x: rbX, y: rbY, w: rbW, h: rbH }; cy += 38;
  const listTop = cy, listH = my + mh - 34 - listTop, rowH = 24;
  const online = data ? (data.online || []) : [], offline = data ? (data.offline || []) : [];
  const rows = [...online.map(p => ({ p, isOnline: true })), ...offline.map(p => ({ p, isOnline: false }))];
  const maxScroll = Math.max(0, rows.length * rowH - listH); debugTabState.playersScrollY = Math.max(0, Math.min(maxScroll, debugTabState.playersScrollY || 0)); const scrollY = debugTabState.playersScrollY;
  debugTabState._playerRowHitAreas = [];
  ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#475569';
  ['玩家','区域','等级','包/库','状态 / 最后活跃'].forEach((t,i)=>ctx.fillText(t, mx + padX + [6,140,240,290,360][i], listTop + 12));
  const headY = listTop + 18; ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)'; ctx.beginPath(); ctx.moveTo(mx + padX, headY); ctx.lineTo(mx + mw - padX, headY); ctx.stroke();
  if (!data) { ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif'; ctx.fillText(debugTabState._playersLoading ? '正在拉取玩家报表…' : '拉取失败, 点击右上角刷新重试', mx + padX + 6, headY + 24); }
  for (let i=0;i<rows.length;i++) { const ry=headY+6+i*rowH-scrollY; if(ry+rowH<headY||ry>headY+listH)continue; const {p,isOnline}=rows[i]; if(i%2===0){ctx.fillStyle='rgba(15,23,42,.5)';ctx.fillRect(mx+padX,ry,mw-padX*2,rowH);} ctx.font='11px sans-serif';ctx.fillStyle=isOnline?'#34d399':'#64748b';ctx.fillText(p.account||'?',mx+padX+6,ry+16);ctx.fillStyle=isOnline?'#e2e8f0':'#94a3b8';ctx.fillText(p.zone||'-',mx+padX+140,ry+16);ctx.fillText(`Lv.${p.level||1}`,mx+padX+240,ry+16);ctx.fillText(`${p.backpack||0}/${p.bank||0}`,mx+padX+290,ry+16);ctx.fillStyle=isOnline?'#34d399':'#64748b';ctx.fillText(isOnline?`🟢 在线 (${_fmtAgo(p.idle_secs)})`:(p.last_active_at>0?`⚫ 离线 · ${_fmtAgo(p.idle_secs)}`:'⚫ 离线 · 从未活跃'),mx+padX+360,ry+16); debugTabState._playerRowHitAreas.push({x:mx+padX,y:ry,w:mw-padX*2,h:rowH,playerRef:p.player_ref}); }
  if(rows.length*rowH>listH){const barH=Math.max(20,listH*listH/(rows.length*rowH));const barY=headY+(scrollY/(rows.length*rowH-listH))*(listH-barH);ctx.fillStyle='rgba(236,72,153,.3)';ctx.beginPath();ctx.roundRect(mx+mw-8,barY,4,barH,2);ctx.fill();}
  ctx.font='11px sans-serif';ctx.fillStyle='#64748b';ctx.fillText('💡 GM 工具：点击任意玩家 → 详细状态 / 最近账本 / 全账本 / 校验 / 回放',mx+20,my+mh-12);
}

function _drawDebugPlayerDetail(ctx,mx,my,mw,mh){
  const d=debugTabState._selectedPlayerDetail; let cy=my+64; const back={x:mx+16,y:cy,w:58,h:22}; drawDebugBtn(ctx,back.x,back.y,back.w,back.h,'← 列表','#94a3b8',false);
  if(debugTabState._playerDetailLoading){ctx.fillStyle='#94a3b8';ctx.font='12px sans-serif';ctx.fillText('正在读取玩家详情…',mx+88,cy+16);return;}
  if(!d){ctx.fillStyle='#f87171';ctx.font='12px sans-serif';ctx.fillText('玩家详情不可用',mx+88,cy+16);return;}
  ctx.fillStyle='#e2e8f0';ctx.font='bold 12px sans-serif';ctx.fillText(`👤 ${d.account||'玩家'} · GM 详细档案`,mx+88,cy+16);cy+=32;
  ctx.fillStyle='rgba(15,23,42,.72)';ctx.strokeStyle='rgba(56,189,248,.3)';ctx.beginPath();ctx.roundRect(mx+16,cy,mw-32,78,6);ctx.fill();ctx.stroke();ctx.font='10px monospace';ctx.fillStyle='#94a3b8';
  ctx.fillText(`区域 ${d.position?.zone_id||'—'}  坐标 (${Number(d.position?.x||0).toFixed(0)}, ${Number(d.position?.y||0).toFixed(0)})`,mx+28,cy+18);ctx.fillText(`等级 Lv.${d.level||1}   铜钱 ${d.copper||0}   金币 ${d.coins||0}   仙玉 ${d.jade||0}`,mx+28,cy+36);ctx.fillText(`账本高度 #${d.block_height||0}   区块 ${d.ledger_count||0}   最后活跃 ${_fmtPlayerTime(d.last_active_at)}`,mx+28,cy+54);ctx.fillStyle=d.ledger_integrity?'#34d399':'#f87171';ctx.fillText(d.ledger_integrity?'● SERVER LEDGER OK':'● SERVER LEDGER ERROR',mx+28,cy+70);cy+=90;
  const bw=74,bh=24,gap=6,areas={verify:{x:mx+16,y:cy,w:bw,h:bh},replay:{x:mx+16+bw+gap,y:cy,w:bw,h:bh}};drawDebugBtn(ctx,areas.verify.x,cy,bw,bh,'🔍 校验','#34d399',false);drawDebugBtn(ctx,areas.replay.x,cy,bw,bh,'▶ 回放','#38bdf8',false);cy+=34;
  const replay=debugTabState._playerDetailReplay||(debugTabState._playerDetailReplay=new (replayEngine.constructor)(d.ledger||[]));ctx.fillStyle='rgba(15,23,42,.62)';ctx.strokeStyle='rgba(56,189,248,.25)';ctx.beginPath();ctx.roundRect(mx+16,cy,mw-32,76,6);ctx.fill();ctx.stroke();ctx.font='10px monospace';ctx.fillStyle='#e2e8f0';ctx.fillText(`▶ 回放位置 ${replay.cursor}/${replay.blocks.length} · Block #${replay.state.block_height||'—'} · ${replay.state.last_action||'—'}`,mx+28,cy+18);ctx.fillStyle='#94a3b8';ctx.fillText(`状态 (${replay.state.player_x??'—'}, ${replay.state.player_y??'—'}) Zone ${replay.state.zone_id||'—'} · 事件 ${replay.state.action_count}`,mx+28,cy+36);
  const rAreas={};[['⏮','start'],['⏭','step'],['▶','all']].forEach((it,i)=>{const x=mx+28+i*64;drawDebugBtn(ctx,x,cy+46,58,20,it[0],'#38bdf8',false);rAreas[it[1]]={x,y:cy+46,w:58,h:20};});debugTabState._playerDetailReplayAreas={...areas,...rAreas};cy+=86;
  const blocks=d.ledger||[],rowH=20,listTop=cy,listH=my+mh-20-listTop,maxScroll=Math.max(0,blocks.length*rowH-listH);debugTabState._playerDetailScrollY=Math.max(0,Math.min(maxScroll,debugTabState._playerDetailScrollY||0));const sy=debugTabState._playerDetailScrollY;ctx.font='10px monospace';ctx.fillStyle='#64748b';ctx.fillText(`完整行为账本 · 共 ${blocks.length} 个动作（滚轮查看）`,mx+20,listTop-5);
  for(let i=0;i<blocks.length;i++){const y=listTop+i*rowH-sy;if(y<listTop-rowH||y>listTop+listH)continue;const b=blocks[i];if(i%2===0){ctx.fillStyle='rgba(30,41,59,.42)';ctx.fillRect(mx+16,y,mw-32,rowH);}ctx.fillStyle='#a78bfa';ctx.fillText(`#${b.height}`,mx+22,y+14);ctx.fillStyle='#e2e8f0';ctx.fillText(String(b.action_type||'unknown').slice(0,24),mx+74,y+14);ctx.fillStyle='#64748b';ctx.fillText(String(b.block_hash||'').slice(0,10),mx+mw-96,y+14);}
}

function _formatLedgerBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function _drawDebugLedgerTab(ctx, mx, my, mw, mh) {
  const head = localHashChain.getHead();
  const blocks = localHashChain.getRecentBlocks(18);
  const integrityOk = localHashChain.verifyChainIntegrity(localHashChain.blocks);
  const sizeRatio = Math.min(1, head.ledger_bytes / MAX_LEDGER_SEGMENT_BYTES);
  let cy = my + 64;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(mx + 16, cy, mw - 32, 86, 6); ctx.fill(); ctx.stroke();

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`LEDGER v${LEDGER_VERSION}`, mx + 28, cy + 20);
  ctx.fillStyle = integrityOk ? '#34d399' : '#f87171';
  ctx.fillText(integrityOk ? '● HASH CHAIN OK' : '● HASH CHAIN ERROR', mx + 150, cy + 20);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`高度 #${head.height}   区块 ${head.block_count}   ${_formatLedgerBytes(head.ledger_bytes)}`, mx + 28, cy + 40);
  ctx.fillText(`Head ${head.hash}`, mx + 28, cy + 59);

  const barX = mx + 28, barY = cy + 68, barW = mw - 56, barH = 8;
  ctx.fillStyle = 'rgba(71, 85, 105, 0.55)'; ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#a855f7'; ctx.fillRect(barX, barY, barW * sizeRatio, barH);
  ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif';
  ctx.fillText(`1 MiB 分段目标 · ${Math.round(sizeRatio * 100)}%`, barX, barY - 3);

  cy += 98;
  const verifyW = 86, verifyH = 24;
  const verifyX = mx + mw - verifyW - 16;
  const verifyY = cy;
  ctx.fillStyle = integrityOk ? 'rgba(52, 211, 153, 0.14)' : 'rgba(248, 113, 113, 0.14)';
  ctx.strokeStyle = integrityOk ? '#34d399' : '#f87171';
  ctx.beginPath(); ctx.roundRect(verifyX, verifyY, verifyW, verifyH, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = integrityOk ? '#34d399' : '#f87171';
  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('重新校验', verifyX + verifyW / 2, verifyY + 16); ctx.textAlign = 'left';
  debugTabState._ledgerVerifyArea = { x: verifyX, y: verifyY, w: verifyW, h: verifyH };

  ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif';
  ctx.fillText('最近录像（新动作在上）', mx + 20, cy + 42);
  cy += 50;
  const rowH = 20;
  const maxRows = Math.max(1, Math.floor((my + mh - 18 - cy) / rowH));
  for (let i = 0; i < Math.min(blocks.length, maxRows); i++) {
    const b = blocks[i];
    const y = cy + i * rowH;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 41, 59, 0.42)' : 'rgba(15, 23, 42, 0.32)';
    ctx.fillRect(mx + 16, y - 13, mw - 32, rowH);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#a78bfa'; ctx.fillText(`#${b.height}`, mx + 22, y);
    ctx.fillStyle = '#e2e8f0'; ctx.fillText(String(b.action_type).slice(0, 20), mx + 72, y);
    ctx.fillStyle = '#64748b'; ctx.fillText(b.synced ? '✓' : '·', mx + mw - 54, y);
    ctx.fillStyle = '#64748b'; ctx.fillText(String(b.block_hash).slice(0, 8), mx + mw - 128, y);
  }
}


function _drawDebugReplayTab(ctx, mx, my, mw, mh) {
  if (!debugTabState._replay || debugTabState._replay.blocks.length !== localHashChain.blocks.length) {
    debugTabState._replay = new (replayEngine.constructor)(localHashChain.blocks);
  }
  const replay = debugTabState._replay;
  const blocks = replay.blocks;
  const current = replay.currentBlock();
  const st = replay.state;

  let cy = my + 64;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(mx + 16, cy, mw - 32, 112, 6); ctx.fill(); ctx.stroke();

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('PLAYER LEDGER REPLAY', mx + 28, cy + 20);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`进度 ${replay.cursor}/${blocks.length}`, mx + 28, cy + 40);
  ctx.fillText(`Block #${st.block_height || '—'}  Action ${st.last_action || '—'}`, mx + 28, cy + 58);
  ctx.fillText(`位置 ${st.player_x ?? '—'}, ${st.player_y ?? '—'}  Zone ${st.zone_id || '—'}`, mx + 28, cy + 76);
  ctx.fillText(`库存事件物品 ${Object.keys(st.inventory).length}  ·  锻造敲击 ${st.strikes}`, mx + 28, cy + 94);

  const bw = 62, bh = 24, gap = 6;
  const by = cy + 122;
  const labels = [
    ['⏮ 起点', 'start'],
    ['⏭ 单步', 'step'],
    ['▶ 全部', 'all'],
  ];
  const actions = {};
  for (let i = 0; i < labels.length; i++) {
    const bx = mx + 16 + i * (bw + gap);
    drawDebugBtn(ctx, bx, by, bw, bh, labels[i][0], '#38bdf8', false);
    actions[labels[i][1]] = { x: bx, y: by, w: bw, h: bh };
  }

  const barX = mx + 16, barY = by + 36, barW = mw - 32, barH = 8;
  ctx.fillStyle = 'rgba(71, 85, 105, 0.55)'; ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#38bdf8'; ctx.fillRect(barX, barY, barW * replay.progress, barH);

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('第二阶段第一版：只在独立审计状态中回放，不修改正在运行的游戏状态。', mx + 16, barY + 22);
  ctx.fillText(current ? `当前录像：#${current.height} · ${current.action_type}` : '当前录像：尚未开始', mx + 16, barY + 38);

  debugTabState._replayHitAreas = actions;
}

function drawDebugBtn(ctx, bx, by, bw, bh, text, color, active) {
  ctx.fillStyle = active ? `${color}33` : 'rgba(30, 41, 59, 0.7)';
  ctx.strokeStyle = active ? color : '#475569';
  ctx.lineWidth = active ? 1.5 : 1.0;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = active ? color : (color === '#64748b' ? '#94a3b8' : '#e2e8f0');
  ctx.font = 'bold 11px sans-serif';
  const tw = ctx.measureText(text).width;
  ctx.fillText(text, bx + (bw - tw) / 2, by + bh / 2 + 4);
}

export function handleDebugClick(clickX, clickY, bounds, w, h) {
  const { mx, my, mw, mh } = bounds;

  // 🌟 标签页切换 (最优先检测, 5 tabs)
  const tabY = my + 36;
  const tabH = 22;
  const TAB_COUNT = 4;
  const tabW = (mw - 32 - 6 * (TAB_COUNT - 1)) / TAB_COUNT;
  const tabToasts = ['🔭 已切换到场景监视器', '📦 已切换到物品库', '👥 已切换到玩家信息', '⛓️ 已切换到玩家行为账本', '▶️ 已切换到录像回放'];
  for (let i = 0; i < TAB_COUNT; i++) {
    const tx = mx + 16 + i * (tabW + 6);
    if (clickX >= tx && clickX <= tx + tabW && clickY >= tabY && clickY <= tabY + tabH) {
      debugTabState.activeTab = i;
      debugTabState.itemScrollY = 0;
      debugTabState.playersScrollY = 0;
      if (i === 2) { _closePlayerDetail(); _fetchPlayersReport(); } // 切到玩家页自动拉一次报表 (5秒内缓存不重拉)
      debugState.setToast(tabToasts[i]);
      return true;
    }
  }

  // 🌟 Tab 1: 物品库点击处理
  if (debugTabState.activeTab === 1) {
    // 分类筛选栏点击
    if (debugTabState._catHitAreas) {
      for (const area of debugTabState._catHitAreas) {
        if (clickX >= area.x && clickX <= area.x + area.w && clickY >= area.y && clickY <= area.y + area.h) {
          _activeCategory = area.key;
          debugTabState.itemScrollY = 0;
          debugState.setToast(`📂 分类: ${CATALOG_CATEGORIES.find(c => c.key === area.key)?.label || '全部'}`);
          return true;
        }
      }
    }
    // 物品卡片点击
    const areas = debugTabState._hitAreas || [];
    for (const area of areas) {
      if (clickX >= area.x && clickX <= area.x + area.w && clickY >= area.y && clickY <= area.y + area.h) {
        _addItemToBackpack(area.item);
        return true;
      }
    }
    return false;
  }

  // 🌟 Tab 3: 玩家行为账本（第一阶段只读观察 + 手动完整校验）
  if (debugTabState.activeTab === 3) {
    const area = debugTabState._ledgerVerifyArea;
    if (area && clickX >= area.x && clickX <= area.x + area.w && clickY >= area.y && clickY <= area.y + area.h) {
      const ok = localHashChain.verifyChainIntegrity(localHashChain.blocks);
      debugState.setToast(ok ? '✅ 本地行为账本校验通过' : '🚨 本地行为账本校验失败');
      return true;
    }
    return true;
  }

  // 🌟 Tab 2: GM 玩家管理：点击玩家打开详细档案
  if (debugTabState.activeTab === 2) {
    if (debugTabState._selectedPlayerRef) {
      const areas = debugTabState._playerDetailReplayAreas || {};
      const back = { x: mx + 16, y: my + 64, w: 58, h: 22 };
      if (clickX >= back.x && clickX <= back.x + back.w && clickY >= back.y && clickY <= back.y + back.h) { _closePlayerDetail(); return true; }
      if (areas.verify && clickX >= areas.verify.x && clickX <= areas.verify.x + areas.verify.w && clickY >= areas.verify.y && clickY <= areas.verify.y + areas.verify.h) {
        networkAdapter.invoke('player_detail', { player_ref: debugTabState._selectedPlayerRef }).then((d) => {
          if (d) { debugTabState._selectedPlayerDetail = d; debugTabState._playerDetailReplay = new (replayEngine.constructor)(d.ledger || []); debugState.setToast(d.ledger_integrity ? '✅ 服务端账本校验通过' : '🚨 服务端账本校验失败'); }
          else debugState.setToast('❌ 服务端账本校验读取失败');
        });
        return true;
      }
      const replay = debugTabState._playerDetailReplay || new (replayEngine.constructor)(debugTabState._selectedPlayerDetail?.ledger || []);
      if (areas.start && clickX >= areas.start.x && clickX <= areas.start.x + areas.start.w && clickY >= areas.start.y && clickY <= areas.start.y + areas.start.h) { replay.reset(); debugState.setToast('⏮️ 已回到该玩家录像起点'); return true; }
      if (areas.step && clickX >= areas.step.x && clickX <= areas.step.x + areas.step.w && clickY >= areas.step.y && clickY <= areas.step.y + areas.step.h) { replay.step(1); debugState.setToast(`⏭️ 回放至 #${replay.state.block_height || 0}`); return true; }
      if (areas.all && clickX >= areas.all.x && clickX <= areas.all.x + areas.all.w && clickY >= areas.all.y && clickY <= areas.all.y + areas.all.h) { replay.playAll(); debugState.setToast(`▶️ 已回放该玩家全部 ${replay.blocks.length} 个动作`); return true; }
      if (areas.replay && clickX >= areas.replay.x && clickX <= areas.replay.x + areas.replay.w && clickY >= areas.replay.y && clickY <= areas.replay.y + areas.replay.h) { replay.reset(); debugState.setToast('▶️ 回放已重置到起点'); return true; }
      return true;
    }
    const area = debugTabState._refreshBtnArea;
    if (area && clickX >= area.x && clickX <= area.x + area.w && clickY >= area.y && clickY <= area.y + area.h) { _fetchPlayersReport(true); debugState.setToast('🔄 正在重新拉取玩家报表…'); return true; }
    for (const row of (debugTabState._playerRowHitAreas || [])) {
      if (clickX >= row.x && clickX <= row.x + row.w && clickY >= row.y && clickY <= row.y + row.h) { _openPlayerDetail(row.playerRef); return true; }
    }
    return true;
  }
  let cy = my + 64 + 88;

  const btnH = 26;
  const btnGap = 8;
  const btnW = (mw - 32 - btnGap * 2) / 3;

  if (clickY >= cy && clickY <= cy + btnH) {
    if (clickX >= mx + 16 && clickX <= mx + 16 + btnW) {
      const text = `{ x: ${Math.round(playerPos.x)}, y: ${Math.round(playerPos.y)} }`;
      copyToClipboard(text);
      debugState.setToast(`✅ 已复制当前坐标 ${text} 到剪贴板！`);
      return true;
    }
    if (clickX >= mx + 16 + btnW + btnGap && clickX <= mx + 16 + btnW * 2 + btnGap) {
      const text = `public player_x: number = ${Math.round(playerPos.x)};\npublic player_y: number = ${Math.round(playerPos.y)};`;
      copyToClipboard(text);
      debugState.setToast(`✅ 已复制 TS 初始化代码到剪贴板！`);
      return true;
    }
    if (clickX >= mx + 16 + (btnW + btnGap) * 2 && clickX <= mx + mw - 16) {
      debugState.showGrid = !debugState.showGrid;
      saveDebugSettings();
      debugState.setToast(`🌐 辅助网格已${debugState.showGrid ? '开启' : '关闭'}`);
      return true;
    }
  }

  cy += btnH + 8;

  if (clickY >= cy && clickY <= cy + btnH) {
    if (clickX >= mx + 16 && clickX <= mx + 16 + btnW) {
      debugState.showCrosshair = !debugState.showCrosshair;
      saveDebugSettings();
      debugState.setToast(`🎯 十字准星已${debugState.showCrosshair ? '开启' : '关闭'}`);
      return true;
    }
    if (clickX >= mx + 16 + btnW + btnGap && clickX <= mx + 16 + btnW * 2 + btnGap) {
      debugState.showHeadCoords = !debugState.showHeadCoords;
      saveDebugSettings();
      debugState.setToast(`🏷️ 头顶坐标已${debugState.showHeadCoords ? '开启' : '关闭'}`);
      return true;
    }
    if (clickX >= mx + 16 + (btnW + btnGap) * 2 && clickX <= mx + mw - 16) {
      playerPos.x = 13500;
      playerPos.y = 13500;
      camera.snapTo(13500, 13500);
      gameStore.updatePlayerPosition(13500, 13500, null, { persist: true, syncServer: true });
      debugState.setToast(`🔄 已重置角色位置到地图中心 (13500, 13500)`);
      return true;
    }
  }

  cy += btnH + 14 + 20;

  const gmBtnW = (mw - 32 - btnGap) / 2;
  if (clickY >= cy && clickY <= cy + btnH) {
    if (clickX >= mx + 16 && clickX <= mx + 16 + gmBtnW) {
      gameStore.dispatchAction('teleport_zone:zone_gm_test').then((snap) => {
        if (snap) {
          playerPos.x = 13500;
          playerPos.y = 13500;
          camera.snapTo(13500, 13500);
        }
      });
      debugState.setToast('🪐 已传送进入【GM 开发者专属空间】(zone_gm_test)');
      return true;
    }
    if (clickX >= mx + 16 + gmBtnW + btnGap && clickX <= mx + mw - 16) {
      gameStore.dispatchAction('teleport_zone:beijing').then((snap) => {
        if (snap) {
          if (snap.player_x !== undefined) {
            playerPos.x = snap.player_x;
            playerPos.y = snap.player_y;
          }
          camera.snapTo(playerPos.x, playerPos.y);
        }
      });
      debugState.setToast('⛩️ 已神行返回【北京 · 红皇城】');
      return true;
    }
  }

  cy += btnH + 14 + 20;

  const spdW = (mw - 32 - btnGap * 3) / 4;
  if (clickY >= cy && clickY <= cy + btnH) {
    if (clickX >= mx + 16 && clickX <= mx + 16 + spdW) {
      playerPos.speed = 150;
      saveDebugSettings();
      debugState.setToast(`👟 移动速度已设为 150 px/s (漫步)`);
      return true;
    }
    if (clickX >= mx + 16 + (spdW + btnGap) && clickX <= mx + 16 + spdW * 2 + btnGap) {
      playerPos.speed = 300;
      saveDebugSettings();
      debugState.setToast(`👟 移动速度已设为 300 px/s (标准90秒跨图)`);
      return true;
    }
    if (clickX >= mx + 16 + (spdW + btnGap) * 2 && clickX <= mx + 16 + spdW * 3 + btnGap * 2) {
      playerPos.speed = 500;
      saveDebugSettings();
      debugState.setToast(`👟 移动速度已设为 500 px/s (疾驰)`);
      return true;
    }
    if (clickX >= mx + 16 + (spdW + btnGap) * 3 && clickX <= mx + mw - 16) {
      playerPos.speed = 1000;
      saveDebugSettings();
      debugState.setToast(`👟 移动速度已设为 1000 px/s (极速调试)`);
      return true;
    }
  }

  return false;
}

// 🌟 物品库: 添加物品到背包 (工具类: 升级工具等级 + 同时入包作为可见反馈)
function _addItemToBackpack(item) {
  const tier = item.tier || 1;
  const getColor = (t) => t >= 6 ? '#ef4444' : t >= 4 ? '#a855f7' : t >= 3 ? '#38bdf8' : '#10b981';
  const getGlyph = (type) => type === 'wood' ? '🪵' : type === 'herb' ? '🌿' : type === 'hide' ? '🦊' : type === 'tool' ? '🔧' : '⛏️';
  const color = getColor(tier);

  // 🌟 货币类直接点击获取: 铜钱、金币、仙玉 -> 既累加全局账户余额，又将对应货币物品直接放入背包
  const isCurrency = item.currencyKey || item.source === 'currency' || item.type === 'currency' || ['铜钱', '金币', '仙玉'].some(c => (item.name || '').includes(c));
  if (isCurrency) {
    const key = item.currencyKey || (item.name.includes('铜钱') ? 'copper' : item.name.includes('金币') ? 'coins' : 'jade');
    const cleanName = key === 'copper' ? '铜钱' : key === 'coins' ? '金币' : '仙玉';
    const amt = Number(item.amount || item.count) || (key === 'copper' ? 10000 : key === 'coins' ? 1000 : 100);
    const currGlyph = item.icon || (key === 'copper' ? '🪙' : key === 'coins' ? '💰' : '💎');
    const currColor = key === 'copper' ? '#f59e0b' : key === 'coins' ? '#eab308' : '#38bdf8';
    
    // 1. 累加账户余额
    gameState[key] = (Number(gameState[key]) || 0) + amt;

    // 2. 存入背包槽位
    if (!Array.isArray(gameState.backpack)) gameState.backpack = [];
    const maxSlots = gameState.max_backpack || 12;
    while (gameState.backpack.length < maxSlots) gameState.backpack.push(null);

    const existing = gameState.backpack.find(it => it && (it.name === cleanName || it.name === item.name || it.itemId === cleanName));
    if (existing) {
      existing.stack_count = (Number(existing.stack_count || existing.stackCount) || 0) + amt;
      existing.stackCount = existing.stack_count;
    } else {
      const emptySlot = gameState.backpack.indexOf(null);
      const newItem = {
        id: `dbg_${key}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        itemId: cleanName,
        item_id: cleanName,
        name: cleanName,
        itemType: 'Material',
        item_type: 'Material',
        tier: tier,
        stack_count: amt,
        stackCount: amt,
        max_stack: 99999999,
        is_bound: false,
        weight: 0.001,
        glyph: currGlyph,
        color: currColor,
        colorHex: currColor,
      };
      if (emptySlot >= 0) {
        gameState.backpack[emptySlot] = newItem;
      } else {
        gameState.backpack.push(newItem);
      }
    }

    // 3. 区块链审计与云端快照同步 (带入完整背包与货币)
    auditReporter.reportItemGain({ id: `dbg_${key}`, name: cleanName, stack_count: amt }, amt, 'debug_currency');
    debugState.setToast(`✅ 已获得【${cleanName}】x${amt} 并成功存入背包！(余额: ${gameState[key]})`);
    gameStore.addLog(`🪙 调试获取: ${currGlyph} ${cleanName} x${amt} (已存入背包，当前余额: ${gameState[key]})`);
    audio.playCoin();
    return;
  }

  // 🌟 工具类: 先升级 gameState 中的工具等级 (供采集判定使用)，不 return，继续入包;
  //    同时写入本地持久化, 防止刷新页面后工具等级回落为 T1 (game-store 对账时双通道恢复)
  if (item.source === 'tool' && item.toolKey) {
    const currentLevel = gameState[item.toolKey] || 0;
    gameState[item.toolKey] = Math.max(currentLevel, tier);
    const savedLevels = storageAdapter.get(TOOL_LEVELS_KEY, {}) || {};
    savedLevels[item.toolKey] = Math.max(savedLevels[item.toolKey] || 0, gameState[item.toolKey]);
    storageAdapter.set(TOOL_LEVELS_KEY, savedLevels);
  }

  // 🌟 确保背包数组存在且已填充 null 槽位
  if (!Array.isArray(gameState.backpack)) gameState.backpack = [];
  const maxSlots = gameState.max_backpack || 12;
  while (gameState.backpack.length < maxSlots) gameState.backpack.push(null);

  // 🌟 采集物 (gather/corpse) 携带子品阶，供背包底部四圆点显示；工具与特殊物品无子品阶
  const isGatherMat = item.source === 'gather' || item.source === 'corpse';
  const itemSubLevel = isGatherMat ? (Number(item.subLevel) || 1) : 0;

  // 查找已有同类物品 (可堆叠; 新命名体系名字已含子品阶, 同名必同子品阶)
  const existing = gameState.backpack.find(it => it && (it.name === item.name || it.itemId === item.name));
  if (existing) {
    existing.stack_count = (Number(existing.stack_count || existing.stackCount) || 1) + 1;
    existing.stackCount = existing.stack_count;
  } else {
    // 🌟 找第一个空槽 (null) 放入，而不是 push 到末尾
    const emptySlot = gameState.backpack.indexOf(null);
    const newItem = {
      id: `dbg_${item.name}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      itemId: item.name,
      name: item.name,
      itemType: item.source === 'tool' ? 'Tool' : item.type === 'currency' ? 'TradeGood' : 'Material',
      tier: tier,
      subLevel: itemSubLevel || undefined,
      isGatherMat: item.source === 'gather', // 🌟 采集物标记: 仅采集物显示底部四圆点
      stack_count: 1,
      stackCount: 1,
      max_stack: 999,
      is_bound: true,
      is_tool: item.source === 'tool',
      weight: item.source === 'tool' ? 1.0 : item.type === 'herb' ? 0.5 : item.type === 'wood' ? 1.5 : 2.5,
      glyph: item.icon || getGlyph(item.type),
      color: color,
      colorHex: color,
    };
    if (emptySlot >= 0) {
      gameState.backpack[emptySlot] = newItem;
    } else {
      // 背包已满，强制追加到末尾
      gameState.backpack.push(newItem);
    }
  }

  // 🌟 区块链背书: 调试生成物品入链 (HashChain gain 块 + 云端快照落库, 抵抗服务端同步覆盖与刷新丢失)
  auditReporter.reportItemGain({ id: `dbg_${item.name}`, name: item.name }, 1, `debug_${item.source || 'catalog'}`);

  if (item.source === 'tool' && item.toolKey) {
    debugState.setToast(`✅ 已获得【${item.name}】工具等级提升至 T${gameState[item.toolKey]}，已放入背包`);
    gameStore.addLog(`🔧 调试生成: ${item.name} → 工具等级 T${gameState[item.toolKey]} + 入包`);
  } else {
    debugState.setToast(`✅ 已生成【${item.name}】x1 到背包`);
    gameStore.addLog(`📦 调试生成: ${item.icon} ${item.name} (T${tier})`);
  }
}

// 🌟 物品库滚轮处理
export function handleDebugWheel(deltaY) {
  if (!uiState.isOpen('debug')) return false;
  // 🌟 Tab 2: 玩家信息页滚动 (在线+离线列表合并滚动)
  if (debugTabState.activeTab === 2) {
    const bounds = getModalBounds('debug', window.innerWidth, window.innerHeight);
    if (debugTabState._selectedPlayerRef && debugTabState._selectedPlayerDetail) {
      const count = (debugTabState._selectedPlayerDetail.ledger || []).length;
      const listH = bounds.mh - 64 - 32 - 90 - 34 - 86 - 20;
      const maxScroll = Math.max(0, count * 20 - listH);
      debugTabState._playerDetailScrollY = Math.max(0, Math.min(maxScroll, (debugTabState._playerDetailScrollY || 0) + deltaY * 0.7));
    } else {
      const data = debugTabState._playersData;
      const rowCount = data ? (data.online || []).length + (data.offline || []).length : 0;
      const listH = bounds.mh - 80 - 38 - 18 - 6;
      const maxScroll = Math.max(0, rowCount * 24 - listH);
      debugTabState.playersScrollY = Math.max(0, Math.min(maxScroll, (debugTabState.playersScrollY || 0) + deltaY * 0.5));
    }
    return true;
  }
  if (debugTabState.activeTab === 3) return true;
  if (debugTabState.activeTab !== 1) return false;
  const catalog = getItemCatalog();
  const filtered = _activeCategory === 'all' ? catalog : catalog.filter(it => it.category === _activeCategory);
  const cols = 4;
  const cardH = 64;
  const cardGap = 6;
  const totalRows = Math.ceil(filtered.length / cols);
  const bounds = getModalBounds('debug', window.innerWidth, window.innerHeight);
  const gridH = (bounds.mh - 80) - 22 - 12; // contentH - catH - 12
  const maxScroll = Math.max(0, totalRows * (cardH + cardGap) - gridH);
  debugTabState.itemScrollY = Math.max(0, Math.min(maxScroll, (debugTabState.itemScrollY || 0) + deltaY * 0.5));
  return true;
}

function copyToClipboard(text) {
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}
