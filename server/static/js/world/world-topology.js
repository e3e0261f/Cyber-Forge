// ui/js/world/world-topology.js
/**
 * 🗺️ Albion-Like 非战争版：前端世界拓扑图与数据模型 (90秒规则 & 差异化固定传送门)
 *
 * 核心设计规则：
 * 1. 90秒通行时间基准：MAP_SIZE = 27000, PLAYER_SPEED = 300, 27000 / 300 = 90s
 * 2. 差异化固定传送门：边长 L = 27000, 门坐标固定在 [0.25*L, 0.75*L] = [6750, 20250] 区间内的静态常量
 * 3. 边界对齐与点对点跨图重生 (Edge-to-Edge Portal Rebirth)：
 *    从 A 地图的北门传出，出生在 B 地图的南门边（向内偏移 450px 防自环）；回头走即退回 A 地图。
 * 4. 场景净化与 GM 专属地图隔离：
 *    孤立节点 `zone_gm_test`，脱离世界无向图，所有历史测试背景与铁砧仅在 GM 地图中渲染。
 * 5. 全局地图唯一标识与去同质化布局：
 *    每一个节点均拥有全局唯一 ID、独立地名、特色气候增益、专属障碍物与资源矿点。
 */

export const MAP_SIZE = 27000;
export const PLAYER_SPEED = 300; // px/s -> 27000 / 300 = 90 seconds
export const PORTAL_RADIUS = 320;
export const GATE_BOUNDARY_MIN = 6750; // 25% of 27000
export const GATE_BOUNDARY_MAX = 20250; // 75% of 27000
export const SAFE_PORTAL_OFFSET = 450; // 跨图重生安全内推像素 (防止立即二次触发传送)

export const BIOME_THEMES = {
  capital: { primary: '#ef4444', bg: '#160808', tile1: '#1c0a0a', tile2: '#240e0e', glow: '#f87171' },
  forge: { primary: '#f97316', bg: '#1a0c06', tile1: '#241008', tile2: '#2e140a', glow: '#fb923c' },
  gold: { primary: '#f59e0b', bg: '#161208', tile1: '#221a0a', tile2: '#2c220c', glow: '#fbbf24' },
  water: { primary: '#06b6d4', bg: '#08141a', tile1: '#0a1c24', tile2: '#0d242e', glow: '#22d3ee' },
  forest: { primary: '#10b981', bg: '#08160e', tile1: '#0a2014', tile2: '#0e2a1a', glow: '#34d399' },
  earth: { primary: '#eab308', bg: '#161408', tile1: '#201c0a', tile2: '#2a240c', glow: '#facc15' },
  mist: { primary: '#a855f7', bg: '#12081c', tile1: '#1a0b28', tile2: '#220e34', glow: '#c084fc' },
  mountain: { primary: '#f97316', bg: '#160c08', tile1: '#20100a', tile2: '#2a140c', glow: '#fb923c' },
  desert: { primary: '#eab308', bg: '#161206', tile1: '#221a08', tile2: '#2c220a', glow: '#facc15' },
  snow: { primary: '#38bdf8', bg: '#08121a', tile1: '#0c1a26', tile2: '#102232', glow: '#7dd3fc' },
  marsh: { primary: '#10b981', bg: '#081612', tile1: '#0a201a', tile2: '#0e2a22', glow: '#34d399' },
};

// ==================== 生态资源模板 & 生成器 ====================

// 🌟 资源类型 → 对应采集工具映射
export const RESOURCE_TOOL_MAP = {
  ore:  { toolKey: 'tool_mining_pickaxe',  toolName: '采矿镐' },
  gem:  { toolKey: 'tool_quarry_hammer',   toolName: '采石锤' },
  hide: { toolKey: 'tool_skinning_knife',  toolName: '剥皮刀' },
  herb: { toolKey: 'tool_cotton_knife',    toolName: '棉花刀' },
  wood: { toolKey: 'tool_logging_axe',     toolName: '伐木斧' },
};

// 🌟 子品阶颜色 (1级绿 2级蓝 3级紫 4级金)
export const SUB_LEVEL_COLORS = {
  1: '#22c55e', // 绿色
  2: '#3b82f6', // 蓝色
  3: '#a855f7', // 紫色
  4: '#fbbf24', // 金色
};

// 🌟 开采某资源所需的最低工具品阶
// 规则: T(N) 工具可开采 T1~T(N) 全部子等级 + T(N+1).1
//  => 采 T(X).1 只需 T(X-1) 工具; 采 T(X).2/3/4 需 T(X) 工具
export function minToolTierFor(resTier, resSubLevel = 1) {
  if ((resSubLevel || 1) === 1) return Math.max(1, (resTier || 1) - 1);
  return resTier || 1;
}

// 🌟 判定指定品阶工具能否开采某资源 (考虑子品阶)
export function canToolMine(toolTier, resTier, resSubLevel = 1) {
  if ((toolTier || 0) <= 0) return false;
  return toolTier >= minToolTierFor(resTier, resSubLevel);
}

// ==================== 4 级采集物世界级刷新系统 ====================
// 规则: 每 6 小时刷新一次; 刷新后 2 小时采集锁; 每图不出现相同 4 级采集物;
//       每图 ≤2 个; 相邻三张地图总数 ≤2 (沿每条野外链路滑动窗口)
export const T4_REFRESH_MS = 6 * 3600 * 1000; // 6 小时刷新周期
export const T4_LOCK_MS = 2 * 3600 * 1000;    // 刷新后 2 小时采集锁

// 🌟 获取当前 T4 刷新纪元信息 (确定性: 同一纪元内任何客户端结果一致)
export function getT4Phase(now = Date.now()) {
  const epochIndex = Math.floor(now / T4_REFRESH_MS);
  const epochStart = epochIndex * T4_REFRESH_MS;
  const lockUntil = epochStart + T4_LOCK_MS;
  return { epochIndex, epochStart, lockUntil, locked: now < lockUntil, nextRefreshAt: epochStart + T4_REFRESH_MS };
}

// 🌟 采集锁剩余时间格式化 (如 "1小时05分" / "23分钟")
export function formatT4LockRemain(lockUntil, now = Date.now()) {
  const remain = Math.max(0, lockUntil - now);
  if (remain <= 0) return '';
  const h = Math.floor(remain / 3600000);
  const m = Math.floor((remain % 3600000) / 60000);
  if (h > 0) return `${h}小时${String(m).padStart(2, '0')}分`;
  if (m > 0) return `${m}分钟`;
  return '不足1分钟';
}

