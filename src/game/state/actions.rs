use super::{AutoMeltTier, GOD_RATE_SOFT_CAP, GameState, LogFilter};
use crate::game::types::Quality;

fn slag_of(q: Quality) -> u32 {
    q.slag_value()
}

impl GameState {
    // 智能调度：根据按住按键的时间长度，动态计算步长
    // duration_ms: 按键持续的时间
    #[allow(dead_code)]
    pub fn get_step_by_duration(duration_ms: u64) -> u32 {
        if duration_ms > 5000 {
            50
        }
        // 5秒后，50人/Tick
        else if duration_ms > 2000 {
            10
        }
        // 2秒后，10人/Tick
        else if duration_ms > 500 {
            2
        }
        // 0.5秒后，2人/Tick
        else {
            1
        } // 初始，1人/Tick
    }

    #[allow(dead_code)]
    pub fn reassign_workers_dynamic(&mut self, target_type: u8, duration_ms: u64) {
        if self.apprentices == 0 {
            return;
        }
        let step = Self::get_step_by_duration(duration_ms);

        // 实际调配人数 = min(剩余学徒数, step)
        let mut moved = 0u32;
        while moved < step {
            // 调度逻辑：从其他有人的岗位中抽取
            let source_ptr = match target_type {
                1 => {
                    if self.enchant_workers > 0 {
                        &mut self.enchant_workers
                    } else if self.repair_workers > 0 {
                        &mut self.repair_workers
                    } else if self.forge_workers > 0 {
                        &mut self.forge_workers
                    } else if self.auction_workers > 0 {
                        &mut self.auction_workers
                    } else {
                        break;
                    }
                }
                2 => {
                    if self.sharpen_workers > 0 {
                        &mut self.sharpen_workers
                    } else if self.repair_workers > 0 {
                        &mut self.repair_workers
                    } else if self.forge_workers > 0 {
                        &mut self.forge_workers
                    } else if self.auction_workers > 0 {
                        &mut self.auction_workers
                    } else {
                        break;
                    }
                }
                3 => {
                    if self.sharpen_workers > 0 {
                        &mut self.sharpen_workers
                    } else if self.enchant_workers > 0 {
                        &mut self.enchant_workers
                    } else if self.forge_workers > 0 {
                        &mut self.forge_workers
                    } else if self.auction_workers > 0 {
                        &mut self.auction_workers
                    } else {
                        break;
                    }
                }
                4 => {
                    if self.sharpen_workers > 0 {
                        &mut self.sharpen_workers
                    } else if self.enchant_workers > 0 {
                        &mut self.enchant_workers
                    } else if self.repair_workers > 0 {
                        &mut self.repair_workers
                    } else if self.auction_workers > 0 {
                        &mut self.auction_workers
                    } else {
                        break;
                    }
                }
                5 => {
                    if self.sharpen_workers > 0 {
                        &mut self.sharpen_workers
                    } else if self.enchant_workers > 0 {
                        &mut self.enchant_workers
                    } else if self.repair_workers > 0 {
                        &mut self.repair_workers
                    } else if self.forge_workers > 0 {
                        &mut self.forge_workers
                    } else {
                        break;
                    }
                }
                _ => break,
            };

            *source_ptr -= 1;
            match target_type {
                1 => self.sharpen_workers += 1,
                2 => self.enchant_workers += 1,
                3 => self.repair_workers += 1,
                4 => self.forge_workers += 1,
                5 => self.auction_workers += 1,
                _ => {}
            }
            moved += 1;
        }
        if moved > 0 {
            self.set_toast(format!(
                "调配+{}：磨{} 附{} 精{} 盲{} 拍{}",
                moved,
                self.sharpen_workers,
                self.enchant_workers,
                self.repair_workers,
                self.forge_workers,
                self.auction_workers
            ));
        }
    }
    // ... 其他原有方法保持不变 ...
    pub fn push_log(&mut self, msg: String, is_important: bool, is_masterwork: bool) {
        let allow = match self.log_filter {
            LogFilter::All => true,
            LogFilter::Important => is_important || is_masterwork,
            LogFilter::Masterwork => is_masterwork,
        };

        if allow {
            if self.logs.len() >= 500 {
                self.logs.pop_front();
            }
            self.logs.push_back(msg);
        }
    }

    #[allow(dead_code)]
    pub fn toggle_log_filter(&mut self) {
        self.log_filter = self.log_filter.next();
        self.set_toast(format!("日志过滤器：{}", self.log_filter.name()));
    }

    #[allow(dead_code)]
    pub fn scroll_log_up(&mut self) {
        if self.log_scroll_offset < self.logs.len().saturating_sub(1) {
            self.log_scroll_offset += 1;
        }
    }

    #[allow(dead_code)]
    pub fn scroll_log_down(&mut self) {
        if self.log_scroll_offset > 0 {
            self.log_scroll_offset -= 1;
        }
    }

    pub fn trigger_flash(&mut self) {
        self.flash_ticks = 0;
    }
    pub fn tick_flash(&mut self) {
        if self.flash_ticks > 0 {
            self.flash_ticks -= 1;
        }
    }

