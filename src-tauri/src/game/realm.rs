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
    pub cultivation_exp: u128,
    #[serde(default)]
    pub realm_exp: u128,
    pub body: BodyStats,
    pub masterwork_count: u32,
    #[serde(default)]
    pub pending_breakthrough: bool,

    // 🌟 新增：历史最高战力底蕴字段
    #[serde(default = "default_max_level")]
    pub max_total_level: u32,
}

fn default_max_level() -> u32 { 1 }

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
            max_total_level: 1, // 🌟 必须在这里初始化
        }
    }

    pub fn total_level(&self) -> u32 {
        let current_calc = (self.realm as u32 - 1) * 10 + self.sub_level;
        std::cmp::max(current_calc, self.max_total_level)
    }

    pub fn cumulative_exp_for_layer(realm_idx: u32, layer: u32) -> u128 {
        let layer = layer.max(1);
        let t10 = Self::exp_to_perfection(realm_idx);
        if layer <= 10 {
            let l = layer as u128;
            (t10 * l * l) / 100
        } else {
            let extra = layer - 10;
            let mult = 10u128.saturating_mul(3u128.pow(extra.min(30) as u32));
            t10.saturating_mul(mult)
        }
    }

    pub fn exp_to_perfection(realm_idx: u32) -> u128 {
        let idx = realm_idx.max(1).min(12);
        10_000u128.saturating_mul(10u128.pow(idx - 1))
    }

    pub fn exp_to_next_layer(&self) -> u128 {
        let next = self.sub_level.saturating_add(1);
        let need = Self::cumulative_exp_for_layer(self.realm as u32, next);
        need.saturating_sub(self.realm_exp)
    }

    pub fn soft_remap_from_exp(&mut self) {
        let realm_idx = self.realm as u32;
        let exp = self.realm_exp;
        let mut layer = 1u32;

        let mut l = 1u32;
        while l < 100 {
            if exp >= Self::cumulative_exp_for_layer(realm_idx, l) {
                layer = l;
                l += 1;
            } else {
                break;
            }
        }
        self.sub_level = layer;
        self.pending_breakthrough = layer >= 10;

        // 🌟 核心：每次刷新时，自动更新历史巅峰等级，确保突破绝不回退
        let current_calc = (self.realm as u32 - 1) * 10 + self.sub_level;
        if current_calc > self.max_total_level {
            self.max_total_level = current_calc;
        }

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
            let spent = Self::cumulative_exp_for_layer(old_idx, self.sub_level);
            self.realm_exp = 0;
            let _ = spent;
            self.realm = Realm::from_index(old_idx + 1);
            self.sub_level = 1;
            self.pending_breakthrough = false;

            // 突破后立刻重新计算并固化巅峰等级
            let current_calc = (self.realm as u32 - 1) * 10 + self.sub_level;
            if current_calc > self.max_total_level {
                self.max_total_level = current_calc;
            }
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

    // 🌟 找回丢失的 title 方法
    pub fn title(&self) -> &'static str {
        TitleSystem::get_title_by_level(self.total_level().max(1))
    }
}
