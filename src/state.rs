use std::{fs, sync::Arc};
use tokio::sync::RwLock;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use crate::types::{Element, MarketListing, Quality, Sword};

const SAVE_FILE_PATH: &str = "./cyber_forge.save";
/// 10 分钟 @ 100ms tick
const MARKET_REFRESH_TICKS: u64 = 6000;

const RUMORS: &[&str] = &[
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

    pub auto_recycle_trash: bool,
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

    /// 磨剑台 / 附魔炉 / 精修坊 当前估价系数（不对玩家显示）
    #[serde(default = "default_station_mult")]
    pub station_mult: [f64; 3],
    #[serde(default)]
    pub market_tick_counter: u64,
}

fn default_station_mult() -> [f64; 3] {
    [1.0, 1.0, 1.0]
}

#[derive(Serialize, Deserialize)]
struct SavePayload {
    state: GameState,
    hash: String,
}

impl GameState {
    pub fn new() -> Self {
        let mut s = Self {
            strikes: 0,
            max_strikes: 10,
            level: 1,
            exp: 0,
            max_exp: 100,
            coins: 1000,
            backpack: Vec::new(),
            max_backpack: 8,
            pavilion_market: Vec::new(),
            max_pavilion: 5,
            auto_recycle_trash: true,
            carbon_ratio: 0.85,
            apprentices: 0,
            max_apprentices: 5,
            sharpen_workers: 0,
            enchant_workers: 0,
            repair_workers: 0,
            bellows_level: 1,
            natural_interval_ticks: 100,
            repair_progress: 0,
            iron_slag: 0,
            bonus_god_rate: 0.05,
            active_sword_modal: None,
            market_news: "天道熔炉初始化完成，欢迎来到赛博修真工坊！".to_string(),
            station_mult: [1.0, 1.0, 1.0],
            market_tick_counter: 0,
        };
        s.reroll_station_mult(false);
        s
    }

    pub fn update_max_strikes(&mut self) {
        self.max_strikes = match self.level {
            1..=10 => 10,
            11..=20 => 30,
            21..=35 => 100,
            36..=50 => 300,
            51..=70 => 1000,
            _ => 5000,
        };
    }

    pub fn get_backpack_upgrade_cost(&self) -> u128 {
        (500.0 * 1.30f64.powi(self.max_backpack as i32 - 8)) as u128
    }

    pub fn get_next_apprentice_cost(&self) -> u128 {
        (200.0 * 1.35f64.powi(self.apprentices as i32)) as u128
    }

    pub fn get_house_upgrade_cost(&self) -> u128 {
        let house_tier = (self.max_apprentices / 5) as i32 - 1;
        (1000.0 * 1.50f64.powi(house_tier.max(0))) as u128
    }

    pub fn get_pavilion_upgrade_cost(&self) -> u128 {
        (2000.0 * 1.40f64.powi(self.max_pavilion as i32 - 5)) as u128
    }

    pub fn get_bellows_upgrade_cost(&self) -> u128 {
        (500.0 * 1.45f64.powi(self.bellows_level as i32 - 1)) as u128
    }

    pub fn sort_backpack(&mut self) {
        self.backpack.sort_by(|a, b| b.price.cmp(&a.price));
    }

    fn reroll_station_mult(&mut self, announce: bool) {
        let mut rng = rand::thread_rng();
        for m in &mut self.station_mult {
            *m = rng.gen_range(0.75_f64..1.46_f64);
        }
        if announce {
            let rumor = RUMORS[rng.gen_range(0..RUMORS.len())];
            self.market_news = rumor.to_string();
        }
    }

    pub fn tick_market_rumor(&mut self) {
        self.market_tick_counter = self.market_tick_counter.wrapping_add(1);
        if self.market_tick_counter >= MARKET_REFRESH_TICKS {
            self.market_tick_counter = 0;
            self.reroll_station_mult(true);
        }
    }

    pub fn hire_apprentice(&mut self) {
        if self.apprentices >= self.max_apprentices {
            self.market_news = format!(
                "❌ 厢房已满 ({}/{})，按 [R] 扩房！",
                                       self.apprentices, self.max_apprentices
            );
            return;
        }
        let cost = self.get_next_apprentice_cost();
        if self.coins < cost {
            self.market_news = format!("❌ 招募失败：需要 金{}。", cost);
            return;
        }

        self.coins -= cost;
        self.apprentices += 1;
        self.sharpen_workers += 1;
        self.market_news = format!("✨ 第 {} 名学徒加入磨剑台。", self.apprentices);
    }

