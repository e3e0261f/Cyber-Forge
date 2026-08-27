/*
 * 模块功能: 全局输入监听、MMO快捷键统一接管、27000x27000 空间平滑移动、靠近矿物 QTE 采集
 * 文件路径: ui/js/input.js
 */

import { clock, syncState, uiState, gameState, gameStore } from './state.js';
import { triggerStrikeImpact, fx, triggerWarpEffect } from './world.js';
import { camera } from './camera.js';
import { 
  WORLD_ZONES, 
  MAP_SIZE, 
  PLAYER_SPEED, 
  PORTAL_RADIUS, 
  PORTAL_INTERACT_RADIUS,
  TELEPORT_COOLDOWN_SECS,
  INVULNERABLE_DURATION_SECS,
  INVULNERABLE_FATIGUE_SECS,
  PORTAL_SAFE_INSET,
  PORTAL_FALLBACK_INSET,
  RESOURCE_TOOL_MAP, 
  canToolMine, 
  minToolTierFor, 
  formatT4LockRemain, 
  getPortalRebirthPos,
  checkPortalTrigger,
  getWallMargin,
  WORLD_WALL_MARGIN
} from './world/world-topology.js';
import { audio } from './audio.js';
import { hudState, scrollLogs, setLogsScroll, logsScrollY, logsMaxScroll, scrollBody, openItemContextMenu, closeContextMenu, hitTestContextMenu } from './hud.js';
import { isEquipmentItem } from './context-menu.js';
import { getModalDimensions, UI_WINDOW_CONFIG } from './ui-window-config.js';
import { auditReporter } from './security/audit-reporter.js';
import { gameConfig, isDevMode } from './config.js';
import { 
  stashDrag, 
  cycleSortMode, 
  tidyBackpack,
  scrollStash, 
  setStashScroll, 
  stashScrollY, 
  stashMaxScroll, 
  hitTestStashSlot, 
  hitTestSortHint,
  hitTestTidyButton,
  padBackpackSlots, 
  isStashSortOff,
  dropConfirmState,
  openDropConfirm,
  closeDropConfirm,
  executeDropConfirm,
  handleDropConfirmClick
} from './stash-view.js';
import { scrollAuction, setAuctionScroll, auctionScrollY, auctionMaxScroll } from './auction-view.js';
import { handleQuestClick, scrollQuest } from './quest-view.js';
import { handleDebugClick, handleDebugWheel } from './debug-view.js';
import { handleMinimapClick } from './minimap-view.js';
import { handleWorldMapClick, setActiveTab, activeTab } from './world-map.js';
import { handleSettingsClick, scrollSettings, settingsState } from './settings-view.js';
import { handleTradeClick } from './trade-view.js';
import { handleBankClick, scrollBank, setBankScroll, hitBankScrollbar, getBankScrollbarMetrics } from './bank-view.js';

let actionBusy = false;
let strikeBusy = false;
let mainLoopTimer = null;
let lastPortalTime = 0;

let comboCount = 0;
let comboTimer = null;
const COMBO_RESET_MS = 2000;

function bumpCombo(crit = false) {
    comboCount = crit ? comboCount + 2 : comboCount + 1;
    fx.setCombo(comboCount);
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
        comboCount = 0;
        fx.setCombo(0);
    }, COMBO_RESET_MS);
}

const scrollbarDrag = {
  active: false,
  modalId: null,
  pointerId: null,
  grabOffsetY: 0,
  bankSide: null, // 🌟 bank 模态双区滚动条专用: 'left' (银行) | 'right' (背包)
};

function getScrollbarState(id) {
  if (id === 'stash') return { scrollY: stashScrollY, maxScroll: stashMaxScroll, setScroll: setStashScroll };
  if (id === 'auction') return { scrollY: auctionScrollY, maxScroll: auctionMaxScroll, setScroll: setAuctionScroll };
  if (id === 'logs') return { scrollY: logsScrollY, maxScroll: logsMaxScroll, setScroll: setLogsScroll };
  return null;
}

function getScrollbarMetrics(id, bounds) {
  const state = getScrollbarState(id);
  if (!state || state.maxScroll <= 0) return null;
  const trackY = bounds.my + 54;
  const trackH = bounds.mh - 85;
  const contentH = trackH + state.maxScroll;
  const thumbH = Math.max(24, (trackH / contentH) * trackH);
  const travel = trackH - thumbH;
  const thumbY = trackY + (state.scrollY / state.maxScroll) * travel;
  return {
    ...state,
    hitX: bounds.mx + bounds.mw - 18,
    hitW: 16,
    trackY,
    trackH,
    thumbY,
    thumbH,
    travel,
  };
}

function hitScrollbar(x, y, id, bounds) {
  const bar = getScrollbarMetrics(id, bounds);
  if (!bar) return null;
  return x >= bar.hitX && x <= bar.hitX + bar.hitW && y >= bar.trackY && y <= bar.trackY + bar.trackH ? bar : null;
}

function updateScrollbarDrag(clientY) {
  if (!scrollbarDrag.active) return;
  const bounds = getModalBounds(scrollbarDrag.modalId, window.innerWidth, window.innerHeight);
  // 🌟 银行双区滚动条: 按 bankSide 取对应一侧几何 (左=银行/右=背包)
  if (scrollbarDrag.modalId === 'bank') {
    const bankBar = getBankScrollbarMetrics(scrollbarDrag.bankSide, bounds);
    if (!bankBar || bankBar.travel <= 0) return;
    const thumbTop = Math.max(bankBar.trackY, Math.min(bankBar.trackY + bankBar.travel, clientY - scrollbarDrag.grabOffsetY));
    setBankScroll(scrollbarDrag.bankSide, ((thumbTop - bankBar.trackY) / bankBar.travel) * bankBar.maxScroll);
    return;
  }
  const bar = getScrollbarMetrics(scrollbarDrag.modalId, bounds);
  if (!bar || bar.travel <= 0) return;
  const thumbTop = Math.max(bar.trackY, Math.min(bar.trackY + bar.travel, clientY - scrollbarDrag.grabOffsetY));
  bar.setScroll(((thumbTop - bar.trackY) / bar.travel) * bar.maxScroll);
}

function resetScrollbarDrag() {
  scrollbarDrag.active = false;
  scrollbarDrag.modalId = null;
  scrollbarDrag.pointerId = null;
  scrollbarDrag.grabOffsetY = 0;
  scrollbarDrag.bankSide = null;
}

const KEY_MAP = {
  KeyU: 'hammer_up',
  KeyW: 'bellows_up',
  KeyT: 'melt_cycle',
  KeyG: 'list_cycle',
  KeyX: 'breakthrough',
  Digit1: 'worker:forge',
  Digit2: 'worker:auction',
  Digit3: 'worker:sharpen',
  Digit4: 'worker:enchant',
  Digit5: 'worker:repair',
};

export const playerPos = {
  x: gameState.player_x || 13500,
  y: gameState.player_y || 13500,
  vx: 0,
  vy: 0,
  speed: PLAYER_SPEED
};

/**
 * 🌟 跪地状态机 (安全区被击败后跪地 15 秒，锁定所有操作)
 */
export const kneelingState = {
  active: false,
  startTime: 0,
  duration: 15000, // 15 秒

  /** 触发跪地 (被击败时调用) */
  trigger(now = performance.now()) {
    this.active = true;
    this.startTime = now;
    gatheringState.abort('跪地');
    console.log('[Kneeling] ☠️ 玩家被击败，跪地 15 秒');
  },

  /** 每帧更新：检查是否该自动站起 */
  tick(now = performance.now()) {
    if (!this.active) return;
    if (now - this.startTime >= this.duration) {
      this.active = false;
      console.log('[Kneeling] ✨ 15 秒已过，自动站起');
    }
  },
};

/**
 * 🌟 怪物尸体采集状态机
 * 怪物被击杀后，尸体变为可采集物，采集后根据怪物等级获得 T1-T8 兽皮
 * 尸体 60 秒后自然腐烂消失
 */
export const monsterCorpseState = {
  corpses: [],          // 当前地图上的尸体列表
  corpseDecayMs: 60000, // 尸体 60 秒后腐烂
  _nextId: 1,

  /** 生成一具怪物尸体 (怪物被击杀时调用) */
  spawn(x, y, monsterTier = 1, monsterName = '野兽') {
    const tier = Math.max(1, Math.min(8, monsterTier));
    const hideNames = ['兽皮', '粗皮', '硬皮', '灵皮', '妖皮', '魔皮', '神皮', '天道皮'];
    const hideIcons = ['🦌', '🐗', '🐊', '🦊', '🐉', '👹', '🔮', '✨'];
    const corpse = {
      id: `corpse_${this._nextId++}`,
      x, y,
      tier,
      monsterName,
      hideName: hideNames[tier - 1] || '兽皮',
      hideIcon: hideIcons[tier - 1] || '🦌',
      yieldItem: `T${tier}${hideNames[tier - 1]}`,
      spawnTime: performance.now(),
      harvested: false,
    };
    this.corpses.push(corpse);
    console.log(`[Corpse] 💀 ${monsterName}(T${tier}) 尸体已生成 @(${Math.round(x)},${Math.round(y)})`);
    return corpse;
  },

  /** 每帧更新：清理过期尸体 */
  tick(now = performance.now()) {
    this.corpses = this.corpses.filter(c => {
      if (c.harvested) return false;
      if (now - c.spawnTime > this.corpseDecayMs) {
        console.log(`[Corpse] 🍂 ${c.monsterName}(T${c.tier}) 尸体已腐烂`);
        return false;
      }
      return true;
    });
  },

  /** 获取某张地图上的所有尸体 */
  getCorpses() {
    return this.corpses;
  },

  /** 采集尸体 (返回采集物品信息) */
  harvest(corpseId) {
    const corpse = this.corpses.find(c => c.id === corpseId);
    if (!corpse || corpse.harvested) return null;
    corpse.harvested = true;
    console.log(`[Corpse] 🧤 采集了 ${corpse.monsterName}(T${corpse.tier}) 的皮 → ${corpse.yieldItem}`);
    return { item: corpse.yieldItem, tier: corpse.tier, icon: corpse.hideIcon };
  },
};

