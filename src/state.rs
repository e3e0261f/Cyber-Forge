use std::sync::Arc;
use tokio::sync::RwLock;
use crate::types::{Quality, Sword};

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
    pub apprentices: u32,
    pub max_apprentices: u32,
}

impl GameState {
    pub fn get_next_apprentice_cost(&self) -> u128 {
        let count = self.apprentices as u128;
        200 + count * count * 300
    }

    pub fn hire_apprentice(&mut self) -> Result<(), &'static str> {
        if self.apprentices >= self.max_apprentices {
            return Err("学徒名额已满！");
        }
        let cost = self.get_next_apprentice_cost();
        if self.coins < cost {
            return Err("铜板不足！");
        }

        self.coins -= cost;
        self.apprentices += 1;
        Ok(())
    }
}

#[derive(Clone)]
pub struct SharedGameState(pub Arc<RwLock<GameState>>);

impl SharedGameState {
    /// 安全一键卖出 (锁定保护史诗/传说/神话装备)
    pub async fn safe_sell_all(&self, keep_high_rarity: bool) -> u128 {
        let mut state = self.0.write().await;
        let mut total_gained = 0u128;

        let mut remaining = Vec::new();
        for item in state.inventory.drain(..) {
            if keep_high_rarity && (item.quality == Quality::Epic || item.quality == Quality::Legendary || item.quality == Quality::Mythic) {
                remaining.push(item);
            } else {
                total_gained += item.price;
            }
        }

        state.inventory = remaining;
        state.coins += total_gained;
        total_gained
    }
}