    pub fn upgrade_house(&mut self) {
        let cost = self.get_house_upgrade_cost();
        if self.coins < cost {
            self.market_news = format!("❌ 扩房失败：需要 金{}。", cost);
            return;
        }
        self.coins -= cost;
        self.max_apprentices += 5;
        self.market_news = format!("🏰 厢房扩建，名额升至 {} 人。", self.max_apprentices);
    }

    pub fn upgrade_pavilion(&mut self) {
        let cost = self.get_pavilion_upgrade_cost();
        if self.coins < cost {
            self.market_news = format!("❌ 柜扩失败：需要 金{}。", cost);
            return;
        }
        self.coins -= cost;
        self.max_pavilion += 1;
        self.market_news = format!("🏛️ 展位增至 {} 个。", self.max_pavilion);
    }

    pub fn upgrade_bellows(&mut self) {
        if self.natural_interval_ticks <= 10 {
            self.market_news = "⚡ 风箱已达极限 (1.0s/锤)。".to_string();
            return;
        }
        let cost = self.get_bellows_upgrade_cost();
        if self.coins < cost {
            self.market_news = format!("❌ 风升失败：需要 金{}。", cost);
            return;
        }
        self.coins -= cost;
        self.bellows_level += 1;
        self.natural_interval_ticks = (self.natural_interval_ticks - 5).max(10);
        self.market_news = format!(
            "💨 风箱 Lv.{}，锤速 {:.1}s/锤。",
            self.bellows_level,
            self.natural_interval_ticks as f32 / 10.0
        );
    }

    pub fn reassign_workers(&mut self, target_type: u8) {
        if self.apprentices == 0 {
            self.market_news = "⚠️ 无学徒，按 [A] 招募。".to_string();
            return;
        }

        match target_type {
            1 => {
                if self.enchant_workers > 0 {
                    self.enchant_workers -= 1;
                    self.sharpen_workers += 1;
                } else if self.repair_workers > 0 {
                    self.repair_workers -= 1;
                    self.sharpen_workers += 1;
                }
                self.market_news = format!(
                    "磨剑台 {} · 附魔炉 {} · 精修坊 {}",
                    self.sharpen_workers, self.enchant_workers, self.repair_workers
                );
            }
            2 => {
                if self.sharpen_workers > 0 {
                    self.sharpen_workers -= 1;
                    self.enchant_workers += 1;
                } else if self.repair_workers > 0 {
                    self.repair_workers -= 1;
                    self.enchant_workers += 1;
                }
                self.market_news = format!(
                    "磨剑台 {} · 附魔炉 {} · 精修坊 {}",
                    self.sharpen_workers, self.enchant_workers, self.repair_workers
                );
            }
            3 => {
                if self.sharpen_workers > 0 {
                    self.sharpen_workers -= 1;
                    self.repair_workers += 1;
                } else if self.enchant_workers > 0 {
                    self.enchant_workers -= 1;
                    self.repair_workers += 1;
                }
                self.market_news = format!(
                    "磨剑台 {} · 附魔炉 {} · 精修坊 {}",
                    self.sharpen_workers, self.enchant_workers, self.repair_workers
                );
            }
            _ => {}
        }
    }

    pub fn process_apprentice_work(&mut self) {
        if self.apprentices == 0 {
            return;
        }

        if self.sharpen_workers > 0 && !self.backpack.is_empty() {
            let mult = self.station_mult[0];
            let workers = self.sharpen_workers;
            for sword in &mut self.backpack {
                if sword.sharpness < 100 {
                    sword.sharpness = (sword.sharpness + workers * 2).min(100);
                    let bump = ((sword.price as f64) * 0.01 * workers as f64 * mult) as u128;
                    sword.price = sword.price.saturating_add(bump.max(1));
                }
            }
            self.sort_backpack();
        }

        if self.enchant_workers > 0 && !self.backpack.is_empty() {
            let mult = self.station_mult[1];
            let workers = self.enchant_workers;
            let mut rng = rand::thread_rng();
            for sword in &mut self.backpack {
                if sword.enchantment.is_none() && rng.gen_bool((0.15 * workers as f64).min(1.0)) {
                    let elements = [
                        Element::Gold,
                        Element::Wood,
                        Element::Water,
                        Element::Fire,
                        Element::Earth,
                    ];
                    sword.enchantment = Some(elements[rng.gen_range(0..elements.len())]);
                    let bump = ((sword.price as f64) * 0.25 * mult) as u128;
                    sword.price = sword.price.saturating_add(bump.max(1));
                }
            }
            self.sort_backpack();
        }

        if self.repair_workers > 0 && self.iron_slag >= 100 {
            self.repair_progress += self.repair_workers * 5;
            if self.repair_progress >= 100 {
                self.repair_progress = 0;
                self.iron_slag -= 100;

                let mult = self.station_mult[2];
                let mut rng = rand::thread_rng();
                let base = 15_000u128;
                let price = ((base as f64) * mult) as u128;
                let reforged_sword = Sword {
                    id: rng.gen(),
                    name: "天道重铸 · 极光飞剑".to_string(),
                    element: Element::Fire,
                    quality: Quality::Epic,
                    price,
                    carbon_ratio: 0.85,
                    forged_timestamp: 0,
                        sharpness: 100,
                        enchantment: Some(Element::Fire),
                        is_reforged: true,
                };

                if self.backpack.len() < self.max_backpack {
                    self.backpack.push(reforged_sword.clone());
                    self.sort_backpack();
                    self.active_sword_modal = Some(reforged_sword);
                }
            }
        }
    }

