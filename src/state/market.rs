use rand::Rng;
use super::{GameState, MARKET_REFRESH_TICKS, RUMORS};
use crate::types::MarketListing;

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
        if self.backpack.is_empty() { self.set_toast("囊中无剑"); return; }
        if self.pavilion_market.len() >= self.max_pavilion { self.set_toast("展位已满，按 [E] 扩柜"); return; }
        let sword = self.backpack.remove(0);
        let fair = sword.price.max(1);
        let start = ((fair as f64) * 0.72) as u128;
        let msg = format!("上架：[{}] 起拍 金{}（估价 金{}）", sword.name, start.max(1), fair);
        self.pavilion_market.push(MarketListing {
            sword,
            listed_price: start.max(1),
                                  listing_time: 120, // 2 分钟 (120 秒) 竞拍倒计时
                                  fair_value: fair,
                                  bid_count: 0,
        });
        self.set_toast(&msg);
        self.push_log(msg, false, false);
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
                                      listing_time: 120,
                                      fair_value: fair,
                                      bid_count: 0,
            });
        }
    }

    pub fn process_immortal_buyers(&mut self) {
        if self.pavilion_market.is_empty() { return; }
        let mut rng = rand::thread_rng();
        let n = self.pavilion_market.len();

        for i in (0..n).rev() {
            if i >= self.pavilion_market.len() { continue; }

            // 旧存档修复：若倒计时大于 120 秒，自动归位修剪
            if self.pavilion_market[i].listing_time > 120 {
                self.pavilion_market[i].listing_time = 120;
            }

            let q = self.pavilion_market[i].sword.quality;
            let fair = self.pavilion_market[i].fair_value.max(self.pavilion_market[i].sword.price).max(1);
            let bid = self.pavilion_market[i].listed_price;
            let sword_name = self.pavilion_market[i].sword.name.clone();

            // 120 秒倒计时递减
            if self.pavilion_market[i].listing_time > 0 {
                self.pavilion_market[i].listing_time -= 1;
            }

            // 竞价判定（仅在倒计时未结束时）
            if self.pavilion_market[i].listing_time > 0 && rng.gen_bool(q.notice_chance()) {
                let headroom = fair.saturating_sub(bid);
                let overshoot = if rng.gen_bool((0.02 + q.rank() as f64 * 0.002).min(0.2f64)) {
                    ((fair as f64) * rng.gen_range(1.15..2.4)) as u128
                } else if headroom > 0 {
                    bid + (headroom as f64 * rng.gen_range(0.08..0.35)) as u128 + 1
                } else {
                    bid + ((fair as f64) * rng.gen_range(0.01..0.08)) as u128 + 1
                };

                let new_bid = overshoot.max(bid + 1);
                self.pavilion_market[i].listed_price = new_bid;
                self.pavilion_market[i].bid_count = self.pavilion_market[i].bid_count.saturating_add(1);

                let buyer_titles = ["过路散修", "云游剑客", "宗门执事", "藏宝阁暗桩", "富商修士"];
                let buyer = buyer_titles[rng.gen_range(0..buyer_titles.len())];

                if self.pavilion_market[i].bid_count <= 2 || rng.gen_bool(0.2) {
                    self.set_toast(format!("{} 对 [{}] 加价 → 金{}", buyer, sword_name, new_bid));
                }
            }

            // 倒计时归零 -> 落槌成交！
            if self.pavilion_market[i].listing_time == 0 {
                let sold = self.pavilion_market.remove(i);
                self.coins += sold.listed_price;
                let is_sky_price = sold.listed_price >= sold.fair_value.saturating_mul(12) / 10;
                let tag = if is_sky_price { "天价落槌" } else { "拍卖落槌" };
                let msg = format!("落槌：{} [{}] 得金{}（估价金{}）", tag, sold.sword.name, sold.listed_price, sold.fair_value);
                self.set_toast(&msg);
                self.push_log(msg, is_sky_price, is_sky_price);
            }
        }
        if self.auto_list_market { self.auto_fill_market(); }
    }
}
