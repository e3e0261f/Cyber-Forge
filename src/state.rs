use std::{fs, sync::Arc};
use tokio::sync::RwLock;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use crate::types::{Element, MarketListing, Quality, Sword};
use crate::realm::RealmState;

const SAVE_FILE_PATH: &str = "./cyber_forge.save";
const MARKET_REFRESH_TICKS: u64 = 6000;
const GOD_RATE_SOFT_CAP: f64 = 0.33;

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
}

fn default_station_mult() -> [f64; 3] {
    [1.0, 1.0, 1.0]
}

fn slag_of(q: Quality) -> u32 {
    q.slag_value()
}

#[derive(Serialize, Deserialize)]
struct SavePayload {
    data: String,
    hash: String,
}

impl Default for RealmState {
    fn default() -> Self {
        Self::new()
    }
}

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
            market_news: "天道熔炉初始化完成，欢迎来到赛博修真工坊！".to_string(),
            toast: String::new(),
            toast_ticks: 0,
            station_mult: [1.0, 1.0, 1.0],
            market_tick_counter: 0,
            forge_qte_hits: 0,
            realm: RealmState::new(),
        };
        s.reroll_station_mult(false);
        s
    }

    pub fn set_toast(&mut self, msg: impl Into<String>) {
        self.toast = msg.into();
        self.toast_ticks = 15;
    }

    pub fn tick_toast(&mut self) {
        if self.toast_ticks > 0 {
            self.toast_ticks -= 1;
            if self.toast_ticks == 0 {
                self.toast.clear();
            }
        }
    }

    pub fn update_max_strikes(&mut self) {
        self.max_strikes = match self.level {
            1..=10 => 63,
            11..=20 => 127,
            21..=35 => 255,
            36..=50 => 511,
            51..=70 => 1023,
            _ => 2055,
        };
    }

    pub fn get_backpack_upgrade_cost(&self) -> u128 {
        (500.0 * 1.0130f64.powi(self.max_backpack as i32 - 8)) as u128
    }
    pub fn get_next_apprentice_cost(&self) -> u128 {
        (200.0 * 1.0135f64.powi(self.apprentices as i32)) as u128
    }
    pub fn get_house_upgrade_cost(&self) -> u128 {
        let house_tier = (self.max_apprentices / 5) as i32 - 1;
        (1000.0 * 1.019f64.powi(house_tier.max(0))) as u128
    }
    pub fn get_pavilion_upgrade_cost(&self) -> u128 {
        (2000.0 * 1.0140f64.powi(self.max_pavilion as i32 - 5)) as u128
    }
    pub fn get_bellows_upgrade_cost(&self) -> u128 {
        (50.0 * 1.0145f64.powi(self.bellows_level as i32 - 1)) as u128
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
            self.market_news = RUMORS[rng.gen_range(0..RUMORS.len())].to_string();
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
            self.set_toast(format!(
                "厢房已满 ({}/{})，按 [R] 扩房",
                self.apprentices, self.max_apprentices
            ));
            return;
        }
        let cost = self.get_next_apprentice_cost();
        if self.coins < cost {
            self.set_toast(format!("招募失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.apprentices += 1;
        self.sharpen_workers += 1;
        self.set_toast(format!("第 {} 名学徒加入磨剑台", self.apprentices));
    }

    pub fn upgrade_house(&mut self) {
        let cost = self.get_house_upgrade_cost();
        if self.coins < cost {
            self.set_toast(format!("扩建房屋失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.max_apprentices += 5;
        self.set_toast(format!("厢房扩建，名额升至 {} 人", self.max_apprentices));
    }

    pub fn upgrade_pavilion(&mut self) {
        let cost = self.get_pavilion_upgrade_cost();
        if self.coins < cost {
            self.set_toast(format!("展位升级失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.max_pavilion += 1;
        self.set_toast(format!("展位增至 {} 个", self.max_pavilion));
    }

    pub fn upgrade_bellows(&mut self) {
        if self.natural_interval_ticks <= 10 {
            self.set_toast("挥锤速度已达极限 (1.0s/锤)");
            return;
        }
        let cost = self.get_bellows_upgrade_cost();
        if self.coins < cost {
            self.set_toast(format!("风箱升级失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.bellows_level += 1;
        self.natural_interval_ticks = (self.natural_interval_ticks - 5).max(10);
        self.set_toast(format!(
            "风箱 Lv.{}，锤速 {:.1}s/锤",
            self.bellows_level,
            self.natural_interval_ticks as f32 / 10.0
        ));
    }

    pub fn reassign_workers(&mut self, target_type: u8) {
        if self.apprentices == 0 {
            self.set_toast("无学徒，按 [A] 招募");
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
            }
            2 => {
                if self.sharpen_workers > 0 {
                    self.sharpen_workers -= 1;
                    self.enchant_workers += 1;
                } else if self.repair_workers > 0 {
                    self.repair_workers -= 1;
                    self.enchant_workers += 1;
                }
            }
            3 => {
                if self.sharpen_workers > 0 {
                    self.sharpen_workers -= 1;
                    self.repair_workers += 1;
                } else if self.enchant_workers > 0 {
                    self.enchant_workers -= 1;
                    self.repair_workers += 1;
                }
            }
            _ => {}
        }
        self.set_toast(format!(
            "磨剑台 {} · 附魔炉 {} · 精修坊 {}",
            self.sharpen_workers, self.enchant_workers, self.repair_workers
        ));
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
                let price = ((15_000f64) * mult) as u128;
                let reforged = Sword {
                    id: rng.gen(),
                    name: "天道重铸 · 极光飞剑".to_string(),
                    element: Element::Fire,
                    quality: Quality::new(32),
                    price,
                    carbon_ratio: 0.85,
                    forged_timestamp: 0,
                    sharpness: 100,
                    enchantment: Some(Element::Fire),
                    is_reforged: true,
                };
                if self.backpack.len() < self.max_backpack {
                    self.backpack.push(reforged.clone());
                    self.sort_backpack();
                    self.active_sword_modal = Some(reforged);
                    self.set_toast("精修坊重铸出史诗飞剑！");
                }
            }
        }
    }

    pub fn list_top_sword_to_market(&mut self) {
        self.sort_backpack();
        if self.backpack.is_empty() {
            self.set_toast("囊中无剑");
            return;
        }
        if self.pavilion_market.len() >= self.max_pavilion {
            self.set_toast("展位已满，按 [E] 扩柜");
            return;
        }
        let sword = self.backpack.remove(0);
        let fair = sword.price.max(1);
        // 起拍低于素质估价，留给道友抬价空间
        let start = ((fair as f64) * 0.72) as u128;
        self.pavilion_market.push(MarketListing {
            sword: sword.clone(),
            listed_price: start.max(1),
            listing_time: 0,
            fair_value: fair,
            bid_count: 0,
        });
        self.set_toast(format!(
            "[{}] 起拍 金{}（素质估价 金{}）",
            sword.name, start.max(1), fair
        ));
    }

    pub fn auto_fill_market(&mut self) {
        while self.pavilion_market.len() < self.max_pavilion && !self.backpack.is_empty() {
            self.sort_backpack();
            let sword = self.backpack.remove(0);
            let fair = sword.price.max(1);
            let start = ((fair as f64) * 0.72) as u128;
            self.pavilion_market.push(MarketListing {
                sword,
                listed_price: start.max(1),
                listing_time: 0,
                fair_value: fair,
                bid_count: 0,
            });
        }
    }

    pub fn toggle_auto_melt(&mut self) {
        self.auto_melt_common = !self.auto_melt_common;
        self.set_toast(if self.auto_melt_common {
            "自动熔炼凡品：开"
        } else {
            "自动熔炼凡品：关"
        });
    }

    pub fn toggle_auto_list(&mut self) {
        self.auto_list_market = !self.auto_list_market;
        self.set_toast(if self.auto_list_market {
            "自动上架：开"
        } else {
            "自动上架：关"
        });
        if self.auto_list_market {
            self.auto_fill_market();
        }
    }

    pub fn melt_all_backpack(&mut self) {
        if self.backpack.is_empty() {
            self.set_toast("囊中无剑可熔");
            return;
        }
        let count = self.backpack.len();
        let mut slag_total = 0u32;
        let mut cult_total = 0u128;
        let swords: Vec<Sword> = self.backpack.drain(..).collect();
        for sword in &swords {
            let slag = slag_of(sword.quality);
            let cult = sword.price / 10;
            slag_total += slag;
            cult_total += cult;
            self.realm.add_cultivation(cult);
            let bonus = ((sword.price as f64) * self.bonus_god_rate * 0.01) as u128;
            self.realm.add_cultivation(bonus);
        }
        let rate_before = self.bonus_god_rate;
        self.add_iron_slag(slag_total);
        let rate_after = self.bonus_god_rate;
        if (rate_after - rate_before).abs() > 1e-12 {
            self.set_toast(format!(
                "熔炼 {} 把：碎铁 +{}（现有 {}）｜极品机缘 {:.2}% → {:.2}%｜修仙经验 +{}",
                count, slag_total, self.iron_slag, rate_before * 100.0, rate_after * 100.0, cult_total
            ));
        } else {
            self.set_toast(format!(
                "熔炼 {} 把：碎铁 +{}（现有 {}）｜极品机缘 {:.2}%｜修仙经验 +{}",
                count, slag_total, self.iron_slag, rate_after * 100.0, cult_total
            ));
        }
    }

    pub fn process_immortal_buyers(&mut self) {
        if self.pavilion_market.is_empty() {
            return;
        }
        let mut rng = rand::thread_rng();
        // 复制索引，避免边改边借
        let n = self.pavilion_market.len();
        for i in (0..n).rev() {
            if i >= self.pavilion_market.len() {
                continue;
            }
            let listing = &self.pavilion_market[i];
            let q = listing.sword.quality;
            let fair = listing.fair_value.max(listing.sword.price).max(1);
            let bid = listing.listed_price;

            // 素质越高，越容易被路过道友盯上
            let notice = q.notice_chance();
            if !rng.gen_bool(notice) {
                continue;
            }

            // 加价：向估价上方冲，偶发天价
            let headroom = fair.saturating_sub(bid);
            let overshoot = if rng.gen_bool((0.02 + q.rank() as f64 * 0.002).min(0.2)) {
                // 天价：超过素质估价
                ((fair as f64) * rng.gen_range(1.15..2.4)) as u128
            } else if headroom > 0 {
                bid + (headroom as f64 * rng.gen_range(0.08..0.35)) as u128 + 1
            } else {
                // 已在估价附近，小幅再抬
                bid + ((fair as f64) * rng.gen_range(0.01..0.08)) as u128 + 1
            };

            let new_bid = overshoot.max(bid + 1);
            self.pavilion_market[i].listed_price = new_bid;
            self.pavilion_market[i].bid_count =
                self.pavilion_market[i].bid_count.saturating_add(1);

            let buyer_titles = ["过路散修", "云游剑客", "宗门执事", "藏宝阁暗桩", "富商修士"];
            let buyer = buyer_titles[rng.gen_range(0..buyer_titles.len())];

            // 加价后有概率直接拍下
            let take = q.take_chance();
            if rng.gen_bool(take) || self.pavilion_market[i].bid_count >= 8 {
                let sold = self.pavilion_market.remove(i);
                self.coins += sold.listed_price;
                let tag = if sold.listed_price >= sold.fair_value.saturating_mul(12) / 10 {
                    "天价成交"
                } else if sold.listed_price >= sold.fair_value {
                    "溢价成交"
                } else {
                    "成交"
                };
                self.set_toast(format!(
                    "{} {} [{}] 金{}（估价{}）",
                    buyer, tag, sold.sword.name, sold.listed_price, sold.fair_value
                ));
            } else if self.pavilion_market[i].bid_count <= 2 || rng.gen_bool(0.25) {
                self.set_toast(format!(
                    "{} 对 [{}] 加价 → 金{}",
                    buyer, self.pavilion_market[i].sword.name, new_bid
                ));
            }
        }
        if self.auto_list_market {
            self.auto_fill_market();
        }
    }

    pub fn add_iron_slag(&mut self, amount: u32) {
        self.iron_slag += amount;
        if self.iron_slag >= 1000 {
            let conversions = self.iron_slag / 1000;
            self.iron_slag %= 1000;
            self.bonus_god_rate =
                (self.bonus_god_rate + conversions as f64 * 0.01).min(GOD_RATE_SOFT_CAP);
        }
    }

    /// 每次完美 QTE +2% 掉宝率（可叠加），再与永久机缘合计
    pub fn effective_god_rate(&self, qte_hits: u32) -> f64 {
        let qte_bonus = qte_hits as f64 * 0.02;
        (self.bonus_god_rate + qte_bonus).min(GOD_RATE_SOFT_CAP + qte_bonus)
    }

    pub fn save_to_disk(&self) {
        if let Ok(data) = serde_json::to_string(self) {
            let mut hasher = Sha256::new();
            hasher.update(data.as_bytes());
            let hash = format!("{:x}", hasher.finalize());
            let payload = SavePayload { data, hash };
            if let Ok(file_content) = serde_json::to_string(&payload) {
                let _ = fs::write(SAVE_FILE_PATH, file_content);
            }
        }
    }

    pub fn load_from_disk() -> Self {
        if let Ok(file_content) = fs::read_to_string(SAVE_FILE_PATH) {
            if let Ok(payload) = serde_json::from_str::<SavePayload>(&file_content) {
                let mut hasher = Sha256::new();
                hasher.update(payload.data.as_bytes());
                let calculated = format!("{:x}", hasher.finalize());
                if calculated == payload.hash {
                    if let Ok(mut state) = serde_json::from_str::<GameState>(&payload.data) {
                        state.realm.soft_remap_from_exp();
                        return state;
                    }
                }
            }
            println!("⚡ 存档校验失败或格式过旧，天道打回重练（2.3 存档格式已升级）。");
        }
        Self::new()
    }
}

#[derive(Clone)]
pub struct SharedGameState(pub Arc<RwLock<GameState>>);
