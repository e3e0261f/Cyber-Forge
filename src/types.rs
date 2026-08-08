use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Element {
    Gold,
    Wood,
    Water,
    Fire,
    Earth,
}

impl fmt::Display for Element {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Element::Gold => write!(f, "庚金"),
            Element::Wood => write!(f, "乙木"),
            Element::Water => write!(f, "葵水"),
            Element::Fire => write!(f, "丙火"),
            Element::Earth => write!(f, "戊土"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Quality {
    Common,    // 凡品 [白]
    Fine,      // 上品 [绿]
    Rare,      // 稀有 [蓝]
    Epic,      // 史诗 [紫]
    Legendary, // 传说 [黄]
    Mythic,    // 神话 [红]
}

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
