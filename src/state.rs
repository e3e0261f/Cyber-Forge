use std::sync::Arc;
use tokio::sync::RwLock;
use crate::types::{GameError, Sword};

/// 主游戏状态数据结构声明
pub struct GameState {
    pub strikes: u32,
    pub max_strikes: u32,
    pub level: u32,
    pub exp: u32,
    pub max_exp: u32,
    pub coins: u128,
    pub inventory: Vec<Sword>,
    pub max_inventory: usize,
    pub carbon_ratio: f32,
}

/// 线程安全的全局状态指针包装类型声明
#[derive(Clone)]
pub struct SharedGameState(pub Arc<RwLock<GameState>>);

/// 核心业务逻辑 Trait 契约声明
#[async_trait::async_trait]
pub trait ForgingEngine {
    async fn strikeonce(&self, entropy_delta: u64) -> Result<Option<Sword>, GameError>;
    async fn sell_item(&self, index: usize) -> Result<u128, GameError>;
    async fn safe_sell_all(&self, keep_high_rarity: bool) -> u128;
    async fn expand_inventory(&self) -> Result<usize, GameError>;
}
