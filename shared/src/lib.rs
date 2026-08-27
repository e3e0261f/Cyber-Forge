use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 全局游戏配置常量 (消除所有魔法数字)
pub struct GameConfig;

impl GameConfig {
    // === 世界与坐标 ===
    pub const MAP_SIZE: f64 = 27000.0;
    pub const COORD_MIN: f64 = 100.0;
    pub const COORD_MAX: f64 = 26900.0;
    pub const DEFAULT_SPAWN_X: f64 = 13500.0;
    pub const DEFAULT_SPAWN_Y: f64 = 13500.0;

    // === 墙体与边界页边距 ===
    pub const WALL_MARGIN: f64 = 80.0;

    // === 传送门与过图 ===
    pub const PORTAL_RADIUS: f64 = 24.0;
    pub const PORTAL_INTERACT_RADIUS: f64 = 36.0;
    pub const TELEPORT_COOLDOWN_SECS: u64 = 5;
    pub const INVULNERABLE_DURATION_SECS: u64 = 30;
    pub const INVULNERABLE_FATIGUE_SECS: u64 = 60;
    pub const PORTAL_SAFE_INSET: f64 = 120.0;
    pub const PORTAL_FALLBACK_INSET: f64 = 120.0;

    // === 采集系统 ===
    pub const GATHER_DISTANCE_MAX: f64 = 160.0;
    pub const GATHER_PROMPT_DISTANCE: f64 = 350.0;
    pub const GATHER_NODE_RESPAWN_SECS: u64 = 15;
    pub const GATHER_YIELD_NORMAL: u32 = 1;
    pub const GATHER_YIELD_CRIT: u32 = 2;
    pub const GATHER_YIELD_PERFECT: u32 = 3; // QTE 正中间完美一击 (3倍产出)
    pub const GATHER_COPPER_PER_UNIT: u64 = 20;
    pub const GATHER_NODE_MAX_CAPACITY: u32 = 100;
    pub const GATHER_RESPAWN_TICK_SECS: u64 = 5;
    pub const GATHER_RESPAWN_AMOUNT: u32 = 5;

    // === 背包与负重 ===
    pub const DEFAULT_MAX_BACKPACK: usize = 12;
    pub const DEFAULT_MAX_WEIGHT: f64 = 50.0;
    pub const WEIGHT_TOLERANCE: f64 = 0.001;
    pub const MAX_STACK_DEFAULT: u32 = 999;

    // === 物品重量 (按分类) ===
    pub const WEIGHT_ORE: f64 = 2.5;
    pub const WEIGHT_HERB: f64 = 0.5;
    pub const WEIGHT_WOOD: f64 = 1.5;
    pub const WEIGHT_STONE: f64 = 3.0;
    pub const WEIGHT_FUR: f64 = 1.0;
    pub const WEIGHT_DEFAULT: f64 = 1.0;

    // === 反作弊 ===
    pub const MAX_MOVE_SPEED: f64 = 1000.0;

    // === 市场 ===
    pub const MARKET_FLUCTUATION_MIN_SECS: u64 = 1500;
    pub const MARKET_FLUCTUATION_MAX_SECS: u64 = 2700;
    pub const MARKET_RATIO_MIN: f64 = 0.60;
    pub const MARKET_RATIO_MAX: f64 = 2.20;
    pub const MARKET_SELL_RATIO: f64 = 0.92;

    // === 商票 ===
    pub const COMMERCE_CREDIT_MULTIPLIER: u64 = 3;
    /// 🌟 商票初始信用额度 (免费领取, 采购额度 3 万铜)
    pub const TICKET_INITIAL_LIMIT: u64 = 30_000;
    /// 🌟 交割目标: 把 3 万额度赚到累计回款 10 万铜后方可交割商票
    pub const TICKET_SETTLE_TARGET: u64 = 100_000;
    /// 🌟 交割奖励比例: 交割时按累计回款的 10% 发放驿站奖励金
    pub const TICKET_SETTLE_BONUS_DIV: u64 = 10;
    /// 🌟 贸易商品单件负重 (买入包即占取重量)
    pub const TRADE_GOOD_UNIT_WEIGHT: f64 = 1.5;

