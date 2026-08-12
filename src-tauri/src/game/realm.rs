use serde::{Deserialize, Serialize};
use crate::game::titles::TitleSystem;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Realm {
    BodyRefining = 1,
    QiCondensation,
    SpiritFocus,
    GoldenCore,
    NascentSoul,
    GodTransformation,
    BodyIntegration,
    Mahayana,
    Immortal,
    Saint,
    HeavenlyDao,
    Supreme,
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

    pub fn from_index(i: u32) -> Self {
        match i {
            1 => Realm::BodyRefining,
            2 => Realm::QiCondensation,
            3 => Realm::SpiritFocus,
            4 => Realm::GoldenCore,
            5 => Realm::NascentSoul,
            6 => Realm::GodTransformation,
            7 => Realm::BodyIntegration,
            8 => Realm::Mahayana,
            9 => Realm::Immortal,
            10 => Realm::Saint,
            11 => Realm::HeavenlyDao,
            _ => Realm::Supreme,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyStats {
    pub physique: u64,
    pub qi_sense: u64,
    pub spirit: u64,
    pub core_count: u32,
    pub core_size: u64,
    pub core_refine: u32,
    pub infant_size: u64,
    pub infant_count: u32,
    pub infant_power: u64,
    pub qi_machine: u64,
    pub matrix: u64,
    pub law_shards: u32,
    pub anti_gravity: u64,
    pub tribulation: u64,
    pub causality: u64,
    pub law_control: u64,
    pub causal_mastery: u64,
    pub thermo: u64,
    pub entropy_switch: u64,
}

impl Default for BodyStats {
    fn default() -> Self {
        Self {
            physique: 1,
            qi_sense: 0,
            spirit: 0,
            core_count: 0,
            core_size: 0,
            core_refine: 0,
            infant_size: 0,
            infant_count: 0,
            infant_power: 0,
            qi_machine: 0,
            matrix: 0,
            law_shards: 0,
            anti_gravity: 0,
            tribulation: 0,
            causality: 0,
            law_control: 0,
            causal_mastery: 0,
            thermo: 0,
            entropy_switch: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealmState {
    pub realm: Realm,
    pub sub_level: u32,
    /// 生涯累计修仙经验（只增不减，供展示）
    pub cultivation_exp: u128,
    /// 本境界经验池（突破大境界时按规则结算）
    #[serde(default)]
    pub realm_exp: u128,
    pub body: BodyStats,
    pub masterwork_count: u32,
    #[serde(default)]
    pub pending_breakthrough: bool,
}

impl Default for RealmState {
    fn default() -> Self { Self::new() }
}

impl RealmState {
    pub fn new() -> Self {
        Self {
            realm: Realm::BodyRefining,
            sub_level: 1,
            cultivation_exp: 0,
            realm_exp: 0,
            body: BodyStats::default(),
            masterwork_count: 0,
            pending_breakthrough: false,
        }
    }

    pub fn total_level(&self) -> u32 {
        // 每境最多按 13 层计（10 圆满 + 3 极境）
        (self.realm as u32 - 1) * 13 + self.sub_level.min(13)
    }

    /// 本境界达到第 `layer` 层所需的累计经验（层内阈值）
    /// - 1～10：平滑爬到圆满；第 10 层阈值 = base(境界)
    /// - 11 / 12 / 13：相对第 10 层分别为 10× / 100× / 1000×
    pub fn cumulative_exp_for_layer(realm_idx: u32, layer: u32) -> u128 {
        let layer = layer.max(1).min(20);
        let t10 = Self::exp_to_perfection(realm_idx);
        if layer <= 10 {
            // 平方曲线：前几层快一点体感，接近圆满变沉
            let l = layer as u128;
            (t10 * l * l) / 100
        } else {
            // 11→10x, 12→100x, 13→1000x, 再往上继续 ×10
            let mult = 10u128.pow((layer - 10) as u32);
            t10.saturating_mul(mult)
        }
    }

    /// 该境界「10 层圆满」所需累计经验
    /// 炼体 1e4，炼气 1e5，… 每境 ×10
    pub fn exp_to_perfection(realm_idx: u32) -> u128 {
        let idx = realm_idx.max(1).min(12);
        10_000u128.saturating_mul(10u128.pow(idx - 1))
    }

    /// 当前层升级到下一层还差多少
    pub fn exp_to_next_layer(&self) -> u128 {
        let next = self.sub_level.saturating_add(1).min(13);
        let need = Self::cumulative_exp_for_layer(self.realm as u32, next);
        need.saturating_sub(self.realm_exp)
    }

    pub fn soft_remap_from_exp(&mut self) {
        let realm_idx = self.realm as u32;
        // 旧档仅有生涯经验时：不把生涯总量灌进本境池（否则会一键满层）
        // realm_exp 从 0 起重新走本境曲线；cultivation_exp 仍保留生涯展示

        let exp = self.realm_exp;
        let mut layer = 1u32;
        for l in 1..=13 {
            if exp >= Self::cumulative_exp_for_layer(realm_idx, l) {
                layer = l;
            } else {
                break;
            }
        }
        self.sub_level = layer;
        self.pending_breakthrough = layer >= 10;

        let tl = self.total_level() as u64;
        if realm_idx >= 4 {
            self.body.core_count = (tl / 20).max(1) as u32;
            self.body.core_size = tl * 3;
            self.body.core_refine = (tl / 10) as u32;
        }
        if realm_idx >= 5 {
            self.body.infant_size = tl * 2;
            self.body.infant_count = (tl / 30).max(1) as u32;
            self.body.infant_power = tl * 5;
        }
        if realm_idx >= 6 {
            self.body.qi_machine = tl * 4;
            self.body.matrix = tl;
        }
        if realm_idx >= 7 {
            self.body.law_shards = (tl / 15) as u32;
            self.body.anti_gravity = tl;
        }
        if realm_idx >= 8 {
            self.body.tribulation = tl * 2;
            self.body.causality = tl;
        }
    }

    pub fn manual_breakthrough(&mut self) -> bool {
        if self.sub_level >= 10 && (self.realm as u32) < 12 {
            let old_idx = self.realm as u32;
            // 极境突破：消耗达到当前层的累计经验，余量不带入下一境（防一键飞升）
            let spent = Self::cumulative_exp_for_layer(old_idx, self.sub_level);
            self.realm_exp = 0;
            let _ = spent;
            self.realm = Realm::from_index(old_idx + 1);
            self.sub_level = 1;
            self.pending_breakthrough = false;
            true
        } else {
            false
        }
    }

    pub fn add_cultivation(&mut self, amount: u128) {
        if amount == 0 {
            return;
        }
        self.cultivation_exp = self.cultivation_exp.saturating_add(amount);
        self.realm_exp = self.realm_exp.saturating_add(amount);
        self.soft_remap_from_exp();
    }

    pub fn title(&self) -> &'static str {
        TitleSystem::get_title_by_level(self.total_level().max(1))
    }
}