// 10 条野外链路前缀 (每条链路 6 张图线性相邻, _1 靠近起始主城, _6 靠近终点主城)
const T4_CHAIN_PREFIXES = [
  'wild_bj_hb', 'wild_bj_sh', 'wild_bj_zj', 'wild_bj_yn', 'wild_bj_qh',
  'wild_hb_sh', 'wild_sh_zj', 'wild_zj_yn', 'wild_yn_qh', 'wild_qh_hb',
];

// 🌟 为一条链路分配各图 4 级采集物数量: 每图 ≤2, 任意相邻 3 图总数 ≤2 (滑动窗口贪心)
function _assignT4Counts(rng) {
  const counts = [];
  for (let i = 0; i < 6; i++) {
    const prev1 = counts[i - 1] || 0;
    const prev2 = counts[i - 2] || 0;
    const budget = Math.max(0, 2 - prev1 - prev2); // 窗口 (i-2, i-1, i) 总数不超 2
    if (budget === 0) { counts.push(0); continue; }
    const r = rng();
    counts.push(r < 0.2 && budget >= 2 ? 2 : r < 0.6 ? 1 : 0);
  }
  return counts;
}

// 🌟 构建一个 4 级采集物节点 (携带采集锁与纪元标记)
function _buildT4Resource(zone, tmpl, tier, phase, slotIdx, rng) {
  const mapW = zone.width || 27000;
  const mapH = zone.height || 27000;
  const x = Math.round(2500 + rng() * (mapW - 5000));
  const y = Math.round(2500 + rng() * (mapH - 5000));
  const toolInfo = RESOURCE_TOOL_MAP[tmpl.type] || RESOURCE_TOOL_MAP.ore;
  return {
    id: `${zone.id}_t4_e${phase.epochIndex}_${slotIdx}`,
    name: tmpl.name,
    tier,
    subLevel: 4,
    subLevelTag: 'Ⅳ',
    type: tmpl.type,
    toolType: toolInfo.toolKey,
    toolName: toolInfo.toolName,
    x,
    y,
    yieldItem: tmpl.yieldItem,
    respawnSecs: 15 + tier * 5,
    icon: tmpl.icon,
    isT4: true,
    lockUntil: phase.lockUntil,
    t4Epoch: phase.epochIndex,
  };
}

let _appliedT4Epoch = -1;

/**
 * 🌟 世界级 4 级采集物分配 (幂等: 同一纪元内重复调用无副作用)
 * 每 6 小时纪元切换时清除旧 4 级采集物并按新种子重新投放, 刷新后 2 小时采集锁生效。
 * @returns {boolean} 本次调用是否发生了刷新换批
 */
export function applyT4Resources(now = Date.now()) {
  const phase = getT4Phase(now);
  if (_appliedT4Epoch === phase.epochIndex) return false;
  _appliedT4Epoch = phase.epochIndex;

  for (const prefix of T4_CHAIN_PREFIXES) {
    const countRng = _seededRandom(_hashStr(`${prefix}_t4cnt_e${phase.epochIndex}`));
    const counts = _assignT4Counts(countRng);
    for (let i = 1; i <= 6; i++) {
      const zone = WORLD_ZONES[`${prefix}_${i}`];
      if (!zone || !Array.isArray(zone.resources)) continue;
      // 清除上一纪元/旧随机产生的 4 级采集物 (本图不重复出现)
      zone.resources = zone.resources.filter((r) => (r.subLevel || 1) !== 4);
      const k = counts[i - 1];
      if (k <= 0) continue;
      const rng = _seededRandom(_hashStr(`${zone.id}_t4res_e${phase.epochIndex}`));
      const templates = BIOME_RESOURCE_TEMPLATES[zone.biome] || BIOME_RESOURCE_TEMPLATES.capital;
      // 打乱模板后取前 k 个 => 同图内 4 级采集物名称互不相同 (不出现相同采集物)
      const shuffled = [...templates];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const m = Math.floor(rng() * (j + 1));
        [shuffled[j], shuffled[m]] = [shuffled[m], shuffled[j]];
      }
      const picked = shuffled.slice(0, Math.min(k, shuffled.length));
      picked.forEach((tmpl, slotIdx) => {
        // 品阶加权随机 (T1-T8)
        let tierRoll = rng() * 100;
        let tier = 1;
        let cumW = 0;
        for (const td of TIER_DISTRIBUTION) {
          cumW += td.weight;
          if (tierRoll <= cumW) { tier = td.tier; break; }
        }
        zone.resources.push(_buildT4Resource(zone, tmpl, tier, phase, slotIdx, rng));
      });
    }
  }
  return true;
}

// 🌟 每帧/每 tick 调用的轻量检查: 纪元切换时自动换批 (开销仅为一次整除比较)
export function checkT4Refresh(now = Date.now()) {
  return applyT4Resources(now);
}

// 子品阶权重分布 (1级最多, 4级最稀有)
const SUB_LEVEL_WEIGHTS = [
  { level: 1, weight: 40 },
  { level: 2, weight: 30 },
  { level: 3, weight: 20 },
  { level: 4, weight: 10 },
];
// 🌟 常规随机仅产出 1-3 级子品阶 (4 级由世界级 T4 刷新系统 applyT4Resources 统一管控)
const SUB_LEVEL_WEIGHTS_1_3 = SUB_LEVEL_WEIGHTS.filter((sw) => sw.level <= 3); // 总权重 90