    // === 初始资源 ===
    pub const STARTER_COPPER: u64 = 100;
    pub const STARTER_COINS: u64 = 0;
    pub const STARTER_JADE: u64 = 0;
    pub const STARTER_LEVEL: u32 = 1;

    // === 持久化 ===
    pub const SAVE_INTERVAL_SECS: u64 = 30;
    pub const SAVE_FILE_PATH: &'static str = "data/world_state.json";

    // === 在线判定 ===
    /// 最近心跳在该窗口内视为在线 (客户端每秒轮询 /api/tick, 30 秒窗口宽容弱网)
    pub const ONLINE_WINDOW_SECS: u64 = 30;

    // === 认证 ===
    pub const DEFAULT_ACCOUNT_ID: &'static str = "default_cultivator";
    pub const AUTH_TOKEN_HEADER: &'static str = "X-Auth-Token";
}

/// 🌟 UI 弹窗与模态框几何尺寸配置 (量化游戏内每一个弹出窗口的大小)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct WindowDimensions {
    pub width: f64,
    pub height: f64,
}

pub struct UIWindowConfig;

impl UIWindowConfig {
    // 1. 九州导航网络地图 (map)
    pub const MAP_WIDTH: f64 = 880.0;
    pub const MAP_HEIGHT: f64 = 640.0;

    // 2. 矩阵锦囊背包 (stash)
    pub const STASH_WIDTH: f64 = 560.0;
    pub const STASH_HEIGHT: f64 = 420.0;

    // 3. 藏宝阁拍卖大厅 (auction)
    pub const AUCTION_WIDTH: f64 = 580.0;
    pub const AUCTION_HEIGHT: f64 = 440.0;

    // 4. 天道任务 (quest)
    pub const QUEST_WIDTH: f64 = 560.0;
    pub const QUEST_HEIGHT: f64 = 420.0;

    // 5. 铁匠铺学徒工坊 (apprentice)
    pub const APPRENTICE_WIDTH: f64 = 560.0;
    pub const APPRENTICE_HEIGHT: f64 = 420.0;

    // 6. 宗门天道日志 (logs)
    pub const LOGS_WIDTH: f64 = 560.0;
    pub const LOGS_HEIGHT: f64 = 420.0;

    // 7. 身体素质/炼体 (body)
    pub const BODY_WIDTH: f64 = 580.0;
    pub const BODY_HEIGHT: f64 = 560.0;

    // 8. 天道出生证明 (inspect)
    pub const INSPECT_WIDTH: f64 = 480.0;
    pub const INSPECT_HEIGHT: f64 = 320.0;

    // 9. 调试控制台 (debug)
    pub const DEBUG_WIDTH: f64 = 480.0;
    pub const DEBUG_HEIGHT: f64 = 440.0;

    // 10. 系统设置 (settings)
    pub const SETTINGS_WIDTH: f64 = 560.0;
    pub const SETTINGS_HEIGHT: f64 = 440.0;

    // 11. 跑商与特产行 (trade)
    pub const TRADE_WIDTH: f64 = 600.0;
    pub const TRADE_HEIGHT: f64 = 560.0;

    // 12. 万宝金库/银行 (bank)
    pub const BANK_WIDTH: f64 = 640.0;
    pub const BANK_HEIGHT: f64 = 440.0;

    // 13. 地牢探索 (dungeon)
    pub const DUNGEON_WIDTH: f64 = 640.0;
    pub const DUNGEON_HEIGHT: f64 = 480.0;

    // 14. 丢弃销毁确认 (drop_confirm)
    pub const DROP_CONFIRM_WIDTH: f64 = 360.0;
    pub const DROP_CONFIRM_HEIGHT: f64 = 220.0;

    // 15. 右键上下文菜单 (context_menu)
    pub const CONTEXT_MENU_WIDTH: f64 = 184.0;
    pub const CONTEXT_MENU_ROW_HEIGHT: f64 = 28.0;
    pub const CONTEXT_MENU_PAD: f64 = 6.0;

