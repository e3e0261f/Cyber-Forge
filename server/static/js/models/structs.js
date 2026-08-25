/**
 * 维度一：【数据与逻辑绝对分离（Data-Logic Separation）】
 * 
 * 模块功能: 纯数据结构模型定义 (Rust Struct Analogs)
 * 设计理念: 对标 Rust 的 `#[derive(Serialize, Deserialize, Clone, Debug)] struct`。
 * 严禁在数据模型中混入 DOM 节点、Canvas Context、事件监听或 UI 状态。
 * 所有状态只包含纯粹的数据字段与纯数据工厂方法。
 */

/**
 * 玩家空间坐标结构体 (对标 Rust: pub struct PlayerLocation)
 * @typedef {Object} PlayerLocationStruct
 * @property {number} x - 空间坐标 X (0 ~ 27000)
 * @property {number} y - 空间坐标 Y (0 ~ 27000)
 * @property {string} zoneId - 区域 ID (如 'beijing', 'hebei')
 * @property {number} timestamp - 记录时间戳
 */
export function createPlayerLocation(x = 13500, y = 13500, zoneId = 'beijing') {
    return {
        x: Math.max(100, Math.min(26900, Number(x) || 13500)),
        y: Math.max(100, Math.min(26900, Number(y) || 13500)),
        zoneId: String(zoneId || 'beijing'),
        timestamp: Date.now()
    };
}

/**
 * 物品类型枚举 (对标 Rust: pub enum ItemType)
 */
export const ItemType = Object.freeze({
    Material: 'Material',       // 普通采集材料
    Equipment: 'Equipment',     // 可穿戴装备/神兵
    Consumable: 'Consumable',   // 消耗品
    TradeGood: 'TradeGood'      // 跑商特产货物
});

/**
 * 核心物品结构体 (对标 Rust: pub struct GameItem)
 */
export function createGameItem(raw = {}) {
    return {
        id: String(raw.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
        itemId: String(raw.itemId || raw.name || '未知物品'),
        name: String(raw.name || '凡铁矿'),
        glyph: String(raw.glyph || '[物]'),
        itemType: raw.itemType || ItemType.Material,
        tier: Number(raw.tier) || 1,
        price: String(raw.price || '0'),
        qualityRank: Number(raw.qualityRank) || 0,
        colorHex: String(raw.colorHex || '#dcdcdc'),
        isBound: Boolean(raw.isBound),
        isTradeGood: Boolean(raw.isTradeGood),
        buyCity: raw.buyCity ? String(raw.buyCity) : undefined,
        buyPrice: raw.buyPrice !== undefined ? Number(raw.buyPrice) : undefined,
        attributes: raw.attributes ? { ...raw.attributes } : {},
        stackCount: Math.max(1, Number(raw.stackCount) || 1),
        maxStack: Math.max(1, Number(raw.maxStack) || 1),
        is_tool: Boolean(raw.is_tool),
        element: raw.element ? String(raw.element) : undefined,
        fingerprint: raw.fingerprint ? String(raw.fingerprint) : undefined
    };
}

/**
 * 跑商特产货殖结构体 (对标 Rust: pub struct TradeGoodEntry)
 */
export function createTradeGoodEntry(id, name, count, buyCity, buyPrice) {
    return {
        id: String(id || `good_${Date.now()}`),
        name: String(name || '特产货殖'),
        count: Math.max(0, Number(count) || 0),
        buyCity: String(buyCity || 'beijing'),
        buyPrice: Math.max(0, Number(buyPrice) || 0)
    };
}

/**
 * 商票与贸易车队状态结构体 (对标 Rust: pub struct CommerceState)
 */
export function createCommerceState(raw = {}) {
    return {
        caravanActive: Boolean(raw.caravan_active || raw.caravanActive),
        caravanProgress: Number(raw.caravan_progress || raw.caravanProgress || 0),
        caravanDesc: String(raw.caravan_desc || raw.caravanDesc || ''),
        tradeInventory: Array.isArray(raw.trade_inventory || raw.tradeInventory)
            ? (raw.trade_inventory || raw.tradeInventory).map(g => createTradeGoodEntry(g.id, g.name, g.count, g.buyCity, g.buyPrice))
            : []
    };
}

/**
 * 游戏核心状态契约结构体 (对标 Rust: pub struct GameStateSnapshot)
 */
export function createDefaultGameState() {
    return {
        copper: '0',
        coins: '0',
        jade: '0',
        level: 1,
        exp: 0,
        max_exp: 5000,
        hammer_name: '凡铁锤',
        hammer_level: 1,
        hammer_power: '1.00',
        // 🌟 5 种采集工具 (0=未拥有, 1-8=工具品阶)
        tool_mining_pickaxe: 1,   // 采矿镐 (开采矿物 ore)
        tool_quarry_hammer: 1,    // 采石锤 (开采宝石/石头 gem)
        tool_skinning_knife: 0,   // 剥皮刀 (剥取皮革 hide)
        tool_cotton_knife: 0,     // 棉花刀 (采集草药/棉花 herb)
        tool_logging_axe: 0,      // 伐木斧 (砍伐木材 wood)
        interval_secs: 1.0,
        forge_qte_hits: 0,
        sub_level: 1,
        realm_name: '炼体',
        matrix_slots: 1,
        concurrent_hammers: 1,
        currency_protocol: '[天道纳玉]',
        currency_protocol_color: '#00ffc8',
        matrix_progresses: [],
        backpack: [],
        max_backpack: 12,
        lots: [],
        logs: [],
        toast: '',
        last_log: '',
        quests: [],
        active_quests: [],
        quest_next_refresh_secs: 0,
        current_zone_id: 'beijing',
        current_city_id: 'beijing',
        player_x: 13500,
        player_y: 13500,
        sky_city_jades: 0,
        sky_city_unlocked: false,
        caravan_active: false,
        caravan_progress: 0,
        caravan_desc: '',
        trade_inventory: []
    };
}
