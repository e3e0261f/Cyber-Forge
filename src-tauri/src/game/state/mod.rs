pub mod actions;
pub mod encounters;
pub mod encounters_lore;
pub mod market;
pub mod save;
pub mod upgrades;

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::RwLock;
use serde::{Deserialize, Serialize};
use crate::game::types::{MarketListing, Sword};
use crate::game::realm::RealmState;

pub use save::save_file_path;
pub const MARKET_REFRESH_TICKS: u64 = 6000;
pub const GOD_RATE_SOFT_CAP: f64 = 0.33;

pub const RUMORS: &[&str] = &[
    "东街张家明日嫁女，鼓乐通宵。", "北巷老李昨夜归西，白幡已挂。",
"有人彩票刮中三等，正在酒楼请客。", "南门狗患又起，行人频频踩中。",
"城西王婆丢了只鹅，正满街喊。", "修士某在渡口摔了一跤，据说摔得很响。",
"今夜月色不错，却与你无关。", "西市豆腐摊今日晚开，原因不明。",
"有人在巷口连续打了二十个喷嚏。", "城东那棵歪树又掉下一根枯枝。",
"码头船工为争一根绳吵了半日。", "酒楼跑堂把热汤扣在了自己脚上。",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogFilter { All, Important, Masterwork }

impl LogFilter {
    pub fn name(&self) -> &'static str {
        match self { LogFilter::All => "全量", LogFilter::Important => "重要", LogFilter::Masterwork => "代表作" }
    }
    pub fn next(&self) -> Self {
        match self { LogFilter::All => LogFilter::Important, LogFilter::Important => LogFilter::Masterwork, LogFilter::Masterwork => LogFilter::All }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutoMeltTier { Off, Trash, Fine, Rare, Epic, All }

impl AutoMeltTier {
    pub fn name(&self) -> &'static str {
        match self {
            AutoMeltTier::Off => "关", AutoMeltTier::Trash => "凡品", AutoMeltTier::Fine => "上品及以下",
            AutoMeltTier::Rare => "稀有及以下", AutoMeltTier::Epic => "史诗及以下", AutoMeltTier::All => "全品质",
        }
    }
    pub fn next(&self) -> Self {
        match self {
            AutoMeltTier::Off => AutoMeltTier::Trash, AutoMeltTier::Trash => AutoMeltTier::Fine,
            AutoMeltTier::Fine => AutoMeltTier::Rare, AutoMeltTier::Rare => AutoMeltTier::Epic,
            AutoMeltTier::Epic => AutoMeltTier::All, AutoMeltTier::All => AutoMeltTier::Off,
        }
    }
    pub fn max_rank(&self) -> u8 {
        match self { AutoMeltTier::Off => 0, AutoMeltTier::Trash => 5, AutoMeltTier::Fine => 15, AutoMeltTier::Rare => 25, AutoMeltTier::Epic => 35, AutoMeltTier::All => 59 }
    }
    pub fn color_hex(&self) -> &'static str {
        match self {
            AutoMeltTier::Off => "#787878", AutoMeltTier::Trash => "#a0a0a0",
            AutoMeltTier::Fine => "#00ff7f", AutoMeltTier::Rare => "#00e5ff",
            AutoMeltTier::Epic => "#8a2be2", AutoMeltTier::All => "#ff0055",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutoListTier { Off, All, Fine, Rare, Epic, Legendary }

impl AutoListTier {
    pub fn name(&self) -> &'static str {
        match self {
            AutoListTier::Off => "关", AutoListTier::All => "全品质", AutoListTier::Fine => "上品及以上",
            AutoListTier::Rare => "稀有及以上", AutoListTier::Epic => "史诗及以上", AutoListTier::Legendary => "传说及以上",
        }
    }
    pub fn next(&self) -> Self {
        match self {
            AutoListTier::Off => AutoListTier::All, AutoListTier::All => AutoListTier::Fine,
            AutoListTier::Fine => AutoListTier::Rare, AutoListTier::Rare => AutoListTier::Epic,
            AutoListTier::Epic => AutoListTier::Legendary, AutoListTier::Legendary => AutoListTier::Off,
        }
    }
    pub fn min_rank(&self) -> u8 {
        match self { AutoListTier::Off => 255, AutoListTier::All => 0, AutoListTier::Fine => 6, AutoListTier::Rare => 16, AutoListTier::Epic => 26, AutoListTier::Legendary => 36 }
    }
    pub fn color_hex(&self) -> &'static str {
        match self {
            AutoListTier::Off => "#787878", AutoListTier::All => "#dcdcdc",
            AutoListTier::Fine => "#00ff7f", AutoListTier::Rare => "#00e5ff",
            AutoListTier::Epic => "#8a2be2", AutoListTier::Legendary => "#ffd700",
        }
    }
}

fn default_melt_tier() -> AutoMeltTier { AutoMeltTier::Off }
fn default_list_tier() -> AutoListTier { AutoListTier::Off }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub strikes: u32,
    #[serde(default)] pub total_strikes_count: u64,
    #[serde(default)] pub sub_strikes: f64,
    pub max_strikes: u32,
    pub level: u32,
    pub exp: u32,
    pub max_exp: u32,
    pub coins: u128,               // 金币
    #[serde(default)] pub copper: u128, // 铜钱 (凡间通用)
    #[serde(default)] pub jade: u128,   // 仙玉 (大能至高契约)
    pub backpack: Vec<Sword>,
    pub max_backpack: usize,
    pub pavilion_market: Vec<MarketListing>,
    pub max_pavilion: usize,
    #[serde(default = "default_melt_tier")] pub melt_tier: AutoMeltTier,
    #[serde(default = "default_list_tier")] pub list_tier: AutoListTier,
    pub carbon_ratio: f32,
    pub apprentices: u32,
    pub max_apprentices: u32,
    pub sharpen_workers: u32,
    pub enchant_workers: u32,
    pub repair_workers: u32,
    #[serde(default)] pub forge_workers: u32,
    #[serde(default)] pub auction_workers: u32,
    #[serde(default)] pub apprentice_forge_progress: f64,
    pub bellows_level: u32,
    pub natural_interval_ticks: u64,
    pub repair_progress: u32,
    pub iron_slag: u32,
    pub bonus_god_rate: f64,
    pub active_sword_modal: Option<Sword>,
    pub market_news: String,
    #[serde(default)] pub toast: String,
    #[serde(default)] pub toast_ticks: u32,
    #[serde(default = "default_station_mult")] pub station_mult: [f64; 3],
    #[serde(default)] pub market_tick_counter: u64,
    #[serde(default)] pub forge_qte_hits: f64,
    #[serde(default)] pub realm: RealmState,
    #[serde(default)] pub logs: VecDeque<String>,
    #[serde(default = "default_log_filter")] pub log_filter: LogFilter,
    #[serde(default)] pub log_scroll_offset: usize,
    #[serde(default)] pub flash_ticks: u32,
    #[serde(default = "default_hammer_level")] pub hammer_level: u32,
    #[serde(default = "default_encounter_timer")] pub encounter_timer: u32,
    #[serde(default)] pub master_shattered_count: u64,
    #[serde(default)] pub apprentice_shattered_count: u64,
    #[serde(default)] pub missed_encounter_count: u64,
    #[serde(default)] pub debug_mode: bool,
    #[serde(default)] pub market_swarm: crate::game::market_swarm::MarketSwarm,
}

