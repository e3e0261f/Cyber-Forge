use rand::Rng;
use crate::types::{Element, ForgeResult, Quality, Sword};

pub struct SwordGenerator;

impl SwordGenerator {
    const ELEMENTS: &'static [Element] = &[
        Element::Gold,
        Element::Wood,
        Element::Water,
        Element::Fire,
        Element::Earth,
    ];

    const PREFIXES: &'static [&'static str] = &[
        "锈蚀的", "半成品", "热锻", "冷淬", "油淬", "水淬", "真空熔", "天工",
        "赛博", "纳米", "超导", "量子", "低频", "高频", "残次", "返修",
        "宗门订制", "流民捡来的", "武馆淘汰", "供奉用", "私藏", "仿制",
        "陈浩南同款", "山鸡同款", "港风", "东洋传入", "苗疆", "塞外",
    ];

    /// 铁匠能锻的一切：兵刃、工具、构件、杂件
    const BASE_TYPES: &'static [&'static str] = &[
        // 飞剑 / 汉剑 / 苗刀
        "飞剑", "短飞剑", "重飞剑", "汉剑", "软剑", "苗刀", "窄刃苗刀", "宽刃苗刀",
        "绣春刀", "腰刀", "朴刀", "斩马刀", "大砍刀", "手刀",
        // 日本刀
        "打刀", "太刀", "胁差", "短刀", "薙刀", "长卷", "武士刀", "居合刀",
        // 匕首 / 菜刀 / 西瓜刀
        "匕首", "刺剑", "柳叶匕", "靴刀", "菜刀", "斩骨刀", "切片刀",
        "西瓜刀", "长西瓜刀", "短西瓜刀", "陈浩南的西瓜刀", "山鸡的西瓜刀",
        // 西洋 / 杂兵刃
        "阔剑", "刺剑", "军刀", "马刀", "钩镰", "戈头", "矛尖", "枪头",
        // 工具
        "铁锤", "羊角锤", "钳工锤", "凿子", "锉刀", "扳手", "活动扳手",
        "铁剪", "铁锯", "钻头", "镐头", "锄头", "镰刀", "斧头", "开山斧",
        "马蹄铁", "马掌钉", "门闩", "门锁芯", "合页", "门环", "窗钩",
        // 钟楼 / 机械构件
        "钟楼齿轮", "大钟摆锤", "发条盒", "擒纵轮", "指针轴", "钟乳配重",
        "塔钟轴承", "报刻拨杆", "铆钉组", "工字铁片", "角铁", "法兰盘",
        // 铁畜 / 铁玩
        "铁色子", "铁马", "铁牛", "铁鸡", "铁犬", "铁狮门环", "铁算盘珠",
        "压纸铁兽", "镇宅铁锚", "小铁锚", "秤砣", "砝码", "铁尺",
        // 赛博杂件
        "单分子刃胚", "链锯齿条", "等离子电极", "伺服关节", "散热肋片",
        "反应堆铆钉", "磁轨导片", "动能锤头",
    ];

    const SUFFIXES: &'static [&'static str] = &[
        "",
        "· 试作品",
        "· 量产型",
        "· 加固型",
        "· 破晓",
        "· 归墟",
        "· 绝响",
        "· 裂空",
        "· 溯源",
        "· 夜走",
        "· 雨打",
        "· 坊间",
        "· 武馆订货",
        "· 钟楼备件",
        "· 马厩急件",
        "· 港风传奇",
    ];

    pub fn generate(
        player_level: u32,
        carbon_ratio: f32,
        entropy_factor: u64,
        apprentices: u32,
        bonus_god_rate: f64,
        qte_hits: u32,
        max_strikes: u32,
    ) -> ForgeResult {
        let mut rng = rand::thread_rng();

        // 完美次数压失败率；全完美则必成
        let fail_rate = if max_strikes > 0 && qte_hits >= max_strikes {
            0.0
        } else if qte_hits >= 60 {
            0.01
        } else if qte_hits >= 50 {
            0.02
        } else if qte_hits >= 40 {
            0.05
        } else if qte_hits > 30 {
            0.10
        } else {
            0.28
        };

        if fail_rate > 0.0 && rng.gen_bool(fail_rate) {
            return ForgeResult::Shattered {
                slag_gained: 40 + rng.gen_range(0..80),
            };
        }

        let element = Self::ELEMENTS[rng.gen_range(0..Self::ELEMENTS.len())];
        let prefix = Self::PREFIXES[rng.gen_range(0..Self::PREFIXES.len())];
        let base = Self::BASE_TYPES[rng.gen_range(0..Self::BASE_TYPES.len())];
        let suffix = Self::SUFFIXES[rng.gen_range(0..Self::SUFFIXES.len())];

        let name = if suffix.is_empty() {
            format!("{}{}{}", prefix, element, base)
        } else {
            format!("{}{}{}{}", prefix, element, base, suffix)
        };

        let carbon_quality = if (0.7..=0.9).contains(&carbon_ratio) {
            1.5
        } else {
            0.85
        };
        let apprentice_markup = 1.0 + (apprentices as f64 * 0.08);
        let base_price =
            (player_level as f64 * 40.0 * carbon_quality * apprentice_markup) as u128;
        let mut final_price = base_price + (entropy_factor % 200) as u128;

        // 掉宝/品阶：bonus_god_rate 影响高阶概率（含 QTE 掉宝率）
        let mut roll: f64 = rng.gen_range(0.0..1.0);
        roll -= bonus_god_rate * 0.5; // 掉宝率推高阶
        let rank = if roll < bonus_god_rate * 0.15 {
            // 顶端附近
            rng.gen_range(50..=59)
        } else {
            // 等级与价格推基础阶，再抖动
            let from_price = ((final_price as f64).sqrt() / 3.0) as u8;
            let from_level = (player_level / 3) as u8;
            let base_r = from_price.max(from_level).min(45);
            let jitter = rng.gen_range(0u8..8);
            base_r.saturating_add(jitter).min(59)
        };
        // 完美击锤：每下至少 +1 阶，并额外吃掉宝率
        let qte_boost = qte_hits.min(30);
        let rank = (rank as u32 + qte_boost + if qte_hits > 0 { 2 } else { 0 }).min(59) as u8;
        let quality = Quality::new(rank);
        // 高阶抬价
        final_price = final_price.saturating_mul(1 + rank as u128 / 8);
        if qte_hits > 0 {
            final_price = final_price.saturating_add((qte_hits as u128) * 15);
        }

        ForgeResult::Success(Sword {
            id: entropy_factor ^ rng.gen::<u64>(),
            name,
            element,
            quality,
            price: final_price.max(1),
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