const BIOME_RESOURCE_TEMPLATES = {
  mountain: [
    { name: '铁矿脉', type: 'ore', icon: '⛏️', yieldItem: '铁矿石', weight: 35 },
    { name: '花岗岩', type: 'ore', icon: '🪨', yieldItem: '花岗岩', weight: 30 },
    { name: '玄钢矿', type: 'ore', icon: '⛏️', yieldItem: '玄钢', weight: 18 },
    { name: '铜矿脉', type: 'ore', icon: '⛏️', yieldItem: '铜矿石', weight: 12 },
    { name: '银矿脉', type: 'ore', icon: '💎', yieldItem: '银矿石', weight: 5 },
  ],
  marsh: [
    { name: '灵蕈丛', type: 'herb', icon: '🍄', yieldItem: '灵蕈', weight: 30 },
    { name: '沼泽古木', type: 'wood', icon: '🌲', yieldItem: '沼泽木材', weight: 30 },
    { name: '灵棉草', type: 'herb', icon: '🌿', yieldItem: '灵棉', weight: 25 },
    { name: '毒蟾草', type: 'herb', icon: '🌿', yieldItem: '毒蟾草', weight: 15 },
  ],
  desert: [
    { name: '风化岩', type: 'ore', icon: '🪨', yieldItem: '风化石材', weight: 28 },
    { name: '沙金矿', type: 'ore', icon: '💰', yieldItem: '沙金', weight: 24 },
    { name: '胡杨木', type: 'wood', icon: '🌲', yieldItem: '胡杨木', weight: 23 },
    { name: '晶石矿脉', type: 'gem', icon: '💎', yieldItem: '晶石', weight: 15 },
    { name: '铁矿脉', type: 'ore', icon: '⛏️', yieldItem: '铁矿石', weight: 10 },
  ],
  forest: [
    { name: '灵木林', type: 'wood', icon: '🌲', yieldItem: '灵木', weight: 35 },
    { name: '灵草圃', type: 'herb', icon: '🌿', yieldItem: '灵草', weight: 30 },
    { name: '古树林', type: 'wood', icon: '🌳', yieldItem: '古木', weight: 20 },
    { name: '仙芝丛', type: 'herb', icon: '🍄', yieldItem: '仙芝', weight: 15 },
  ],
  earth: [
    { name: '厚土矿脉', type: 'ore', icon: '⛏️', yieldItem: '厚土矿石', weight: 30 },
    { name: '盐晶矿', type: 'gem', icon: '💎', yieldItem: '盐晶', weight: 25 },
    { name: '黄土岩', type: 'ore', icon: '🪨', yieldItem: '黄土岩', weight: 28 },
    { name: '天青晶矿', type: 'gem', icon: '💎', yieldItem: '天青晶', weight: 12 },
    { name: '灵髓石', type: 'gem', icon: '💎', yieldItem: '灵髓石', weight: 5 },
  ],
  water: [
    { name: '水草', type: 'herb', icon: '🌿', yieldItem: '水草', weight: 30 },
    { name: '河畔柳木', type: 'wood', icon: '🌲', yieldItem: '柳木', weight: 28 },
    { name: '河卵石', type: 'ore', icon: '🪨', yieldItem: '河卵石', weight: 22 },
    { name: '珍珠蚌', type: 'gem', icon: '💎', yieldItem: '珍珠', weight: 12 },
    { name: '玄玉水脉', type: 'essence', icon: '💧', yieldItem: '玄玉水', weight: 8 },
  ],
  snow: [
    { name: '冰晶矿', type: 'gem', icon: '💎', yieldItem: '冰晶', weight: 25 },
    { name: '雪松木', type: 'wood', icon: '🌲', yieldItem: '雪松木', weight: 30 },
    { name: '寒铁矿', type: 'ore', icon: '⛏️', yieldItem: '寒铁', weight: 28 },
    { name: '冰魄石', type: 'gem', icon: '💎', yieldItem: '冰魄石', weight: 12 },
    { name: '万年玄冰', type: 'ore', icon: '🪨', yieldItem: '万年玄冰', weight: 5 },
  ],
  mist: [
    { name: '迷雾矿脉', type: 'ore', icon: '⛏️', yieldItem: '迷雾矿石', weight: 22 },
    { name: '虚空晶', type: 'gem', icon: '💎', yieldItem: '虚空晶', weight: 18 },
    { name: '迷雾古木', type: 'wood', icon: '🌲', yieldItem: '迷雾木', weight: 22 },
    { name: '灵 essence 泉', type: 'essence', icon: '💧', yieldItem: '灵 essence', weight: 16 },
    { name: '迷幻菇', type: 'herb', icon: '🍄', yieldItem: '迷幻菇', weight: 14 },
    { name: '太虚星铁', type: 'ore', icon: '⛏️', yieldItem: '太虚星铁', weight: 8 },
  ],
  capital: [
    { name: '龙脉石', type: 'ore', icon: '🪨', yieldItem: '龙脉石', weight: 30 },
    { name: '灵桐木', type: 'wood', icon: '🌲', yieldItem: '灵桐木', weight: 30 },
    { name: '皇极矿脉', type: 'ore', icon: '⛏️', yieldItem: '皇极矿石', weight: 25 },
    { name: '灵草圃', type: 'herb', icon: '🌿', yieldItem: '灵草', weight: 15 },
  ],
  forge: [
    { name: '地火矿晶', type: 'ore', icon: '🔥', yieldItem: '地火矿晶', weight: 35 },
    { name: '赤火精金', type: 'ore', icon: '⛏️', yieldItem: '赤火精金', weight: 30 },
    { name: '熔岩石', type: 'ore', icon: '🪨', yieldItem: '熔岩石', weight: 28 },
    { name: '玄钢矿', type: 'ore', icon: '⛏️', yieldItem: '玄钢', weight: 7 },
  ],
  gold: [
    { name: '金矿脉', type: 'ore', icon: '💰', yieldItem: '金矿石', weight: 28 },
    { name: '秘银矿', type: 'gem', icon: '💎', yieldItem: '秘银', weight: 22 },
    { name: '灵石矿', type: 'ore', icon: '⛏️', yieldItem: '灵石', weight: 27 },
    { name: '商船残木', type: 'wood', icon: '🌲', yieldItem: '商船木', weight: 15 },
    { name: '深海蚌珠', type: 'gem', icon: '💎', yieldItem: '深海蚌珠', weight: 8 },
  ],
};

// 🌟 采集物基础名目录 (全部 biome 模板 yieldItem + 旧版服务端硬编码产出名):
//    命中且名字不带 ·T品阶.子品阶 后缀的物品视为旧命名采集物, 需迁移为新命名。
export const GATHER_BASE_NAMES = new Set([
  ...Object.values(BIOME_RESOURCE_TEMPLATES).flat().map((t) => t.yieldItem),
  '凡铁精矿', '百草灵芝', '金丝楠木', '昆仑原石', '太乙兽皮',
]);

/** 🌟 旧采集物命名归一化: 无品阶后缀的采集物 (如 "花岗岩") 迁移为 "花岗岩·T{tier}.{sub}"。
 *  子品阶旧账本未持久化, 统一归 1; 非采集物/已带后缀的物品原样返回 (幂等)。 */
