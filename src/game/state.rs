use std::sync::Arc;
use tokio::sync::RwLock;
use crate::sword_gen::Sword;

pub struct GameState {
    pub strikes: u32,
    pub max_strikes: u32,
    pub level: u32,
    pub exp: u32,
    pub coins: u128,
    pub inventory: Vec<Sword>,
}

#[derive(Clone)]
pub struct SharedGameState(pub Arc<RwLock<GameState>>);

impl SharedGameState {
    /// 安全地“一键卖出”，带品质保护锁
    pub async fn safe_sell_all(&self, keep_high_rarity: bool) -> u128 {
        let mut state = self.0.write().await;
        let mut total_gained = 0u128;
        
        // 过滤保留装备
        let mut new_inventory = Vec::new();
        for sword in state.inventory.drain(..) {
            if keep_high_rarity && sword.price >= 10_000 {
                // 保留紫装/金装
                new_inventory.push(sword);
            } else {
                total_gained += sword.price;
            }
        }
        
        state.inventory = new_inventory;
        state.coins += total_gained;
        total_gained
    }
}
