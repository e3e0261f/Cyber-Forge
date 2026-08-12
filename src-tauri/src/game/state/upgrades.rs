use rand::Rng;
use super::GameState;
use crate::game::sword_gen::SwordGenerator;
use crate::game::types::{Element, ForgeResult, Quality, Sword};

impl GameState {
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

    pub fn upgrade_hammer(&mut self) {
        let cost = self.get_hammer_upgrade_cost();
        if self.coins < cost {
            self.set_toast(format!("升级锤子失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.hammer_level += 1;
        let name = self.hammer_name();
        let power = self.hammer_power();
        self.sync_equipped_hammer_tool();
        let msg = format!("重锤升阶：[{}] Lv.{}（1锤={:.1}下）·已装备", name, self.hammer_level, power);
        self.set_toast(&msg);
        self.push_log(msg, true, false);
    }

    /// 装备槽中的锤同步进背包家什区（不可熔、不可上架）
    pub fn sync_equipped_hammer_tool(&mut self) {
        use crate::game::types::{Element, Quality, Sword};
        let name = format!("【装备】{}", self.hammer_name());
        // 移除旧的装备锤标记
        self.backpack.retain(|s| !(s.is_tool && s.name.starts_with("【装备】")));
        self.backpack.push(Sword {
            id: 0x48414D4D_u64, // "HAMM"
            name,
            element: Element::Earth,
            quality: Quality::new((self.hammer_level.min(59)) as u8),
            price: 0,
            carbon_ratio: 0.0,
            forged_timestamp: 0,
            sharpness: self.hammer_level,
            enchantment: None,
            is_reforged: false,
            is_tool: true,
        });
    }

    pub fn hire_apprentice(&mut self) {
        if self.apprentices >= self.max_apprentices {
            self.set_toast(format!("厢房已满 ({}/{})，按 [R] 扩房", self.apprentices, self.max_apprentices));
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
        let msg = format!("招募学徒：第 {} 名学徒加入磨剑台", self.apprentices);
        self.set_toast(&msg);
        self.push_log(msg, false, false);
    }

    pub fn upgrade_house(&mut self) {
        let cost = self.get_house_upgrade_cost();
        if self.coins < cost {
            self.set_toast(format!("扩建失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.max_apprentices += 5;
        let msg = format!("厢房扩建：名额升至 {} 人", self.max_apprentices);
        self.set_toast(&msg);
        self.push_log(msg, false, false);
    }

    pub fn upgrade_pavilion(&mut self) {
        let cost = self.get_pavilion_upgrade_cost();
        if self.coins < cost {
            self.set_toast(format!("展位扩建失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.max_pavilion += 1;
        let msg = format!("展位扩建：升至 {} 个", self.max_pavilion);
        self.set_toast(&msg);
        self.push_log(msg, false, false);
    }

    pub fn upgrade_bellows(&mut self) {
        if self.natural_interval_ticks <= 10 {
            self.set_toast("风箱已达 500 阶天道极限 (1.0s/锤)");
            return;
        }
        let cost = self.get_bellows_upgrade_cost();
        if self.coins < cost {
            self.set_toast(format!("风箱升级失败：需要 金{}", cost));
            return;
        }
        self.coins -= cost;
        self.bellows_level += 1;

        let secs = (10.0 - (self.bellows_level as f64 - 1.0) * (9.0 / 499.0)).max(1.0);
        self.natural_interval_ticks = (secs * 10.0) as u64;

        let msg = format!("风箱升级：Lv.{}/500，锤速 {:.1}s/锤", self.bellows_level, secs);
        self.set_toast(&msg);
        self.push_log(msg, false, false);
    }

    pub fn reassign_workers(&mut self, target_type: u8) {
        if self.apprentices == 0 {
            self.set_toast("无学徒，按 [A] 招募");
            return;
        }
        match target_type {
            1 => {
                if self.enchant_workers > 0 { self.enchant_workers -= 1; self.sharpen_workers += 1; }
                else if self.repair_workers > 0 { self.repair_workers -= 1; self.sharpen_workers += 1; }
                else if self.forge_workers > 0 { self.forge_workers -= 1; self.sharpen_workers += 1; }
                else if self.auction_workers > 0 { self.auction_workers -= 1; self.sharpen_workers += 1; }
            }
            2 => {
                if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.enchant_workers += 1; }
                else if self.repair_workers > 0 { self.repair_workers -= 1; self.enchant_workers += 1; }
                else if self.forge_workers > 0 { self.forge_workers -= 1; self.enchant_workers += 1; }
                else if self.auction_workers > 0 { self.auction_workers -= 1; self.enchant_workers += 1; }
            }
            3 => {
                if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.repair_workers += 1; }
                else if self.enchant_workers > 0 { self.enchant_workers -= 1; self.repair_workers += 1; }
                else if self.forge_workers > 0 { self.forge_workers -= 1; self.repair_workers += 1; }
                else if self.auction_workers > 0 { self.auction_workers -= 1; self.repair_workers += 1; }
            }
            4 => {
                if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.forge_workers += 1; }
                else if self.enchant_workers > 0 { self.enchant_workers -= 1; self.forge_workers += 1; }
                else if self.repair_workers > 0 { self.repair_workers -= 1; self.forge_workers += 1; }
                else if self.auction_workers > 0 { self.auction_workers -= 1; self.forge_workers += 1; }
            }
            5 => {
                if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.auction_workers += 1; }
                else if self.enchant_workers > 0 { self.enchant_workers -= 1; self.auction_workers += 1; }
                else if self.repair_workers > 0 { self.repair_workers -= 1; self.auction_workers += 1; }
                else if self.forge_workers > 0 { self.forge_workers -= 1; self.auction_workers += 1; }
            }
            _ => {}
        }
        self.set_toast(format!(
            "磨剑 {} · 附魔 {} · 精修 {} · 盲锻 {} · 拍卖 {}",
            self.sharpen_workers, self.enchant_workers, self.repair_workers, self.forge_workers, self.auction_workers
        ));
    }

    /// 批量调配：把 n 名学徒调到指定岗位（从其他岗位抽）
    pub fn reassign_workers_n(&mut self, target_type: u8, n: u32) {
        if n == 0 { return; }
        if self.apprentices == 0 {
            self.set_toast("无学徒，按 [A] 招募");
            return;
        }
        let mut moved = 0u32;
        for _ in 0..n {
            let moved_one = match target_type {
                1 => {
                    if self.enchant_workers > 0 { self.enchant_workers -= 1; self.sharpen_workers += 1; true }
                    else if self.repair_workers > 0 { self.repair_workers -= 1; self.sharpen_workers += 1; true }
                    else if self.forge_workers > 0 { self.forge_workers -= 1; self.sharpen_workers += 1; true }
                    else if self.auction_workers > 0 { self.auction_workers -= 1; self.sharpen_workers += 1; true }
                    else { false }
                }
                2 => {
                    if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.enchant_workers += 1; true }
                    else if self.repair_workers > 0 { self.repair_workers -= 1; self.enchant_workers += 1; true }
                    else if self.forge_workers > 0 { self.forge_workers -= 1; self.enchant_workers += 1; true }
                    else if self.auction_workers > 0 { self.auction_workers -= 1; self.enchant_workers += 1; true }
                    else { false }
                }
                3 => {
                    if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.repair_workers += 1; true }
                    else if self.enchant_workers > 0 { self.enchant_workers -= 1; self.repair_workers += 1; true }
                    else if self.forge_workers > 0 { self.forge_workers -= 1; self.repair_workers += 1; true }
                    else if self.auction_workers > 0 { self.auction_workers -= 1; self.repair_workers += 1; true }
                    else { false }
                }
                4 => {
                    if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.forge_workers += 1; true }
                    else if self.enchant_workers > 0 { self.enchant_workers -= 1; self.forge_workers += 1; true }
                    else if self.repair_workers > 0 { self.repair_workers -= 1; self.forge_workers += 1; true }
                    else if self.auction_workers > 0 { self.auction_workers -= 1; self.forge_workers += 1; true }
                    else { false }
                }
                5 => {
                    if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.auction_workers += 1; true }
                    else if self.enchant_workers > 0 { self.enchant_workers -= 1; self.auction_workers += 1; true }
                    else if self.repair_workers > 0 { self.repair_workers -= 1; self.auction_workers += 1; true }
                    else if self.forge_workers > 0 { self.forge_workers -= 1; self.auction_workers += 1; true }
                    else { false }
                }
                _ => false,
            };
            if !moved_one { break; }
            moved += 1;
        }
        if moved > 0 {
            self.set_toast(format!(
                "批量×{}：磨{} 附{} 精{} 盲{} 拍{}",
                moved, self.sharpen_workers, self.enchant_workers, self.repair_workers, self.forge_workers, self.auction_workers
            ));
        } else {
            self.set_toast("无可调配学徒");
        }
    }

    pub fn process_apprentice_work(&mut self) {
        if self.apprentices == 0 { return; }

        let mut rng = rand::thread_rng();

        // 1. 盲锻坊：产出绝对 [无] 品阶 (Quality::new(0)) 农具工具，估价 15~80 铜钱
        if self.forge_workers > 0 {
            let gold_burn = (self.forge_workers as u128) * 10;
            if self.coins >= gold_burn {
                self.coins -= gold_burn;

                let slag_gain = self.forge_workers;
                self.add_iron_slag(slag_gain);

                self.apprentice_forge_progress += self.forge_workers as f64;

                while self.apprentice_forge_progress >= 630.0 && self.backpack.len() < self.max_backpack {
                    self.apprentice_forge_progress -= 630.0;

                    let base_type = SwordGenerator::random_base_type(&mut rng);

                    let sword = Sword {
                        id: rng.gen(),
                        name: format!("盲锻 · {}", base_type),
                        element: Element::Earth,
                        quality: Quality::new(0), // 100% 绝对 [无] 品阶（无品阶/无灵气）
                        price: rng.gen_range(15..=80), // 15~80 铜钱
                        carbon_ratio: 0.10,
                        forged_timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
                        sharpness: 0,
                        enchantment: None,
                        is_reforged: false, is_tool: false,
                    };

                    let log_msg = format!("徒弟盲锻出炉：[{}]（无品阶，估价 {} 铜钱）", sword.name, sword.price);
                    self.backpack.push(sword);
                    self.sort_backpack();
                    self.push_log(log_msg, false, false);
                }
            }
        }

        // 2. 磨剑台
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

        // 3. 附魔炉
        if self.enchant_workers > 0 && !self.backpack.is_empty() {
            let mult = self.station_mult[1];
            let workers = self.enchant_workers;
            for sword in &mut self.backpack {
                if sword.enchantment.is_none() && rng.gen_bool((0.15 * workers as f64).min(1.0)) {
                    let elements = [Element::Gold, Element::Wood, Element::Water, Element::Fire, Element::Earth];
                    sword.enchantment = Some(elements[rng.gen_range(0..elements.len())]);
                    let bump = ((sword.price as f64) * 0.25 * mult) as u128;
                    sword.price = sword.price.saturating_add(bump.max(1));
                }
            }
            self.sort_backpack();
        }

        // 4. 精修坊
        if self.repair_workers > 0 && self.iron_slag >= 100 {
            let progress_add = (self.repair_workers * 2).min(100);
            self.repair_progress += progress_add;
            if self.repair_progress >= 1000 {
                self.repair_progress = 0;
                self.iron_slag -= 100;

                let base_type = SwordGenerator::random_base_type(&mut rng);
                let qi_bonus = (self.realm.body.qi_sense / 50) as u8;

                if let ForgeResult::Success(mut sword) = SwordGenerator::generate(
                    self.level,
                    self.carbon_ratio,
                    rng.gen(),
                    self.apprentices,
                    0.0,
                    0,
                    63,
                    qi_bonus,
                    0.15, // 精修失败率略低
                    0,
                ) {
                    sword.name = format!("精修 · {}", base_type);
                    sword.sharpness = 100;
                    sword.is_reforged = true;

                    let mult = self.station_mult[2];
                    sword.price = ((sword.price as f64 * 0.30 * mult) as u128).max(1);

                    let log_msg = format!("学徒精修出炉：[{}]（估价金{}）", sword.name, sword.price);
                    self.backpack.push(sword);
                    self.sort_backpack();
                    self.push_log(log_msg, false, false);
                }
            }
        }
    }
}