export function normalizeGatherItemNames(item) {
  if (!item || !item.name) return item;
  if (item.name.includes('·T') || !GATHER_BASE_NAMES.has(item.name)) return item;
  const tier = Number(item.tier) || 1;
  const sub = Number(item.subLevel) || 1;
  const newName = `${item.name}·T${tier}.${sub}`;
  const migrated = { ...item, name: newName };
  // itemId/item_id 与旧名绑定的同步更新, 保持身份字段与名字一致 (同名即同物)
  if (migrated.itemId === item.name) migrated.itemId = newName;
  if (migrated.item_id === item.name) migrated.item_id = newName;
  return migrated;
}

/** 🌟 从新命名后缀推导子品阶: "名字·T品.子品" → 子品阶数字, 无后缀返回 0 */
export function subLevelFromName(name) {
  const m = typeof name === 'string' && name.match(/·T\d+\.(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** 🌟 服务端 GameItem 无 subLevel/isGatherMat 字段, 同步回传后从名字后缀推导补齐,
 *  否则采集乐观入包按子品阶找堆失败 → 反复新开 mat_ 堆 → 同步又丢弃 → 背包震荡。
 *  幂等: 已带字段或无后缀物品原样返回。 */
export function deriveGatherFields(item) {
  if (!item || !item.name) return item;
  const sub = subLevelFromName(item.name);
  if (!sub) return item;
  if (item.subLevel === sub && item.isGatherMat) return item;
  const fixed = { ...item };
  if (!fixed.subLevel) fixed.subLevel = sub;
  if (!fixed.isGatherMat) fixed.isGatherMat = true;
  return fixed;
}

// 确定性伪随机数生成器 (seeded PRNG)
function _seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function _hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// 按权重随机选取模板
function _pickWeighted(templates, rng) {
  const total = templates.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of templates) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return templates[templates.length - 1];
}

// 品阶分布: 等级越高越稀有
const TIER_DISTRIBUTION = [
  { tier: 1, weight: 25 },
  { tier: 2, weight: 22 },
  { tier: 3, weight: 18 },
  { tier: 4, weight: 14 },
  { tier: 5, weight: 10 },
  { tier: 6, weight: 6 },
  { tier: 7, weight: 3 },
  { tier: 8, weight: 2 },
];

/**
 * 🌟 按 biome 生成最多 maxCount 个采集资源，离散分布于地图各处
 * 每张地图不超过 100 个，T1-T8 品阶按权重分布
 */
function biomeGenerateResources(zoneId, biome, mapW, mapH, maxCount = 100) {
  const templates = BIOME_RESOURCE_TEMPLATES[biome] || BIOME_RESOURCE_TEMPLATES.capital;
  const rng = _seededRandom(_hashStr(zoneId + '_resources_v2'));
  const resources = [];

  // 网格离散分布: 10x10 网格，每格最多 1 个资源
  const gridCols = 10;
  const gridRows = 10;
  const cellW = (mapW - 2000) / gridCols;
  const cellH = (mapH - 2000) / gridRows;
  const margin = 1000;

  // 生成所有网格位置并随机打乱
  const cells = [];
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      cells.push({ r, c });
    }
  }
  // Fisher-Yates shuffle
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  for (let idx = 0; idx < Math.min(maxCount, cells.length); idx++) {
    const cell = cells[idx];
    const x = Math.round(margin + cell.c * cellW + rng() * (cellW - 200) + 100);
    const y = Math.round(margin + cell.r * cellH + rng() * (cellH - 200) + 100);

    // 品阶加权随机
    let tierRoll = rng() * 100;
    let tier = 1;
    let cumW = 0;
    for (const td of TIER_DISTRIBUTION) {
      cumW += td.weight;
      if (tierRoll <= cumW) { tier = td.tier; break; }
    }

    const tmpl = _pickWeighted(templates, rng);
    const resId = `${zoneId}_res_${idx}`;

    // 🌟 子品阶加权随机 (仅 1-3 级; 4 级采集物由世界级 T4 刷新系统统一投放)
    let subRoll = rng() * 90;
    let subLevel = 1;
    let subCumW = 0;
    for (const sw of SUB_LEVEL_WEIGHTS_1_3) {
      subCumW += sw.weight;
      if (subRoll <= subCumW) { subLevel = sw.level; break; }
    }

    // 🌟 工具类型映射
    const toolInfo = RESOURCE_TOOL_MAP[tmpl.type] || RESOURCE_TOOL_MAP.ore;

    const tierSuffix = tier >= 5 ? `·T${tier}` : '';
    const subLevelTag = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][subLevel - 1] || 'Ⅰ';

    resources.push({
      id: resId,
      name: `${tmpl.name}${tierSuffix}`,
      tier,
      subLevel,
      subLevelTag,
      type: tmpl.type,
      toolType: toolInfo.toolKey,
      toolName: toolInfo.toolName,
      x: Math.max(500, Math.min(mapW - 500, x)),
      y: Math.max(500, Math.min(mapH - 500, y)),
      yieldItem: tmpl.yieldItem,
      respawnSecs: 15 + tier * 5,
      icon: tmpl.icon,
    });
  }

  return resources;
}

// ==================== 安全区后处理 ====================
function processSafeZones() {
  for (const [key, zone] of Object.entries(WORLD_ZONES)) {
    if (zone.isCity) {
      zone.safeZone = true;
      zone.resources = []; // 主城无采集物
      zone.safeZoneTint = 'rgba(59, 130, 246, 0.06)'; // 蓝色安全区光晕
    }
  }
}

