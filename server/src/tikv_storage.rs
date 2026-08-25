//! 🌟 TiKV 分布式存储层
//!
//! 替换 JSON 文件存储，提供：
//! - 分布式强一致 (Raft)
//! - 水平扩展能力
//! - 百万级 QPS
//! - JSON 存档自动迁移

// 🌟 TiKV 存储层为生产演进预留 (当前回退 JSON), 接入前压制 dead_code 警告
#![allow(dead_code)]

use anyhow::{Context, Result};
use cyber_forge_shared::{PlayerState, ResourceNode};
use std::collections::HashMap;
use std::sync::Arc;
use tikv_client::{RawClient, Value};
use tokio::sync::RwLock;
use tracing::info;

/// TiKV Key 前缀定义
mod keys {
    use tikv_client::BoundRange;

    pub const PLAYER_PREFIX: &str = "player:";
    pub const NODE_PREFIX: &str = "node:";
    pub const META_PREFIX: &str = "meta:";

    pub fn player_state(account_id: &str) -> String {
        format!("{}{}:state", PLAYER_PREFIX, account_id)
    }

    pub fn node_state(node_id: &str) -> String {
        format!("{}{}", NODE_PREFIX, node_id)
    }

    pub fn meta_save_time() -> String {
        format!("{}{}", META_PREFIX, "last_save")
    }

    /// 玩家 key 扫描范围 (返回 BoundRange)
    pub fn player_scan_range() -> BoundRange {
        let start = PLAYER_PREFIX.as_bytes().to_vec();
        let mut end = PLAYER_PREFIX.as_bytes().to_vec();
        end.push(0xff);
        (start, end).into()
    }

    /// 节点 key 扫描范围 (返回 BoundRange)
    pub fn node_scan_range() -> BoundRange {
        let start = NODE_PREFIX.as_bytes().to_vec();
        let mut end = NODE_PREFIX.as_bytes().to_vec();
        end.push(0xff);
        (start, end).into()
    }
}

/// TiKV 存储引擎
pub struct TikvStorage {
    client: RawClient,
    /// 本地缓存 (减少网络请求)
    cache: Arc<RwLock<HashMap<String, Value>>>,
    cache_enabled: bool,
}

impl TikvStorage {
    /// 连接 TiKV 集群
    pub async fn connect(endpoints: Vec<String>) -> Result<Self> {
        info!("🔌 连接 TiKV 集群: {:?}", endpoints);

        let client = RawClient::new(endpoints)
            .await
            .context("TiKV 连接失败")?;

        info!("✅ TiKV 连接成功");

        Ok(Self {
            client,
            cache: Arc::new(RwLock::new(HashMap::new())),
            cache_enabled: true,
        })
    }

    /// 从 JSON 存档迁移数据到 TiKV
    pub async fn migrate_from_json(&self, json_path: &str) -> Result<u32> {
        use std::path::Path;

        let path = Path::new(json_path);
        if !path.exists() {
            info!("📂 JSON 存档不存在，跳过迁移");
            return Ok(0);
        }

        info!("🔄 开始从 JSON 迁移数据到 TiKV: {}", json_path);

        let json_content = tokio::fs::read_to_string(path)
            .await
            .context("读取 JSON 存档失败")?;

        let save_data: crate::persistence::WorldSaveData =
            serde_json::from_str(&json_content).context("解析 JSON 存档失败")?;

        let mut migrated = 0u32;

        // 迁移玩家数据
        for (account_id, player) in save_data.players {
            self.save_player(&account_id, &player).await?;
            migrated += 1;
        }

        // 迁移采集节点数据
        for (node_id, node) in save_data.gathering_nodes {
            self.save_node(&node_id, &node).await?;
            migrated += 1;
        }

        // 保存迁移时间戳
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        self.client
            .put(keys::meta_save_time(), now.to_string().into_bytes())
            .await?;

        info!("✅ 数据迁移完成: 共 {} 条记录", migrated);
        Ok(migrated)
    }

    /// 保存玩家状态
    pub async fn save_player(&self, account_id: &str, player: &PlayerState) -> Result<()> {
        let key = keys::player_state(account_id);
        let data = serde_json::to_vec(player)?;

        self.client.put(key.clone(), data.clone()).await?;

        // 更新缓存
        if self.cache_enabled {
            let mut cache = self.cache.write().await;
            cache.insert(key, data);
        }

        Ok(())
    }

