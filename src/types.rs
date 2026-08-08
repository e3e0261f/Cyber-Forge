use serde::{Deserialize, Serialize};
use std::fmt;

/// 五行属性枚举声明
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Element {
    Gold,   // 庚金
    Wood,   // 乙木
    Water,  // 葵水
    Fire,   // 丙火
    Earth,  // 戊土
    Chaos,  // 混沌
}

impl fmt::Display for Element {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Element::Gold => write!(f, "庚金"),
            Element::Wood => write!(f, "乙木"),
            Element::Water => write!(f, "葵水"),
            Element::Fire => write!(f, "丙火"),
            Element::Earth => write!(f, "戊土"),
            Element::Chaos => write!(f, "混沌"),
        }
    }
}

/// 装备品质等级声明
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Quality {
    Common,    // 凡品 (白)
    Fine,      // 上品 (绿)
    Rare,      // 稀有 (蓝)
    Epic,      // 史诗 (紫)
    Legendary, // 传说 (黄)
    Mythic,    // 神话 (红)
}

impl Quality {
    pub fn color_code(&self) -> &'static str {
        match self {
            Quality::Common => "\x1b[37m",
            Quality::Fine => "\x1b[32m",
            Quality::Rare => "\x1b[34m",
            Quality::Epic => "\x1b[35m",
            Quality::Legendary => "\x1b[33m",
            Quality::Mythic => "\x1b[31m",
        }
    }
}

/// 核心宝剑对象结构体声明
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sword {
    pub id: u64,
    pub name: String,
    pub element: Element,
    pub quality: Quality,
    pub price: u128,
    pub exp_reward: u32,
    pub carbon_ratio: f32,
    pub forged_timestamp: u64,
}

/// 第一行（Line 1）UI 专属定宽渲染数据契约声明
#[derive(Debug, Clone, Copy)]
pub struct Line1DisplayData {
    pub current_strikes: u32,
    pub max_strikes: u32,
    pub level: u32,
    pub current_exp: u32,
    pub max_exp: u32,
    pub coins: u128,
}

/// 游戏错误类型枚举声明
#[derive(Debug)]
pub enum GameError {
    InventoryFull,
    InsufficientCoins(u128),
    SaveDataCorrupted,
    TerminalError(String),
}

impl std::error::Error for GameError {}

impl fmt::Display for GameError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GameError::InventoryFull => write!(f, "背包空间已满！请先出售或扩容。"),
            GameError::InsufficientCoins(needed) => write!(f, "铜板不足，需要 {} 铜板。", needed),
            GameError::SaveDataCorrupted => write!(f, "存档校验失败，天道雷劫重置！"),
            GameError::TerminalError(msg) => write!(f, "终端渲染失败: {}", msg),
        }
    }
}
