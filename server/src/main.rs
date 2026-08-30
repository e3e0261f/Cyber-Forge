
mod auth;
mod cold_archive;
mod commerce;
mod errors;
mod event_stream;
mod gathering;
mod handlers;
mod market;
mod persistence;
mod storage;
mod tikv_storage;
mod world_topology;

use actix_files as fs;
use actix_web::{web, App, HttpServer};
use cyber_forge_shared::*;
use dashmap::DashMap;
use gathering::GatheringEngine;
use market::MarketEngine;
use std::env;
use std::path::Path;
use std::sync::Arc;
use tracing::{info, warn, Level};
use tracing_subscriber::FmtSubscriber;
use world_topology::WorldTopology;

use handlers::{action, login, state, ws};
use std::path::PathBuf;

/// 全局游戏世界中央状态机 (单一事实来源)
pub struct WorldState {
    /// 在线玩家状态表 (AccountID -> PlayerState) — Arc 共享给自动保存任务
    pub players: Arc<DashMap<String, PlayerState>>,
    /// 阿尔比恩式资源节点引擎 (Yield Pool)
    pub gathering: Arc<GatheringEngine>,
    /// 动态物价市场引擎 (25-45分钟刷新)
    pub market: Arc<MarketEngine>,
    /// 九州拓扑与商路图谱
    pub topology: Arc<WorldTopology>,
    /// 玩家区块链链式账本 (AccountID -> Vec<ActionLogBlock>)
    pub player_ledgers: Arc<DashMap<String, Vec<ActionLogBlock>>>,
}

impl WorldState {
    pub fn new() -> Self {
        let market = Arc::new(MarketEngine::new());
        market.spawn_fluctuation_task();

        let topology = Arc::new(WorldTopology::new());

        let gathering = Arc::new(GatheringEngine::new(&topology));
        gathering.spawn_respawn_task();

        Self {
            players: Arc::new(DashMap::new()),
            gathering,
            market,
            topology,
            player_ledgers: Arc::new(DashMap::new()),
        }
    }

    /// 从存档恢复世界状态
    pub fn restore_from_save(&mut self) {
        if let Some(save_data) = persistence::load_world_state() {
            for (account_id, player_state) in save_data.players {
                self.players.insert(account_id, player_state);
            }
            // 🌟 恢复采集节点储量
            if !save_data.gathering_nodes.is_empty() {
                self.gathering.restore_from_save(save_data.gathering_nodes);
            }
            info!("🔄 世界状态已从存档恢复 (玩家数: {})", self.players.len());
        }
    }

    /// 读取或创建玩家状态 (若已有历史坐标则保留，防止刷新被重置)
    pub fn get_or_create_player(&self, account_id: &str) -> PlayerState {
        let mut p = self.players
            .entry(account_id.to_string())
            .or_insert_with(|| PlayerState {
                account_id: account_id.to_string(),
                position: Position {
                    x: GameConfig::DEFAULT_SPAWN_X,
                    y: GameConfig::DEFAULT_SPAWN_Y,
                    zone_id: "beijing".into(),
                    last_updated: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                },
                copper: GameConfig::STARTER_COPPER,
                coins: GameConfig::STARTER_COINS,
                jade: GameConfig::STARTER_JADE,
                level: GameConfig::STARTER_LEVEL,
                backpack: Vec::new(),
                max_backpack: GameConfig::DEFAULT_MAX_BACKPACK,
                current_weight: 0.0,
                max_weight: GameConfig::DEFAULT_MAX_WEIGHT,
                merchant_ticket: None,
                caravan: None,
                bank_items: Vec::new(),
                teleport_cooldown_until: 0,
                invulnerable_until: 0,
                invulnerable_fatigue_until: 0,
                block_height: 0,
                block_hash: "0000000000000000genesis_hash".to_string(),
                last_active_at: 0,
            })
            .clone();
        p.recalculate_weight();
        p
    }

