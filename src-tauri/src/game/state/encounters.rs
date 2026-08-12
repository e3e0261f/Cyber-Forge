use rand::Rng;
use super::GameState;
use super::encounters_lore;
use crate::game::types::{Element, Quality, Sword};

impl GameState {
    pub fn process_encounters(&mut self) {
        let mut rng = rand::thread_rng();

        self.encounter_timer = rng.gen_range(1800..=3600);

        let b = &self.realm.body;
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();

        let base_luck = (b.spirit as f64 * 0.002 + b.qi_sense as f64 * 0.003 + b.physique as f64 * 0.005).max(0.01);
        let final_chance = (base_luck * self.bonus_god_rate).clamp(0.01, 0.40);

        // 1. 成功获得物品奇遇
        if rng.gen_bool(final_chance) && self.backpack.len() < self.max_backpack {
            let rank = (10 + (self.bonus_god_rate * 120.0) as u8).min(58);
            let is_special = rng.gen_bool(0.3);
            let name = if is_special { "太虚梦授剑" } else { "沉睡的古剑" };
            let el = [Element::Gold, Element::Wood, Element::Water, Element::Fire, Element::Earth][rng.gen_range(0..5)];

            let sword = Sword {
                id: rng.gen(),
                name: name.to_string(),
                element: el,
                quality: Quality::new(rng.gen_range(rank..=(rank + 6).min(59))),
                price: rng.gen_range(20_000..200_000),
                carbon_ratio: 0.80,
                forged_timestamp: ts,
                    sharpness: 50,
                    enchantment: if is_special { Some(el) } else { None },
                    is_reforged: false, is_tool: false,
            };

            let prefix = encounters_lore::random_success_prefix();
            let log_msg = format!("天道奇遇：{} [{}]！", prefix, sword.name);
            self.backpack.push(sword);
            self.sort_backpack();
            self.set_toast(&log_msg);
            self.push_log(log_msg, true, is_special);
            return;
        }

        // 2. 错失良机奇遇：增加错失计数（滋养精神力）+ 仙缘经验 (+12 ~ +99)
        self.missed_encounter_count += 1;
        self.sync_body_stats(); // 实时刷新精神力

        let cult_gain = rng.gen_range(12..=99) as u128;
        self.realm.add_cultivation(cult_gain);
        let missed_msg = encounters_lore::random_missed_lore(cult_gain);
        self.set_toast(&missed_msg);
        self.push_log(missed_msg, false, false);
    }
}