    // === 弹窗最大化区域（上下 HUD 之间） ===
    pub const MAX_MODAL_TOP_INSET: f64 = 60.0;
    pub const MAX_MODAL_BOTTOM_INSET: f64 = 44.0;
    pub const MAX_MODAL_SIDE_INSET: f64 = 10.0;

    // 默认回退弹窗尺寸
    pub const DEFAULT_MODAL_WIDTH: f64 = 560.0;
    pub const DEFAULT_MODAL_HEIGHT: f64 = 420.0;

    /// 根据弹窗 ID 获取量化窗口尺寸
    pub fn get_window_size(modal_id: &str) -> WindowDimensions {
        match modal_id {
            "map" => WindowDimensions { width: Self::MAP_WIDTH, height: Self::MAP_HEIGHT },
            "stash" => WindowDimensions { width: Self::STASH_WIDTH, height: Self::STASH_HEIGHT },
            "auction" => WindowDimensions { width: Self::AUCTION_WIDTH, height: Self::AUCTION_HEIGHT },
            "quest" => WindowDimensions { width: Self::QUEST_WIDTH, height: Self::QUEST_HEIGHT },
            "apprentice" => WindowDimensions { width: Self::APPRENTICE_WIDTH, height: Self::APPRENTICE_HEIGHT },
            "logs" => WindowDimensions { width: Self::LOGS_WIDTH, height: Self::LOGS_HEIGHT },
            "body" => WindowDimensions { width: Self::BODY_WIDTH, height: Self::BODY_HEIGHT },
            "inspect" => WindowDimensions { width: Self::INSPECT_WIDTH, height: Self::INSPECT_HEIGHT },
            "debug" => WindowDimensions { width: Self::DEBUG_WIDTH, height: Self::DEBUG_HEIGHT },
            "settings" => WindowDimensions { width: Self::SETTINGS_WIDTH, height: Self::SETTINGS_HEIGHT },
            "trade" => WindowDimensions { width: Self::TRADE_WIDTH, height: Self::TRADE_HEIGHT },
            "bank" => WindowDimensions { width: Self::BANK_WIDTH, height: Self::BANK_HEIGHT },
            "dungeon" => WindowDimensions { width: Self::DUNGEON_WIDTH, height: Self::DUNGEON_HEIGHT },
            "drop_confirm" | "drop" => WindowDimensions { width: Self::DROP_CONFIRM_WIDTH, height: Self::DROP_CONFIRM_HEIGHT },
            _ => WindowDimensions { width: Self::DEFAULT_MODAL_WIDTH, height: Self::DEFAULT_MODAL_HEIGHT },
        }
    }
}

/// 空间坐标 (0.0 ~ 27000.0)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
    pub zone_id: String,
    pub last_updated: u64,
}

/// 物品分类枚举 (矿物/草药/木头/石头/皮草/通用材料/装备)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ItemCategory {
    Ore,       // 矿物类
    Herb,      // 草药类
    Wood,      // 木头类
    Stone,     // 石头类
    Fur,       // 皮草类 (击杀动物获得)
    Material,  // 通用材料
    Equipment, // 装备
}