    pub fn set_toast(&mut self, msg: impl Into<String>) {
        let s = msg.into();
        self.toast = s.clone();
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

    pub fn sort_backpack(&mut self) {
        // 货在前（价高优先），家什锤沉底（永不被当成「最贵货」）
        self.backpack.sort_by(|a, b| match (a.is_tool, b.is_tool) {
            (false, true) => std::cmp::Ordering::Less,
            (true, false) => std::cmp::Ordering::Greater,
            _ => b.price.cmp(&a.price),
        });
    }

    pub fn stamp_backpack_cooldown(&mut self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        for s in &mut self.backpack {
            if !s.is_tool {
                s.forged_timestamp = now;
            }
        }
    }
    pub fn toggle_auto_melt(&mut self) {
        self.melt_tier = self.melt_tier.next();
        self.stamp_backpack_cooldown();
        self.set_toast(format!(
            "自动熔炼档位：{}（3秒后生效）",
            self.melt_tier.name()
        ));
    }
    pub fn toggle_auto_list(&mut self) {
        self.list_tier = self.list_tier.next();
        self.stamp_backpack_cooldown();
        self.set_toast(format!(
            "自动上架门槛：{}（3秒后生效，可连按G调档）",
            self.list_tier.name()
        ));
    }

    pub fn process_auto_melt(&mut self) {
        if self.melt_tier == AutoMeltTier::Off || self.backpack.is_empty() {
            return;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let max_target_rank = self.melt_tier.max_rank();

        let mut i = 0;
        while i < self.backpack.len() {
            let sword = &self.backpack[i];
            if sword.is_tool {
                i += 1;
                continue;
            }
            if sword.quality.rank() <= max_target_rank
                && now.saturating_sub(sword.forged_timestamp) >= 3
            {
                let melt_sword = self.backpack.remove(i);
                let slag = slag_of(melt_sword.quality);
                let cult = ((melt_sword.price as f64).sqrt() as u128 / 10)
                    .max(1)
                    .min(80);

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
        // 只熔货：家什锤永不进熔炉
        let idx = self.backpack.iter().rposition(|s| !s.is_tool);
        let Some(idx) = idx else {
            self.set_toast("囊中无货可熔（家什锤受天道保护）");
            return;
        };
        let id = self.backpack[idx].id;
        self.melt_sword_by_id(id);
    }

    pub fn melt_sword_by_id(&mut self, id: u64) {
        let Some(idx) = self.backpack.iter().position(|s| s.id == id) else {
            self.set_toast("目标神兵已不在锦囊中");
            return;
        };
        if self.backpack[idx].is_tool {
            self.set_toast("家什锤受天道保护，不可熔炼");
            return;
        }
        let sword = self.backpack.remove(idx);
        let slag = slag_of(sword.quality);
        let cult = ((sword.price as f64).sqrt() as u128 / 10).max(1).min(80);

        self.realm.add_cultivation(cult);
        let bonus = (((sword.price as f64).sqrt() * self.bonus_god_rate) as u128).min(40);
        self.realm.add_cultivation(bonus);

        self.add_iron_slag(slag);
        self.bonus_god_rate = (self.bonus_god_rate + 0.0005).min(GOD_RATE_SOFT_CAP);

        let msg = format!(
            "手动熔炼：熔解 [{}]，碎铁 +{}，修仙 +{}，机缘上升！",
            sword.name, slag, cult
        );
        self.set_toast(&msg);
        self.push_log(msg, false, false);
    }

    pub fn add_iron_slag(&mut self, amount: u32) {
        if amount == 0 {
            return;
        }
        let phy = self.realm.body.physique as f64;
        let qi = self.realm.body.qi_sense as f64;
        let mult = (1.0 + phy / 20000.0 + qi / 10000.0).min(1.50);
        let gained = ((amount as f64) * mult).round().max(1.0) as u32;
        self.iron_slag = self.iron_slag.saturating_add(gained);
        if self.iron_slag >= 1000 {
            let conversions = (self.iron_slag / 1000) as u64;
            self.iron_slag %= 1000;
            self.realm.body.qi_sense += conversions;
            self.push_log(
                format!(
                    "铁浆炼气：1000 铁浆凝融，气感 +{}（现气感 {}）",
                    conversions, self.realm.body.qi_sense
                ),
                false,
                false,
            );
        }
    }
    pub fn grant_visitor_slag(
        &mut self,
        buyer_title: &str,
        element_match: bool,
        impulsive: bool,
        deal_closed: bool,
    ) {
        let base: u32 = match buyer_title {
            "过路散修" => 1 + (self.iron_slag % 3),
            "宗门执事" => 2 + (self.iron_slag % 5),
            "富商修士" => 4 + (self.iron_slag % 9),
            "合体老怪" => 10 + (self.iron_slag % 19),
            _ => 2,
        };
        let mut gain = base;
        if element_match {
            gain = ((gain as f64) * 1.5).round() as u32;
        }
        if impulsive {
            gain = ((gain as f64) * 1.8).round() as u32;
        }
        if deal_closed {
            gain = gain.saturating_add(base / 2 + 1);
        }
        if gain == 0 {
            return;
        }
        self.add_iron_slag(gain);
        if deal_closed || gain >= 8 {
            let tag = if element_match && impulsive {
                "五行特需·斗气"
            } else if element_match {
                "五行特需"
            } else if impulsive {
                "斗气冲动"
            } else {
                "道韵残留"
            };
            self.push_log(
                format!(
                    "铁浆增益：{} 过境留下 {} 铁浆（{}）",
                    buyer_title, gain, tag
                ),
                false,
                false,
            );
        }
    }
    pub fn effective_god_rate(&self, qte_hits: f64) -> f64 {
        let qte_bonus = qte_hits * 0.02;
        (self.bonus_god_rate + qte_bonus).min(GOD_RATE_SOFT_CAP + qte_bonus)
    }
}