/**
 * 背包负重速度惩罚系数
 * ratio <= 1.0 → 1.0 (无惩罚)
 * ratio = 2.0  → 0.89 (减速 11%)
 * ratio = 5.0  → 0.56 (减速 44%)
 * ratio = 8.0  → 0.22 (减速 78%)
 * ratio = 9.9  → 0.01 (减速 99%)
 * ratio >= 10  → 0.0  (无法移动)
 */
export function getWeightSpeedMultiplier() {
  const curW = Number(gameState.current_weight) || 0;
  const maxW = Number(gameState.max_weight) || 50.0;
  if (maxW <= 0) return 1.0;
  const ratio = curW / maxW;
  if (ratio <= 1.0) return 1.0;
  if (ratio >= 10.0) return 0.0;
  return 1.0 - (ratio - 1.0) / 9.0;
}
let lastSyncTime = 0;
let lastTickTime = performance.now();
const heldKeys = new Map();

export function isPlayerMovingLocally() {
  return heldKeys.has('KeyW') || heldKeys.has('KeyS') || heldKeys.has('KeyA') || heldKeys.has('KeyD') ||
         heldKeys.has('ArrowUp') || heldKeys.has('ArrowDown') || heldKeys.has('ArrowLeft') || heldKeys.has('ArrowRight') ||
         Math.hypot(playerPos.vx, playerPos.vy) > 1;
}

export function getCurrentZone() {
  const zoneId = gameState.current_zone_id || gameState.current_city_id || 'beijing';
  return WORLD_ZONES[zoneId] || WORLD_ZONES.beijing;
}

export function getNearbyInteractable() {
  // 🌟 跪地时不可交互
  if (kneelingState.active) return null;
  const zone = getCurrentZone();
  const px = playerPos.x;
  const py = playerPos.y;

  if (zone.id === 'zone_gm_test') {
    const anvilDist = Math.hypot(px - 13500, py - 13500);
    if (anvilDist <= 450) {
      return { type: 'anvil', name: '天道试验神坛', x: 13500, y: 13500, dist: anvilDist };
    }
  }

  const resources = zone.resources || [];
  let nearestRes = null;
  let minDist = 100; // 紧贴资源光圈边缘才能采集 (与渲染 isNearby<=80 匹配，留 20px 容差)

  for (const res of resources) {
    const subLevel = res.subLevel || 1;
    const nodeId = res.id || `${res.x}_${res.y}`;
    const rem = gatheringState ? gatheringState.getNodeRemaining(nodeId) : 8;
    // 🌟 1.4 ~ 8.4 采集物 (subLevel === 4) 特殊规则: 采光即消失，不可被交互
    if (subLevel === 4 && rem <= 0) continue;

    const dist = Math.hypot(px - res.x, py - res.y);
    if (dist <= minDist) {
      minDist = dist;
      nearestRes = { type: 'resource', data: res, name: res.name, x: res.x, y: res.y, dist };
    }
  }

  // 🌟 怪物尸体检测 (优先级高于普通资源，更近交互距离)
  monsterCorpseState.tick(performance.now());
  let nearestCorpse = null;
  let corpseMinDist = 120; // 尸体交互距离稍大
  for (const corpse of monsterCorpseState.getCorpses()) {
    if (corpse.harvested) continue;
    const dist = Math.hypot(px - corpse.x, py - corpse.y);
    if (dist <= corpseMinDist) {
      corpseMinDist = dist;
      nearestCorpse = { type: 'corpse', data: corpse, name: `${corpse.monsterName}尸体 (T${corpse.tier})`, x: corpse.x, y: corpse.y, dist };
    }
  }

  // 尸体优先于普通资源 (如果都有的话)
  if (nearestCorpse && (!nearestRes || nearestCorpse.dist < nearestRes.dist)) {
    return nearestCorpse;
  }

  return nearestRes;
}

