use serde::{Deserialize, Serialize};

// ================================================================
// 梦幻西游式：回合制战斗系统
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnBasedCombat {
    pub rounds: Vec<RoundLog>,
    pub current_round: u32,
    pub max_rounds: u32,
    pub is_finished: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundLog {
    pub round: u32,
    pub turn_order: Vec<(String, u64)>, // (角色名, ID) 按速度排序
    pub actions: Vec<CombatAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatAction {
    pub actor_id: u64,
    pub actor_name: String,
    pub action_type: ActionType,
    pub target_id: u64,
    pub target_name: String,
    pub damage: f32,
    pub is_critical: bool,
    pub extra_effect: Option<String>, // "中毒", "冰冻", "连击" 等
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    Attack,    // 普通攻击
    Skill(String), // 技能名
    Heal,      // 治疗
    Buff,      // 增益
    Debuff,    // 减益
    Dodge,     // 躲避
    Dead,      // 死亡
}

// ================================================================
// 战斗结果 - 分数制（类似梦幻西游）
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatReward {
    pub exp: u64,
    pub gold: u64,
    pub items: Vec<(String, u32)>, // (物品名, 数量)
    pub contribution_score: u32, // 贡献度 (0-100)
    pub performance_score: u32,  // 表现分 (伤害、治疗等)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CombatResult {
    Victory { 
        rewards: CombatReward,
        survivors: Vec<u64>, 
    },
    Defeat { 
        survivors: Vec<u64>,
        penalty: u32, // 掉装备/经验百分比
    },
    Escape,
}

// ================================================================
// 任务系统 - 梦幻西游式多人合作
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QuestType {
    Main,           // 主线
    Daily,          // 日常
    Escort,         // 跑商/镖车 (护送NPC/物品)
    BeastCapture,   // 抓宝宝 (捕捉宠物)
    CopyDungeon,    // 副本 (多人团队)
    PvP,            // PvP
    Help,           // 帮派任务
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quest {
    pub id: u64,
    pub quest_type: QuestType,
    pub title: String,
    pub description: String,
    pub level_req: u32,
    pub max_players: u32,           // 最多几个人做这任务
    pub current_party: Vec<u64>,    // 当前参与者ID
    pub objectives: Vec<Objective>,
    pub progress: u32,
    pub rewards: QuestReward,
    pub time_limit: u32,            // 秒
    pub status: QuestStatus,
    pub dungeon_type: Option<String>, // 针对副本
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Objective {
    pub id: u32,
    pub description: String,
    pub target_count: u32,
    pub current_count: u32,
    pub objective_type: ObjectiveType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ObjectiveType {
    KillMobs { enemy_name: String, count: u32 },
    CollectItems { item_name: String, count: u32 },
    EscortNPC { npc_name: String, destination: String },
    CaptureBeasts { beast_name: String, count: u32 },
    DefendLocation { location: String, time_secs: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestReward {
    pub base_exp: u64,
    pub base_gold: u64,
    pub items: Vec<(String, u32)>,
    pub contribution_bonus: f32, // 1.0 = 100% (按贡献度分配)
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum QuestStatus {
    Available,
    InProgress,
    Completed,
    Abandoned,
}

// ================================================================
// 跑商系统 - "骑马跑商"复刻
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscortQuest {
    pub id: u64,
    pub npc_id: u64,
    pub npc_name: String,
    pub current_location: String,
    pub destination: String,
    pub waypoints: Vec<String>,
    pub current_waypoint: usize,
    pub difficulty: u32,    // 怪物难度等级
    pub enemy_encounters: u32, // 预计遭遇怪物数
    pub reward_multiplier: f32, // 根据难度的倍数
    pub party_members: Vec<u64>,
    pub is_completed: bool,
}

impl EscortQuest {
    /// 下一站位置和预计遭遇的怪物
    pub fn next_waypoint(&self) -> Option<(String, u32)> {
        if self.current_waypoint < self.waypoints.len() {
            Some((
                self.waypoints[self.current_waypoint].clone(),
                self.enemy_encounters,
            ))
        } else {
            None
        }
    }

    pub fn progress(&mut self) {
        self.current_waypoint += 1;
        if self.current_waypoint >= self.waypoints.len() {
            self.is_completed = true;
        }
    }
}

// ================================================================
// 宠物/宝宝系统 - 梦幻西游抓捕
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct Beast {\n    pub id: u64,\n    pub name: String,\n    pub level: u32,\n    pub species: String,     // "小白鼠", "蝙蝠", "蜘蛛" 等\n    pub rarity: Rarity,      // 稀有度\n    pub stats: BeastStats,\n    pub skills: Vec<String>,\n    pub tameness: f32,       // 0-1 驯服度\n    pub exp: u64,            // 宠物经验\n    pub owner_id: Option<u64>, // 拥有者ID\n}\n\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct BeastStats {\n    pub hp: u32,\n    pub mp: u32,\n    pub attack: u32,\n    pub defense: u32,\n    pub speed: u32,\n    pub magic: u32,\n}\n\n#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]\npub enum Rarity {\n    Common,\n    Rare,\n    Epic,\n    Legendary,\n}\n\nimpl Rarity {\n    pub fn capture_rate(&self) -> f32 {\n        match self {\n            Rarity::Common => 0.8,\n            Rarity::Rare => 0.5,\n            Rarity::Epic => 0.25,\n            Rarity::Legendary => 0.05,\n        }\n    }\n}\n\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct CaptureQuest {\n    pub id: u64,\n    pub target_beast: Beast,\n    pub max_attempts: u32,\n    pub current_attempts: u32,\n    pub is_captured: bool,\n    pub capturer_id: u64,\n    pub difficulty: u32,     // 宝宝难度等级\n}\n\n// ================================================================\n// 帮派/工会系统\n// ================================================================\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct Faction {\n    pub id: u64,\n    pub name: String,\n    pub leader_id: u64,\n    pub members: Vec<u64>,\n    pub level: u32,\n    pub funds: u64,\n    pub daily_quests: Vec<Quest>, // 帮派���常任务\n    pub reputation: i32,\n}\n\nimpl Faction {\n    pub fn add_member(&mut self, player_id: u64) -> bool {\n        if self.members.len() < 100 { // 帮派最大成员数\n            self.members.push(player_id);\n            true\n        } else {\n            false\n        }\n    }\n\n    pub fn remove_member(&mut self, player_id: u64) {\n        self.members.retain(|&id| id != player_id);\n    }\n}\n\n// ================================================================\n// 音效数据 - 为了那份回忆\n// ================================================================\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct SoundEffect {\n    pub name: String,\n    pub file: String,\n    pub volume: f32,\n    pub trigger: SoundTrigger,\n}\n\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub enum SoundTrigger {\n    CombatStart,\n    CriticalHit,\n    Victory,\n    LevelUp,\n    CatchBeast,\n    QuestComplete,\n    ItemObtain,\n}\n\npub struct AudioManager {\n    pub sounds: Vec<SoundEffect>,\n}\n\nimpl AudioManager {\n    pub fn new() -> Self {\n        Self {\n            sounds: vec![\n                SoundEffect {\n                    name: \"战斗开始\".to_string(),\n                    file: \"assets/audio/combat_start.mp3\".to_string(),\n                    volume: 0.7,\n                    trigger: SoundTrigger::CombatStart,\n                },\n                SoundEffect {\n                    name: \"暴击\".to_string(),\n                    file: \"assets/audio/critical.mp3\".to_string(),\n                    volume: 0.8,\n                    trigger: SoundTrigger::CriticalHit,\n                },\n                SoundEffect {\n                    name: \"胜利\".to_string(),\n                    file: \"assets/audio/victory.mp3\".to_string(),\n                    volume: 0.9,\n                    trigger: SoundTrigger::Victory,\n                },\n                SoundEffect {\n                    name: \"升级\".to_string(),\n                    file: \"assets/audio/levelup.mp3\".to_string(),\n                    volume: 1.0,\n                    trigger: SoundTrigger::LevelUp,\n                },\n                SoundEffect {\n                    name: \"抓宝宝\".to_string(),\n                    file: \"assets/audio/catch_beast.mp3\".to_string(),\n                    volume: 0.9,\n                    trigger: SoundTrigger::CatchBeast,\n                },\n            ],\n        }\n    }\n\n    pub fn get_sound(&self, trigger: &SoundTrigger) -> Option<&SoundEffect> {\n        self.sounds.iter().find(|s| s.trigger == trigger)\n    }\n}\n"