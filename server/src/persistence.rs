// 🌟 JsonStorage 部分方法为存储演进/运维预留, 接入前压制 dead_code 警告
#![allow(dead_code)]

use cyber_forge_shared::{GameConfig, PlayerState, ResourceNode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tracing::{error, info, warn};

/// 可持久化的世界状态快照
#[derive(Serialize, Deserialize, Clone)]
pub struct WorldSaveData {
    pub players: HashMap<String, PlayerState>,
    #[serde(default)]  // 🌟 向后兼容：旧存档没有此字段时使用空 HashMap
    pub gathering_nodes: HashMap<String, ResourceNode>,
    pub saved_at: u64,
    #[serde(default)]
    pub version: u32,
}

/// 将世界状态保存到文件
pub fn save_world_state(
    players: &dashmap::DashMap<String, PlayerState>,
    gathering_nodes: &dashmap::DashMap<String, ResourceNode>,
) -> Result<(), std::io::Error> {
    let save_path = Path::new(GameConfig::SAVE_FILE_PATH);
    
    // 确保目录存在
    if let Some(parent) = save_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut player_map = HashMap::new();
    for entry in players.iter() {
        player_map.insert(entry.key().clone(), entry.value().clone());
    }

    let mut node_map = HashMap::new();
    for entry in gathering_nodes.iter() {
        node_map.insert(entry.key().clone(), entry.value().clone());
    }

    // 🌟 安全检查：防止空数据覆盖有效存档
    if player_map.is_empty() && save_path.exists() {
        if let Ok(existing) = std::fs::read_to_string(save_path) {
            if existing.contains("\"players\": {") && !existing.contains("\"players\": {}") {
                warn!("⚠️ 拒绝保存空玩家数据，保护现有存档不被覆盖");
                return Ok(());
            }
        }
    }

    let save_data = WorldSaveData {
        players: player_map,
        gathering_nodes: node_map.clone(),
        saved_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        version: 2,  // v2: 新增采集节点储量持久化
    };

    let node_count = node_map.len();

    let json = serde_json::to_string_pretty(&save_data)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 🌟 安全保护：写入前先备份旧存档 (防止数据丢失)
    if save_path.exists() {
        let backup_path = save_path.with_extension("json.bak");
        if let Err(e) = std::fs::copy(save_path, &backup_path) {
            warn!("⚠️ 存档备份失败 (继续写入): {}", e);
        } else {
            info!("📋 旧存档已备份到 {:?}", backup_path);
        }
    }

    // 原子写入：先写临时文件，再重命名
    let tmp_path = save_path.with_extension("tmp");
    std::fs::write(&tmp_path, json)?;
    std::fs::rename(&tmp_path, save_path)?;

    info!("💾 世界状态已持久化到 {} (玩家数: {}, 节点数: {})", GameConfig::SAVE_FILE_PATH, players.len(), node_count);
    Ok(())
}

/// 从文件加载世界状态
pub fn load_world_state() -> Option<WorldSaveData> {
    let save_path = Path::new(GameConfig::SAVE_FILE_PATH);
    
    if !save_path.exists() {
        info!("📂 未找到存档文件，将使用空白世界状态");
        return None;
    }

    match std::fs::read_to_string(save_path) {
        Ok(json) => {
            match serde_json::from_str::<WorldSaveData>(&json) {
                Ok(data) => {
                    info!("📂 成功加载世界状态存档 (玩家数: {}, 保存时间: {})", data.players.len(), data.saved_at);
                    Some(data)
                }
                Err(e) => {
                    error!("❌ 存档文件格式错误: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            warn!("⚠️ 读取存档文件失败: {}", e);
            None
        }
    }
}

/// 启动定期自动保存后台任务 (接收 Arc 共享引用，确保保存实时数据)
pub fn spawn_autosave_task(
    players: Arc<dashmap::DashMap<String, PlayerState>>,
    gathering_nodes: Arc<dashmap::DashMap<String, ResourceNode>>,
) {
    info!("🔄 自动保存任务已启动 (初始玩家: {}, 节点: {})", players.len(), gathering_nodes.len());
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(
            tokio::time::Duration::from_secs(GameConfig::SAVE_INTERVAL_SECS)
        );
        loop {
            interval.tick().await;
            let count = players.len();
            if count > 0 {
                let ids: Vec<_> = players.iter().map(|e| e.key().clone()).collect();
                info!("💾 自动保存: 在线玩家 {} 人 {:?}", count, ids);
            }
            if let Err(e) = save_world_state(&players, &gathering_nodes) {
                error!("❌ 自动保存失败: {}", e);
            }
        }
    });
}

// ============================================================
// 🌟 JSON 文件存储结构体 (用于 GameStorage 枚举)
// ============================================================

/// JSON 文件存储后端 (开发环境 / TiKV 不可用时的回退方案)
pub struct JsonStorage {
    pub players: Arc<RwLock<HashMap<String, PlayerState>>>,
    pub nodes: Arc<RwLock<HashMap<String, ResourceNode>>>,
    pub save_path: PathBuf,
}

impl JsonStorage {
    /// 从现有存档文件创建 JsonStorage
    pub fn new() -> Self {
        let save_path = PathBuf::from(GameConfig::SAVE_FILE_PATH);
        let storage = Self {
            players: Arc::new(RwLock::new(HashMap::new())),
            nodes: Arc::new(RwLock::new(HashMap::new())),
            save_path,
        };
        // 尝试从文件加载
        storage.load_from_file();
        storage
    }

    /// 从 JSON 文件加载数据到内存
    fn load_from_file(&self) {
        if !self.save_path.exists() {
            info!("📂 JSON 存档不存在，使用空数据");
            return;
        }
        match std::fs::read_to_string(&self.save_path) {
            Ok(json) => {
                match serde_json::from_str::<WorldSaveData>(&json) {
                    Ok(data) => {
                        if let Ok(mut players) = self.players.write() {
                            *players = data.players;
                        }
                        if let Ok(mut nodes) = self.nodes.write() {
                            *nodes = data.gathering_nodes;
                        }
                        info!(
                            "📂 JSON 存档已加载 (玩家: {}, 节点: {})",
                            self.players.read().map(|p| p.len()).unwrap_or(0),
                            self.nodes.read().map(|n| n.len()).unwrap_or(0)
                        );
                    }
                    Err(e) => error!("❌ JSON 存档解析失败: {}", e),
                }
            }
            Err(e) => warn!("⚠️ 读取 JSON 存档失败: {}", e),
        }
    }

    /// 将内存数据刷写到 JSON 文件
    pub fn flush(&self) -> Result<(), std::io::Error> {
        let players = self.players.read().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        let nodes = self.nodes.read().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

        // 防止空数据覆盖
        if players.is_empty() && self.save_path.exists() {
            if let Ok(existing) = std::fs::read_to_string(&self.save_path) {
                if existing.contains("\"players\": {") && !existing.contains("\"players\": {}") {
                    warn!("⚠️ 拒绝保存空玩家数据，保护现有存档");
                    return Ok(());
                }
            }
        }

        // 确保目录存在
        if let Some(parent) = self.save_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let save_data = WorldSaveData {
            players: players.clone(),
            gathering_nodes: nodes.clone(),
            saved_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            version: 2,
        };

        let json = serde_json::to_string_pretty(&save_data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        // 备份旧存档
        if self.save_path.exists() {
            let backup_path = self.save_path.with_extension("json.bak");
            let _ = std::fs::copy(&self.save_path, &backup_path);
        }

        // 原子写入
        let tmp_path = self.save_path.with_extension("tmp");
        std::fs::write(&tmp_path, &json)?;
        std::fs::rename(&tmp_path, &self.save_path)?;

        info!("💾 JSON 存档已保存 (玩家: {}, 节点: {})", players.len(), nodes.len());
        Ok(())
    }
}
