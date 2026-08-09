use serde::{Deserialize, Serialize};

/// 12大修仙境界枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Realm {
    BodyRefining = 1,   // 1. 炼体
    QiCondensation,     // 2. 炼气
    SpiritFocus,        // 3. 练神
    GoldenCore,         // 4. 金丹
    NascentSoul,        // 5. 元婴
    GodTransformation,  // 6. 化神
    BodyIntegration,    // 7. 合体
    Mahayana,           // 8. 大乘
    Immortal,           // 9. 仙人
    Saint,              // 10. 圣人
    HeavenlyDao,        // 11. 天道境
    Supreme,            // 12. 至尊境
}

impl Realm {
    pub fn name(&self) -> &'static str {
        match self {
            Realm::BodyRefining => "炼体",
            Realm::QiCondensation => "炼气",
            Realm::SpiritFocus => "练神",
            Realm::GoldenCore => "金丹",
            Realm::NascentSoul => "元婴",
            Realm::GodTransformation => "化神",
            Realm::BodyIntegration => "合体",
            Realm::Mahayana => "大乘",
            Realm::Immortal => "仙人",
            Realm::Saint => "圣人",
            Realm::HeavenlyDao => "天道境",
            Realm::Supreme => "至尊境",
        }
    }
}

/// 纯粹的修为状态模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealmState {
    pub realm: Realm,    // 当前大境界
    pub sub_level: u32,  // 小层级 (1-10 常规，11+ 极境破限)
}

impl RealmState {
    pub fn new() -> Self {
        Self {
            realm: Realm::BodyRefining,
            sub_level: 1,
        }
    }

    /// 计算全局总权重等级，用于装备、剑品质或藏宝阁判定
    pub fn total_level(&self) -> u32 {
        let base = (self.realm as u32 - 1) * 15;
        base + self.sub_level
    }

    /// 是否处于极境
    pub fn is_limbo(&self) -> bool {
        self.sub_level > 10
    }
}
