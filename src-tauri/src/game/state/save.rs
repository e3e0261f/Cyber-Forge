use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use super::GameState;

#[derive(Serialize, Deserialize)]
struct SavePayload { data: String, hash: String }

pub fn save_dir() -> PathBuf {
    if let Ok(p) = std::env::var("CYBER_FORGE_SAVE_DIR") { if !p.is_empty() { return PathBuf::from(p); } }
    if let Ok(home) = std::env::var("HOME") { return PathBuf::from(home).join(".local/share/cyber-forge"); }
    if let Ok(appdata) = std::env::var("APPDATA") { return PathBuf::from(appdata).join("cyber-forge"); }
    PathBuf::from(".")
}
pub fn save_file_path() -> PathBuf { save_dir().join("cyber_forge.save") }
fn ensure_dir(path: &Path) { if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); } }

impl GameState {
    pub fn to_save_json(&self) -> Option<String> {
        let data = serde_json::to_string(self).ok()?;
        let mut h = Sha256::new(); h.update(data.as_bytes());
        serde_json::to_string(&SavePayload { data, hash: format!("{:x}", h.finalize()) }).ok()
    }
    pub fn from_save_json(s: &str) -> Option<Self> {
        let p: SavePayload = serde_json::from_str(s).ok()?;
        let mut h = Sha256::new(); h.update(p.data.as_bytes());
        if format!("{:x}", h.finalize()) != p.hash { return None; }
        let mut st: GameState = serde_json::from_str(&p.data).ok()?;
        st.realm.soft_remap_from_exp();
        st.sync_body_stats();
        Some(st)
    }
    pub fn save_to_disk(&self) -> bool {
        let path = save_file_path(); ensure_dir(&path);
        self.to_save_json().map(|c| fs::write(&path, c).is_ok()).unwrap_or(false)
    }
    pub fn load_from_disk() -> Self {
        let path = save_file_path();
        if let Ok(c) = fs::read_to_string(&path) {
            if let Some(s) = Self::from_save_json(&c) { return s; }
        }
        if let Ok(c) = fs::read_to_string("./cyber_forge.save") {
            if let Some(s) = Self::from_save_json(&c) { let _ = s.save_to_disk(); return s; }
        }
        Self::new()
    }
}
