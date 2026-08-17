use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ================================================================
// 3D 坐标系统
// ================================================================
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    /// 计算两点间距离
    pub fn distance(&self, other: &Vec3) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        let dz = self.z - other.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    /// 向目标方向移动
    pub fn move_towards(&mut self, target: &Vec3, speed: f32) {
        let dir = self.direction_to(target);
        self.x += dir.x * speed;
        self.y += dir.y * speed;
        self.z += dir.z * speed;
    }

    fn direction_to(&self, target: &Vec3) -> Vec3 {
        let dx = target.x - self.x;
        let dy = target.y - self.y;
        let dz = target.z - self.z;
        let len = (dx * dx + dy * dy + dz * dz).sqrt();
        if len > 0.0 {
            Vec3::new(dx / len, dy / len, dz / len)
        } else {
            Vec3::new(0.0, 0.0, 0.0)
        }
    }
}

// ================================================================
// 属性系统
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub max_hp: f32,
    pub hp: f32,
    pub attack: f32,      // 攻击力
    pub defense: f32,     // 防御力
    pub speed: f32,       // 移动速度
    pub attack_speed: f32, // 攻击速度（次/秒）
    pub critical_rate: f32, // 暴击率(0-1)
    pub critical_damage: f32, // 暴击伤害倍数
}

impl Stats {
    pub fn player_base(level: u32) -> Self {
        let base_hp = 100.0 + (level as f32) * 20.0;
        Self {
            max_hp: base_hp,
            hp: base_hp,
            attack: 10.0 + (level as f32) * 5.0,
            defense: 5.0 + (level as f32) * 2.0,
            speed: 10.0,           // 单位/秒
            attack_speed: 1.0,     // 每秒攻击1次
            critical_rate: 0.05,
            critical_damage: 1.5,
        }
    }

    pub fn enemy_base(level: u32, boss: bool) -> Self {
        let base_hp = if boss {
            500.0 + (level as f32) * 100.0
        } else {
            50.0 + (level as f32) * 10.0
        };
        Self {
            max_hp: base_hp,
            hp: base_hp,
            attack: 5.0 + (level as f32) * 2.5,
            defense: 2.0 + (level as f32) * 1.0,
            speed: 5.0 + (level as f32) * 0.5,
            attack_speed: 0.8,
            critical_rate: 0.02,
            critical_damage: 1.2,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.hp > 0.0
    }

    pub fn take_damage(&mut self, damage: f32) {
        self.hp = (self.hp - damage).max(0.0);
    }

    pub fn heal(&mut self, amount: f32) {
        self.hp = (self.hp + amount).min(self.max_hp);
    }
}

// ================================================================
// 战斗状态
// ================================================================
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CombatState {
    Idle,              // 空闲
    InCombat,          // 战斗中
    Casting,           // 施法中（保留用）
    Dead,              // 死亡
}

// ================================================================
// 玩家实体
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: u64,
    pub name: String,
    pub level: u32,
    pub exp: u64,
    pub position: Vec3,
    pub rotation: f32, // 0-360 度朝向
    pub stats: Stats,
    pub state: CombatState,
    pub in_combat_with: Option<u64>, // 当前对战的敌人ID
    pub equipment: HashMap<String, String>, // 装备槽
    pub last_attack_time: f64, // 上次攻击时间戳
}

impl Player {
    pub fn new(id: u64, name: String, level: u32) -> Self {
        Self {
            id,
            name,
            level,
            exp: 0,
            position: Vec3::new(0.0, 0.0, 0.0),
            rotation: 0.0,
            stats: Stats::player_base(level),
            state: CombatState::Idle,
            in_combat_with: None,
            equipment: HashMap::new(),
            last_attack_time: 0.0,
        }
    }

    pub fn move_input(&mut self, dx: f32, dy: f32, dz: f32, delta_time: f32) {
        // WASD 输入转换为世界坐标移动
        let speed = self.stats.speed * delta_time;
        self.position.x += dx * speed;
        self.position.y += dy * speed;
        self.position.z += dz * speed;
    }

    pub fn gain_exp(&mut self, amount: u64) {
        self.exp += amount;
        let exp_to_level = (100 * self.level as u64).saturating_mul(2);
        if self.exp >= exp_to_level {
            self.level_up();
        }
    }

    fn level_up(&mut self) {
        self.level += 1;
        let old_max_hp = self.stats.max_hp;
        self.stats = Stats::player_base(self.level);
        // 升级恢复HP
        self.stats.hp = (old_max_hp + self.stats.max_hp) / 2.0;
    }

    pub fn calculate_damage(&self, defender: &Player) -> f32 {
        let base_damage = self.stats.attack - defender.stats.defense * 0.5;
        let base_damage = base_damage.max(1.0); // 最小1点伤害
        
        // 暴击判定
        let is_crit = rand::random::<f32>() < self.stats.critical_rate;
        if is_crit {
            base_damage * self.stats.critical_damage
        } else {
            base_damage
        }
    }
}

// ================================================================
// 敌人实体
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Enemy {
    pub id: u64,
    pub name: String,
    pub level: u32,
    pub position: Vec3,
    pub stats: Stats,
    pub state: CombatState,
    pub in_combat_with: Option<u64>, // 当前对战的玩家ID
    pub target_position: Option<Vec3>, // AI目标位置
    pub last_attack_time: f64,
    pub exp_reward: u64,
    pub gold_reward: u64,
    pub is_boss: bool,
}

impl Enemy {
    pub fn new(id: u64, name: String, level: u32, position: Vec3, is_boss: bool) -> Self {
        let exp_reward = if is_boss {
            1000 + (level as u64) * 200
        } else {
            100 + (level as u64) * 20
        };
        let gold_reward = exp_reward / 10;

        Self {
            id,
            name,
            level,
            position,
            stats: Stats::enemy_base(level, is_boss),
            state: CombatState::Idle,
            in_combat_with: None,
            target_position: None,
            last_attack_time: 0.0,
            exp_reward,
            gold_reward,
            is_boss,
        }
    }

    /// 简单AI：靠近玩家
    pub fn ai_update(&mut self, player_pos: &Vec3, delta_time: f32) {
        let distance = self.position.distance(player_pos);
        
        // 追击距离50以内
        if distance < 50.0 && distance > 1.0 {
            self.position.move_towards(player_pos, self.stats.speed * delta_time);
        }
    }

    pub fn calculate_damage(&self, defender: &Player) -> f32 {
        let base_damage = self.stats.attack - defender.stats.defense * 0.5;
        let base_damage = base_damage.max(0.5);
        
        let is_crit = rand::random::<f32>() < self.stats.critical_rate;
        if is_crit {
            base_damage * self.stats.critical_damage
        } else {
            base_damage
        }
    }
}

// ================================================================
// 战斗会话
// ================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatSession {
    pub id: u64,
    pub player_id: u64,
    pub enemy_id: u64,
    pub round: u32,
    pub started_at: f64,
    pub is_active: bool,
}

impl CombatSession {
    pub fn new(player_id: u64, enemy_id: u64) -> Self {
        Self {
            id: rand::random(),
            player_id,
            enemy_id,
            round: 0,
            started_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs_f64(),
            is_active: true,
        }
    }
}
