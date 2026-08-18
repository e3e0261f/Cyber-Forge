use super::{AutoListTier, GameState, MARKET_REFRESH_TICKS, RUMORS};
use crate::game::types::MarketListing;
use rand::Rng;

impl GameState {
    pub fn reroll_station_mult(&mut self, announce: bool) {
        let mut rng = rand::thread_rng();
        for m in &mut self.station_mult {
            *m = rng.gen_range(0.75_f64..1.46_f64);
        }
        if announce {
            let rum = RUMORS[rng.gen_range(0..RUMORS.len())].to_string();
            self.market_news = rum.clone();
            self.push_log(format!("市井杂闻：{}", rum), false, false);
        }
    }

    pub fn tick_market_rumor(&mut self) {
        self.market_tick_counter = self.market_tick_counter.wrapping_add(1);
        if self.market_tick_counter >= MARKET_REFRESH_TICKS {
            self.market_tick_counter = 0;
            self.reroll_station_mult(true);
        }
    }

    pub fn list_top_sword_to_market(&mut self) {
        self.sort_backpack();
        // 家什锤不可上架
        let idx = self.backpack.iter().position(|s| !s.is_tool);
        let Some(idx) = idx else {
            self.set_toast("囊中无货可上架（锤属家什）");
            return;
        };
        let id = self.backpack[idx].id;
        self.list_sword_by_id(id);
    }

    pub fn list_sword_by_id(&mut self, id: u64) {
        let Some(idx) = self.backpack.iter().position(|s| s.id == id) else {
            self.set_toast("目标神兵已不在锦囊中");
            return;
        };
        if self.backpack[idx].is_tool {
            self.set_toast("家什锤不可上架拍卖");
            return;
        }
        if self.pavilion_market.len() >= self.max_pavilion {
            self.set_toast("展位已满，按 [E] 扩柜");
            return;
        }
        let sword = self.backpack.remove(idx);
        let fair = sword.price.max(1);
        let start = (fair / 10).max(1);

        let mut rng = rand::thread_rng();
        let roll: f64 = rng.gen_range(0.0..100.0);
        let hype_factor = if roll < 70.0 {
            rng.gen_range(0.3..=0.9)
        } else if roll < 90.0 {
            rng.gen_range(1.0..=1.8)
        } else {
            rng.gen_range(2.0..=5.0)
        };
        let init_time = rng.gen_range(90..=180);

        let msg = format!(
            "上架：[{}] 1折起拍 金{}（估价 金{}）",
            sword.name, start, fair
        );
        self.pavilion_market.push(MarketListing {
            sword,
            listed_price: start,
            listing_time: init_time,
            fair_value: fair,
            bid_count: 0,
            is_sold: false,
            sold_timer: 0,
            hype_factor,
            momentum: 0.0,
            chant_timer: 0,
            last_buyer_title: String::new(),
        });
        self.set_toast(&msg);
        self.push_log(msg, false, false);
    }