function checkClientCollision(x, y, radius = 24) {
  const zone = getCurrentZone();
  const mapW = zone.width || MAP_SIZE;
  const mapH = zone.height || MAP_SIZE;
  const wallMargin = getWallMargin();
  const gatePassHalfW = 60;
  const portals = zone.portals || zone.gates || [];

  // 1. 边界城墙碰撞检测 (在门洞开口处允许通行并接触传送门)
  // 西城墙 (x <= wallMargin)
  if (x - radius < wallMargin) {
    const isAtGate = portals.some(p => (p.dir === 'west' || Math.abs(p.x - wallMargin) < 200) && Math.abs(y - p.y) <= gatePassHalfW);
    if (!isAtGate || x < wallMargin - 40) return true;
  }
  // 东城墙 (x >= mapW - wallMargin)
  if (x + radius > mapW - wallMargin) {
    const isAtGate = portals.some(p => (p.dir === 'east' || Math.abs(p.x - (mapW - wallMargin)) < 200) && Math.abs(y - p.y) <= gatePassHalfW);
    if (!isAtGate || x > mapW - wallMargin + 40) return true;
  }
  // 北城墙 (y <= wallMargin)
  if (y - radius < wallMargin) {
    const isAtGate = portals.some(p => (p.dir === 'north' || Math.abs(p.y - wallMargin) < 200) && Math.abs(x - p.x) <= gatePassHalfW);
    if (!isAtGate || y < wallMargin - 40) return true;
  }
  // 南城墙 (y >= mapH - wallMargin)
  if (y + radius > mapH - wallMargin) {
    const isAtGate = portals.some(p => (p.dir === 'south' || Math.abs(p.y - (mapH - wallMargin)) < 200) && Math.abs(x - p.x) <= gatePassHalfW);
    if (!isAtGate || y > mapH - wallMargin + 40) return true;
  }

  // 2. 障碍物碰撞检测
  for (const obs of zone.obstacles || []) {
    if (
      x + radius > obs.minX &&
      x - radius < obs.maxX &&
      y + radius > obs.minY &&
      y - radius < obs.maxY
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 🌟 阿尔比恩式硬核采集读条状态机 (Albion-Style Channeling Gathering Engine)
 */
export const gatheringState = {
  active: false,
  targetNodeId: null,
  targetResource: null,
  progress: 0.0,
  duration: 1000, // 每次读条 1.0 秒
  startTime: 0,
  nodeIdToRemaining: {}, // 各节点储量池映射 (默认 8 次)
  nodeIdToLastHarvest: {}, // 各节点上次采集时间映射
  _completing: false, // 防止重入标志
  lastRegenTick: 0, // 自然再生计时器
  _cooldownUntil: 0, // QTE 失败冷却截止时间
  _autoChain: false, // 连续自动读条模式
  _qteAttempted: false, // 当前读条周期内 QTE 已尝试

  getNodeRemaining(nodeId) {
    if (this.nodeIdToRemaining[nodeId] === undefined) {
      this.nodeIdToRemaining[nodeId] = 8;
    }
    return this.nodeIdToRemaining[nodeId];
  },

  isT4Node(nodeId, res) {
    if (res && (Number(res.subLevel) === 4 || res.isT4)) return true;
    if (typeof nodeId === 'string' && nodeId.includes('_t4_')) return true;
    return false;
  },

  start(target) {
    // 🌟 诊断日志: 所有提前返回 分支都带原因输出, 杜绝静默卡死无从排查
    if (this._completing) { console.warn('[Gathering] start 拒绝: 上一轮采集结算尚未完成 (_completing 卡滞)'); return; }
    if (performance.now() < this._cooldownUntil) { console.warn('[Gathering] start 拒绝: QTE 失败冷却中'); return; }
    if (!target || !target.data) return;
    // 超重 10 倍时禁止采集 (移速为 0)
    if (getWeightSpeedMultiplier() <= 0) {
      gameStore.setToast('⚠️ 背包负重已达极限！请丢弃物品、换大背包或换负重更高的坐骑');
      return;
    }

    // 🌟 4 级采集物采集锁检查: 每 6 小时刷新一次, 刷新后 2 小时蕴养期不可采 (优先级高于工具检查)
    const resData = target.data;
    if ((resData.subLevel || 1) === 4 && resData.lockUntil && Date.now() < resData.lockUntil) {
      gameStore.setToast(`🔒 4级采集物灵气蕴养中，${formatT4LockRemain(resData.lockUntil)}后方可采集`);
      return;
    }

    // 🌟 工具需求检查: 必须有对应类型且品阶足够的采集工具 (新规则: T(N)可采 T1~T(N)全部 + T(N+1).1)
    const resType = resData.type;
    const resTier = resData.tier || 1;
    const resSubLevel = resData.subLevel || 1;
    const toolInfo = RESOURCE_TOOL_MAP[resType];
    if (toolInfo) {
      const playerToolLevel = gameState[toolInfo.toolKey] || 0;
      if (playerToolLevel === 0) {
        gameStore.setToast(`❌ 缺少${toolInfo.toolName}！无法采集此类资源`);
        return;
      }
      if (!canToolMine(playerToolLevel, resTier, resSubLevel)) {
        const needTier = minToolTierFor(resTier, resSubLevel);
        gameStore.setToast(`⚠️ 需要 T${needTier}${toolInfo.toolName}（当前 T${playerToolLevel}）才能开采 T${resTier}.${resSubLevel}`);
        return;
      }
    }

    const nodeId = resData.id || `${resData.x}_${resData.y}`;
    const rem = this.getNodeRemaining(nodeId);
    if (rem <= 0) {
      console.warn('[Gathering] start 拒绝: 节点储量耗尽', nodeId);
      if (resSubLevel === 4 || resData.isT4) {
        gameStore.setToast('⚠️ 4级珍稀灵物已开采完毕并化为灵气消散，将在下次天地异变(6小时后)刷新重现');
      } else {
        gameStore.setToast('⚠️ 资源节点已开采耗尽，正在汲取天地灵气再生中...');
      }
      return;
    }
    console.log('[Gathering] 开始连续读条:', nodeId, 'remaining:', rem,
      `T${resData.tier || 1}.${resData.subLevel || 1}`, '工具需求已通过');
    this.active = true;
    this._autoChain = true; // 开启自动连续读条
    this._qteAttempted = false;
    this.targetNodeId = nodeId;
    this.targetResource = target.data;
    this.progress = 0.0;
    this.startTime = performance.now();
    audio.playUI();
    fx.addFlash('#10b981', 0.15, 0.05);
  },

  abort(reason = '移动打断') {
    if (!this.active) return;
    this.active = false;
    this._autoChain = false;
    this.targetNodeId = null;
    this.targetResource = null;
    this.progress = 0.0;
    // 移动打断静默处理，不显示 toast
  },

  /** 状态机帧心跳 (负责推进读条、自动连续读条、资源自然再生) */
  tick(now) {
    // 1. 推进读条 (防止 _completing 期间重复触发)
    if (this.active && !this._completing) {
      const elapsed = now - this.startTime;
      this.progress = Math.min(1.0, elapsed / this.duration);
      if (this.progress >= 1.0) {
        this._completing = true;
        this.completeGather(false, now).then(() => {
          this._completing = false;
          // 自动连续读条：如果储量未耗尽且仍在自动模式，立即开启下一轮
          if (this._autoChain) {
            const rem = this.getNodeRemaining(this.targetNodeId);
            if (rem > 0 && this.active) {
              this.progress = 0.0;
              this._qteAttempted = false;
              this.startTime = performance.now();
              audio.playUI();
            } else {
              this._autoChain = false;
              this.active = false;
            }
          }
        });
      }
    }

    // 2. 客户端资源点自然再生循环 (每 5 秒检测一次，20 秒静止再生 1 点储量，上限 8 点)
    // 🌟 1.4~8.4 采集物 (subLevel === 4) 特殊规则: 采光后不参与自然再生，直接消散，仅随 6 小时世界刷新重新生成
    if (now - this.lastRegenTick > 5000) {
      this.lastRegenTick = now;
      for (const [id, rem] of Object.entries(this.nodeIdToRemaining)) {
        if (rem < 8) {
          if (this.isT4Node(id)) continue;
          const lastTime = this.nodeIdToLastHarvest[id] || 0;
          if (now - lastTime > 20000) {
            this.nodeIdToRemaining[id] = Math.min(8, rem + 1);
            this.nodeIdToLastHarvest[id] = now;
          }
        }
      }
    }
  },

  /** 玩家在读条期间按下空格触发 QTE 暴击判定
   *  🌟 完美区 (49%~51%): 正中间一击 → 3倍产出，金色特效
   *  ⚡ 黄金区 (76%~88%): 暴击 → 2倍产出，自动连续读条继续
   *  ❌ 其他区域: 整个采集链打断 + 1秒冷却，不消耗储量、不给物品 */
  async resolveQTE() {
    if (!this.active || this._completing || this._qteAttempted) return;
    this._qteAttempted = true; // 本周期内只允许尝试一次
    const now = performance.now();
    const elapsed = now - this.startTime;
    const prog = Math.min(1.0, elapsed / this.duration);
    const isPerfect = prog >= 0.85 && prog <= 0.87; // 黄金区正中间一帧 (86%位置，±1%)
    const isCrit = !isPerfect && prog >= 0.76 && prog <= 0.88;

    if (isPerfect) {
      // 🌟 QTE 完美一击：3倍产出，自动链继续
      audio.playCrit();
      triggerStrikeImpact(true, window.innerWidth, window.innerHeight);
      fx.addFlash('#ff4d7a', 0.4, 0.15);
      console.log('[Gathering] 🌟 QTE 完美一击！进度:', (prog * 100).toFixed(1) + '%，命中正中间 → 3倍产出');
      this._completing = true;
      await this.completeGather(false, now, true); // isCrit=false, isPerfect=true
      this._completing = false;
      // 自动链继续
      if (this._autoChain) {
        const rem = this.getNodeRemaining(this.targetNodeId);
        if (rem > 0 && this.active) {
          this.progress = 0.0;
          this._qteAttempted = false;
          this.startTime = performance.now();
          audio.playUI();
        } else {
          this._autoChain = false;
          this.active = false;
        }
      }
    } else if (isCrit) {
      // ⚡ QTE 暴击成功：2倍产出，自动链继续
      audio.playCrit();
      triggerStrikeImpact(true, window.innerWidth, window.innerHeight);
      fx.addFlash('#ffd700', 0.3, 0.1);
      console.log('[Gathering] ⚡ QTE 暴击！进度:', (prog * 100).toFixed(1) + '%，落在 76%~88% 黄金区');
      this._completing = true;
      await this.completeGather(true, now); // isCrit=true, isPerfect=false
      this._completing = false;
      // 自动链继续：如果储量未耗尽，立即开启下一轮
      if (this._autoChain) {
        const rem = this.getNodeRemaining(this.targetNodeId);
        if (rem > 0 && this.active) {
          this.progress = 0.0;
          this._qteAttempted = false;
          this.startTime = performance.now();
          audio.playUI();
        } else {
          this._autoChain = false;
          this.active = false;
        }
      }
    } else {
      // QTE 失败：整个采集链打断 + 1秒冷却
      this.active = false;
      this._autoChain = false;
      this.progress = 0.0;
      this._cooldownUntil = now + 1000;
      audio.playHit();
      fx.addFlash('#ef4444', 0.15, 0.08);
      console.log('[Gathering] ✖ QTE 未命中 (进度:', (prog * 100).toFixed(1) + '%)，采集链已打断，冷却 1 秒');
      gameStore.setToast('⚡ 未命中黄金区！采集链被打断，冷却 1 秒...');
    }
  },

  async completeGather(isCrit = false, now = performance.now(), isPerfect = false) {
    if (!this.active) return;
    const nodeId = this.targetNodeId;
    const resData = this.targetResource;
    if (!nodeId || !resData) {
      // 防御性检查：targetResource 被清空时安全中止
      this.active = false;
      this._autoChain = false;
      return;
    }
    const currentRem = this.getNodeRemaining(nodeId);
    console.log('[Gathering] completeGather: rem=', currentRem, 'isCrit=', isCrit, 'isPerfect=', isPerfect, 'autoChain=', this._autoChain);
    
    // 1. 基础开采消耗与产出：普通 1 个，QTE 黄金暴击 2 个，完美一击 3 个
    const harvestMultiplier = isPerfect ? 3 : (isCrit ? 2 : 1);
    const baseHarvestCount = Math.min(harvestMultiplier, currentRem);
    const newRem = Math.max(0, currentRem - baseHarvestCount);
    this.nodeIdToRemaining[nodeId] = newRem;
    this.nodeIdToLastHarvest[nodeId] = now;

    // 2. 高阶采集工具增益判定 (Tool Tier Bonus)
    // 根据当前锤/镐/工具品阶提供额外掉落概率增益 (每阶 +15% 几率额外爆出 +1 灵材)
    const toolTier = Math.max(1, Number(gameState.hammer_level) || 1);
    const toolName = gameState.hammer_name || '采矿镐';
    const toolBonusChance = Math.min(0.75, Math.max(0, (toolTier - 1) * 0.15));
    const hasToolBonus = toolBonusChance > 0 && Math.random() < toolBonusChance;
    const finalHarvestCount = hasToolBonus ? baseHarvestCount + 1 : baseHarvestCount;

    // 🌟 产出物品名必须取自节点自身定义; 缺失时置空让服务端拒绝结算 (旧默认值 '五行玄晶' 会掩盖节点定义缺失)
    const baseItemName = resData?.yieldItem || resData?.name || '';
    const tier = Number(resData?.tier) || 1;
    const resSubLevel = Number(resData?.subLevel) || 1;
    // 🌟 采集物命名规则: <产出名>·T<品阶>.<子品阶> (如 花岗岩·T5.1)。
    //    每种采集物 T1~T8 品阶名字互不重复, 不同品阶/子品阶绝不同名,
    //    服务端按名堆叠时不会把 T5 新采的并进旧 T3 堆。
    const targetItemName = baseItemName ? `${baseItemName}·T${tier}.${resSubLevel}` : '';

    // 🌟 防御: 节点未携带产出定义时中止本轮采集 (不入包不发请求), 避免空名物品污染背包
    if (!targetItemName) {
      console.error('[Gathering] 节点缺少 yieldItem 定义, 中止采集:', nodeId, resData);
      gameStore.setToast('⚠️ 该采集节点定义异常，无法产出物品');
      this.active = false;
      this._autoChain = false;
      return;
    }

    if (hasToolBonus) {
      audio.playCrit();
      triggerStrikeImpact(true, window.innerWidth, window.innerHeight);
      fx.addFlash('#00ffc8', 0.25, 0.08);
      fx.addGatherTip(`⚒️ +${finalHarvestCount} ${targetItemName}`, '#00ffc8', 9);
      gameStore.addLog(`⚒️【${toolName}共鸣】获得【${targetItemName}】x${finalHarvestCount} (${newRem}/8)`);
    } else if (isPerfect) {
      audio.playCrit();
      triggerStrikeImpact(true, window.innerWidth, window.innerHeight);
      fx.addFlash('#ff4d7a', 0.35, 0.12);
      fx.addGatherTip(`🌟 完美 +${finalHarvestCount} ${targetItemName}`, '#ff4d7a', 11);
      gameStore.addLog(`🌟【完美一击】三倍灵材【${targetItemName}】x3 (${newRem}/8)`);
    } else if (isCrit) {
      audio.playCrit();
      triggerStrikeImpact(true, window.innerWidth, window.innerHeight);
      fx.addFlash('#ffd700', 0.25, 0.08);
      fx.addGatherTip(`⚡ 暴击 +${finalHarvestCount} ${targetItemName}`, '#ffd700', 10);
      gameStore.addLog(`💥【QTE 暴击】双倍灵材【${targetItemName}】x2 (${newRem}/8)`);
    } else {
      audio.playHit();
      triggerStrikeImpact(false, window.innerWidth, window.innerHeight);
      fx.addGatherTip(`+${finalHarvestCount} ${targetItemName}`, '#34d399', 9);
      gameStore.addLog(`✨ 采掘成功：【${targetItemName}】x1 (${newRem}/8)`);
    }

    // 3. 客户端乐观入包 (确保背包立即出现物品)
    if (!Array.isArray(gameState.backpack)) gameState.backpack = [];
    // 🌟 新命名体系下名字已含品阶与子品阶 (名字·T品.子品), 同名必同子品阶;
    //    旧按 subLevel 字段比对会因服务端回传物品无该字段而找堆失败 → 反复新开 mat_ 堆 → 同步丢弃 → 背包震荡
    const existing = gameState.backpack.find(it => it && (it.name === targetItemName || it.itemId === targetItemName));
    if (existing) {
      existing.stack_count = (Number(existing.stack_count || existing.stackCount) || 1) + finalHarvestCount;
      existing.stackCount = existing.stack_count;
    } else {
      // 新物品类型 → 直接新增一格 (不限制格数硬上限，超重由负重惩罚系统处理)
      const getGlyph = (type) => type === 'wood' ? '🪵' : type === 'herb' ? '🌿' : type === 'fur' ? '🦊' : '⛏️';
      const getColor = (t) => t >= 6 ? '#ef4444' : t >= 4 ? '#a855f7' : t >= 3 ? '#38bdf8' : '#10b981';
      const newItem = {
        id: `mat_${tier}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        itemId: targetItemName,
        name: targetItemName,
        itemType: 'Material',
        tier: tier,
        subLevel: resSubLevel,
        isGatherMat: true, // 🌟 采集物标记: 背包图标下方四圆点仅采集物显示
        stack_count: finalHarvestCount,
        stackCount: finalHarvestCount,
        max_stack: 999,
        is_bound: true,
        weight: resData?.type === 'herb' ? 0.5 : resData?.type === 'wood' ? 1.5 : 2.5,
        glyph: getGlyph(resData?.type),
        color: getColor(tier),
        colorHex: getColor(tier)
      };
      // 🌟 优先放入首个空槽 (背包为 null 填充的定长槽位数组, 直接 push 会落到渲染范围外的溢出位);
      //    格满时追加末尾 (超容量入包, 与服务端设计一致)
      const emptyIdx = gameState.backpack.findIndex((slot) => !slot);
      if (emptyIdx >= 0) {
        gameState.backpack[emptyIdx] = newItem;
      } else {
        gameState.backpack.push(newItem);
      }
    }

    // 4. 触发后端/全局状态机采集并持久化 (先结算, 后快照——顺序不可颠倒)
    console.log('[Gathering] sending dispatchAction to server...');
    try {
      const result = await gameStore.dispatchAction('gather_zone_resource', { 
        is_crit: isCrit,
        is_perfect: isPerfect,
        count: finalHarvestCount, 
        base_count: baseHarvestCount,
        has_tool_bonus: hasToolBonus,
        tool_tier: toolTier,
        target_node_id: nodeId,
        target_resource: resData,
        target_item: targetItemName,
        zone_id: gameState.current_zone_id,
        player_x: playerPos.x,
        player_y: playerPos.y,
        x: playerPos.x,
        y: playerPos.y
      });
      console.log('[Gathering] dispatchAction result:', result ? 'received' : 'null');
      if (result) {
        console.log('[Gathering] backpack after sync:', JSON.stringify(gameState.backpack?.filter(Boolean).map(it => ({ name: it.name, count: it.stack_count || it.stackCount }))), 'weight:', gameState.current_weight);
      }
    } catch (err) {
      console.error('[Gathering] 服务端采集请求失败:', err);
    }

    // 🌟 区块链背书: 采集获得入链 (HashChain gain 块 + 云端快照落库, 刷新页面后不丢失)。
    //    必须在服务端结算之后: 若快照与结算并发乱序到达, 快照整体替换背包会与结算新堆
    //    叠加出同名双堆 (一份带子品阶圆点/一份不带); 先结算后快照则两者数据一致。
    auditReporter.reportItemGain(
      existing || gameState.backpack.find(it => it && (it.name === targetItemName || it.itemId === targetItemName)),
      finalHarvestCount,
      'gather'
    );

    // 检查是否彻底采光 (8次)
    if (newRem <= 0) {
      if (resSubLevel === 4 || resData?.isT4) {
        gameStore.setToast(`🎉 4级天地珍宝【${resData?.name || targetItemName}】采掘完毕已化为灵气消散，将在 6 小时后天地异变重现！`);
        gameStore.addLog(`✨ 4级天地珍宝【${resData?.name || targetItemName}】已采尽消散，下轮 6 小时刷新重聚`);
        // 🌟 1.4~8.4 采集物采完直接从当前地图资源列表中剔除，实现立即消失
        const zone = getCurrentZone();
        if (zone && Array.isArray(zone.resources)) {
          zone.resources = zone.resources.filter(r => (r.id || `${r.x}_${r.y}`) !== nodeId);
        }
      } else {
        gameStore.setToast(`🎉【${resData?.name || targetItemName}】已完全开采耗尽 (${baseHarvestCount}/8)！按 B 打开锦囊查看物品`);
      }
      this._autoChain = false;
    } else if (!this._autoChain) {
      gameStore.setToast(`✨ 采掘成功！获得【${targetItemName}】x${finalHarvestCount} (${newRem}/8) 按B查看锦囊`);
    }
    
    // 状态重置由调用方 (tick/resolveQTE) 管理
    // 非自动链时，清理目标状态
    if (!this._autoChain) {
      this.targetNodeId = null;
      this.targetResource = null;
      this.progress = 0.0;
    }
  }
};

export async function handleSpacePress() {
  console.log('[Input] handleSpacePress called, strikeBusy:', strikeBusy, 'document.hidden:', document.hidden);
  if (strikeBusy || document.hidden) return;

  const target = getNearbyInteractable();
  console.log('[Input] getNearbyInteractable returned:', target);
  if (!target) return;

  const crit = clock.isCrit;

  if (target.type === 'resource') {
    if (!gatheringState.active && !gatheringState._completing) {
      // 第一次按 Space：开启采集读条
      gatheringState.start(target);
    } else if (gatheringState.active) {
      // 读条中再按 Space：QTE 暴击判定 (76%~88% 黄金区)
      gatheringState.resolveQTE();
    }
    return;
  }

  // 🌟 怪物尸体采集：按空格直接拾取兽皮 (无需读条)
  if (target.type === 'corpse') {
    const corpse = target.data;
    const result = monsterCorpseState.harvest(corpse.id);
    if (result) {
      // 🌟 兽皮入包 (同名同品阶堆叠, 否则新开一格)
      if (!Array.isArray(gameState.backpack)) gameState.backpack = [];
      const existingHide = gameState.backpack.find(it => it && (it.name === result.item || it.itemId === result.item));
      if (existingHide) {
        existingHide.stack_count = (Number(existingHide.stack_count || existingHide.stackCount) || 1) + 1;
        existingHide.stackCount = existingHide.stack_count;
      } else {
        const emptyIdx = gameState.backpack.indexOf(null);
        const hideItem = {
          id: `fur_${result.tier}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          itemId: result.item,
          name: result.item,
          itemType: 'Material',
          tier: result.tier,
          subLevel: 0,
          stack_count: 1,
          stackCount: 1,
          max_stack: 999,
          is_bound: true,
          weight: 1.0,
          glyph: result.icon,
          color: '#f59e0b',
          colorHex: '#f59e0b',
        };
        if (emptyIdx !== -1) gameState.backpack[emptyIdx] = hideItem;
        else gameState.backpack.push(hideItem);
      }
      // 🌟 区块链背书: 尸体拾取获得入链 + 云端快照落库 (刷新不丢失)
      auditReporter.reportItemGain({ id: `fur_${result.tier}`, name: result.item }, 1, 'corpse_loot');
      audio.playCoin();
      if (fx && fx.addGatherTip) {
        fx.addGatherTip(`${result.icon} +1 ${result.item}`, '#f59e0b', 9);
      }
      gameStore.addLog(`🧤 剥取了【${corpse.monsterName}】的尸体 → ${result.item} (T${result.tier})`);
    }
    return;
  }

  strikeBusy = true;
  try {
    clock.resetCycle();

    if (target.type === 'anvil') {
      triggerStrikeImpact(crit, window.innerWidth, window.innerHeight);
      if (crit) audio.playCrit();
      else audio.playHit();
      bumpCombo(crit);
      await gameStore.dispatchStrike();
    }
  } finally {
    strikeBusy = false;
  }
}

// 🌟 顶格导出 doStrike，完美兼容 app.js 的模块导入需求
export async function doStrike() {
  await handleSpacePress();
}

async function fireKey(code, shiftKey, ctrlKey, hitCount = 1) {
  if (actionBusy) return;
  let k = KEY_MAP[code];
  if (!k) return;

  actionBusy = true;
  try {
    await gameStore.dispatchAction(k);
  } finally {
    actionBusy = false;
  }
}

// 🌟 导出全局统一传送门检测函数
export { checkPortalTrigger };

/**
 * 🌟 核心：帧驱动本地零延迟移动物理积分与视口预测 (Frame-Driven Physics & Movement)
 * 在 requestAnimationFrame 循环中调用，与垂直同步严格对齐，彻底消除 setInterval 导致的掉帧与颤抖
 */
export function updatePlayerMovement(now = performance.now()) {
  if (!lastTickTime) lastTickTime = now;
  const dt = Math.min((now - lastTickTime) / 1000, 0.05);
  lastTickTime = now;

  // 🌟 跪地状态：锁定所有移动与操作
  kneelingState.tick(now);
  if (kneelingState.active) {
    playerPos.vx = 0;
    playerPos.vy = 0;
    gatheringState.abort('跪地');
    return;
  }

  let moveX = 0;
  let moveY = 0;
  
  if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) moveY -= 1;
  if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) moveY += 1;
  if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) moveX -= 1;
  if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) moveX += 1;

  if (moveX !== 0 || moveY !== 0) {
    const len = Math.hypot(moveX, moveY);
    const weightMul = getWeightSpeedMultiplier();
    const effectiveSpeed = playerPos.speed * weightMul;
    if (effectiveSpeed <= 0) {
      // 负重超限，无法移动
      playerPos.vx = 0;
      playerPos.vy = 0;
      if (!gatheringState._overweightWarned) {
        gatheringState._overweightWarned = true;
        gameStore.setToast('⚠️ 背包负重已达极限 (10倍)！请丢弃物品、换大背包或换负重更高的坐骑');
      }
    } else {
      gatheringState._overweightWarned = false;
      playerPos.vx = (moveX / len) * effectiveSpeed;
      playerPos.vy = (moveY / len) * effectiveSpeed;
    }
    // 玩家位移时，立刻中断当前的采集读条
    if (playerPos.vx !== 0 || playerPos.vy !== 0) {
      gatheringState.abort('玩家位移');
    }
  } else {
    playerPos.vx = 0;
    playerPos.vy = 0;
    gatheringState._overweightWarned = false;
  }

  // 采集读条状态机心跳驱动 (在静止读条时推进 0.0 ~ 1.0)
  gatheringState.tick(now);

  const zone = getCurrentZone();
  const mapW = zone.width || MAP_SIZE;
  const mapH = zone.height || MAP_SIZE;
  const nextX = playerPos.x + playerPos.vx * dt;
  const nextY = playerPos.y + playerPos.vy * dt;

  const wallMargin = getWallMargin();
  if (!checkClientCollision(nextX, playerPos.y)) {
    playerPos.x = Math.max(wallMargin - 40, Math.min(nextX, mapW - (wallMargin - 40)));
  }
  if (!checkClientCollision(playerPos.x, nextY)) {
    playerPos.y = Math.max(wallMargin - 40, Math.min(nextY, mapH - (wallMargin - 40)));
  }

  // 纯本地内存同步，0 网络延迟，0 主线程阻塞
  gameState.player_x = playerPos.x;
  gameState.player_y = playerPos.y;
  gameStore.state.player_x = playerPos.x;
  gameStore.state.player_y = playerPos.y;

  if (moveX !== 0 || moveY !== 0) {
    gameStore.updatePlayerPosition(playerPos.x, playerPos.y, zone.id, { persist: true, syncServer: false });
  }

  // 🌟 传送门触发检测 (全局统一极短物理接触判定)
  const cooldownMs = (TELEPORT_COOLDOWN_SECS || 5) * 1000;
  if (now - lastPortalTime > cooldownMs) {
    const hit = checkPortalTrigger(playerPos, zone, mapW, mapH, gameState.sky_city_unlocked);
    if (hit) {
      const { portal, dir, targetId } = hit;
      lastPortalTime = now;
      triggerWarpEffect();
      audio.playUI();
      const rebirthPos = getPortalRebirthPos(zone.id, targetId, dir);
      const targetSpawnX = rebirthPos.x;
      const targetSpawnY = rebirthPos.y;

      // 本地立即更新坐标与区域，平滑无缝过图
      playerPos.x = targetSpawnX;
      playerPos.y = targetSpawnY;
      playerPos.vx = 0;
      playerPos.vy = 0;
      gameState.current_zone_id = targetId;
      gameState.current_city_id = targetId;
      gameStore.state.current_zone_id = targetId;
      gameStore.state.current_city_id = targetId;
      gameStore.state.player_x = targetSpawnX;
      gameStore.state.player_y = targetSpawnY;
      camera.snapTo(targetSpawnX, targetSpawnY);
      gameStore.persistCoordinates(true);

      gameStore.dispatchAction(`teleport_zone:${targetId}`).then(snap => {
        if (snap) {
          if (snap.player_x !== undefined) {
            playerPos.x = snap.player_x;
            playerPos.y = snap.player_y;
          }
          if (snap.current_zone_id) {
            gameState.current_zone_id = snap.current_zone_id;
            gameState.current_city_id = snap.current_zone_id;
            gameStore.state.current_zone_id = snap.current_zone_id;
            gameStore.state.current_city_id = snap.current_zone_id;
          }
          camera.snapTo(playerPos.x, playerPos.y);
        }
      });
    }
  }

  // 异步节流位置同步 (250ms 一次，后台发送，不阻断前端平滑渲染)
  if ((moveX !== 0 || moveY !== 0) && now - lastSyncTime > 250) {
      lastSyncTime = now;
      gameStore.updatePlayerPosition(playerPos.x, playerPos.y, zone.id, { persist: false, syncServer: true });
  }

  // 处理其它非移动长按按键
  for (const [code, info] of heldKeys.entries()) {
    if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) continue;
    
    const interval = gameConfig.otherKeysIntervalMs;
    if (now - info.lastFiredTime >= interval) {
      info.lastFiredTime = now;
      info.hitCount++;
      fireKey(code, info.shiftKey, info.ctrlKey, info.hitCount);
    }
  }
}