export const WORLD_ZONES = {
  // ==================== 1. 中央红皇城 (北京) ====================
  beijing: {
    id: 'beijing',
    name: '北京 · 红皇城',
    alias: '天道帝都',
    isCity: true,
    cityId: 'beijing',
    biome: 'capital',
    weather: '风沙',
    weatherBuff: '天道罡风淬火：锻造暴击率 +10%',
    graphX: 0,
    graphY: 0,
    color: '#ef4444',
    bgColor: '#160808',
    desc: '九州世界的绝对中心，四方通衢，帝京皇极天工营总舵，高价回收天下神兵与熔铁。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [
      { dir: 'north', x: 8100, y: 500, targetZoneId: 'wild_bj_hb_1', targetDir: 'south', name: '北直门 ➔ 太行官道·幽燕关隘', color: '#f97316' },
      { dir: 'east', x: 26500, y: 17550, targetZoneId: 'wild_bj_sh_1', targetDir: 'west', name: '东华门 ➔ 京沪漕运·通州泊口', color: '#f59e0b' },
      { dir: 'south', x: 18900, y: 26500, targetZoneId: 'wild_bj_yn_1', targetDir: 'north', name: '南薰门 ➔ 蜀道滇南·秦岭古栈', color: '#10b981' },
      { dir: 'west', x: 500, y: 10800, targetZoneId: 'wild_bj_qh_1', targetDir: 'east', name: '西便门 ➔ 丝路陇右·居庸天堑', color: '#a855f7' },
    ],
    resources: [],
    obstacles: [
      { id: 'bj_palace_l', name: '皇城左天工阁', minX: 4500, maxX: 7500, minY: 4500, maxY: 15500 },
      { id: 'bj_palace_r', name: '皇城右太清殿', minX: 19500, maxX: 22500, minY: 4500, maxY: 15500 },
    ],
  },

  // ==================== 2. 河北 · 丙火城 (北门主城) ====================
  hebei: {
    id: 'hebei',
    name: '河北 · 丙火城',
    alias: '百炼铁都',
    isCity: true,
    cityId: 'hebei',
    biome: 'forge',
    weather: '烈阳',
    weatherBuff: '地脉真火：熔炼铁渣产出 +10%',
    graphX: 0,
    graphY: -7,
    color: '#f97316',
    bgColor: '#1a0c06',
    desc: '燕赵地火奔涌，天下炼器名匠百炼之源，盛产赤火精金与太行玄钢。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [
      { dir: 'south', x: 9450, y: 26500, targetZoneId: 'wild_bj_hb_6', targetDir: 'north', name: '南烽门 ➔ 太行官道·邢襄平野', color: '#ef4444' },
      { dir: 'east', x: 26500, y: 14850, targetZoneId: 'wild_hb_sh_1', targetDir: 'west', name: '东冶门 ➔ 渤海通途·山海雄关', color: '#f59e0b' },
      { dir: 'west', x: 500, y: 12150, targetZoneId: 'wild_qh_hb_6', targetDir: 'east', name: '西陉门 ➔ 黄土陇东·五台圣境', color: '#eab308' },
    ],
    resources: [],
    obstacles: [
      { id: 'hb_lava_1', name: '九幽地火熔岩池', minX: 4500, maxX: 8500, minY: 4500, maxY: 11000 },
      { id: 'hb_lava_2', name: '丙火淬炼重鼎', minX: 18500, maxX: 22500, minY: 16000, maxY: 22500 },
    ],
  },

  // ==================== 3. 上海 · 庚金城 (东门主城) ====================
  shanghai: {
    id: 'shanghai',
    name: '上海 · 庚金城',
    alias: '万国商埠',
    isCity: true,
    cityId: 'shanghai',
    biome: 'gold',
    weather: '商晴',
    weatherBuff: '万商云集：交易手续费 -5%',
    graphX: 7,
    graphY: 0,
    color: '#f59e0b',
    bgColor: '#161208',
    desc: '东海之滨，通商枢纽。天下各大钱庄与大宗拍卖行总舵设于此，商贸极其繁荣。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [
      { dir: 'west', x: 500, y: 18900, targetZoneId: 'wild_bj_sh_6', targetDir: 'east', name: '申西门 ➔ 京沪漕运·吴淞商港', color: '#ef4444' },
      { dir: 'north', x: 12150, y: 500, targetZoneId: 'wild_hb_sh_6', targetDir: 'south', name: '长江门 ➔ 渤海通途·崇明外泽', color: '#f97316' },
      { dir: 'south', x: 17550, y: 26500, targetZoneId: 'wild_sh_zj_1', targetDir: 'north', name: '沪杭门 ➔ 钱塘水陆·松江古渡', color: '#06b6d4' },
    ],
    resources: [],
    obstacles: [
      { id: 'sh_dock', name: '万国商港泊位', minX: 4500, maxX: 7500, minY: 6000, maxY: 21000 },
      { id: 'sh_vault', name: '万宝仙石金库', minX: 19500, maxX: 22500, minY: 6000, maxY: 21000 },
    ],
  },

  // ==================== 4. 浙江 · 癸水城 (东南主城) ====================
  zhejiang: {
    id: 'zhejiang',
    name: '浙江 · 癸水城',
    alias: '灵秀工坊',
    isCity: true,
    cityId: 'zhejiang',
    biome: 'water',
    weather: '微澜',
    weatherBuff: '水法灵韵：学徒打铁效率 +15%',
    graphX: 5,
    graphY: 5,
    color: '#06b6d4',
    bgColor: '#08141a',
    desc: '江南水乡灵泉遍布，学徒工坊云集，以龙泉剑淬火与水法冶炼闻名天下。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [
      { dir: 'north', x: 10800, y: 500, targetZoneId: 'wild_sh_zj_6', targetDir: 'south', name: '武林门 ➔ 钱塘水陆·诸暨剑潭', color: '#f59e0b' },
      { dir: 'west', x: 500, y: 16200, targetZoneId: 'wild_zj_yn_1', targetDir: 'east', name: '钱清门 ➔ 百越灵岭·仙霞古道', color: '#10b981' },
      { dir: 'northwest', x: 8100, y: 500, targetZoneId: 'wild_bj_zj_6', targetDir: 'south', name: '运河门 ➔ 大运河津·拱宸古桥', color: '#ef4444' },
    ],
    resources: [],
    obstacles: [
      { id: 'zj_canal_1', name: '西子灵水千波池', minX: 4500, maxX: 8500, minY: 4500, maxY: 12000 },
      { id: 'zj_canal_2', name: '龙泉千锤水碓工坊', minX: 18500, maxX: 22500, minY: 15000, maxY: 22500 },
    ],
  },

  // ==================== 5. 云南 · 乙木城 (西南主城) ====================
  yunnan: {
    id: 'yunnan',
    name: '云南 · 乙木城',
    alias: '灵蕈林都',
    isCity: true,
    cityId: 'yunnan',
    biome: 'forest',
    weather: '多雨',
    weatherBuff: '青木灵气：全境采集效率 +15%',
    graphX: -5,
    graphY: 5,
    color: '#10b981',
    bgColor: '#08160e',
    desc: '十万大山古木参天，仙灵草药与奇蕈遍地，盛产千年灵木与七彩迷幻菇。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [
      { dir: 'north', x: 16200, y: 500, targetZoneId: 'wild_bj_yn_6', targetDir: 'south', name: '金马门 ➔ 蜀道滇南·苍山古林', color: '#ef4444' },
      { dir: 'east', x: 26500, y: 12150, targetZoneId: 'wild_zj_yn_6', targetDir: 'west', name: '碧鸡门 ➔ 百越灵岭·罗霄绝顶', color: '#06b6d4' },
      { dir: 'northwest', x: 500, y: 9450, targetZoneId: 'wild_yn_qh_1', targetDir: 'southeast', name: '苍山门 ➔ 茶马雪山·玉龙雪峰', color: '#eab308' },
    ],
    resources: [],
    obstacles: [
      { id: 'yn_swamp_1', name: '十万大山神木根系', minX: 4500, maxX: 8500, minY: 16000, maxY: 22500 },
      { id: 'yn_swamp_2', name: '迷幻万毒灵沼', minX: 18500, maxX: 22500, minY: 4500, maxY: 11000 },
    ],
  },

  // ==================== 6. 青海 · 坤土城 (西门主城) ====================
  qinghai: {
    id: 'qinghai',
    name: '青海 · 坤土城',
    alias: '西域坤灵',
    isCity: true,
    cityId: 'qinghai',
    biome: 'earth',
    weather: '晴雪',
    weatherBuff: '极西厚土：神兵坚韧度 +15%',
    graphX: -7,
    graphY: 0,
    color: '#eab308',
    bgColor: '#161408',
    desc: '极西荒原高原圣境，天高地阔，盛产极品大地母石与天山冰晶。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [
      { dir: 'east', x: 26500, y: 16200, targetZoneId: 'wild_bj_qh_6', targetDir: 'west', name: '湟水门 ➔ 丝路陇右·倒淌河畔', color: '#ef4444' },
      { dir: 'south', x: 13500, y: 26500, targetZoneId: 'wild_yn_qh_6', targetDir: 'north', name: '唐蕃门 ➔ 茶马雪山·巴颜喀拉', color: '#10b981' },
      { dir: 'north', x: 8100, y: 500, targetZoneId: 'wild_qh_hb_1', targetDir: 'south', name: '祁连门 ➔ 黄土陇东·祁连雪积', color: '#f97316' },
    ],
    resources: [],
    obstacles: [
      { id: 'qh_salt_1', name: '万丈察尔汗青盐幻海', minX: 4500, maxX: 8500, minY: 15000, maxY: 22500 },
      { id: 'qh_salt_2', name: '极西昆仑天晶矿障', minX: 18500, maxX: 22500, minY: 4500, maxY: 12000 },
    ],
  },

  // ==================== 7. 天空之城 (Albion 迷雾浮空岛) ====================
  sky_city: {
    id: 'sky_city',
    name: '天空之城 · 太虚迷境',
    alias: 'Albion 迷雾秘境',
    isCity: true,
    cityId: 'sky_city',
    biome: 'mist',
    weather: '极光',
    weatherBuff: '太虚神韵：造物神兵高阶概率 +35%',
    graphX: 0,
    graphY: 0,
    color: '#a855f7',
    bgColor: '#12081c',
    desc: '悬浮于九天之上的太虚神境，受百枚仙玉结界封印，内藏无尽造化机缘。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [
      { dir: 'south', x: 13500, y: 26500, targetZoneId: 'beijing', targetDir: 'north', name: '太虚星门 ➔ 返回北京', color: '#ef4444' },
      { dir: 'east', x: 26500, y: 13500, targetZoneId: 'shanghai', targetDir: 'west', name: '星穹通途 ➔ 降落上海', color: '#f59e0b' },
      { dir: 'west', x: 500, y: 13500, targetZoneId: 'qinghai', targetDir: 'east', name: '太古玄界 ➔ 降落青海', color: '#eab308' },
    ],
    resources: [],
    obstacles: [
      { id: 'sky_void_1', name: '太虚空间裂隙', minX: 4500, maxX: 7500, minY: 4500, maxY: 22500 },
      { id: 'sky_void_2', name: '混沌星核残骸', minX: 19500, maxX: 22500, minY: 4500, maxY: 22500 },
    ],
  },

  // ==================== 8. 场景净化：GM 开发者专属隔离空间 ====================
  zone_gm_test: {
    id: 'zone_gm_test',
    name: 'GM 开发者空间 · 虚空试验场',
    alias: 'DIMENSION_OUT_OF_BOUNDS',
    isCity: false,
    biome: 'mist',
    weather: '混沌',
    weatherBuff: '天道试验场：全系统最高权限调试中 (铁砧实体与测试贴图专区)',
    graphX: 999,
    graphY: 999,
    color: '#ec4899',
    bgColor: '#140614',
    desc: '绝对隔离的 GM 开发者维度外空间。没有任何边界传送门连接世界网络，保留所有开发测试素材。',
    spawnX: 13500,
    spawnY: 13500,
    gates: [],
    resources: [
      { id: 'gm_test_ore', name: '无限天道法则水晶', tier: 9, type: 'gem', x: 10000, y: 10000, yieldItem: '天道法则碎屑', respawnSecs: 5 },
      { id: 'gm_test_tree', name: '混沌开天神树', tier: 9, type: 'wood', x: 17000, y: 17000, yieldItem: '开天神木', respawnSecs: 5 },
    ],
    obstacles: [
      { id: 'gm_barrier_1', name: 'GM 调试隔离光幕·左', minX: 4500, maxX: 6500, minY: 4500, maxY: 22500 },
      { id: 'gm_barrier_2', name: 'GM 调试隔离光幕·右', minX: 20500, maxX: 22500, minY: 4500, maxY: 22500 },
    ],
  },
};

