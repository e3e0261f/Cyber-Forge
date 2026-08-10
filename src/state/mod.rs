pub mod actions;
pub mod encounters;
pub mod market;
pub mod save;
pub mod upgrades;

use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use crate::types::{MarketListing, Sword};
use crate::realm::RealmState;

pub const SAVE_FILE_PATH: &str = "./cyber_forge.save";
pub const MARKET_REFRESH_TICKS: u64 = 6000;
pub const GOD_RATE_SOFT_CAP: f64 = 0.33;

pub const RUMORS: &[&str] = &[
    "东街张家明日嫁女，鼓乐通宵。",
"北巷老李昨夜归西，白幡已挂。",
"有人彩票刮中三等，正在酒楼请客。",
"南门狗患又起，行人频频踩中。",
"城西王婆丢了只鹅，正满街喊。",
"修士某在渡口摔了一跤，据说摔得很响。",
"今夜月色不错，却与你无关。",
"西市豆腐摊今日晚开，原因不明。",
"有人在巷口连续打了二十个喷嚏。",
"城东那棵歪树又掉下一根枯枝。",
"码头船工为争一根绳吵了半日。",
"酒楼跑堂把热汤扣在了自己脚上。",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogFilter {
    All,         // 全量记录
    Important,   // 仅重要（成交/极品/奇遇）
    Masterwork,  // 仅代表作/精进
}

impl LogFilter {
    pub fn name(&self) -> &'static str {
        match self {
            LogFilter::All => "全量",
            LogFilter::Important => "重要",
            LogFilter::Masterwork => "代表作",
        }
    }

    pub fn next(&self) -> Self {
        match self {
            LogFilter::All => LogFilter::Important,
            LogFilter::Important => LogFilter::Masterwork,
            LogFilter::Masterwork => LogFilter::All,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub strikes: u32,
    pub max_strikes: u32,
    pub level: u32,
    pub exp: u32,
    pub max_exp: u32,
    pub coins: u128,
    pub backpack: Vec<Sword>,
    pub max_backpack: usize,
    pub pavilion_market: Vec<MarketListing>,
    pub max_pavilion: usize,
    #[serde(default)]
    pub auto_melt_common: bool,
    #[serde(default)]
    pub auto_list_market: bool,
    pub carbon_ratio: f32,
    pub apprentices: u32,
    pub max_apprentices: u32,
    pub sharpen_workers: u32,
    pub enchant_workers: u32,
    pub repair_workers: u32,
    pub bellows_level: u32,
    pub natural_interval_ticks: u64,
    pub repair_progress: u32,
    pub iron_slag: u32,
    pub bonus_god_rate: f64,
    pub active_sword_modal: Option<Sword>,
    pub market_news: String,
    #[serde(default)]
    pub toast: String,
    #[serde(default)]
    pub toast_ticks: u32,
    #[serde(default = "default_station_mult")]
    pub station_mult: [f64; 3],
    #[serde(default)]
    pub market_tick_counter: u64,
    #[serde(default)]
    pub forge_qte_hits: u32,
    #[serde(default)]
    pub realm: RealmState,

    #[serde(default)]
    pub logs: VecDeque<String>,
    #[serde(default = "default_log_filter")]
    pub log_filter: LogFilter,
    #[serde(default)]
    pub flash_ticks: u32,
}

fn default_station_mult() -> [f64; 3] { [1.0, 1.0, 1.0] }
fn default_log_filter() -> LogFilter { LogFilter::All }

impl GameState {
    pub fn new() -> Self {
        let mut s = Self {
            strikes: 0,
            max_strikes: 63,
            level: 1,
            exp: 0,
            max_exp: 5000,
            coins: 500,
            backpack: Vec::new(),
            max_backpack: 20,
            pavilion_market: Vec::new(),
            max_pavilion: 20,
            auto_melt_common: false,
            auto_list_market: false,
            carbon_ratio: 0.14,
            apprentices: 0,
            max_apprentices: 10,
            sharpen_workers: 0,
            enchant_workers: 0,
            repair_workers: 0,
            bellows_level: 1,
            natural_interval_ticks: 10,
            repair_progress: 0,
            iron_slag: 0,
            bonus_god_rate: 0.005,
            active_sword_modal: None,
            market_news: "天道熔炉初始化完成！".to_string(),
            toast: String::new(),
            toast_ticks: 0,
            station_mult: [1.0, 1.0, 1.0],
            market_tick_counter: 0,
            forge_qte_hits: 0,
                realm: RealmState::new(),
                logs: VecDeque::with_capacity(30),
                log_filter: LogFilter::All,
                flash_ticks: 0,
        };
        s.reroll_station_mult(false);
        s
    }
}

#[derive(Clone)]
pub struct SharedGameState(pub Arc<RwLock<GameState>>);
