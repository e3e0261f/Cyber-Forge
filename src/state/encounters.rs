use rand::Rng;
use super::GameState;
use crate::types::{Element, Quality, Sword};

impl GameState {
    pub fn process_encounters(&mut self) {
        if self.backpack.len() >= self.max_backpack { return; }

        let mut rng = rand::thread_rng();
        let b = &self.realm.body;
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();

        // 核心契约：前三境基础率 * 机缘比例（bonus_god_rate）直接相乘

        // 1. 练神境：神游太虚
        let spirit_base = (b.spirit as f64 * 0.005).max(0.0);
        let spirit_final = (spirit_base * self.bonus_god_rate).clamp(0.0, 0.25);
        if rng.gen_bool(spirit_final) {
            let el = [Element::Gold, Element::Fire, Element::Water][rng.gen_range(0..3)];
            let sword = Sword {
                id: rng.gen(),
                name: "太虚梦授剑".to_string(),
                element: el,
                quality: Quality::new(rng.gen_range(35..55)),
                price: rng.gen_range(80_000..300_000),
                carbon_ratio: 0.88,
                forged_timestamp: ts,
                    sharpness: 90,
                    enchantment: Some(el),
                    is_reforged: false,
            };
            let log_msg = format!("天道奇遇：梦授神兵 [{}] 入囊！", sword.name);
            self.backpack.push(sword);
            self.sort_backpack();
            self.set_toast(&log_msg);
            self.push_log(log_msg, true, true);
            return;
        }

        // 2. 炼气境：气机出土
        let qi_base = (b.qi_sense as f64 * 0.01).max(0.0);
        let qi_final = (qi_base * self.bonus_god_rate).clamp(0.0, 0.30);
        if rng.gen_bool(qi_final) {
            let el = [Element::Earth, Element::Wood][rng.gen_range(0..2)];
            let sword = Sword {
                id: rng.gen(),
                name: "沉睡的古剑".to_string(),
                element: el,
                quality: Quality::new(rng.gen_range(20..40)),
                price: rng.gen_range(15_000..60_000),
                carbon_ratio: 0.75,
                forged_timestamp: ts,
                    sharpness: 20,
                    enchantment: None,
                    is_reforged: false,
            };
            let log_msg = format!("天道奇遇：气机出土 [{}]！", sword.name);
            self.backpack.push(sword);
            self.sort_backpack();
            self.set_toast(&log_msg);
            self.push_log(log_msg, true, false);
            return;
        }

        // 3. 炼体境：体魄赠铁
        let phy_base = (b.physique as f64 * 0.02).max(0.1);
        let phy_final = (phy_base * self.bonus_god_rate).clamp(0.001, 0.35);
        if rng.gen_bool(phy_final) {
            let is_gem = rng.gen_bool(0.5);
            let (name, q, price) = if is_gem {
                ("蒙尘的星陨铁", 45, rng.gen_range(50_000..150_000))
            } else {
                ("垫桌脚的废铁", 2, rng.gen_range(10..100))
            };

            let sword = Sword {
                id: rng.gen(),
                name: name.to_string(),
                element: Element::Earth,
                quality: Quality::new(q),
                price,
                carbon_ratio: 0.10,
                forged_timestamp: ts,
                    sharpness: 0,
                    enchantment: None,
                    is_reforged: false,
            };
            let log_msg = format!("天道奇遇：邻居赠送 [{}]", name);
            self.backpack.push(sword);
            self.sort_backpack();
            self.set_toast(&log_msg);
            self.push_log(log_msg, is_gem, is_gem);
        }
    }
}
