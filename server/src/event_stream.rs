//! 🌟 Kafka 异步事件流
//!
//! 玩家动作异步化：
//! - 采集/移动/交易等动作 → 发送到 Kafka Topic
//! - 区块链验证器异步消费 → 反作弊检测
//! - 解耦游戏逻辑与持久化/验证

// 🌟 Kafka 事件流为异步反作弊架构预留 (生产者已接入, 消费端待部署), 压制 dead_code 警告
#![allow(dead_code)]

use anyhow::{Context, Result};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::Message;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{error, info, warn};

/// 玩家动作事件 (序列化后发送到 Kafka)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerAction {
    pub account_id: String,
    pub action_type: ActionType,
    pub payload: serde_json::Value,
    pub timestamp: u64,
    pub sequence: u64,
}

/// 动作类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    Gather,
    Move,
    Trade,
    Craft,
    Teleport,
    Combat,
    Login,
    Logout,
}

/// Kafka 事件生产者 (游戏服务器发送动作)
pub struct EventProducer {
    producer: FutureProducer,
    topic: String,
    /// 本地缓冲 (Kafka 不可用时暂存)
    fallback_tx: mpsc::Sender<PlayerAction>,
    fallback_rx: Arc<tokio::sync::Mutex<mpsc::Receiver<PlayerAction>>>,
}

impl EventProducer {
    /// 连接 Kafka 集群
    pub fn new(brokers: &str, topic: &str) -> Result<Self> {
        info!("📡 创建 Kafka 事件生产者: brokers={}, topic={}", brokers, topic);

        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .set("queue.buffering.max.messages", "100000")
            .create()
            .context("Kafka 生产者创建失败")?;

        let (fallback_tx, fallback_rx) = mpsc::channel(10000);

        info!("✅ Kafka 事件生产者已就绪");

        Ok(Self {
            producer,
            topic: topic.to_string(),
            fallback_tx,
            fallback_rx: Arc::new(tokio::sync::Mutex::new(fallback_rx)),
        })
    }

    /// 发送玩家动作到 Kafka
    pub async fn emit_action(&self, action: PlayerAction) -> Result<()> {
        let key = action.account_id.clone();
        let payload = serde_json::to_string(&action)?;

        let record = FutureRecord::to(&self.topic)
            .key(&key)
            .payload(&payload);

        match self.producer.send(record, std::time::Duration::from_secs(5)).await {
            Ok(_) => {
                // 成功发送
            }
            Err((e, _)) => {
                warn!("⚠️ Kafka 发送失败，转入本地缓冲: {}", e);
                // 转入本地缓冲
                let _ = self.fallback_tx.try_send(action);
            }
        }

        Ok(())
    }

    /// 获取本地缓冲中未发送的动作数
    pub async fn pending_count(&self) -> usize {
        self.fallback_rx.lock().await.len()
    }
}

/// Kafka 事件消费者 (反作弊验证器消费动作)
pub struct EventConsumer {
    consumer: StreamConsumer,
}

impl EventConsumer {
    /// 连接 Kafka 并订阅 Topic
    pub fn new(brokers: &str, topic: &str, group_id: &str) -> Result<Self> {
        info!("📡 创建 Kafka 事件消费者: brokers={}, topic={}, group={}", brokers, topic, group_id);

        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("group.id", group_id)
            .set("enable.auto.commit", "true")
            .set("auto.offset.reset", "latest")
            .create()
            .context("Kafka 消费者创建失败")?;

        consumer.subscribe(&[topic])
            .context("Kafka Topic 订阅失败")?;

        info!("✅ Kafka 事件消费者已订阅: {}", topic);

        Ok(Self { consumer })
    }

    /// 启动异步消费循环 (反作弊验证)
    pub fn spawn_verify_loop(self) -> mpsc::Receiver<PlayerAction> {
        let (verify_tx, verify_rx) = mpsc::channel(1000);

        tokio::spawn(async move {
            use futures_util::StreamExt;

            info!("🔍 区块链反作弊验证循环已启动");

            let mut stream = self.consumer.stream();
            while let Some(message) = stream.next().await {
                match message {
                    Ok(borrowed_message) => {
                        if let Some(payload) = borrowed_message.payload() {
                            match serde_json::from_slice::<PlayerAction>(payload) {
                                Ok(action) => {
                                    // 发送到验证队列
                                    if verify_tx.send(action).await.is_err() {
                                        warn!("⚠️ 验证队列已满，丢弃消息");
                                    }
                                }
                                Err(e) => {
                                    warn!("⚠️ 反序列化玩家动作失败: {}", e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("❌ Kafka 消费错误: {}", e);
                    }
                }
            }
        });

        verify_rx
    }
}

/// 快速创建便捷方法
pub fn create_producer(brokers: &str, topic: &str) -> Option<Arc<EventProducer>> {
    match EventProducer::new(brokers, topic) {
        Ok(p) => Some(Arc::new(p)),
        Err(e) => {
            warn!("⚠️ Kafka 生产者创建失败 (将使用本地缓冲): {}", e);
            None
        }
    }
}

pub fn create_consumer(brokers: &str, topic: &str, group: &str) -> Option<EventConsumer> {
    match EventConsumer::new(brokers, topic, group) {
        Ok(c) => Some(c),
        Err(e) => {
            warn!("⚠️ Kafka 消费者创建失败: {}", e);
            None
        }
    }
}