/// 独立区域地图配置结构体
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ZoneConfigDefinition {
    pub zone_id: String,
    pub name: String,
    pub biome: String,
    pub width: f64,
    pub height: f64,
    pub spawn_x: f64,
    pub spawn_y: f64,
    pub resources: Vec<ResourceSpawnConfig>,
    pub monsters: Vec<MonsterSpawnConfig>,
    pub npcs: Vec<NpcTaskConfig>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ResourceSpawnConfig {
    pub id: String,
    pub name: String,
    pub category: ItemCategory, // 区分 矿物、草药、木头、石头、皮草
    pub tier: u8,
    pub x: f64,
    pub y: f64,
    pub yield_item_id: String,
    pub max_capacity: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MonsterSpawnConfig {
    pub monster_id: String,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub drop_fur_id: Option<String>, // 击杀后掉落皮草
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NpcTaskConfig {
    pub npc_id: String,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub has_quest: bool,
}

/// 物品大类
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ItemType {
    Material,
    Equipment,
    Consumable,
    TradeGood,
}

fn default_item_weight() -> f64 {
    GameConfig::WEIGHT_DEFAULT
}

fn default_max_weight() -> f64 {
    GameConfig::DEFAULT_MAX_WEIGHT
}

/// 游戏物品结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameItem {
    pub id: String,
    pub item_id: String,
    pub name: String,
    pub item_type: ItemType,
    pub tier: u8,
    pub stack_count: u32,
    pub max_stack: u32,
    pub is_bound: bool,
    #[serde(default = "default_item_weight")]
    pub weight: f64,
    pub attributes: HashMap<String, f64>,
}

/// 商票与随身特产 (货物直接入背包占重, NPC 只识别背包内货物)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerchantTicket {
    pub ticket_id: String,
    pub credit_limit: u64,
    pub current_deposit: u64,
    pub issue_city: String,
    pub is_active: bool,
    pub cargo: Vec<TradeGoodCargo>,
    /// 🌟 已用信用额度 = 手上未售出货物的采购成本 (卖出后释放可再采购)
    #[serde(default)]
    pub used_credit: u64,
    /// 🌟 累计卖出回款 (交割判据: 达到 TICKET_SETTLE_TARGET 即可交割)
    #[serde(default)]
    pub earned_total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeGoodCargo {
    pub good_id: String,
    pub name: String,
    pub count: u32,
    pub buy_city: String,
    pub buy_unit_price: u64,
}

/// 阿尔比恩式硬核采集矿脉/资源节点储量池 (Yield Pool)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceNode {
    pub node_id: String,
    pub zone_id: String,
    pub max_capacity: u32,
    pub current_yield: u32,
    pub tier: u8,
    pub respawn_rate_secs: u64,
}

/// 动态物价条目 (浮动比率 60% ~ 220%)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityMarketGoods {
    pub good_id: String,
    pub name: String,
    pub base_price: u64,
    pub current_buy_price: u64,
    pub current_sell_price: u64,
    pub trend_ratio: f64,
}

/// 玩家在线状态完整结构体 (单一可信源)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub account_id: String,
    pub position: Position,
    pub copper: u64,
    pub coins: u64,
    pub jade: u64,
    pub level: u32,
    pub backpack: Vec<GameItem>,
    pub max_backpack: usize,
    #[serde(default)]
    pub current_weight: f64,
    #[serde(default = "default_max_weight")]
    pub max_weight: f64,
    pub merchant_ticket: Option<MerchantTicket>,
    #[serde(default)]
    pub bank_items: Vec<GameItem>,
    #[serde(default)]
    pub teleport_cooldown_until: u64,
    #[serde(default)]
    pub invulnerable_until: u64,
    #[serde(default)]
    pub invulnerable_fatigue_until: u64,
    #[serde(default)]
    pub block_height: u64,
    #[serde(default = "default_genesis_hash")]
    pub block_hash: String,
    /// 🌟 最近一次活动心跳 (epoch 秒): tick/action/登录均刷新; 旧存档缺省 0 = 视为离线。
    ///    真实在线 = 最近 ONLINE_WINDOW_SECS 内有心跳的玩家, 而非 players 表总长 (表从不淘汰会无限增长)
    #[serde(default)]
    pub last_active_at: u64,
}

fn default_genesis_hash() -> String {
    "0000000000000000genesis_hash".to_string()
}

/// 简单且确定性的哈希计算辅助函数 (FNV-1a 64位哈希转16进制，支持完全无外部依赖确定性输出)
pub fn calculate_hash(data: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in data.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

/// 移动行为抽查报告 (Movement Report)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovementReport {
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
    pub zone_id: String,
    pub duration_secs: f64,
    pub timestamp: u64,
}

/// 物品丢弃审计报告 (Item Drop Report)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemDropReport {
    pub item_id: String,
    pub name: String,
    pub count: u32,
    pub timestamp: u64,
}