    pub fn process_auto_list(&mut self) {
        while self.pavilion_market.len() > self.max_pavilion {
            if let Some(idx) = self.pavilion_market.iter().rposition(|l| !l.is_sold) {
                let back = self.pavilion_market.remove(idx);
                if !back.is_sold {
                    self.backpack.push(back.sword);
                }
            } else {
                break;
            }
        }
        if self.list_tier == AutoListTier::Off || self.backpack.is_empty() {
            return;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // 展位硬上限 = max_pavilion（拍卖席不增加容量）
        let mut rng = rand::thread_rng();

        let mut i = 0;
        while self.pavilion_market.len() < self.max_pavilion && i < self.backpack.len() {
            let sword = &self.backpack[i];
            if sword.is_tool {
                i += 1;
                continue;
            }
            if sword.quality.rank() >= self.list_tier.min_rank()
                && now.saturating_sub(sword.forged_timestamp) >= 3
            {
                let listed_sword = self.backpack.remove(i);
                let fair = listed_sword.price.max(1);
                let start = (fair / 10).max(1);

                let roll: f64 = rng.gen_range(0.0..100.0);
                let hype_factor = if roll < 70.0 {
                    rng.gen_range(0.3..=0.9)
                } else if roll < 90.0 {
                    rng.gen_range(1.0..=1.8)
                } else {
                    rng.gen_range(2.0..=5.0)
                };
                let init_time = rng.gen_range(90..=180);

                let msg = format!(
                    "自动上架：[{}] 入包满3s 移至展位（1折起拍金{}）",
                    listed_sword.name, start
                );
                self.pavilion_market.push(MarketListing {
                    sword: listed_sword,
                    listed_price: start,
                    listing_time: init_time,
                    fair_value: fair,
                    bid_count: 0,
                    is_sold: false,
                    sold_timer: 0,
                    hype_factor,
                    momentum: 0.0,
                    chant_timer: 0,
                    last_buyer_title: String::new(),
                });
                self.push_log(msg, false, false);
            } else {
                i += 1;
            }
        }
    }

    pub fn auto_fill_market(&mut self) {
        self.process_auto_list();
    }

    // 拍场结算：大能道友出价【传说/神话】兵刃，支持【仙玉】免税直付！
    pub fn process_immortal_buyers(&mut self) {
        let mut rng = rand::thread_rng();
        // 云集道友 ABM：更新在场/竞价人数（即使暂无拍品也驱动进出）
        let active_lots = self.pavilion_market.iter().filter(|l| !l.is_sold).count();
        let hype = 1.0 + (self.auction_workers as f64 * 0.01).min(0.5);
        let traffic = 0.5 + (self.apprentices as f64 * 0.005).min(0.5);
        let _intents = self.market_swarm.step(&mut rng, active_lots, hype, traffic);

        if self.pavilion_market.is_empty() {
            return;
        }

        let w = self.auction_workers as u64;
        let teams = if w > 0 { (w + 9) / 10 } else { 1 };
        let ideal_headcount = teams * 10;
        let missing = ideal_headcount.saturating_sub(w);
        let efficiency_factor = ((100u64.saturating_sub(missing * 10)).max(10) as f64) / 100.0;

        let auctioneers = teams as usize;
        let tea_staff = w * 7 / 10;
        let appraisers = w * 2 / 10;

        let n = self.pavilion_market.len();

        for i in (0..n).rev() {
            if i >= self.pavilion_market.len() {
                continue;
            }

            if self.pavilion_market[i].is_sold {
                if self.pavilion_market[i].sold_timer > 0 {
                    self.pavilion_market[i].sold_timer -= 1;
                } else {
                    self.pavilion_market.remove(i);
                }
                continue;
            }

            if i >= auctioneers {
                continue;
            }

            if self.pavilion_market[i].listing_time > 0 {
                self.pavilion_market[i].listing_time -= 1;
            }

            if self.pavilion_market[i].chant_timer > 0 {
                self.pavilion_market[i].chant_timer -= 1;
                continue;
            }

            let q = self.pavilion_market[i].sword.quality;
            let fair = self.pavilion_market[i]
                .fair_value
                .max(self.pavilion_market[i].sword.price)
                .max(1);
            let bid = self.pavilion_market[i].listed_price;
            let sword_name = self.pavilion_market[i].sword.name.clone();

            let buyer_roll: f64 = rng.gen_range(0.0..100.0);
            let (buyer_title, base_jump_range, buyer_cap_mult, buyer_element) = if buyer_roll < 45.0
            {
                (
                    "过路散修",
                    0.05..=0.15,
                    0.85,
                    crate::game::types::Element::Earth,
                )
            } else if buyer_roll < 75.0 {
                (
                    "宗门执事",
                    0.15..=0.30,
                    1.25,
                    crate::game::types::Element::Gold,
                )
            } else if buyer_roll < 92.0 {
                (
                    "富商修士",
                    0.30..=0.60,
                    1.85,
                    crate::game::types::Element::Water,
                )
            } else {
                (
                    "合体老怪",
                    0.50..=1.50,
                    4.50,
                    self.pavilion_market[i].sword.element,
                )
            };

            let element_mult = if buyer_element == self.pavilion_market[i].sword.element {
                1.8
            } else {
                1.0
            };
            self.pavilion_market[i].momentum =
                (self.pavilion_market[i].bid_count as f64 * 0.15).min(1.5);

            let price_ratio = bid as f64 / fair as f64;
            let interest_factor = if price_ratio < 0.50 {
                1.00
            } else if price_ratio < 0.60 {
                0.95
            } else if price_ratio < 0.70 {
                0.90
            } else if price_ratio < 0.80 {
                0.80
            } else if price_ratio < 0.90 {
                0.70
            } else if price_ratio < 1.00 {
                0.60
            } else {
                0.50
            };
            let extreme_damping = if price_ratio <= 1.00 {
                1.0
            } else if price_ratio <= 1.10 {
                0.10
            } else if price_ratio <= 2.00 {
                0.01
            } else {
                0.001
            };

            let total_damping = interest_factor * extreme_damping;
            let hype = self.pavilion_market[i].hype_factor;
            let momentum = self.pavilion_market[i].momentum;
            let max_price_cap = (fair as f64 * hype * buyer_cap_mult * (1.0 + momentum)) as u128;

            if bid < max_price_cap && self.pavilion_market[i].listing_time > 0 {
                let notice_rate = (q.notice_chance() + appraisers as f64 * 0.02)
                    * hype
                    * (1.0 + momentum)
                    * total_damping
                    * efficiency_factor;

                if rng.gen_bool(notice_rate.clamp(0.0001, 0.70)) {
                    let is_impulsive = rng.gen_bool(0.05);
                    let impulse_mult = if is_impulsive {
                        rng.gen_range(1.8..=3.0)
                    } else {
                        1.0
                    };

                    let base_jump_pct = rng.gen_range(base_jump_range);
                    let tea_bonus_pct = (tea_staff as f64 * 0.001).min(0.10);
                    let total_jump_pct = (base_jump_pct + tea_bonus_pct)
                        * element_mult
                        * impulse_mult
                        * total_damping
                        * efficiency_factor;

                    let jump = ((fair as f64 * total_jump_pct) as u128).max(10);
                    let new_bid = (bid + jump).min(max_price_cap);

                    self.pavilion_market[i].listed_price = new_bid;
                    self.pavilion_market[i].bid_count += 1;
                    self.pavilion_market[i].last_buyer_title = buyer_title.to_string();

                    self.pavilion_market[i].chant_timer = rng.gen_range(6..=14);

                    let reset_time = rng.gen_range(20..=45);
                    if self.pavilion_market[i].listing_time < reset_time {
                        self.pavilion_market[i].listing_time = reset_time;
                    }

                    let tag = if is_impulsive {
                        "【斗气冲动】"
                    } else if element_mult > 1.0 {
                        "【五行特需】"
                    } else {
                        ""
                    };
                    if self.pavilion_market[i].bid_count <= 2 || rng.gen_bool(0.2) {
                        self.push_log(
                            format!(
                                "拍场抬价：{} {}对 [{}] 抬价 +金{} → 金{}",
                                buyer_title, tag, sword_name, jump, new_bid
                            ),
                            false,
                            false,
                        );
                    }
                }
            }

            if self.pavilion_market[i].listing_time == 0 {
                let final_price = self.pavilion_market[i].listed_price;
                self.pavilion_market[i].is_sold = true;
                self.pavilion_market[i].sold_timer = 3;

                // 核心：【传说/神话】品质或大能交易，概率以【仙玉】直付结算！
                let pays_in_jade = q.rank() >= 36 || rng.gen_bool(0.15);
                let currency_msg = if pays_in_jade {
                    let jade_earned = (final_price / 10_000).max(1);
                    self.jade += jade_earned;
                    format!("仙玉 {}", jade_earned)
                } else {
                    self.coins += final_price;
                    format!("金 {}", final_price)
                };

                let ratio_pct = (final_price as f64 / fair as f64 * 100.0) as u32;
                let is_sky_price = ratio_pct >= 180;
                let tag = if is_sky_price {
                    "爆火天价"
                } else {
                    "落槌成交"
                };
                let msg = format!(
                    "拍场落槌：{} [{}] 得 {}（估价{}%）",
                    tag, self.pavilion_market[i].sword.name, currency_msg, ratio_pct
                );

                self.push_log(msg, is_sky_price, is_sky_price);

                // 买家过境铁浆（element_match 用本帧 roll 近似即可；主要看头衔与成交）
                // 先 clone，避免 immutable borrow 与 &mut self 冲突
                let buyer = if self.pavilion_market[i].last_buyer_title.is_empty() {
                    "过路散修".to_string()
                } else {
                    self.pavilion_market[i].last_buyer_title.clone()
                };
                self.grant_visitor_slag(&buyer, element_mult > 1.0, false, true);
            }
        }
        if self.list_tier != AutoListTier::Off {
            self.process_auto_list();
        }
    }
}
