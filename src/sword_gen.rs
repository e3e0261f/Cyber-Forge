use rand::Rng;
use crate::types::{Element, Quality, Sword};

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

    pub fn generate(player_level: u32, carbon_ratio: f32, entropy_factor: u64) -> Sword {
        let mut rng = rand::thread_rng();

        let element = Self::ELEMENTS[rng.gen_range(0..Self::ELEMENTS.len())];
        let prefix = Self::PREFIXES[rng.gen_range(0..Self::PREFIXES.len())];
        let base = Self::BASE_TYPES[rng.gen_range(0..Self::BASE_TYPES.len())];
        let suffix = Self::SUFFIXES[rng.gen_range(0..Self::SUFFIXES.len())];

        let name = format!("{} {} {} {}", element, prefix, base, suffix);

        let carbon_quality = if (0.7..=0.9).contains(&carbon_ratio) { 1.5 } else { 0.8 };
        let base_price = (player_level as f64 * 50.0 * carbon_quality) as u128;
        let final_price = base_price + (entropy_factor % 100) as u128;

        let (quality, exp_mult) = match final_price {
            0..=500 => (Quality::Common, 1.0),
            501..=2000 => (Quality::Fine, 1.2),
            2001..=10000 => (Quality::Rare, 1.5),
            10001..=50000 => (Quality::Epic, 2.0),
            _ => (Quality::Legendary, 3.0),
        };

        Sword {
            id: entropy_factor,
            name,
            element,
            quality,
            price: final_price,
            exp_reward: (player_level * 10) + (final_price as f64 * 0.05 * exp_mult) as u32,
            carbon_ratio,
            forged_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        }
    }
}