/// 本地区块链链式日志条目 (Local Blockchain Hash Chain Block)
/// 客户端玩家行为账本协议版本。
/// v2 的核心语义：一笔玩家动作对应一个 Ledger Block；服务端仍拥有最终裁决权。
pub const PLAYER_LEDGER_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionLogBlock {
    pub height: u64,
    pub prev_hash: String,
    pub action_type: String, // "mine", "drop", "teleport", "coin_change", "qte_result", "offline_progress"
    pub payload_json: String,
    pub timestamp: u64,
    pub block_hash: String,
}

impl ActionLogBlock {
    pub fn create(height: u64, prev_hash: &str, action_type: &str, payload_json: &str, timestamp: u64) -> Self {
        let raw_content = format!("{}:{}:{}:{}:{}", height, prev_hash, action_type, payload_json, timestamp);
        let block_hash = calculate_hash(&raw_content);
        Self {
            height,
            prev_hash: prev_hash.to_string(),
            action_type: action_type.to_string(),
            payload_json: payload_json.to_string(),
            timestamp,
            block_hash,
        }
    }

    pub fn verify(&self) -> bool {
        let raw_content = format!("{}:{}:{}:{}:{}", self.height, self.prev_hash, self.action_type, self.payload_json, self.timestamp);
        self.block_hash == calculate_hash(&raw_content)
    }
}

/// 批量对账同步请求 (Batch Log Sync)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchLogSyncRequest {
    pub account_id: String,
    pub blocks: Vec<ActionLogBlock>,
}

/// 批量对账同步响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchLogSyncResponse {
    pub success: bool,
    pub message: String,
    pub current_height: u64,
    pub current_hash: String,
    pub rolled_back: bool,
}

impl PlayerState {
    /// 动态重新计算当前背包所有物品总重量
    pub fn recalculate_weight(&mut self) -> f64 {
        let total: f64 = self.backpack.iter().map(|item| {
            let unit_w = if item.weight > 0.0 { item.weight } else { 1.0 };
            unit_w * (item.stack_count as f64)
        }).sum();
        self.current_weight = (total * 100.0).round() / 100.0;
        self.current_weight
    }

    /// 校验是否可以容纳新增的物品重量 (默认上限 50.0 KG)
    pub fn can_add_weight(&self, incoming_weight: f64) -> bool {
        let max_w = if self.max_weight > 0.0 { self.max_weight } else { GameConfig::DEFAULT_MAX_WEIGHT };
        (self.current_weight + incoming_weight) <= (max_w + GameConfig::WEIGHT_TOLERANCE)
    }
}

/// 延迟云端快照上报 (Lazy Cloud Snapshot)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudStateSnapshot {
    pub trigger: String,
    pub timestamp: u64,
    pub block_height: u64,
    pub block_hash: String,
    pub player_x: f64,
    pub player_y: f64,
    pub current_zone_id: String,
    pub current_city_id: String,
    pub backpack: Vec<GameItem>,
    pub gold: i64,
    pub lingshi: i64,
    pub slag: i64,
    pub level: u32,
    pub strikes: u64,
}

