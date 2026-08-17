use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ================================================================
// 多人队伍系统 - "组队打怪"的爽感
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Party {
    pub id: u64,
    pub leader_id: u64,
    pub members: Vec<PartyMember>,
    pub max_members: u32,
    pub created_at: u64,
    pub experience_distribution: DistributionMethod,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyMember {
    pub player_id: u64,
    pub player_name: String,
    pub level: u32,
    pub contribution: ContributionStats,
    pub joined_at: u64,
}

/// 贡献统计 - 帮别人打怪时计算
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionStats {
    pub damage_dealt: u64,      // 造成的伤害
    pub damage_taken: u64,      // 承受的伤害
    pub healing_done: u64,      // 治疗量
    pub kills: u32,             // 击杀数
    pub assists: u32,           // 助攻数
    pub deaths: u32,            // 死亡数
    pub buff_applied: u32,      // 增益buff数
    pub debuff_applied: u32,    // 减益buff数
}

impl ContributionStats {
    pub fn new() -> Self {
        Self {
            damage_dealt: 0,
            damage_taken: 0,
            healing_done: 0,
            kills: 0,
            assists: 0,
            deaths: 0,
            buff_applied: 0,
            debuff_applied: 0,
        }
    }

    /// 计算贡献度分数 (0-100)
    pub fn calculate_contribution_score(&self, total_damage: u64) -> u32 {
        let mut score = 0u32;

        // 伤害贡献 (50%)
        let damage_ratio = if total_damage > 0 {
            (self.damage_dealt as f32 / total_damage as f32).min(1.0)
        } else {
            0.0
        };
        score += (damage_ratio * 50.0) as u32;

        // 治疗贡献 (20%)
        score += (self.healing_done / 100).min(20) as u32;

        // 控制/辅助 (20%)
        score += ((self.buff_applied + self.debuff_applied) / 5).min(20) as u32;

        // 生存度 (10%)
        if self.deaths == 0 {
            score += 10;
        } else {
            score = score.saturating_sub(5 * self.deaths);
        }

        score.min(100)
    }
}

/// 经验分配方式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DistributionMethod {
    Equal,          // 平均分配
    ByContribution, // 按贡献度分配 (推荐)
    ByLevel,        // 按等级分配
    Leader,         // 全给队长
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyReward {
    pub base_exp: u64,
    pub base_gold: u64,
    pub items: Vec<(String, u32)>,
    pub member_rewards: HashMap<u64, IndividualReward>, // player_id -> 个人奖励
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndividualReward {
    pub player_id: u64,
    pub player_name: String,
    pub exp_received: u64,
    pub gold_received: u64,
    pub items_received: Vec<(String, u32)>,
    pub contribution_score: u32,
    pub bonus_multiplier: f32, // 贡献度高的人获得额外奖励
}

impl Party {
    pub fn new(leader_id: u64, leader_name: String, leader_level: u32, max_members: u32) -> Self {
        let mut members = Vec::new();
        members.push(PartyMember {
            player_id: leader_id,
            player_name: leader_name,
            level: leader_level,
            contribution: ContributionStats::new(),
            joined_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        });

        Self {
            id: rand::random(),
            leader_id,
            members,
            max_members,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            experience_distribution: DistributionMethod::ByContribution,
        }
    }

    /// 加入队伍
    pub fn add_member(&mut self, player_id: u64, player_name: String, level: u32) -> Result<(), String> {
        if self.members.len() >= self.max_members as usize {
            return Err("队伍已满".to_string());
        }

        if self.members.iter().any(|m| m.player_id == player_id) {
            return Err("该玩家已在队伍中".to_string());
        }

        self.members.push(PartyMember {
            player_id,
            player_name,
            level,
            contribution: ContributionStats::new(),
            joined_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        });

        Ok(())
    }

    /// 移除成员
    pub fn remove_member(&mut self, player_id: u64) -> Result<(), String> {
        if self.leader_id == player_id && self.members.len() > 1 {
            return Err("队长无法离队".to_string());
        }

        self.members.retain(|m| m.player_id != player_id);
        Ok(())
    }

    /// 解散队伍
    pub fn disband(&mut self) {
        self.members.clear();
    }

    /// 计算并分配战斗奖励
    pub fn calculate_rewards(&self, base_exp: u64, base_gold: u64, items: Vec<(String, u32)>) -> PartyReward {
        let mut member_rewards = HashMap::new();
        
        // 计算总伤害
        let total_damage: u64 = self.members.iter().map(|m| m.contribution.damage_dealt).sum();

        for member in &self.members {
            let contribution_score = member.contribution.calculate_contribution_score(total_damage);
            
            // 根据分配方式计算倍数
            let multiplier = match self.experience_distribution {
                DistributionMethod::Equal => 1.0,
                DistributionMethod::ByContribution => {
                    (contribution_score as f32 / 100.0).max(0.5) // 最少50%
                }
                DistributionMethod::ByLevel => {
                    let avg_level = self.members.iter().map(|m| m.level as f32).sum::<f32>() / self.members.len() as f32;
                    (member.level as f32 / avg_level).min(1.5).max(0.5)
                }
                DistributionMethod::Leader => {
                    if member.player_id == self.leader_id {
                        2.0
                    } else {
                        0.5
                    }
                }
            };

            let member_count = self.members.len() as f32;
            let exp_share = ((base_exp as f32 / member_count) * multiplier) as u64;
            let gold_share = ((base_gold as f32 / member_count) * multiplier) as u64;

            member_rewards.insert(
                member.player_id,
                IndividualReward {
                    player_id: member.player_id,
                    player_name: member.player_name.clone(),
                    exp_received: exp_share,
                    gold_received: gold_share,
                    items_received: Vec::new(),
                    contribution_score,
                    bonus_multiplier: multiplier,
                },
            );
        }

        PartyReward {
            base_exp,
            base_gold,
            items,
            member_rewards,
        }
    }

    /// 获取队伍总战力
    pub fn get_total_power(&self) -> u32 {
        self.members.iter().map(|m| m.level).sum()
    }

    /// 获取队伍平均等级
    pub fn get_avg_level(&self) -> u32 {
        if self.members.is_empty() {
            0
        } else {
            self.members.iter().map(|m| m.level as u64).sum::<u64>() as u32 / self.members.len() as u32
        }
    }
}

// ================================================================
// "帮别人打怪" - 助人利他的爽感系统
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistanceRequest {
    pub id: u64,
    pub requester_id: u64,
    pub requester_name: String,
    pub requester_level: u32,
    pub location: String,
    pub dungeon_name: String,
    pub difficulty: u32,
    pub max_helpers: u32,
    pub current_helpers: Vec<u64>,
    pub status: AssistanceStatus,
    pub reward_pool: AssistanceReward,
    pub created_at: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum AssistanceStatus {
    Open,       // 开放招募
    InProgress, // 进行中
    Completed,  // 完成
    Failed,     // 失败
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistanceReward {
    pub base_exp: u64,
    pub base_gold: u64,
    pub karma_points: u32,  // 因果值/善恶值
    pub helper_bonus: f32,  // 帮手的额外奖励倍数
}

impl AssistanceRequest {
    pub fn new(
        requester_id: u64,
        requester_name: String,
        requester_level: u32,
        location: String,
        dungeon_name: String,
        difficulty: u32,
    ) -> Self {
        Self {
            id: rand::random(),
            requester_id,
            requester_name,
            requester_level,
            location,
            dungeon_name,
            difficulty,
            max_helpers: 3, // 最多3个帮手
            current_helpers: Vec::new(),
            status: AssistanceStatus::Open,
            reward_pool: AssistanceReward {
                base_exp: 500 + (difficulty as u64 * 100),
                base_gold: 100 + (difficulty as u64 * 20),
                karma_points: 10 + difficulty,
                helper_bonus: 1.5, // 帮手获得1.5倍奖励
            },
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    /// 加入帮助
    pub fn add_helper(&mut self, player_id: u64) -> Result<(), String> {
        if self.current_helpers.len() >= self.max_helpers as usize {
            return Err("帮手位置已满".to_string());
        }

        if self.current_helpers.contains(&player_id) {
            return Err("您已加入此任务".to_string());
        }

        self.current_helpers.push(player_id);
        Ok(())
    }

    /// 计算帮手奖励
    pub fn calculate_helper_reward(&self) -> u64 {
        ((self.reward_pool.base_exp as f32 * self.reward_pool.helper_bonus) / 2.0) as u64
    }
}

// ================================================================
// 玩家关系 - 组队历史
// ================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerRelation {
    pub player_a_id: u64,
    pub player_b_id: u64,
    pub times_teamed: u32,
    pub times_helped: u32,
    pub friendship_level: u32,
    pub last_interaction: u64,
}

impl PlayerRelation {
    pub fn new(player_a_id: u64, player_b_id: u64) -> Self {
        Self {
            player_a_id,
            player_b_id,
            times_teamed: 0,
            times_helped: 0,
            friendship_level: 0,
            last_interaction: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    /// 增加友谊度
    pub fn add_friendship(&mut self, points: u32) {
        self.friendship_level = self.friendship_level.saturating_add(points);
        self.last_interaction = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }
}
