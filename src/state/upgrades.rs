use rand::Rng;
use super::GameState;
use crate::types::{Element, Quality, Sword};

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
        let msg = format!("风箱升级：Lv.{}，锤速 {:.1}s/锤", self.bellows_level, self.natural_interval_ticks as f32 / 10.0);
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
            }
            2 => {
                if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.enchant_workers += 1; }
                else if self.repair_workers > 0 { self.repair_workers -= 1; self.enchant_workers += 1; }
            }
            3 => {
                if self.sharpen_workers > 0 { self.sharpen_workers -= 1; self.repair_workers += 1; }
                else if self.enchant_workers > 0 { self.enchant_workers -= 1; self.repair_workers += 1; }
            }
            _ => {}
        }
        self.set_toast(format!("磨剑台 {} · 附魔炉 {} · 精修坊 {}", self.sharpen_workers, self.enchant_workers, self.repair_workers));
    }

    pub fn process_apprentice_work(&mut self) {
        if self.apprentices == 0 { return; }
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
                    let elements = [Element::Gold, Element::Wood, Element::Water, Element::Fire, Element::Earth];
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
                    let msg = format!("精修出炉：重铸史诗飞剑 [{}]", reforged.name);
                    self.backpack.push(reforged.clone());
                    self.sort_backpack();
                    self.active_sword_modal = Some(reforged);
                    self.set_toast(&msg);
                    self.push_log(msg, true, true);
                }
            }
        }
    }
}