/// 客户端/服务端 WebSocket 通讯协议
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    Auth { token: String },
    MoveSync { x: f64, y: f64, zone_id: String },
    MovementAuditReport(MovementReport),
    ItemDropAuditReport(ItemDropReport),
    SyncHashChain { blocks: Vec<ActionLogBlock> },
    SubmitCloudSnapshot(CloudStateSnapshot),
    StrikeMine { target_node_id: String, is_crit: bool },
    BuyTradeGood { good_id: String, count: u32 },
    SellTradeGood { good_id: String, count: u32 },
    TeleportZone { target_zone_id: String },
    DropItem { item_id: String, count: Option<u32> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    StateSnapshot(PlayerState),
    MarketUpdate(HashMap<String, Vec<CityMarketGoods>>),
    NodeDepleted { node_id: String },
    HashChainValidated { height: u64, block_hash: String },
    StateOverrideWithCloud { state: PlayerState, message: String },
    SecurityViolation { reason: String, rollback_height: u64, kick: bool },
    Error { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_hash_deterministic() {
        let hash1 = calculate_hash("hello");
        let hash2 = calculate_hash("hello");
        assert_eq!(hash1, hash2, "相同输入应产生相同哈希");
    }

    #[test]
    fn test_calculate_hash_different_inputs() {
        let hash1 = calculate_hash("hello");
        let hash2 = calculate_hash("world");
        assert_ne!(hash1, hash2, "不同输入应产生不同哈希");
    }

    #[test]
    fn test_action_log_block_create_and_verify() {
        let block = ActionLogBlock::create(1, "genesis", "mine", "{\"ore\":1}", 1000);
        assert_eq!(block.height, 1);
        assert_eq!(block.prev_hash, "genesis");
        assert!(block.verify(), "新创建的区块应通过校验");
    }

    #[test]
    fn test_action_log_block_tamper_detection() {
        let mut block = ActionLogBlock::create(1, "genesis", "mine", "{\"ore\":1}", 1000);
        assert!(block.verify());
        
        // 篡改 payload
        block.payload_json = "{\"ore\":999}".to_string();
        assert!(!block.verify(), "篡改后的区块应校验失败");
    }

    #[test]
    fn test_action_log_block_chain_continuity() {
        let first = ActionLogBlock::create(1, "genesis", "move", "{\"x\":10}", 1000);
        let second = ActionLogBlock::create(2, &first.block_hash, "attack", "{\"target\":7}", 1001);

        assert_eq!(PLAYER_LEDGER_VERSION, 2);
        assert!(first.verify());
        assert!(second.verify());
        assert_eq!(second.prev_hash, first.block_hash);
        assert_eq!(second.height, first.height + 1);
    }

    #[test]
    fn test_player_state_weight_calculation() {
        let mut player = PlayerState {
            account_id: "test".into(),
            position: Position { x: 0.0, y: 0.0, zone_id: "test".into(), last_updated: 0 },
            copper: 0, coins: 0, jade: 0, level: 1,
            backpack: vec![
                GameItem {
                    id: "1".into(), item_id: "ore1".into(), name: "铁矿".into(),
                    item_type: ItemType::Material, tier: 1, stack_count: 10,
                    max_stack: 999, is_bound: true, weight: 2.5,
                    attributes: HashMap::new(),
                },
            ],
            max_backpack: 12,
            current_weight: 0.0,
            max_weight: 50.0,
            merchant_ticket: None,
            bank_items: vec![],
            teleport_cooldown_until: 0,
            invulnerable_until: 0,
            invulnerable_fatigue_until: 0,
            block_height: 0,
            block_hash: "genesis".into(),
            last_active_at: 0,
        };

        let total = player.recalculate_weight();
        assert!((total - 25.0).abs() < 0.01, "10个铁矿 x 2.5KG = 25KG");
        assert!(player.can_add_weight(25.0), "还能再装 25KG");
        assert!(!player.can_add_weight(26.0), "不能再装 26KG");
    }

    #[test]
    fn test_game_config_constants() {
        assert_eq!(GameConfig::MAP_SIZE, 27000.0);
        assert_eq!(GameConfig::TELEPORT_COOLDOWN_SECS, 5);
        assert_eq!(GameConfig::INVULNERABLE_DURATION_SECS, 30);
        assert!(GameConfig::GATHER_DISTANCE_MAX > 0.0);
        assert!(GameConfig::DEFAULT_MAX_WEIGHT > 0.0);
    }

    #[test]
    fn test_serde_roundtrip_player_state() {
        let player = PlayerState {
            account_id: "test_player".into(),
            position: Position { x: 100.0, y: 200.0, zone_id: "beijing".into(), last_updated: 12345 },
            copper: 500, coins: 10, jade: 5, level: 3,
            backpack: vec![],
            max_backpack: 12,
            current_weight: 0.0,
            max_weight: 50.0,
            merchant_ticket: None,
            bank_items: vec![],
            teleport_cooldown_until: 0,
            invulnerable_until: 0,
            invulnerable_fatigue_until: 0,
            block_height: 0,
            block_hash: "genesis".into(),
            last_active_at: 0,
        };

        let json = serde_json::to_string(&player).unwrap();
        let restored: PlayerState = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.account_id, "test_player");
        assert_eq!(restored.copper, 500);
        assert_eq!(restored.position.zone_id, "beijing");
    }
}
