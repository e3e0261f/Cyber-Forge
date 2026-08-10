use super::{GameState, AutoMeltTier, AutoListTier, GOD_RATE_SOFT_CAP, LogFilter};
use crate::types::Quality;

fn slag_of(q: Quality) -> u32 { q.slag_value() }

impl GameState {
    pub fn push_log(&mut self, msg: String, is_important: bool, is_masterwork: bool) {
        let allow = match self.log_filter {
            LogFilter::All => true,
            LogFilter::Important => is_important || is_masterwork,
            LogFilter::Masterwork => is_masterwork,
        };

        if allow {
            if self.logs.len() >= 25 {
                self.logs.pop_front();
            }
            self.logs.push_back(msg);
        }
    }

    pub fn toggle_log_filter(&mut self) {
        self.log_filter = self.log_filter.next();
        self.set_toast(format!("日志过滤器：{}", self.log_filter.name()));
    }

    pub fn scroll_log_up(&mut self) {
        if self.log_scroll_offset < self.logs.len().saturating_sub(1) {
            self.log_scroll_offset += 1;
        }
    }

    pub fn scroll_log_down(&mut self) {
        if self.log_scroll_offset > 0 {
            self.log_scroll_offset -= 1;
        }
    }

    pub fn trigger_flash(&mut self) { self.flash_ticks = 0; }
    pub fn tick_flash(&mut self) { if self.flash_ticks > 0 { self.flash_ticks -= 1; } }

    pub fn set_toast(&mut self, msg: impl Into<String>) {
        let s = msg.into();
        self.toast = s.clone();
        self.toast_ticks = 15;
    }

    pub fn tick_toast(&mut self) {
        if self.toast_ticks > 0 {
            self.toast_ticks -= 1;
            if self.toast_ticks == 0 { self.toast.clear(); }
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

    pub fn sort_backpack(&mut self) {
        self.backpack.sort_by(|a, b| b.price.cmp(&a.price));
    }

    pub fn toggle_auto_melt(&mut self) {
        self.melt_tier = self.melt_tier.next();
        self.set_toast(format!("自动熔炼档位：{}", self.melt_tier.name()));
    }

    pub fn toggle_auto_list(&mut self) {
        self.list_tier = self.list_tier.next();
        self.set_toast(format!("自动上架门槛：{}", self.list_tier.name()));
        if self.list_tier != AutoListTier::Off {
            self.process_auto_list();
        }
    }

    pub fn process_auto_melt(&mut self) {
        if self.melt_tier == AutoMeltTier::Off || self.backpack.is_empty() { return; }

        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        let max_target_rank = self.melt_tier.max_rank();

        let mut i = 0;
        while i < self.backpack.len() {
            let sword = &self.backpack[i];
            if sword.quality.rank() <= max_target_rank && now.saturating_sub(sword.forged_timestamp) >= 3 {
                let melt_sword = self.backpack.remove(i);
                let slag = slag_of(melt_sword.quality);
                let cult = melt_sword.price / 10;

                self.realm.add_cultivation(cult);
                self.add_iron_slag(slag);

                let log_msg = format!("自动熔炼：[{}] 入包满3s 化为碎铁+{}", melt_sword.name, slag);
                self.push_log(log_msg, false, false);
            } else {
                i += 1;
            }
        }
    }

    pub fn melt_lowest_sword(&mut self) {
        self.sort_backpack();
        if self.backpack.is_empty() { self.set_toast("囊中无剑可熔"); return; }

        let sword = self.backpack.pop().unwrap();
        let slag = slag_of(sword.quality);
        let cult = sword.price / 10;

        self.realm.add_cultivation(cult);
        let bonus = ((sword.price as f64) * self.bonus_god_rate * 0.01) as u128;
        self.realm.add_cultivation(bonus);

        self.add_iron_slag(slag);
        self.bonus_god_rate = (self.bonus_god_rate + 0.0005).min(GOD_RATE_SOFT_CAP);

        let msg = format!("手动熔炼：熔解 [{}]，碎铁 +{}，修仙 +{}，机缘上升！", sword.name, slag, cult);
        self.set_toast(&msg);
        self.push_log(msg, false, false);
    }

    pub fn add_iron_slag(&mut self, amount: u32) {
        self.iron_slag += amount;
        if self.iron_slag >= 1000 {
            let conversions = (self.iron_slag / 1000) as u64;
            self.iron_slag %= 1000;
            self.realm.body.qi_sense += conversions;
            let msg = format!("碎铁炼气：1000 碎铁凝融，气感 +{}（现气感 {}）", conversions, self.realm.body.qi_sense);
            self.push_log(msg, false, false);
        }
    }

    pub fn effective_god_rate(&self, qte_hits: f64) -> f64 {
        let qte_bonus = qte_hits * 0.02;
        (self.bonus_god_rate + qte_bonus).min(GOD_RATE_SOFT_CAP + qte_bonus)
    }
}
