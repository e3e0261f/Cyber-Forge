use rand::Rng;

#[derive(Debug, Clone)]
pub enum Element { 金, 木, 水, 火, 土, 混沌 }

#[derive(Debug, Clone)]
pub struct Sword {
    pub name: String,
    pub price: u128,
    pub rarity_color: &'static str,
    pub element: Element,
    pub exp_reward: u32,
}

pub struct SwordGenerator;

impl SwordGenerator {
    const ELEMENTS: &'static [&'static str] = &["庚金", "乙木", "葵水", "丙火", "戊土"];
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

        // 1. 抽取矩阵成分
        let elem_str = Self::ELEMENTS[rng.gen_range(0..Self::ELEMENTS.len())];
        let prefix = Self::PREFIXES[rng.gen_range(0..Self::PREFIXES.len())];
        let base = Self::BASE_TYPES[rng.gen_range(0..Self::BASE_TYPES.len())];
        let suffix = Self::SUFFIXES[rng.gen_range(0..Self::SUFFIXES.len())];

        // 2. 拼接全名
        let name = format!("{} {} {} {}", elem_str, prefix, base, suffix);

        // 3. 碳含量与熵池加成计算
        let carbon_quality = if (0.7..=0.9).contains(&carbon_ratio) { 1.5 } else { 0.8 };
        let base_price = (player_level as f64 * 50.0 * carbon_quality) as u128;
        let final_price = base_price + (entropy_factor % 100) as u128;

        // 4. 品质判定与色彩分配
        let (rarity_color, exp_mult) = match final_price {
            0..=500 => ("\x1b[37m", 1.0),       // 白色普通
            501..=2000 => ("\x1b[32m", 1.2),    // 绿色优质
            2001..=10000 => ("\x1b[34m", 1.5),  // 蓝色稀有
            10001..=50000 => ("\x1b[35m", 2.0), // 紫色史诗
            _ => ("\x1b[33m", 3.0),             // 金色神兵
        };

        Sword {
            name,
            price: final_price,
            rarity_color,
            element: Element::火,
            exp_reward: (player_level * 10) + (final_price as f64 * 0.05 * exp_mult) as u32,
        }
    }
}