    /// 加载玩家状态
    pub async fn load_player(&self, account_id: &str) -> Result<Option<PlayerState>> {
        let key = keys::player_state(account_id);

        // 先查缓存
        if self.cache_enabled {
            let cache = self.cache.read().await;
            if let Some(data) = cache.get(&key) {
                if let Ok(player) = serde_json::from_slice(data) {
                    return Ok(Some(player));
                }
            }
        }

        // 查 TiKV
        let result = self.client.get(key.clone()).await?;

        match result {
            Some(data) => {
                let player: PlayerState = serde_json::from_slice(&data)?;
                // 回填缓存
                if self.cache_enabled {
                    let mut cache = self.cache.write().await;
                    cache.insert(key, data);
                }
                Ok(Some(player))
            }
            None => Ok(None),
        }
    }

    /// 保存采集节点状态
    pub async fn save_node(&self, node_id: &str, node: &ResourceNode) -> Result<()> {
        let key = keys::node_state(node_id);
        let data = serde_json::to_vec(node)?;
        self.client.put(key, data).await?;
        Ok(())
    }

    /// 加载所有采集节点
    pub async fn load_all_nodes(&self) -> Result<HashMap<String, ResourceNode>> {
        let range = keys::node_scan_range();
        let pairs = self.client.scan(range, 10000).await?;

        let mut nodes = HashMap::new();
        for kv in pairs {
            let key_bytes: &[u8] = kv.key().into();
            let key_str = String::from_utf8_lossy(key_bytes).to_string();
            let value_bytes: &[u8] = kv.value().as_slice();
            if let Some(node_id) = key_str.strip_prefix(keys::NODE_PREFIX) {
                if let Ok(node) = serde_json::from_slice::<ResourceNode>(value_bytes) {
                    nodes.insert(node_id.to_string(), node);
                }
            }
        }

        Ok(nodes)
    }

    /// 加载所有玩家
    pub async fn load_all_players(&self) -> Result<HashMap<String, PlayerState>> {
        let range = keys::player_scan_range();
        let pairs = self.client.scan(range, 100000).await?;

        let mut players = HashMap::new();
        for kv in pairs {
            let key_bytes: &[u8] = kv.key().into();
            let key_str = String::from_utf8_lossy(key_bytes).to_string();
            let value_bytes: &[u8] = kv.value().as_slice();
            // 只处理 :state 后缀的 key
            if key_str.ends_with(":state") {
                if let Some(account_id) = key_str
                    .strip_prefix(keys::PLAYER_PREFIX)
                    .and_then(|s| s.strip_suffix(":state"))
                {
                    if let Ok(player) = serde_json::from_slice::<PlayerState>(value_bytes) {
                        players.insert(account_id.to_string(), player);
                    }
                }
            }
        }

        Ok(players)
    }

    /// 批量保存 (玩家 + 节点 + 元数据)
    pub async fn batch_save(
        &self,
        players: &[(String, PlayerState)],
        nodes: &[(String, ResourceNode)],
    ) -> Result<()> {
        let mut puts = Vec::with_capacity(players.len() + nodes.len() + 1);

        for (account_id, player) in players {
            let key = keys::player_state(account_id);
            let data = serde_json::to_vec(player)?;
            puts.push((key, data));
        }

        for (node_id, node) in nodes {
            let key = keys::node_state(node_id);
            let data = serde_json::to_vec(node)?;
            puts.push((key, data));
        }

        // 更新保存时间
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        puts.push((keys::meta_save_time(), now.to_string().into_bytes()));

        // 逐条写入 (RawClient 无原生 batch_put 批量接口)
        for (key, value) in puts {
            self.client.put(key, value).await?;
        }

        Ok(())
    }

    /// 获取最后保存时间
    pub async fn get_last_save_time(&self) -> Result<Option<u64>> {
        let result = self.client.get(keys::meta_save_time()).await?;

        match result {
            Some(data) => {
                let s = String::from_utf8_lossy(&data);
                Ok(s.parse().ok())
            }
            None => Ok(None),
        }
    }

    /// 删除玩家数据
    pub async fn delete_player(&self, account_id: &str) -> Result<()> {
        let key = keys::player_state(account_id);
        self.client.delete(key.clone()).await?;

        // 清除缓存
        if self.cache_enabled {
            let mut cache = self.cache.write().await;
            cache.remove(&key);
        }

        Ok(())
    }

    /// 清空本地缓存
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
        info!("🧹 TiKV 本地缓存已清空");
    }
}

/// TiKV 连接配置
pub struct TikvConfig {
    pub endpoints: Vec<String>,
    pub cache_enabled: bool,
}

impl Default for TikvConfig {
    fn default() -> Self {
        Self {
            endpoints: vec!["127.0.0.1:2379".to_string()],
            cache_enabled: true,
        }
    }
}