function createWildernessChain(prefix, baseName, stationNames, startCityId, endCityId, startDir, endDir, biome, weather, buff, startGraphPos, endGraphPos, baseColor) {
  const count = 6;
  const intermediateOffsets = [8100, 16200, 10800, 18900, 9450, 17550, 13500];

  const startCity = WORLD_ZONES[startCityId];
  const startGate = (startCity?.gates || []).find((g) => g.targetZoneId === `${prefix}_1`);
  const startCoord = (startDir === 'north' || startDir === 'south') ? (startGate?.x ?? 8100) : (startGate?.y ?? 8100);

  const endCity = WORLD_ZONES[endCityId];
  const endGate = (endCity?.gates || []).find((g) => g.targetZoneId === `${prefix}_${count}`);
  const endCoord = (endDir === 'north' || endDir === 'south') ? (endGate?.x ?? 9450) : (endGate?.y ?? 9450);

  const borderOffsets = [
    startCoord,
    intermediateOffsets[1],
    intermediateOffsets[2],
    intermediateOffsets[3],
    intermediateOffsets[4],
    intermediateOffsets[5],
    endCoord,
  ];

  for (let i = 1; i <= count; i++) {
    const zoneId = `${prefix}_${i}`;
    const prevZoneId = i === 1 ? startCityId : `${prefix}_${i - 1}`;
    const nextZoneId = i === count ? endCityId : `${prefix}_${i + 1}`;

    const t = i / (count + 1);
    const gx = startGraphPos[0] + (endGraphPos[0] - startGraphPos[0]) * t;
    const gy = startGraphPos[1] + (endGraphPos[1] - startGraphPos[1]) * t;

    const entryOffset = borderOffsets[i - 1];
    const exitOffset = borderOffsets[i];

    const prevZoneName = i === 1 ? (WORLD_ZONES[startCityId] ? WORLD_ZONES[startCityId].name.split(' ')[0] : '出发地') : stationNames[i - 2];
    const nextZoneName = i === count ? (WORLD_ZONES[endCityId] ? WORLD_ZONES[endCityId].name.split(' ')[0] : '目的地') : stationNames[i];

    const gates = [];

    if (startDir === 'north') {
      gates.push({ dir: 'south', x: entryOffset, y: 26500, targetZoneId: prevZoneId, targetDir: 'north', name: `南口 ➔ ${prevZoneName}` });
      gates.push({ dir: 'north', x: exitOffset, y: 500, targetZoneId: nextZoneId, targetDir: 'south', name: `北口 ➔ ${nextZoneName}` });
    } else if (startDir === 'south') {
      gates.push({ dir: 'north', x: entryOffset, y: 500, targetZoneId: prevZoneId, targetDir: 'south', name: `北口 ➔ ${prevZoneName}` });
      gates.push({ dir: 'south', x: exitOffset, y: 26500, targetZoneId: nextZoneId, targetDir: 'north', name: `南口 ➔ ${nextZoneName}` });
    } else if (startDir === 'east') {
      gates.push({ dir: 'west', x: 500, y: entryOffset, targetZoneId: prevZoneId, targetDir: 'east', name: `西口 ➔ ${prevZoneName}` });
      gates.push({ dir: 'east', x: 26500, y: exitOffset, targetZoneId: nextZoneId, targetDir: 'west', name: `东口 ➔ ${nextZoneName}` });
    } else {
      gates.push({ dir: 'east', x: 26500, y: entryOffset, targetZoneId: prevZoneId, targetDir: 'west', name: `东口 ➔ ${prevZoneName}` });
      gates.push({ dir: 'west', x: 500, y: exitOffset, targetZoneId: nextZoneId, targetDir: 'east', name: `西口 ➔ ${nextZoneName}` });
    }

    const sName = stationNames[i - 1] || `${baseName}·第${i}驿`;
    const obsOffset = (i * 3100) % 5000;
    const obstacles = [
      {
        id: `${zoneId}_obs1`,
        name: `${sName} · 古道石林`,
        minX: 5500 + obsOffset,
        maxX: 8500 + obsOffset,
        minY: 6000 + ((i * 2700) % 6000),
        maxY: 12000 + ((i * 2700) % 6000),
      },
      {
        id: `${zoneId}_obs2`,
        name: `${sName} · 灵气断壑`,
        minX: 18500 - obsOffset,
        maxX: 21500 - obsOffset,
        minY: 15000 - ((i * 1900) % 5000),
        maxY: 21000 - ((i * 1900) % 5000),
      },
    ];

    WORLD_ZONES[zoneId] = {
      id: zoneId,
      name: `${baseName} · ${sName}`,
      alias: `野外要道 ${i}/6`,
      isCity: false,
      biome,
      weather,
      weatherBuff: buff,
      graphX: Math.round(gx * 10) / 10,
      graphY: Math.round(gy * 10) / 10,
      color: baseColor,
      bgColor: '#060d14',
      desc: `广袤无垠的【${sName}】，横贯两地之咽喉。步行横跨需整整 90 秒，沿途蕴含丰富天地灵矿。`,
      spawnX: 13500,
      spawnY: 13500,
      gates,
      obstacles,
      resources: biomeGenerateResources(zoneId, biome, 27000, 27000, 100),
    };
  }
}