fn default_station_mult() -> [f64; 3] { [1.0, 1.0, 1.0] }
fn default_log_filter() -> LogFilter { LogFilter::All }
fn default_hammer_level() -> u32 { 1 }
fn default_encounter_timer() -> u32 { 1800 }

impl GameState {
    pub fn hammer_power(&self) -> f64 { 1.0 + (self.hammer_level.saturating_sub(1)) as f64 * 0.1 }
    pub fn total_hammer_power(&self) -> f64 { self.hammer_power() + (self.realm.body.physique as f64 / 1000.0) }
    pub fn concurrent_hammers(&self) -> u32 { 1 + self.realm.body.infant_count.min(7) }
    pub fn concurrent_power_mul(&self) -> f64 { 1.0 + (self.realm.body.infant_power as f64 / 5000.0).min(1.0) }
    pub fn matrix_slots(&self) -> u32 { (1 + self.realm.body.matrix / 50).min(16) as u32 }
    pub fn qi_machine_speed_mul(&self) -> f64 { (1.0 + self.realm.body.qi_machine as f64 / 2000.0).min(2.0) }
    pub fn anti_gravity_floor_secs(&self) -> f64 { (1.0 - self.realm.body.anti_gravity as f64 / 2000.0).clamp(0.05, 1.0) }
    pub fn effective_interval_secs(&self) -> f64 {
        let base = self.natural_interval_ticks.max(1) as f64 / 10.0;
        let sped = base / self.qi_machine_speed_mul();
        if self.realm.body.anti_gravity > 0 { sped.max(self.anti_gravity_floor_secs()) }
        else { sped.max(base.min(1.0)) }
    }
    pub fn exp_multiplier(&self) -> f64 { (1.0 + self.realm.body.qi_sense as f64 * 0.001).min(2.0) }
    pub fn spirit_fail_reduction(&self) -> f64 { (self.realm.body.spirit as f64 / 100.0 * 0.01).min(0.30) }
    pub fn core_rank_boost(&self) -> u32 { self.realm.body.core_count.min(12) }
    pub fn core_fail_reduction(&self) -> f64 { (self.realm.body.core_refine as f64 * 0.002).min(0.20) }
    pub fn core_cult_bonus(&self) -> u128 { (self.realm.body.core_size / 50) as u128 }
    pub fn passive_qte_god_bonus(&self) -> f64 { (self.realm.body.causality as f64 / 2000.0 * 0.5).min(0.5) }
    pub fn toggle_debug_mode(&mut self) {
        self.debug_mode = !self.debug_mode;
        if self.debug_mode {
            self.coins = 1_000_000_000_000;
            self.copper = 1_000_000_000_000;
            self.jade = 1_000_000_000;
            self.set_toast("调试模式 ON：钱无限 · 经验泵");
        } else { self.set_toast("调试模式 OFF"); }
    }
    pub fn debug_tick_boost(&mut self) {
        if !self.debug_mode { return; }
        self.coins = self.coins.max(1_000_000_000_000);
        self.copper = self.copper.max(1_000_000_000_000);
        self.jade = self.jade.max(1_000_000_000);
        let need = self.realm.exp_to_next_layer().max(1);
        let base = crate::game::realm::RealmState::exp_to_perfection(self.realm.realm as u32);
        self.realm.add_cultivation(need.max(base / 20).max(100));
        self.exp = self.exp.saturating_add(500);
        if self.exp >= self.max_exp {
            self.level += 1; self.exp = 0;
            self.max_exp = (5000.0 * 1.25f64.powi(self.level as i32)) as u32;
            self.update_max_strikes();
        }
    }
    pub fn hammer_name(&self) -> &'static str {
        match self.hammer_level {
            1 => "凡铁锤", 2 => "精工锤", 3 => "高频震动锤", 4..=6 => "高能脉冲锤",
            7..=10 => "纳米重锤", 11..=15 => "量子重锤", 16..=22 => "星核巨锤",
            23..=30 => "虚空震天锤", 31..=40 => "因果律锻锤", 41..=50 => "天道炉火锤", _ => "熵增造物锤",
        }
    }
    pub fn get_hammer_upgrade_cost(&self) -> u128 { (100.0 * 1.25f64.powi(self.hammer_level as i32 - 1)) as u128 }
    pub fn sync_body_stats(&mut self) {
        self.realm.body.physique = (self.total_strikes_count / 100) + 1;
        self.realm.body.spirit = self.master_shattered_count + self.apprentice_shattered_count + self.missed_encounter_count;
    }
    pub fn new() -> Self {
        let mut s = Self {
            strikes: 0, total_strikes_count: 0, sub_strikes: 0.0, max_strikes: 63, level: 1, exp: 0, max_exp: 5000, coins: 500, copper: 10000, jade: 0,
            backpack: Vec::new(), max_backpack: 20, pavilion_market: Vec::new(), max_pavilion: 20, melt_tier: AutoMeltTier::Off,
            list_tier: AutoListTier::Off, carbon_ratio: 0.14, apprentices: 0, max_apprentices: 10, sharpen_workers: 0, enchant_workers: 0,
            repair_workers: 0, forge_workers: 0, auction_workers: 0, apprentice_forge_progress: 0.0, bellows_level: 1, natural_interval_ticks: 100,
            repair_progress: 0, iron_slag: 0, bonus_god_rate: 0.005, active_sword_modal: None, market_news: "天道熔炉初始化完成！".to_string(),
            toast: String::new(), toast_ticks: 0, station_mult: [1.0, 1.0, 1.0], market_tick_counter: 0, forge_qte_hits: 0.0, realm: RealmState::new(),
            logs: VecDeque::with_capacity(30), log_filter: LogFilter::All, log_scroll_offset: 0, flash_ticks: 0, hammer_level: 1, encounter_timer: 1800,
            master_shattered_count: 0, apprentice_shattered_count: 0, missed_encounter_count: 0, debug_mode: false, market_swarm: Default::default(),
        };
        s.reroll_station_mult(false);
        s.sync_body_stats();
        s.sync_equipped_hammer_tool();
        s
    }
}

#[derive(Clone)]
pub struct SharedGameState(pub Arc<RwLock<GameState>>);


