use macroquad::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerPosition {
    pub x: f64,
    pub y: f64,
    pub zone_id: String,
    pub last_updated: u64,
}

pub trait StorageDriver {
    fn load_position(&self) -> Option<PlayerPosition>;
    fn save_position(&self, pos: &PlayerPosition) -> bool;
}

#[allow(dead_code)]
pub struct LocalStorageDriver {
    storage_key: &'static str,
}

impl LocalStorageDriver {
    pub fn new() -> Self {
        Self {
            storage_key: "cyber_forge_player_pos",
        }
    }
}

#[cfg(target_arch = "wasm32")]
impl StorageDriver for LocalStorageDriver {
    fn load_position(&self) -> Option<PlayerPosition> {
        let window = web_sys::window()?;
        let storage = window.local_storage().ok()??;
        let raw = storage.get_item(self.storage_key).ok()??;
        serde_json::from_str::<PlayerPosition>(&raw).ok()
    }

    fn save_position(&self, pos: &PlayerPosition) -> bool {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(json) = serde_json::to_string(pos) {
                    return storage.set_item(self.storage_key, &json).is_ok();
                }
            }
        }
        false
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl StorageDriver for LocalStorageDriver {
    fn load_position(&self) -> Option<PlayerPosition> {
        if let Ok(content) = std::fs::read_to_string(".player_pos_cache.json") {
            serde_json::from_str::<PlayerPosition>(&content).ok()
        } else {
            None
        }
    }

    fn save_position(&self, pos: &PlayerPosition) -> bool {
        if let Ok(json) = serde_json::to_string_pretty(pos) {
            std::fs::write(".player_pos_cache.json", json).is_ok()
        } else {
            false
        }
    }
}
