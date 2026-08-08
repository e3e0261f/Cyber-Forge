use rand::Rng;
use crate::types::{Element, ForgeResult, Quality, Sword};

pub struct SwordGenerator;

impl SwordGenerator {
    const ELEMENTS: &'static [Element] = &[
        Element::Gold, Element::Wood, Element::Water, Element::Fire, Element::Earth,
    ];
    const PREFIXES: &'static [&'static str] = &[
        "锈蚀的", "废品电路线", "低频震荡", "超导脉冲",
        "金丹淬火", "量子纠缠", "零点发动的", "天道崩坏"
    ];
    const BASE_TYPES: &'static [&'static str] = &[
        "飞剑", "巨阙", "斩马刀", "汉剑", "软剑",
        "刺客短匕", "三尺青锋", "高频震动刀", "单分子光刃", "链锯大剑"
    ];
    const SUFFIXES: &'static [&'static str] = &[
        "· 破晓", "· 归墟", "· 灭度", "· 绝响", "· 寂灭", "· 裂空", "· 溯源"
    ];

    pub fn generate(
        player_level: u32,
        carbon_ratio: f32,
        entropy_factor: u64,
        apprentices: u32,
        bonus_god_rate: f64,
    ) -> ForgeResult {
        let mut rng = rand::thread_rng();

        if rng.gen_bool(0.33) {
            return ForgeResult::Shattered { slag_gained: 100 };
        }

        let element = Self::ELEMENTS[rng.gen_range(0..Self::ELEMENTS.len())];
        let prefix = Self::PREFIXES[rng.gen_range(0..Self::PREFIXES.len())];
        let base = Self::BASE_TYPES[rng.gen_range(0..Self::BASE_TYPES.len())];
        let suffix = Self::SUFFIXES[rng.gen_range(0..Self::SUFFIXES.len())];

        let name = format!("{} {} {} {}", element, prefix, base, suffix);

        let carbon_quality = if (0.7..=0.9).contains(&carbon_ratio) { 1.5 } else { 0.8 };
        let apprentice_markup = 1.0 + (apprentices as f64 * 0.10);
        let base_price = (player_level as f64 * 50.0 * carbon_quality * apprentice_markup) as u128;
        let final_price = base_price + (entropy_factor % 100) as u128;

        let god_roll: f64 = rng.gen_range(0.0..100.0);
        let quality = if god_roll < bonus_god_rate {
            Quality::Mythic
        } else {
            match final_price {
                0..=500 => Quality::Common,
                501..=2000 => Quality::Fine,
                2001..=10000 => Quality::Rare,
                10001..=50000 => Quality::Epic,
                _ => Quality::Legendary,
            }
        };

        ForgeResult::Success(Sword {
            id: entropy_factor,
            name,
            element,
            quality,
            price: final_price,
            carbon_ratio,
            forged_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
                             sharpness: 0,
                             enchantment: None,
                             is_reforged: false,
        })
    }
}
