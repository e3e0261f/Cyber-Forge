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
            Element::Water => write!(f, "癸水"),
            Element::Fire => write!(f, "丙火"),
            Element::Earth => write!(f, "戊土"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Quality(pub u8);

impl Quality {
    pub const MAX: u8 = 59;

    pub fn new(rank: u8) -> Self {
        Self(rank.min(Self::MAX))
    }

    pub fn rank(self) -> u8 {
        self.0.min(Self::MAX)
    }

    pub fn is_trash(self) -> bool {
        self.rank() <= 5
    }

    pub fn is_masterwork_tier(self) -> bool {
        self.rank() >= 12
    }

    pub fn badge(self) -> &'static str {
        const BADGES: [&str; 60] = [
            "[残]", "[劣]", "[粗]", "[凡]", "[普]", "[稳]", "[整]", "[良]", "[佳]", "[优]",
            "[精]", "[锐]", "[利]", "[亮]", "[淬]", "[炼]", "[锻]", "[锤]", "[锋]", "[稀]",
            "[名]", "[巧]", "[奇]", "[绝]", "[珍]", "[宝]", "[灵]", "[法]", "[宝器]", "[史]",
            "[宗]", "[师]", "[圣胚]", "[玄]", "[妙]", "[通]", "[达]", "[彻]", "[神工]", "[神]",
            "[传说]", "[古]", "[遗]", "[封]", "[御]", "[皇]", "[帝]", "[尊]", "[王]", "[道]",
            "[天]", "[劫]", "[律]", "[界]", "[宇]", "[宙]", "[源]", "[空]", "[无]", "[熵]",
        ];
        BADGES[self.rank() as usize]
    }

    pub fn bonus_exp(self) -> u32 {
        let r = self.rank() as u32;
        2 + r * r / 2
    }

    pub fn slag_value(self) -> u32 {
        5 + self.rank() as u32 * 10
    }

    pub fn notice_chance(self) -> f64 {
        0.06 + self.rank() as f64 * 0.007
    }

    pub fn take_chance(self) -> f64 {
        (0.38 - self.rank() as f64 * 0.004).clamp(0.08, 0.40)
    }

    pub fn color(self) -> ratatui::style::Color {
        use ratatui::style::Color;
        match self.rank() {
            0..=5 => Color::Rgb(120, 120, 120),
            6..=11 => Color::Rgb(0, 180, 90),
            12..=17 => Color::Rgb(0, 170, 200),
            18..=23 => Color::Rgb(80, 140, 255),
            24..=29 => Color::Rgb(140, 80, 255),
            30..=35 => Color::Rgb(200, 120, 255),
            36..=41 => Color::Rgb(255, 180, 40),
            42..=47 => Color::Rgb(255, 120, 40),
            48..=53 => Color::Rgb(255, 60, 100),
            _ => Color::Rgb(255, 40, 180),
        }
    }

    pub fn atk_base(self) -> u64 {
        8 + self.rank() as u64 * 8
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

impl Sword {
    pub fn category_glyph(&self) -> &'static str {
        let name = &self.name;
        if name.contains("剑") || name.contains("巨阙") {
            "[剑]"
        } else if name.contains("刀") || name.contains("匕") || name.contains("刺") {
            "[刀]"
        } else if name.contains("锤") || name.contains("凿") || name.contains("扳") || name.contains("剪") || name.contains("锯") || name.contains("斧") || name.contains("锄") || name.contains("镰") {
            "[具]"
        } else if name.contains("轮") || name.contains("轴") || name.contains("钉") || name.contains("盘") || name.contains("锁") || name.contains("闩") || name.contains("片") {
            "[件]"
        } else {
            "[物]"
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketListing {
    pub sword: Sword,
    pub listed_price: u128,
    #[serde(default = "default_auction_time")]
    pub listing_time: u64, // 竞拍倒计时（秒）
    #[serde(default)]
    pub fair_value: u128,
    #[serde(default)]
    pub bid_count: u32,
}

fn default_auction_time() -> u64 { 120 } // 修正为 2 分钟 (120 秒)

pub enum ForgeResult {
    Success(Sword),
    Shattered { slag_gained: u32 },
}
