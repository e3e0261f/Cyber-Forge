use serde::{Deserialize, Serialize};
use super::dreamquest::{TurnBasedCombat, RoundLog, CombatAction, ActionType, CombatResult, CombatReward};
use super::party::{Party, ContributionStats, PartyReward, IndividualReward};
use std::collections::HashMap;

// ================================================================
// 战斗角色 (支持单人和多人战斗)
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatCharacter {
    pub id: u64,
    pub name: String,
    pub level: u32,
    pub max_hp: f32,
    pub current_hp: f32,
    pub max_mp: f32,
    pub current_mp: f32,
    pub attack: f32,
    pub defense: f32,
    pub speed: u32,     // 速度决定出手顺序
    pub magic_attack: f32,
    pub magic_defense: f32,
    pub critical_rate: f32,
    pub dodge_rate: f32,
    pub buffs: Vec<Buff>,
    pub debuffs: Vec<Debuff>,
    pub is_alive: bool,
    pub team: TeamSide,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TeamSide {
    Player,
    Enemy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Buff {
    pub name: String,
    pub effect_type: BuffType,
    pub duration: u32,  // 回合数
    pub value: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BuffType {
    AttackUp,      // 攻击+
    DefenseUp,     // 防御+
    SpeedUp,       // 速度+
    LifeSteal,     // 吸血
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Debuff {
    pub name: String,
    pub effect_type: DebuffType,
    pub duration: u32,  // 回合数
    pub damage_per_round: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DebuffType {
    Poison,        // 中毒
    Freeze,        // 冰冻 (无法行动)
    Bleed,         // 流血
    Cursed,        // 诅咒 (攻防降低)
}

// ================================================================
// 回合制战斗引擎 - "梦幻西游"式
// ================================================================
pub struct TurnBasedCombatEngine;

impl TurnBasedCombatEngine {
    /// 初始化战斗 - 计算出手顺序
    pub fn initialize_combat(
        players: Vec<CombatCharacter>,
        enemies: Vec<CombatCharacter>,
    ) -> TurnBasedCombat {
        // 计算出手顺序 (按速度排序，高速先手)
        let mut all_combatants = players;
        all_combatants.extend(enemies);
        all_combatants.sort_by(|a, b| b.speed.cmp(&a.speed));

        let turn_order: Vec<(String, u64)> = all_combatants
            .iter()
            .map(|c| (c.name.clone(), c.id))
            .collect();

        TurnBasedCombat {
            rounds: vec![RoundLog {
                round: 1,
                turn_order,
                actions: Vec::new(),
            }],
            current_round: 1,
            max_rounds: 999, // 最多999回合防止无限循环
            is_finished: false,
        }
    }

    /// 执行一个完整回合
    pub fn execute_round(
        combat: &mut TurnBasedCombat,
        players: &mut Vec<CombatCharacter>,
        enemies: &mut Vec<CombatCharacter>,
    ) -> Option<CombatResult> {
        if combat.is_finished || combat.current_round >= combat.max_rounds {
            return None;
        }

        let current_log = &combat.rounds[combat.rounds.len() - 1];
        let turn_order = current_log.turn_order.clone();
        let mut actions = Vec::new();

        // 执行每个角色的行动
        for (actor_name, actor_id) in turn_order {
            // 找到该角色
            let actor_option = if let Some(p) = players.iter_mut().find(|c| c.id == actor_id) {
                Some((p as *mut CombatCharacter, TeamSide::Player))
            } else if let Some(e) = enemies.iter_mut().find(|c| c.id == actor_id) {
                Some((e as *mut CombatCharacter, TeamSide::Enemy))
            } else {
                None
            };

            if let Some((actor_ptr, team)) = actor_option {
                unsafe {
                    let actor = &mut *actor_ptr;

                    // 检查是否还活着
                    if !actor.is_alive {
                        continue;
                    }

                    // 处理冰冻 (无法行动)
                    if actor.debuffs.iter().any(|d| d.effect_type == DebuffType::Freeze) {
                        actions.push(CombatAction {
                            actor_id: actor.id,
                            actor_name: actor.name.clone(),
                            action_type: ActionType::Dodge,
                            target_id: 0,
                            target_name: "被冰冻".to_string(),
                            damage: 0.0,
                            is_critical: false,
                            extra_effect: Some("冰冻".to_string()),
                        });
                        continue;
                    }

                    // 简单AI：敌人选择攻击生命值最低的玩家
                    let target = if team == TeamSide::Enemy {
                        players.iter_mut()
                            .filter(|p| p.is_alive)
                            .min_by(|a, b| (a.current_hp as u32).cmp(&(b.current_hp as u32)))
                    } else {
                        enemies.iter_mut()
                            .filter(|e| e.is_alive)
                            .min_by(|a, b| (a.current_hp as u32).cmp(&(b.current_hp as u32)))
                    };

                    if let Some(target) = target {
                        let action = Self::execute_attack(actor, target, combat.current_round);
                        actions.push(action);
                    }
                }
            }
        }

        // 更新log
        if let Some(current_log) = combat.rounds.last_mut() {
            current_log.actions = actions;
        }

        // 清除持续效果
        Self::update_effects(players);
        Self::update_effects(enemies);

        // 检查战斗结束
        let player_alive = players.iter().any(|p| p.is_alive);
        let enemy_alive = enemies.iter().any(|e| e.is_alive);

        if !player_alive {
            combat.is_finished = true;
            return Some(CombatResult::Defeat {
                survivors: enemies.iter().filter(|e| e.is_alive).map(|e| e.id).collect(),
                penalty: 10, // 掉10%经验
            });
        } else if !enemy_alive {
            combat.is_finished = true;
            let rewards = Self::calculate_rewards(players, enemies);
            return Some(CombatResult::Victory {
                rewards,
                survivors: players.iter().filter(|p| p.is_alive).map(|p| p.id).collect(),
            });
        }

        // 继续战斗
        combat.current_round += 1;
        combat.rounds.push(RoundLog {
            round: combat.current_round,
            turn_order: combat.rounds[0].turn_order.clone(),
            actions: Vec::new(),
        });

        None
    }

    /// 执行攻击
    fn execute_attack(
        attacker: &mut CombatCharacter,
        defender: &mut CombatCharacter,
        round: u32,
    ) -> CombatAction {
        // 检查闪避
        if rand::random::<f32>() < defender.dodge_rate {
            return CombatAction {
                actor_id: attacker.id,
                actor_name: attacker.name.clone(),
                action_type: ActionType::Dodge,
                target_id: defender.id,
                target_name: defender.name.clone(),
                damage: 0.0,
                is_critical: false,
                extra_effect: Some("闪避".to_string()),
            };
        }

        // 计算伤害
        let base_damage = (attacker.attack - defender.defense * 0.7).max(1.0);

        // 暴击判定
        let is_critical = rand::random::<f32>() < attacker.critical_rate;
        let final_damage = if is_critical {
            base_damage * 1.5
        } else {
            base_damage
        };

        defender.current_hp = (defender.current_hp - final_damage).max(0.0);
        if defender.current_hp <= 0.0 {
            defender.is_alive = false;
        }

        // 应用中毒伤害
        let poison_damage = defender.debuffs
            .iter()
            .filter(|d| d.effect_type == DebuffType::Poison)
            .map(|d| d.damage_per_round)
            .sum::<f32>();

        defender.current_hp = (defender.current_hp - poison_damage).max(0.0);
        if defender.current_hp <= 0.0 {
            defender.is_alive = false;
        }

        CombatAction {
            actor_id: attacker.id,
            actor_name: attacker.name.clone(),
            action_type: ActionType::Attack,
            target_id: defender.id,
            target_name: defender.name.clone(),
            damage: final_damage,
            is_critical,
            extra_effect: if poison_damage > 0.0 {
                Some(format!("中毒伤害: {:.1}", poison_damage))
            } else {
                None
            },
        }
    }

    /// 更新持续效果
    fn update_effects(combatants: &mut Vec<CombatCharacter>) {
        for combatant in combatants {
            // 更新buff持续时间
            combatant.buffs.retain_mut(|buff| {
                buff.duration = buff.duration.saturating_sub(1);
                buff.duration > 0
            });

            // 更新debuff持续时间
            combatant.debuffs.retain_mut(|debuff| {
                debuff.duration = debuff.duration.saturating_sub(1);
                debuff.duration > 0
            });
        }
    }

    /// 计算奖励
    fn calculate_rewards(
        players: &Vec<CombatCharacter>,
        enemies: &Vec<CombatCharacter>,
    ) -> CombatReward {
        let base_exp = enemies.iter().map(|e| (e.level as u64 + 1) * 10).sum();
        let base_gold = enemies.iter().map(|e| (e.level as u64 + 1) * 5).sum();

        CombatReward {
            exp: base_exp,
            gold: base_gold,
            items: vec![],
            contribution_score: 100,
            performance_score: 100,
        }
    }
}

// ================================================================
// 多人战斗奖励计算
// ================================================================
pub fn calculate_party_combat_reward(
    party: &Party,
    base_exp: u64,
    base_gold: u64,
) -> PartyReward {
    party.calculate_rewards(base_exp, base_gold, vec![])
}
