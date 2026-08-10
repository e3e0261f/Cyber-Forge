use std::fs;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use super::{GameState, SAVE_FILE_PATH};

#[derive(Serialize, Deserialize)]
struct SavePayload {
    data: String,
    hash: String,
}

impl GameState {
    pub fn save_to_disk(&self) {
        if let Ok(data) = serde_json::to_string(self) {
            let mut hasher = Sha256::new();
            hasher.update(data.as_bytes());
            let hash = format!("{:x}", hasher.finalize());
            let payload = SavePayload { data, hash };
            if let Ok(file_content) = serde_json::to_string(&payload) {
                let _ = fs::write(SAVE_FILE_PATH, file_content);
            }
        }
    }

    pub fn load_from_disk() -> Self {
        if let Ok(file_content) = fs::read_to_string(SAVE_FILE_PATH) {
            if let Ok(payload) = serde_json::from_str::<SavePayload>(&file_content) {
                let mut hasher = Sha256::new();
                hasher.update(payload.data.as_bytes());
                let calculated = format!("{:x}", hasher.finalize());
                if calculated == payload.hash {
                    if let Ok(mut state) = serde_json::from_str::<GameState>(&payload.data) {
                        state.realm.soft_remap_from_exp();
                        return state;
                    }
                }
            }
        }
        Self::new()
    }
}
