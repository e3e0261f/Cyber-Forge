use crate::{gathering::GatheringEngine, market::MarketEngine, persistence};
use crate::world_topology::WorldTopology;
use cyber_forge_shared::*;
use dashmap::DashMap;
use std::sync::Arc;
use tracing::info;

/// 游戏世界中央状态机。
///
/// 这是服务器运行期间的单一事实来源：HTTP、WebSocket 和后台任务
/// 都通过这里访问玩家、采集、市场与世界拓扑。
pub struct WorldState {
    pub players: Arc<DashMap<String, PlayerState>>,
    pub gathering: Arc<GatheringEngine>,
    pub market: Arc<MarketEngine>,
    pub topology: Arc<WorldTopology>,
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
        }
    }

    pub fn restore_from_save(&mut self) {
        if let Some(save_data) = persistence::load_world_state() {
            for (account_id, player_state) in save_data.players {
                self.players.insert(account_id, player_state);
            }
            if !save_data.gathering_nodes.is_empty() {
                self.gathering.restore_from_save(save_data.gathering_nodes);
            }
            info!("🔄 世界状态已从存档恢复 (玩家数: {})", self.players.len());
        }
    }

    pub fn get_or_create_player(&self, account_id: &str) -> PlayerState {
        let mut player = self.players
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
                bank_items: Vec::new(),
                teleport_cooldown_until: 0,
                invulnerable_until: 0,
                invulnerable_fatigue_until: 0,
                block_height: 0,
                block_hash: "0000000000000000genesis_hash".to_string(),
                last_active_at: 0,
            })
            .clone();
        player.recalculate_weight();
        player
    }

    pub fn online_count(&self) -> usize {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.players
            .iter()
            .filter(|entry| {
                entry.value().last_active_at > 0
                    && now.saturating_sub(entry.value().last_active_at) <= GameConfig::ONLINE_WINDOW_SECS
            })
            .count()
    }
}