function startMainLoop() {
  // 保持空函数或兼容调用，主循环已全面由 requestAnimationFrame 接管
}

export function getModalBounds(id, w, h) {
  const dim = getModalDimensions(id);
  let mw = dim.width;
  let mh = dim.height;
  mw = Math.min(mw, w * 0.95);
  mh = Math.min(mh, h * 0.9);

  const pos = uiState.modalPositions[id] || { x: null, y: null };
  const mx = pos.x !== null ? pos.x : (w * 0.5 - mw / 2);
  const my = pos.y !== null ? pos.y : (h * 0.5 - mh / 2);
  return { mx, my, mw, mh };
}

export function setupInteractions() {
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const w = window.innerWidth, h = window.innerHeight;
    const x = e.clientX, y = e.clientY;

    if (uiState.isOpen('stash')) {
      const bounds = getModalBounds('stash', w, h);
      if (bounds) {
        const idx = hitTestStashSlot(x, y, bounds);
        const item = idx >= 0 ? (gameState.backpack || [])[idx] : null;
        if (item) {
          openItemContextMenu(x, y, item);
          return;
        }
      }
    }
    closeContextMenu();
  });

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      return;
    }

    const w = window.innerWidth, h = window.innerHeight;
    const mx = e.clientX, my = e.clientY;

    for (const id of [...uiState.activeModals].reverse()) {
      if (!['stash', 'auction', 'logs', 'body', 'quest', 'debug', 'bank'].includes(id)) continue;
      const bounds = getModalBounds(id, w, h);
      if (!bounds) continue;
      const { mx: bx, my: by, mw, mh } = bounds;
      if (mx < bx || mx > bx + mw || my < by || my > by + mh) continue;

      e.preventDefault();
      if (id === 'debug') handleDebugWheel(e.deltaY);
      else if (id === 'stash') scrollStash(e.deltaY);
      else if (id === 'auction') scrollAuction(e.deltaY);
      else if (id === 'logs') scrollLogs(e.deltaY);
      else if (id === 'quest') scrollQuest(e.deltaY);
      // 🌟 银行双区: 滚轮按鼠标所在半区滚动 (左半=金库存物, 右半=随身背包)
      else if (id === 'bank') scrollBank(mx < bx + mw / 2 ? 'left' : 'right', e.deltaY);
      else scrollBody(e.deltaY);
      return;
    }
  }, { passive: false });

  window.addEventListener('pointermove', (e) => {
    const w = window.innerWidth, h = window.innerHeight;

    uiState.mouseX = e.clientX;
    uiState.mouseY = e.clientY;
    stashDrag.mouseX = e.clientX;
    stashDrag.mouseY = e.clientY;

    if (scrollbarDrag.active) {
      updateScrollbarDrag(e.clientY);
      document.body.style.cursor = 'grabbing';
      return;
    }

    if (uiState.draggingModal) {
      const id = uiState.draggingModal;
      uiState.modalPositions[id].x = e.clientX - uiState.dragOffset.x;
      uiState.modalPositions[id].y = e.clientY - uiState.dragOffset.y;
      document.body.style.cursor = 'move';
      return;
    }

    if (stashDrag.active) {
      document.body.style.cursor = 'grabbing';
      return;
    }

    for (const id of [...uiState.activeModals].reverse()) {
      const bounds = getModalBounds(id, w, h);
      const inside = e.clientX >= bounds.mx && e.clientX <= bounds.mx + bounds.mw &&
        e.clientY >= bounds.my && e.clientY <= bounds.my + bounds.mh;
      if (!inside) continue;
      if (['stash', 'auction', 'logs'].includes(id) && hitScrollbar(e.clientX, e.clientY, id, bounds)) {
        document.body.style.cursor = 'grab';
        return;
      }
      break;
    }
    document.body.style.cursor = 'default';
  });

  window.addEventListener('pointerdown', async (e) => {
    const w = window.innerWidth, h = window.innerHeight;
    const clickX = e.clientX, clickY = e.clientY;

    if (e.button === 2) return;

    if (dropConfirmState.active) {
      if (handleDropConfirmClick(clickX, clickY, w, h)) {
        return;
      }
    }

    if (hudState.contextMenu) {
      const hit = hitTestContextMenu(clickX, clickY);
      if (hit >= 0) {
        const entry = hudState.contextMenu.items[hit];
        const item = hudState.contextMenu.item;
        closeContextMenu();
        if (!entry || entry.disabled || entry.id === 'cancel') return;

        if (entry.id === 'inspect') {
          hudState.inspectItem = item;
          if (!uiState.isOpen('inspect')) uiState.toggleModal('inspect');
          return;
        }

        // 🌟 0. 自动识别物品使用 (货币存入、丹药吞服、宝物开启、秘籍领悟)
        if (entry.id === 'use' && item) {
          const usage = entry.usage || {};
          const tier = Number(item.tier) || 1;
          const count = Number(item.stack_count || item.stackCount || 1) || 1;
          const itemId = item.id || item.itemId || item.name;

          // 货币全额存入，其他消耗品默认单次使用 1 个
          const isCurrency = usage.type === 'currency' || ['铜钱', '金币', '仙玉', '纳玉'].some(c => (item.name || '').includes(c));
          const consumeCount = isCurrency ? count : 1;

          // 从随身背包扣除对应堆叠
          if (Array.isArray(gameState.backpack)) {
            const idx = gameState.backpack.findIndex(i => i && (i.id === item.id || (i.name === item.name && i.itemId === item.itemId)));
            if (idx >= 0) {
              const cur = gameState.backpack[idx];
              const curStack = Number(cur.stack_count || cur.stackCount || 1) || 1;
              if (curStack > consumeCount) {
                cur.stack_count = curStack - consumeCount;
                cur.stackCount = cur.stack_count;
              } else {
                gameState.backpack[idx] = null;
              }
            }
          }

          if (isCurrency) {
            let key = usage.currencyKey;
            if (!key) {
              if (item.name.includes('铜钱')) key = 'copper';
              else if (item.name.includes('金币')) key = 'coins';
              else if (item.name.includes('仙玉') || item.name.includes('纳玉')) key = 'jade';
              else key = 'copper';
            }
            const currName = key === 'copper' ? '铜钱' : key === 'coins' ? '金币' : '仙玉';
            gameState[key] = (Number(gameState[key]) || 0) + consumeCount;
            audio.playCoin();
            gameStore.setToast(`✨ 成功使用并存入【${currName}】+${consumeCount}！(当前总计: ${gameState[key]})`);
            gameStore.addLog(`🪙 物品使用: 消耗 ${currName} x${consumeCount}，存入账户 (当前余额: ${gameState[key]})`);
            auditReporter.reportItemDrop(item, consumeCount, 'use_currency');
            auditReporter.saveCloudStateSnapshot();
            gameStore.dispatchAction(`use_item:${itemId}`, { id: item.id, item_id: item.itemId, name: item.name, count: consumeCount, type: 'currency', currency_key: key });
            return;
          }

          if (usage.type === 'consumable') {
            const hpGain = 50 * tier;
            const mpGain = 30 * tier;
            const expGain = 100 * tier;
            if (gameState.hp != null) gameState.hp = Math.min(gameState.max_hp || 100, (Number(gameState.hp) || 100) + hpGain);
            if (gameState.mp != null) gameState.mp = Math.min(gameState.max_mp || 100, (Number(gameState.mp) || 100) + mpGain);
            gameState.exp = (Number(gameState.exp) || 0) + expGain;
            audio.playLevelUp?.() || audio.playUI();
            gameStore.setToast(`🧪 成功吞服【${item.name}】！气血+${hpGain}, 真气+${mpGain}, 修为+${expGain}！`);
            gameStore.addLog(`🧪 吞服丹药: ${item.name} (气血+${hpGain}, 真气+${mpGain}, 修为+${expGain})`);
            auditReporter.reportItemDrop(item, 1, 'use_consumable');
            auditReporter.saveCloudStateSnapshot();
            gameStore.dispatchAction(`use_item:${itemId}`, { id: item.id, item_id: item.itemId, name: item.name, count: 1, type: 'consumable' });
            return;
          }

          if (usage.type === 'chest') {
            const copperReward = 500 * tier;
            const coinsReward = 10 * tier;
            gameState.copper = (Number(gameState.copper) || 0) + copperReward;
            gameState.coins = (Number(gameState.coins) || 0) + coinsReward;
            if (item.name.includes('仙玉') || item.name.includes('混沌')) {
              gameState.jade = (Number(gameState.jade) || 0) + 10 * tier;
            }
            audio.playLevelUp?.() || audio.playCoin();
            gameStore.setToast(`📦 成功开启【${item.name}】！获得铜钱+${copperReward}, 金币+${coinsReward}！`);
            gameStore.addLog(`📦 宝物使用: ${item.name} (获得铜钱+${copperReward}, 金币+${coinsReward})`);
            auditReporter.reportItemDrop(item, 1, 'use_chest');
            auditReporter.saveCloudStateSnapshot();
            gameStore.dispatchAction(`use_item:${itemId}`, { id: item.id, item_id: item.itemId, name: item.name, count: 1, type: 'chest' });
            return;
          }

          if (usage.type === 'book') {
            const expGain = 200 * tier;
            gameState.exp = (Number(gameState.exp) || 0) + expGain;
            audio.playLevelUp?.() || audio.playUI();
            gameStore.setToast(`📖 研读领悟【${item.name}】！心领神会，修为+${expGain}！`);
            gameStore.addLog(`📖 研读领悟: ${item.name} (修为+${expGain})`);
            auditReporter.reportItemDrop(item, 1, 'use_book');
            auditReporter.saveCloudStateSnapshot();
            gameStore.dispatchAction(`use_item:${itemId}`, { id: item.id, item_id: item.itemId, name: item.name, count: 1, type: 'book' });
            return;
          }

          // 通用物品使用
          audio.playUI();
          gameStore.setToast(`✨ 已使用【${item.name}】！`);
          gameStore.addLog(`✨ 物品使用: ${item.name}`);
          auditReporter.reportItemDrop(item, 1, 'use_item');
          auditReporter.saveCloudStateSnapshot();
          gameStore.dispatchAction(`use_item:${itemId}`, { id: item.id, item_id: item.itemId, name: item.name, count: 1, type: 'general' });
          return;
        }

        // 🌟 穿戴装备
        if (entry.id === 'equip' && item) {
          audio.playHammer();
          gameStore.setToast(`⚔️ 已成功穿戴【${item.name}】！`);
          gameStore.addLog(`⚔️ 装备入身: ${item.name} (品阶 T${item.tier || 1})`);
          gameStore.dispatchAction(`equip_item:${item.id || item.itemId || item.name}`, { id: item.id, item_id: item.itemId, name: item.name, tier: item.tier });
          return;
        }

        // 1. 装备回收 (炼铁返金, 仅限装备)
        if (entry.id === 'recycle' && item) {
          if (!isEquipmentItem(item)) {
            gameStore.setToast('⚠️ 只有装备方可进行【装备回收 (炼铁返金)】！', '#ef4444');
            audio.playUI();
            return;
          }
          const tier = Number(item.tier) || 1;
          const isBeijing = gameState.current_city_id === 'beijing';
          const copperRefund = tier * (isBeijing ? 1000 : 500);
          const coinsRefund = tier * (isBeijing ? 20 : 10);
          const ironName = `精铁锭·T${tier}`;

          // 从背包扣除
          if (Array.isArray(gameState.backpack)) {
            const idx = gameState.backpack.findIndex(i => i && (i.id === item.id || (i.name === item.name && i.itemId === item.itemId)));
            if (idx >= 0) {
              const cur = gameState.backpack[idx];
              if ((cur.stack_count || cur.stackCount || 1) > 1) {
                cur.stack_count = (cur.stack_count || cur.stackCount) - 1;
                cur.stackCount = cur.stack_count;
              } else {
                gameState.backpack[idx] = null;
              }
            }
            // 产出精铁锭
            const existingIron = gameState.backpack.find(i => i && i.name === ironName);
            if (existingIron) {
              existingIron.stack_count = (existingIron.stack_count || existingIron.stackCount || 1) + 1;
              existingIron.stackCount = existingIron.stack_count;
            } else {
              const emptySlot = gameState.backpack.indexOf(null);
              const newIron = {
                id: `iron_${tier}_${Date.now()}`,
                itemId: `mat_iron_ingot_t${tier}`,
                name: ironName,
                itemType: 'Material',
                tier: tier,
                stack_count: 1,
                stackCount: 1,
                max_stack: 999,
                is_bound: false,
                weight: 1.0,
                glyph: '🧱',
                color: '#38bdf8',
                colorHex: '#38bdf8'
              };
              if (emptySlot >= 0) gameState.backpack[emptySlot] = newIron;
              else gameState.backpack.push(newIron);
            }
          }

          gameState.copper = (Number(gameState.copper) || 0) + copperRefund;
          gameState.coins = (Number(gameState.coins) || 0) + coinsRefund;

          audio.playHammer();
          gameStore.setToast(`♻️ 装备【${item.name}】回收成功！获得【${ironName}】x1 + ${coinsRefund}金币 + ${copperRefund}铜钱${isBeijing ? ' (红皇城2.0x特惠)' : ''}！`);
          gameStore.addLog(`♻️ 装备回收: ${item.name} → ${ironName} x1 + ${coinsRefund}金币 + ${copperRefund}铜钱`);
          auditReporter.reportItemGain({ id: `iron_${tier}`, name: ironName }, 1, 'recycle_equipment');
          gameStore.dispatchAction(`recycle_equipment:${item.id || item.itemId || item.name}`, { id: item.id, item_id: item.itemId, name: item.name, tier: tier });
          return;
        }

        // 2. 上架藏宝阁 / 拍卖行
        if (entry.id === 'list' && item) {
          const tier = Number(item.tier) || 1;
          const bid = tier * 2000;
          const fair = tier * 3500;

          // 从背包扣除
          if (Array.isArray(gameState.backpack)) {
            const idx = gameState.backpack.findIndex(i => i && (i.id === item.id || (i.name === item.name && i.itemId === item.itemId)));
            if (idx >= 0) {
              const cur = gameState.backpack[idx];
              if ((cur.stack_count || cur.stackCount || 1) > 1) {
                cur.stack_count = (cur.stack_count || cur.stackCount) - 1;
                cur.stackCount = cur.stack_count;
              } else {
                gameState.backpack[idx] = null;
              }
            }
          }

          // 添加到拍品池
          if (!Array.isArray(gameState.lots)) gameState.lots = [];
          const newLot = {
            id: `lot_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: item.name,
            seller: gameState.account_id || '道友',
            bid: bid,
            fair: fair,
            time: 300,
            color: item.colorHex || item.color || '#38bdf8',
            waiting: false,
            sold: false,
            item: { ...item, stack_count: 1, stackCount: 1 }
          };
          gameState.lots.unshift(newLot);

          audio.playCoin();
          gameStore.setToast(`🏛️ 已将【${item.name}】上架至藏宝阁拍卖大厅！起拍价: ${bid} 铜钱`);
          gameStore.addLog(`🏛️ 藏宝阁上架: ${item.name} (起拍价: ${bid} 铜钱, 估值: ${fair})`);
          auditReporter.reportItemDrop(item, 1, 'auction_list');
          gameStore.dispatchAction(`list_item:${item.id || item.itemId || item.name}`, { id: item.id, item_id: item.itemId, name: item.name, tier: tier });
          return;
        }

        // 3. 熔炼成渣 (玄铁矿渣)
        if (entry.id === 'melt' && item) {
          const tier = Number(item.tier) || 1;
          const slagName = `玄铁矿渣·T${tier}`;
          const copperGain = tier * 50;

          // 从背包扣除
          if (Array.isArray(gameState.backpack)) {
            const idx = gameState.backpack.findIndex(i => i && (i.id === item.id || (i.name === item.name && i.itemId === item.itemId)));
            if (idx >= 0) {
              const cur = gameState.backpack[idx];
              if ((cur.stack_count || cur.stackCount || 1) > 1) {
                cur.stack_count = (cur.stack_count || cur.stackCount) - 1;
                cur.stackCount = cur.stack_count;
              } else {
                gameState.backpack[idx] = null;
              }
            }
            // 产出玄铁矿渣
            const existingSlag = gameState.backpack.find(i => i && i.name === slagName);
            if (existingSlag) {
              existingSlag.stack_count = (existingSlag.stack_count || existingSlag.stackCount || 1) + 1;
              existingSlag.stackCount = existingSlag.stack_count;
            } else {
              const emptySlot = gameState.backpack.indexOf(null);
              const newSlag = {
                id: `slag_${tier}_${Date.now()}`,
                itemId: `mat_slag_t${tier}`,
                name: slagName,
                itemType: 'Material',
                tier: tier,
                stack_count: 1,
                stackCount: 1,
                max_stack: 999,
                is_bound: false,
                weight: 0.5,
                glyph: '🔥',
                color: '#94a3b8',
                colorHex: '#94a3b8'
              };
              if (emptySlot >= 0) gameState.backpack[emptySlot] = newSlag;
              else gameState.backpack.push(newSlag);
            }
          }

          gameState.copper = (Number(gameState.copper) || 0) + copperGain;

          audio.playHammer();
          gameStore.setToast(`🔥 已将【${item.name}】成功熔炼成渣，获得【${slagName}】x1 + ${copperGain} 铜钱！`);
          gameStore.addLog(`🔥 熔炼成渣: ${item.name} → ${slagName} x1 + ${copperGain} 铜钱`);
          auditReporter.reportItemGain({ id: `slag_${tier}`, name: slagName }, 1, 'melt_item');
          gameStore.dispatchAction(`melt_item:${item.id || item.itemId || item.name}`, { id: item.id, item_id: item.itemId, name: item.name, tier: tier });
          return;
        }

        if (entry.id === 'equip' && item?.id != null) {
          gameStore.dispatchAction(`equip_item:${item.id}`);
          return;
        }
        return;
      }
      closeContextMenu();
    }

    const btnW = 72, btnH = 26, btnY = 21, btnGap = 6;
    const navs = gameConfig.navButtons;
    const navTotalW = navs.length * btnW + (navs.length - 1) * btnGap;
    const navStartX = w - 28 - navTotalW;

    for (let i = 0; i < navs.length; i++) {
      const bx = navStartX + i * (btnW + btnGap);
      if (clickX >= bx && clickX <= bx + btnW && clickY >= btnY && clickY <= btnY + btnH) {
        const nav = navs[i];
        if (nav.targetModal === 'map') {
          setActiveTab(nav.tab || 'zone');
          uiState.openModal('map');
        } else {
          uiState.toggleModal(nav.targetModal);
        }
        return;
      }
    }

    for (const id of [...uiState.activeModals].reverse()) {
      const bounds = getModalBounds(id, w, h);
      if (!bounds) continue;
      const { mx, my, mw, mh } = bounds;

      if (clickX >= mx + mw - 32 && clickX <= mx + mw && clickY >= my && clickY <= my + 42) {
        uiState.closeModal(id);
        return;
      }

      // 点击窗口任意位置 → 置顶 (新打开的窗口在最上层)
      if (clickX >= mx && clickX <= mx + mw && clickY >= my && clickY <= my + mh) {
        uiState.bringToFront(id);
      }

      if (id === 'map') {
        handleWorldMapClick(clickX, clickY);
        return;
      }

      if (id === 'quest' && handleQuestClick(clickX, clickY, bounds)) {
        return;
      }

      if (id === 'debug' && handleDebugClick(clickX, clickY, bounds, w, h)) {
        return;
      }

      if (id === 'settings' && handleSettingsClick(clickX, clickY, bounds, w, h)) {
        return;
      }

      if (id === 'trade' && handleTradeClick(clickX, clickY, bounds)) {
        return;
      }

      // 🌟 银行双区滚动条拖拽 (优先于行点击: 左栏中缝=银行, 右栏右缘=背包)
      if (id === 'bank') {
        const side = hitBankScrollbar(clickX, clickY, bounds);
        if (side) {
          e.preventDefault();
          const bar = getBankScrollbarMetrics(side, bounds);
          const onThumb = bar && clickY >= bar.thumbY && clickY <= bar.thumbY + bar.thumbH;
          scrollbarDrag.active = true;
          scrollbarDrag.modalId = 'bank';
          scrollbarDrag.bankSide = side;
          scrollbarDrag.pointerId = e.pointerId;
          scrollbarDrag.grabOffsetY = onThumb ? clickY - bar.thumbY : (bar ? bar.thumbH / 2 : 12);
          if (!onThumb) updateScrollbarDrag(clickY);
          e.currentTarget?.setPointerCapture?.(e.pointerId);
          document.body.style.cursor = 'grabbing';
          return;
        }
      }

      if (id === 'bank' && await handleBankClick(clickX, clickY, bounds, e)) {
        return;
      }

      if (['stash', 'auction', 'logs'].includes(id)) {
        const bar = hitScrollbar(clickX, clickY, id, bounds);
        if (bar) {
          e.preventDefault();
          const onThumb = clickY >= bar.thumbY && clickY <= bar.thumbY + bar.thumbH;
          scrollbarDrag.active = true;
          scrollbarDrag.modalId = id;
          scrollbarDrag.pointerId = e.pointerId;
          scrollbarDrag.grabOffsetY = onThumb ? clickY - bar.thumbY : bar.thumbH / 2;
          if (!onThumb) updateScrollbarDrag(clickY);
          e.currentTarget?.setPointerCapture?.(e.pointerId);
          document.body.style.cursor = 'grabbing';
          return;
        }
      }

      if (id === 'stash') {
        // 🌟 左下角"整理"按钮: 压实空位 + 同名堆叠合并 (唯一自动合并入口, 排序不再参与堆叠合并)
        if (hitTestTidyButton(clickX, clickY, bounds)) {
          tidyBackpack();
          return;
        }
        // 排序开关整合至左下角提示小字: 点击 "排序: xx ▾" 循环切换排序模式 (只重排不合并)
        if (hitTestSortHint(clickX, clickY, bounds)) {
          cycleSortMode();
          return;
        }

        const idx = hitTestStashSlot(clickX, clickY, bounds);
        const items = gameState.backpack || [];
        if (idx >= 0 && items[idx]) {
          const srcItem = items[idx];
          const stackTotal = Number(srcItem.stackCount || srcItem.stack_count || 1);
          // 🌟 拆分拖拽: 按住 Shift 每次拖 1 个; 按住 Ctrl 拖堆叠数量的一半; 无修饰键整堆拖拽
          let dragCount = stackTotal;
          if (e.shiftKey) dragCount = 1;
          else if (e.ctrlKey || e.metaKey) dragCount = Math.max(1, Math.floor(stackTotal / 2));
          stashDrag.active = true;
          stashDrag.fromIndex = idx;
          stashDrag.item = srcItem;
          stashDrag.count = Math.min(dragCount, stackTotal);
          stashDrag.mouseX = clickX;
          stashDrag.mouseY = clickY;
          return;
        }
      }

      if (clickX >= mx && clickX <= mx + mw && clickY >= my && clickY <= my + 44) {
        uiState.draggingModal = id;
        uiState.dragOffset.x = clickX - mx;
        uiState.dragOffset.y = clickY - my;
        return;
      }

      if (clickX >= mx && clickX <= mx + mw && clickY >= my && clickY <= my + mh) {
        return;
      }
    }

    if (handleMinimapClick(clickX, clickY, w, h)) {
      return;
    }

    const dockY = h - 38;
    if (clickY >= dockY) {
      if (clickX >= 16 && clickX <= 136 && clickY >= dockY + 6 && clickY <= dockY + 32) {
        fireKey('KeyT', false, false, 1);
        return;
      }
      if (clickX >= 146 && clickX <= 276 && clickY >= dockY + 6 && clickY <= dockY + 32) {
        fireKey('KeyG', false, false, 1);
        return;
      }
      if (clickX >= 286 && clickX <= 411 && clickY >= dockY + 6 && clickY <= dockY + 32) {
        fireKey('KeyX', false, false, 1);
        return;
      }
    }

    const worldPos = camera.screenToWorld(clickX, clickY, w, h);
    const zone = getCurrentZone();

    if (zone.resources && zone.resources.length > 0) {
      for (const res of zone.resources) {
        if (Math.hypot(worldPos.x - res.x, worldPos.y - res.y) <= 120) {
          handleSpacePress();
          return;
        }
      }
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (scrollbarDrag.active && (scrollbarDrag.pointerId === null || scrollbarDrag.pointerId === e.pointerId)) {
      updateScrollbarDrag(e.clientY);
      resetScrollbarDrag();
      document.body.style.cursor = 'default';
    }

    if (uiState.draggingModal) {
      uiState.draggingModal = null;
    }

    if (stashDrag.active && uiState.isOpen('stash')) {
      const w = window.innerWidth, h = window.innerHeight;
      const bounds = getModalBounds('stash', w, h);
      if (bounds) {
        const { mx, my, mw, mh } = bounds;
        const isOutside = e.clientX < mx || e.clientX > mx + mw || e.clientY < my || e.clientY > my + mh;
        if (isOutside) {
          openDropConfirm(stashDrag.item, stashDrag.fromIndex, stashDrag.count);
        } else {
          if (isStashSortOff()) padBackpackSlots();
          const items = gameState.backpack || [];
          const toIndex = hitTestStashSlot(e.clientX, e.clientY, bounds);
          if (toIndex >= 0 && toIndex !== stashDrag.fromIndex) {
            const dragged = stashDrag.item;
            // 🌟 重新锚定活动引用: 拖拽期间同步 (每 150ms) 会重建背包数组与物品对象,
            //    mousedown 抓的 stashDrag.item 可能已脱离数组, 直接改它源槽不扣减 →
            //    幽灵复制堆 (x30+x1=31) → 下次合并按服务端总量截断 → 视觉上"拆分包自动归位又变回一堆"。
            //    保布局合并保证槽位索引不变, 按 fromIndex 重取活动对象; 源槽已被服务端改写则放弃本次落点。
            const src = items[stashDrag.fromIndex];
            if (src && (!dragged || src.name === dragged.name)) {
              const stackTotal = Number(src.stackCount || src.stack_count || 1);
              const dragCount = Math.min(stashDrag.count || stackTotal, stackTotal);
              if (dragCount < stackTotal) {
                // 🌟 拆分拖拽落点处理 (Shift=1个 / Ctrl=半堆)
                const target = items[toIndex] || null;
                const sameKind = target && (target.name === src.name || (src.itemId && target.itemId === src.itemId))
                  && ((Number(target.subLevel) || 0) === (Number(src.subLevel) || 0));
                if (!target) {
                  // 空槽: 拆出 dragCount 个形成新堆叠, 源槽扣减 (活动对象)
                  const moved = { ...src, id: `split_${src.name}_${Date.now()}_${Math.floor(Math.random() * 1000)}`, stack_count: dragCount, stackCount: dragCount };
                  items[toIndex] = moved;
                  src.stack_count = stackTotal - dragCount;
                  src.stackCount = src.stack_count;
                } else if (sameKind) {
                  // 同类堆叠合并 (尊重 max_stack 上限, 溢出部分留在源槽)
                  const maxStack = Number(target.max_stack || 999);
                  const tgtCount = Number(target.stackCount || target.stack_count || 1);
                  const canMove = Math.min(dragCount, maxStack - tgtCount);
                  if (canMove > 0) {
                    target.stack_count = tgtCount + canMove;
                    target.stackCount = target.stack_count;
                    src.stack_count = stackTotal - canMove;
                    src.stackCount = src.stack_count;
                  }
                }
                // 非同类目标槽: 拆分拖拽不交换, 原路返回 (不做任何操作)
              } else {
                const temp = items[toIndex] || null;
                items[toIndex] = src;
                items[stashDrag.fromIndex] = temp;
              }
            }
          }
        }
      }
      stashDrag.active = false;
      stashDrag.item = null;
      stashDrag.fromIndex = -1;
      stashDrag.count = 0;
    }
  });

  window.addEventListener('pointercancel', () => {
    resetScrollbarDrag();
    document.body.style.cursor = 'default';
  });

  window.addEventListener('keydown', async (e) => {
    if (e.code === 'F5' || e.code === 'F12' || (e.ctrlKey && e.code === 'KeyR') || (e.metaKey && e.code === 'KeyR')) {
      return;
    }
    if (e.ctrlKey || e.metaKey) return;

    // 🌟 商票跑商快捷键：Tab (区域地图) / Shift+Tab (世界地图)
    if (e.code === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + TAB 键：打开“世界地图”，方便玩家查看全局城市分布与远距离路线
        if (uiState.isOpen('map') && activeTab === 'world') {
          uiState.closeModal('map');
        } else {
          setActiveTab('world');
          uiState.openModal('map');
        }
      } else {
        // TAB 键：打开“区域地图”，方便玩家规划当前区域的跑商路线
        if (uiState.isOpen('map') && activeTab === 'zone') {
          uiState.closeModal('map');
        } else {
          setActiveTab('zone');
          uiState.openModal('map');
        }
      }
      return;
    }

    if (dropConfirmState.active) {
      if (e.code === 'Escape') {
        e.preventDefault();
        closeDropConfirm();
        return;
      }
      if (e.code === 'KeyY' || e.code === 'Enter') {
        e.preventDefault();
        executeDropConfirm();
        return;
      }
      return;
    }

    if (e.code === 'F3' || e.code === 'Backquote') { if (isDevMode) { e.preventDefault(); uiState.toggleModal('debug'); } return; }
    if (e.code === 'KeyL') {
      e.preventDefault();
      if (uiState.isOpen('map') && activeTab === 'world') uiState.closeModal('map');
      else { setActiveTab('world'); uiState.openModal('map'); }
      return;
    }
    if (e.code === 'KeyM') {
      e.preventDefault();
      if (uiState.isOpen('map') && activeTab === 'zone') uiState.closeModal('map');
      else { setActiveTab('zone'); uiState.openModal('map'); }
      return;
    }
    if (e.code === 'KeyB') { e.preventDefault(); uiState.toggleModal('stash'); return; }
    if (e.code === 'KeyP') { e.preventDefault(); uiState.toggleModal('auction'); return; }
    if (e.code === 'KeyJ') { e.preventDefault(); uiState.toggleModal('quest'); return; }
    if (e.code === 'KeyN') { e.preventDefault(); uiState.toggleModal('apprentice'); return; }
    if (e.code === 'KeyI') { e.preventDefault(); uiState.toggleModal('logs'); return; }
    if (e.code === 'KeyC') { e.preventDefault(); uiState.toggleModal('body'); return; }
    if (e.code === 'KeyT') { e.preventDefault(); uiState.toggleModal('trade'); return; }
    if (e.code === 'KeyV') { e.preventDefault(); uiState.toggleModal('bank'); return; }

    // 🌟 Shift+K 调试触发跪地 (安全区被击败模拟)
    if (e.code === 'KeyK' && e.shiftKey) {
      e.preventDefault();
      if (!kneelingState.active) {
        kneelingState.trigger();
        console.log('[Debug] 跪地状态已触发 (Shift+K)');
      }
      return;
    }

    // 🌟 Shift+C 调试生成怪物尸体 (模拟击杀怪物)
    if (e.code === 'KeyC' && e.shiftKey) {
      e.preventDefault();
      const tier = Math.floor(Math.random() * 8) + 1;
      const monsterNames = ['山贼小喽啰', '赤焰妖狼', '玄冰巨蟒', '金翅大鹏', '幽冥鬼将', '太古神龙', '荒原野猪', '迷幻妖狐'];
      const name = monsterNames[Math.floor(Math.random() * monsterNames.length)];
      const offsetX = (Math.random() - 0.5) * 200;
      const offsetY = (Math.random() - 0.5) * 200;
      monsterCorpseState.spawn(playerPos.x + offsetX, playerPos.y + offsetY, tier, name);
      console.log(`[Debug] 已生成 T${tier} ${name} 尸体 (Shift+C)`);
      return;
    }

    if (e.code === 'Escape') {
      e.preventDefault();
      if (dropConfirmState.active) { closeDropConfirm(); return; }
      if (hudState.contextMenu) { closeContextMenu(); return; }
      if (uiState.isOpen('settings')) { uiState.closeModal('settings'); return; }
      if (uiState.activeModals.size > 0) {
        uiState.closeModal();
        return;
      }
      // 🌟 ESC 键不再呼出系统设置，系统设置窗口只能靠鼠标点击右上角【系统】按钮打开
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      handleSpacePress();
      return;
    }

    const isMovementKey = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);

    if (!KEY_MAP[e.code] && !isMovementKey) return;
    if (e.repeat) return;

    e.preventDefault();
    if (!heldKeys.has(e.code)) {
      heldKeys.set(e.code, { hitCount: 1, lastFiredTime: performance.now(), shiftKey: e.shiftKey, ctrlKey: e.ctrlKey });
      
      if (!isMovementKey) {
        await fireKey(e.code, e.shiftKey, e.ctrlKey, 1);
      }
      startMainLoop();
    }
  });

  window.addEventListener('keyup', (e) => {
    const isMovementKey = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);
    heldKeys.delete(e.code);

    if (isMovementKey) {
      const hasUp = heldKeys.has('KeyW') || heldKeys.has('ArrowUp');
      const hasDown = heldKeys.has('KeyS') || heldKeys.has('ArrowDown');
      const hasLeft = heldKeys.has('KeyA') || heldKeys.has('ArrowLeft');
      const hasRight = heldKeys.has('KeyD') || heldKeys.has('ArrowRight');

      if (!hasUp && !hasDown) playerPos.vy = 0;
      if (!hasLeft && !hasRight) playerPos.vx = 0;

      if (!hasUp && !hasDown && !hasLeft && !hasRight) {
        gameStore.updatePlayerPosition(playerPos.x, playerPos.y, getCurrentZone().id, { persist: true, syncServer: true });
      }
    }

    if (!heldKeys.size && mainLoopTimer) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
    }
  });

  window.addEventListener('blur', () => {
    heldKeys.clear();
    playerPos.vx = 0;
    playerPos.vy = 0;
    uiState.draggingModal = null;
    resetScrollbarDrag();
    if (mainLoopTimer) {
      clearInterval(mainLoopTimer);
      mainLoopTimer = null;
    }
  });
}

export function isAutoStrikeActive() {
  return false;
}
