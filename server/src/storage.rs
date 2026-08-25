//! 🌟 统一存储抽象层
//!
//! 通过枚举分派实现 JSON / TiKV 无缝切换。
//! 启动时优先连接 TiKV；若不可用则自动回退到 JSON 文件。

// 🌟 休眠中的存储演进模块 (数据分阶段演进策略预留), 接入前压制 dead_code 警告
#![allow(dead_code)]

use anyhow::Result;
use cyber_forge_shared::{PlayerState, ResourceNode};
use std::collections::HashMap;
use std::sync::Arc;

use crate::persistence::JsonStorage;
use crate::tikv_storage::TikvStorage;

/// 存储后端枚举 (避免 async trait object 复杂性)
pub enum GameStorage {
    /// JSON 文件存储 (开发/回退)
    Json(JsonStorage),
    /// TiKV 分布式存储 (生产)
    Tikv(Arc<TikvStorage>),
}

impl GameStorage {
    /// 后端名称
    pub fn name(&self) -> &str {
        match self {
            Self::Json(_) => "JSON-File",
            Self::Tikv(_) => "TiKV-Distributed",
        }
    }

    /// 保存单个玩家
    pub async fn save_player(&self, account_id: &str, player: &PlayerState) -> Result<()> {
        match self {
            Self::Json(s) => s.save_player(account_id, player),
            Self::Tikv(s) => s.save_player(account_id, player).await,
        }
    }

    /// 加载单个玩家
    pub async fn load_player(&self, account_id: &str) -> Result<Option<PlayerState>> {
        match self {
            Self::Json(s) => s.load_player(account_id),
            Self::Tikv(s) => s.load_player(account_id).await,
        }
    }

    /// 加载所有玩家
    pub async fn load_all_players(&self) -> Result<HashMap<String, PlayerState>> {
        match self {
            Self::Json(s) => s.load_all_players(),
            Self::Tikv(s) => s.load_all_players().await,
        }
    }

    /// 保存采集节点
    pub async fn save_node(&self, node_id: &str, node: &ResourceNode) -> Result<()> {
        match self {
            Self::Json(s) => s.save_node(node_id, node),
            Self::Tikv(s) => s.save_node(node_id, node).await,
        }
    }

    /// 加载所有采集节点
    pub async fn load_all_nodes(&self) -> Result<HashMap<String, ResourceNode>> {
        match self {
            Self::Json(s) => s.load_all_nodes(),
            Self::Tikv(s) => s.load_all_nodes().await,
        }
    }

    /// 批量保存 (玩家 + 节点)
    pub async fn batch_save(
        &self,
        players: &[(String, PlayerState)],
        nodes: &[(String, ResourceNode)],
    ) -> Result<()> {
        match self {
            Self::Json(s) => s.batch_save(players, nodes),
            Self::Tikv(s) => s.batch_save(players, nodes).await,
        }
    }
}

/// JSON 文件存储的同步包装器
impl JsonStorage {
    pub fn save_player(&self, account_id: &str, player: &PlayerState) -> Result<()> {
        let mut players = self.players.write().map_err(|e| anyhow::anyhow!("锁失败: {}", e))?;
        players.insert(account_id.to_string(), player.clone());
        // 同步写入 JSON 文件
        self.flush()?;
        Ok(())
    }

    pub fn load_player(&self, account_id: &str) -> Result<Option<PlayerState>> {
        let players = self.players.read().map_err(|e| anyhow::anyhow!("锁失败: {}", e))?;
        Ok(players.get(account_id).cloned())
    }

    pub fn load_all_players(&self) -> Result<HashMap<String, PlayerState>> {
        let players = self.players.read().map_err(|e| anyhow::anyhow!("锁失败: {}", e))?;
        Ok(players.clone())
    }

    pub fn save_node(&self, node_id: &str, node: &ResourceNode) -> Result<()> {
        let mut nodes = self.nodes.write().map_err(|e| anyhow::anyhow!("锁失败: {}", e))?;
        nodes.insert(node_id.to_string(), node.clone());
        Ok(())
    }

    pub fn load_all_nodes(&self) -> Result<HashMap<String, ResourceNode>> {
        let nodes = self.nodes.read().map_err(|e| anyhow::anyhow!("锁失败: {}", e))?;
        Ok(nodes.clone())
    }

    pub fn batch_save(
        &self,
        players: &[(String, PlayerState)],
        nodes: &[(String, ResourceNode)],
    ) -> Result<()> {
        {
            let mut p = self.players.write().map_err(|e| anyhow::anyhow!("锁失败: {}", e))?;
            for (id, state) in players {
                p.insert(id.clone(), state.clone());
            }
        }
        {
            let mut n = self.nodes.write().map_err(|e| anyhow::anyhow!("锁失败: {}", e))?;
            for (id, node) in nodes {
                n.insert(id.clone(), node.clone());
            }
        }
        self.flush()?;
        Ok(())
    }
}