// 1. 北京 ➔ 河北 (太行官道)
createWildernessChain('wild_bj_hb', '太行官道', ['幽燕关隘', '飞狐绝径', '井陉天险', '娘子雄关', '滏口古陉', '邢襄平野'], 'beijing', 'hebei', 'north', 'south', 'mountain', '烈阳', '炉温暴涨：熔炼速度 +10%', [0, 0], [0, -7], '#f97316');

// 2. 北京 ➔ 上海 (京沪漕运)
createWildernessChain('wild_bj_sh', '京沪漕运', ['通州泊口', '沧浪清波', '德州古渡', '淮安重津', '扬子古津', '吴淞商港'], 'beijing', 'shanghai', 'east', 'west', 'water', '商晴', '通商顺畅：金币产出 +8%', [0, 0], [7, 0], '#f59e0b');

// 3. 北京 ➔ 浙江 (大运河津)
createWildernessChain('wild_bj_zj', '大运河津', ['张家湾津', '临清古埠', '微山浩渺', '宿迁水驿', '姑苏水巷', '拱宸古桥'], 'beijing', 'zhejiang', 'south', 'north', 'water', '微澜', '学徒顿悟率 +10%', [0, 0], [5, 5], '#06b6d4');

// 4. 北京 ➔ 云南 (蜀道滇南)
createWildernessChain('wild_bj_yn', '蜀道滇南', ['秦岭古栈', '剑门绝壁', '锦官林海', '乌蒙巨壑', '洱海灵沼', '苍山古林'], 'beijing', 'yunnan', 'south', 'north', 'forest', '多雨', '古木催生：采集产出 +12%', [0, 0], [-5, 5], '#10b981');

// 5. 北京 ➔ 青海 (丝路陇右)
createWildernessChain('wild_bj_qh', '丝路陇右', ['居庸天堑', '塞北荒丘', '贺兰古道', '陇西黄土', '日月山口', '倒淌河畔'], 'beijing', 'qinghai', 'west', 'east', 'desert', '晴雪', '西域风蚀：矿脉纯度 +10%', [0, 0], [-7, 0], '#eab308');

