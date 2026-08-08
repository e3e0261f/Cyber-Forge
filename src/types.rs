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
    Common,    // 凡品
    Fine,      // 上品
    Rare,      // 稀有
    Epic,      // 史诗
    Legendary, // 传说
    Mythic,    // 神话
}

impl Quality {
    pub fn badge(&self) -> &'static str {
        match self {
            Quality::Common => "[凡]",
            Quality::Fine => "[优]",
            Quality::Rare => "[稀]",
            Quality::Epic => "[史]",
            Quality::Legendary => "[神]",
            Quality::Mythic => "[道]",
        }
    }

    /// 平滑成品经验补给
    pub fn bonus_exp(&self) -> u32 {
        match self {
            Quality::Common => 2,
            Quality::Fine => 5,
            Quality::Rare => 15,
            Quality::Epic => 50,
            Quality::Legendary => 150,
            Quality::Mythic => 500,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sword {
    pub id: u64,
    pub name: String,
    pub element: Element,
    pub quality: Quality,
    pub price: u128,
    pub carbon_ratio: f32,
    pub forged_timestamp: u64,

    pub sharpness: u32,
    pub enchantment: Option<Element>,
    pub is_reforged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketListing {
    pub sword: Sword,
    pub listed_price: u128,
    pub listing_time: u64,
}

pub enum ForgeResult {
    Success(Sword),
    Shattered { slag_gained: u32 },
}