    /// 🌟 真实在线玩家数: 最近 ONLINE_WINDOW_SECS 内有心跳的玩家。
    ///    players 表含全部历史玩家且从不淘汰, 表长是"累计注册数"而非在线数 (旧日志误报根因)
    pub fn online_count(&self) -> usize {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.players
            .iter()
            .filter(|e| e.value().last_active_at > 0 && now.saturating_sub(e.value().last_active_at) <= GameConfig::ONLINE_WINDOW_SECS)
            .count()
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    info!("🚀 [CyberForge rustCF2513] Actix-web 纯 Rust 游戏服务器正在启动...");

    let mut world_state = WorldState::new();
    world_state.restore_from_save();
    let world_state = Arc::new(world_state);

    // 启动定期自动保存 (玩家 + 采集节点储量)
    persistence::spawn_autosave_task(world_state.players.clone(), world_state.gathering.nodes.clone());

    // 🌟 第二步：尝试连接 Kafka 事件流
    let kafka_brokers = env::var("KAFKA_BROKERS").unwrap_or_else(|_| "127.0.0.1:9092".to_string());
    let event_producer = event_stream::create_producer(&kafka_brokers, "player_actions");
    if event_producer.is_some() {
        info!("📡 Kafka 事件流已连接: {}", kafka_brokers);
    } else {
        info!("📡 Kafka 不可用，玩家动作将仅记录到本地日志");
    }

    // 🌟 第三步：启动冷数据归档任务
    let archive_dir = PathBuf::from(
        env::var("ARCHIVE_DIR").unwrap_or_else(|_| "data/archives".to_string())
    );
    cold_archive::spawn_archive_task(archive_dir.clone());
    info!("📦 冷数据归档目录: {}", archive_dir.display());

    // 🌟 第一步：尝试连接 TiKV (可选，通过环境变量启用)
    let tikv_endpoints = env::var("TIKV_ENDPOINTS").ok();
    if let Some(endpoints_str) = tikv_endpoints {
        let endpoints: Vec<String> = endpoints_str.split(',').map(|s| s.trim().to_string()).collect();
        info!("🔌 尝试连接 TiKV: {:?}", endpoints);
        match tikv_storage::TikvStorage::connect(endpoints).await {
            Ok(tikv) => {
                info!("✅ TiKV 已连接，开始迁移 JSON 数据...");
                let json_path = GameConfig::SAVE_FILE_PATH;
                match tikv.migrate_from_json(json_path).await {
                    Ok(count) => info!("✅ TiKV 迁移完成: {} 条记录", count),
                    Err(e) => warn!("⚠️ TiKV 迁移失败: {}", e),
                }
            }
            Err(e) => {
                warn!("⚠️ TiKV 连接失败，继续使用 JSON 存储: {}", e);
            }
        }
    }

    // 动态静态目录解析
    let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| {
        let candidates = ["./static", "./server/static", "../static", "./ui"];
        for dir in candidates {
            if Path::new(dir).join("index.html").exists() {
                return dir.to_string();
            }
        }
        "./static".to_string()
    });

    info!("📂 静态前端 UI 目录已挂载: {}", static_dir);
    info!("⚡ 访问主页: http://0.0.0.0:3000 (完整游戏界面)");
    info!("⚡ WebSocket 端点: ws://0.0.0.0:3000/ws (游戏实时长连接)");
    info!("💾 自动保存间隔: {} 秒", GameConfig::SAVE_INTERVAL_SECS);

    let static_dir_str = static_dir.clone();

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(world_state.clone()))
            .route("/health", web::get().to(state::health_check))
            .route("/api/login", web::post().to(login::login_handler))
            .route("/api/state", web::get().to(state::api_tick_handler))
            .route("/api/tick", web::post().to(state::api_tick_handler))
            .route("/api/action", web::post().to(action::api_action_handler))
            .route("/api/players_report", web::post().to(state::api_players_report_handler))
            .route("/ws", web::get().to(ws::ws_handler))
            .service(
                fs::Files::new("/", &static_dir_str)
                    .index_file("login.html")
                    .use_last_modified(true),
            )
    })
    .bind(("0.0.0.0", 3000))?
    .run()
    .await
}