// 6. 环形网：河北 ➔ 上海 (渤海通途)
createWildernessChain('wild_hb_sh', '渤海通途', ['山海雄关', '秦皇浴日', '渤海烟波', '黄骅斥卤', '胶东灵脉', '崇明外泽'], 'hebei', 'shanghai', 'east', 'north', 'water', '惊涛', '熔炼暴击 +8%', [0, -7], [7, 0], '#38bdf8');

// 7. 环形网：上海 ➔ 浙江 (钱塘水陆)
createWildernessChain('wild_sh_zj', '钱塘水陆', ['松江古渡', '嘉兴烟雨', '西塘幽巷', '钱塘怒潮', '富春叠翠', '诸暨剑潭'], 'shanghai', 'zhejiang', 'south', 'north', 'water', '微澜', '水法提纯 +10%', [7, 0], [5, 5], '#06b6d4');

// 8. 环形网：浙江 ➔ 云南 (百越灵岭)
createWildernessChain('wild_zj_yn', '百越灵岭', ['仙霞古道', '武夷茶烟', '南岭千叠', '桂林奇峰', '十万深山', '罗霄绝顶'], 'zhejiang', 'yunnan', 'west', 'east', 'forest', '雾障', '稀有草药产出 +15%', [5, 5], [-5, 5], '#10b981');

// 9. 环形网：云南 ➔ 青海 (茶马雪山)
createWildernessChain('wild_yn_qh', '茶马雪山', ['玉龙雪峰', '金沙飞渡', '香格里拉', '澜沧天堑', '念青唐古', '巴颜喀拉'], 'yunnan', 'qinghai', 'north', 'south', 'snow', '严寒', '冰魄淬火 +12%', [-5, 5], [-7, 0], '#eab308');

// 10. 环形网：青海 ➔ 河北 (黄土陇东)
createWildernessChain('wild_qh_hb', '黄土陇东', ['祁连雪积', '乌鞘雄岭', '宁夏平野', '鄂尔多斯', '雁门古塞', '五台圣境'], 'qinghai', 'hebei', 'north', 'west', 'mountain', '风沙', '厚土加持：坚韧 +15%', [-7, 0], [0, -7], '#f97316');

// 补全所有区域的防御性属性
for (const [key, zone] of Object.entries(WORLD_ZONES)) {
  if (!zone.obstacles) zone.obstacles = [];
  if (!zone.portals) zone.portals = zone.gates || [];
  if (!zone.gatherNode) {
    zone.gatherNode = {
      x: 13500,
      y: 11000,
      radius: 180,
      name: `${zone.name.split(' ')[0]}天工台`,
      type: zone.biome || 'ore',
    };
  }
  if (!zone.color) zone.color = '#00ffc8';
  if (!zone.bgColor) zone.bgColor = '#040b14';
  if (!zone.width) zone.width = 27000;
  if (!zone.height) zone.height = 27000;
}

// 🌟 安全区处理：主城标记为 safeZone，清空采集物
processSafeZones();

// 🌟 为非主城区域生成 biome 资源 (如果尚未生成)
for (const [key, zone] of Object.entries(WORLD_ZONES)) {
  if (!zone.isCity && (!zone.resources || zone.resources.length === 0)) {
    zone.resources = biomeGenerateResources(zone.id, zone.biome, zone.width || 27000, zone.height || 27000, 100);
  }
}

// 🌟 初始投放当前纪元的 4 级采集物 (后续由 checkT4Refresh 在纪元切换时自动换批)
applyT4Resources();

/**
 * 点对点跨图重生计算函数 (Edge-to-Edge Portal Rebirth - 严厉禁止回退到 13500,13500)
 */
export function getPortalRebirthPos(fromZoneId, targetZoneId, fromGateDir) {
  const targetZone = WORLD_ZONES[targetZoneId];
  if (!targetZone) {
    throw new Error(`致命错误：尝试传送到一个不存在的拓扑域【${targetZoneId}】！`);
  }

  let returnGate = (targetZone.gates || []).find((g) => g.targetZoneId === fromZoneId);

  if (!returnGate && (targetZone.gates || []).length > 0) {
    const oppMap = { north: 'south', south: 'north', east: 'west', west: 'east' };
    const wantDir = fromGateDir ? oppMap[fromGateDir] : undefined;
    returnGate = (wantDir ? targetZone.gates.find((g) => g.dir === wantDir) : undefined) || targetZone.gates[0];
  }

  if (returnGate) {
    if (returnGate.dir === 'south') {
      return { x: returnGate.x, y: 25900 - 450 };
    } else if (returnGate.dir === 'north') {
      return { x: returnGate.x, y: 1100 + 450 };
    } else if (returnGate.dir === 'east') {
      return { x: 25900 - 450, y: returnGate.y };
    } else if (returnGate.dir === 'west') {
      return { x: 1100 + 450, y: returnGate.y };
    }
  }

  const fallbackGate = (targetZone.gates || [])[0];
  if (fallbackGate) {
    if (fallbackGate.dir === 'north') return { x: fallbackGate.x, y: 1550 };
    if (fallbackGate.dir === 'south') return { x: fallbackGate.x, y: 25450 };
    if (fallbackGate.dir === 'east') return { x: 25450, y: fallbackGate.y };
    return { x: 1550, y: fallbackGate.y };
  }

  return { x: targetZone.spawnX || 13500, y: targetZone.spawnY || 13500 };
}

/**
 * 拓扑图寻路算法
 */
export function findShortestPath(startZoneId, targetZoneId) {
  if (startZoneId === targetZoneId) {
    return { path: [startZoneId], totalSeconds: 0, steps: 0 };
  }

  const queue = [{ current: startZoneId, path: [startZoneId] }];
  const visited = new Set([startZoneId]);

  while (queue.length > 0) {
    const { current, path } = queue.shift();
    if (current === targetZoneId) {
      return {
        path,
        totalSeconds: (path.length - 1) * 90,
        steps: path.length - 1,
      };
    }

    const zone = WORLD_ZONES[current];
    if (zone && zone.gates) {
      for (const gate of zone.gates) {
        if (!visited.has(gate.targetZoneId) && WORLD_ZONES[gate.targetZoneId]) {
          visited.add(gate.targetZoneId);
          queue.push({
            current: gate.targetZoneId,
            path: [...path, gate.targetZoneId],
          });
        }
      }
    }
  }

  return { path: [startZoneId], totalSeconds: 0, steps: 0 };
}