    pub fn list_top_sword_to_market(&mut self) {
        self.sort_backpack();
        if self.backpack.is_empty() {
            self.market_news = "⚠️ 囊中无剑。".to_string();
            return;
        }
        if self.pavilion_market.len() >= self.max_pavilion {
            self.market_news = "❌ 展位已满，按 [E] 扩柜。".to_string();
            return;
        }

        let sword = self.backpack.remove(0);
        let listing_price = (sword.price as f64 * 1.2) as u128;
        self.pavilion_market.push(MarketListing {
            sword: sword.clone(),
                                  listed_price: listing_price,
                                  listing_time: 0,
        });
        self.market_news = format!("📦 [{}] 已架，价 金{}", sword.name, listing_price);
    }

    pub fn melt_all_backpack(&mut self) {
        if self.backpack.is_empty() {
            self.market_news = "⚠️ 囊中无剑可熔。".to_string();
            return;
        }

        let count = self.backpack.len();
        let mut slag = 0u32;
        for sword in self.backpack.drain(..) {
            let add = match sword.quality {
                Quality::Common => 5,
                Quality::Fine => 12,
                Quality::Rare => 30,
                Quality::Epic => 80,
                Quality::Legendary => 200,
                Quality::Mythic => 500,
            };
            slag += add;
        }
        self.add_iron_slag(slag);
        self.market_news = format!(
            "🔥 熔尽 {} 把，得碎铁 {}（现有 {}）。",
            count, slag, self.iron_slag
        );
    }

    pub fn process_immortal_buyers(&mut self) {
        if self.pavilion_market.is_empty() {
            return;
        }

        let mut rng = rand::thread_rng();
        if rng.gen_bool(0.25) {
            let idx = rng.gen_range(0..self.pavilion_market.len());
            let listing = self.pavilion_market.remove(idx);

            let buyer_titles = ["合体老怪", "赛博散修", "金丹长老", "虚空剑仙", "游方道人"];
            let buyer = buyer_titles[rng.gen_range(0..buyer_titles.len())];

            self.coins += listing.listed_price;
            self.market_news = format!(
                "✨ [{}] 竞买 [{}]，得 金{}。",
                buyer, listing.sword.name, listing.listed_price
            );
        }
    }

    pub fn add_iron_slag(&mut self, amount: u32) {
        self.iron_slag += amount;
        if self.iron_slag >= 1000 {
            let conversions = self.iron_slag / 1000;
            self.iron_slag %= 1000;
            self.bonus_god_rate += conversions as f64 * 0.1;
            self.exp += conversions * 200;
        }
    }

    pub fn save_to_disk(&self) {
        if let Ok(json_str) = serde_json::to_string(self) {
            let mut hasher = Sha256::new();
            hasher.update(json_str.as_bytes());
            let hash = format!("{:x}", hasher.finalize());

            let payload = SavePayload {
                state: self.clone(),
                hash,
            };
            if let Ok(file_content) = serde_json::to_string(&payload) {
                let _ = fs::write(SAVE_FILE_PATH, file_content);
            }
        }
    }

    pub fn load_from_disk() -> Self {
        if let Ok(file_content) = fs::read_to_string(SAVE_FILE_PATH) {
            if let Ok(payload) = serde_json::from_str::<SavePayload>(&file_content) {
                if let Ok(json_str) = serde_json::to_string(&payload.state) {
                    let mut hasher = Sha256::new();
                    hasher.update(json_str.as_bytes());
                    let calculated_hash = format!("{:x}", hasher.finalize());

                    if calculated_hash == payload.hash {
                        return payload.state;
                    }
                }
            }
            println!("⚡ 存档校验失败，天道降下天劫打回重练！");
        }
        Self::new()
    }
}

#[derive(Clone)]
pub struct SharedGameState(pub Arc<RwLock<GameState>>);

impl SharedGameState {
    pub async fn melt_all_backpack(&self) {
        let mut state = self.0.write().await;
        state.melt_all_backpack();
    }
}
