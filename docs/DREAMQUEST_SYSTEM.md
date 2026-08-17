# 📖 梦幻西游MMORPG系统 - 使用手册

> **版本**: `v1.0.0-beta`  
> **最后更新**: 2026-08-17  
> **下一个开发者必读** ⭐

## 目录速查

- [系统架构](#系统架构)
- [核心概念](#核心概念)
- [API 参考](#api-参考)
- [代码示例](#代码示例)
- [常见问题](#常见问题)

---

## 系统架构

```
Cyber-Forge MMORPG 梦幻西游复刻
├── 🎮 游戏核心 (src/game/)
│   ├── party.rs              ⭐ 多人队伍系统
│   ├── dreamquest.rs         ⭐ 任务/副本/宝宝/跑商
│   ├── combat_engine.rs      ⭐ 回合制战斗引擎
│   ├── entity.rs             ⭐ 玩家/敌人实体
│   └── world.rs              ⭐ 世界管理
│
├── 🌐 API 端点 (src/main.rs)
│   ├── POST /api/combat/start
│   ├── POST /api/combat/next-round
│   ├── POST /api/party/create
│   ├── POST /api/quest/accept
│   └── ...
│
└── 🎨 前端 (ui/)
    └── 战斗日志、队伍界面、任务列表
```

### 模块依赖关系

```
combat_engine.rs
  ├── 依赖 → dreamquest.rs (TurnBasedCombat, RoundLog)
  └── 依赖 → party.rs (Party, ContributionStats)

party.rs
  ├── 独立模块
  └── 导出 → 多人战斗奖励计算函数

dreamquest.rs
  ├── 独立模块
  └── 定义 Quest, Beast, Faction 等数据结构
```

---

## 核心概念

### 1. 回合制战斗流程

```
┌─────────────────────────────────────┐
│ 1. 初始化战斗                        │
│    TurnBasedCombatEngine::initialize │
│    → 按速度排序出手顺序              │
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│ 2. 执行每一回合                      │
│    TurnBasedCombatEngine::execute_   │
│    → 逐个角色执行行动                │
│    → 应用 Buff/Debuff 效果           │
│    → 检查是否战斗结束                │
└─────────┬───────────────────────────┘
          ↓
    ┌─────┴─────┐
    ↓           ↓
┌─────────┐ ┌─────────┐
│ 战斗继续 │ │ 战斗结束 │
└────┬────┘ └────┬────┘
     │           ├─→ Victory (获得奖励)
     │           └─→ Defeat (掉经验)
     └─────────→ 返回回合日志
```

**关键属性 (影响出手顺序)**:
- `speed`: 速度值，决定先后手
- `critical_rate`: 暴击率 (0-1)
- `dodge_rate`: 闪避率 (0-1)

### 2. 贡献度分配机制

```
多人战斗奖励分配 = 总奖励 × (贡献度分数 / 100) × 分配倍数

贡献度分数计算:
├─ 伤害贡献 (50%)     = (个人伤害 / 队伍总伤害) × 50
├─ 治疗贡献 (20%)     = (个人治疗 / 100) ← 最多20分
├─ 辅助贡献 (20%)     = (Buff/Debuff / 5) ← 最多20分
└─ 生存度   (10%)     = (无死亡 ? 10 : -5×死亡次数)

分配倍数选项:
├─ Equal          = 1.0 (平均分)
├─ ByContribution = contribution_score / 100 (推荐)
├─ ByLevel        = (个人等级 / 平均等级)
└─ Leader         = (队长2.0x, 其他0.5x)
```

### 3. 任务类型

| 类型 | 说明 | 难度 | 奖励倍数 |
|------|------|------|---------|
| Main | 主线 | ★★★ | 1.0x |
| Daily | 日常 | ★ | 0.5x |
| Escort | 跑商护送 | ★★ | 1.5x |
| BeastCapture | 抓宝宝 | ★★★★ | 2.0x |
| CopyDungeon | 副本 | ★★★★★ | 3.0x |
| Help | 帮派任务 | ★ | 0.3x |

### 4. 宝宝稀有度

| 稀有度 | 捕捉率 | 属性增长 | 技能数 |
|--------|--------|---------|--------|
| Common | 80% | 基础 | 2 |
| Rare | 50% | +15% | 3 |
| Epic | 25% | +30% | 4 |
| Legendary | 5% | +50% | 5 |

---

## API 参考

### 基础概念

所有 API 返回统一格式:

```json
{
  "success": true,
  "data": { /* 具体数据 */ },
  "message": "操作成功",
  "timestamp": 1692345600
}
```

### 战斗相关 API

#### 1. **初始化战斗** `POST /api/combat/start`

**请求**:
```json
{
  "player_ids": [1001, 1002, 1003],
  "enemy_ids": [2001, 2002],
  "dungeon_id": 100,
  "difficulty": 3
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "combat_id": "combat_abc123",
    "round": 1,
    "turn_order": [
      ["玩家1", 1001],
      ["玩家2", 1002],
      ["敌��1", 2001],
      ["玩家3", 1003],
      ["敌人2", 2002]
    ],
    "players": [
      {
        "id": 1001,
        "name": "玩家1",
        "hp": 100,
        "max_hp": 100,
        "state": "Idle"
      }
    ],
    "enemies": [
      {
        "id": 2001,
        "name": "小妖",
        "hp": 50,
        "max_hp": 50,
        "level": 1
      }
    ]
  }
}
```

#### 2. **执行下一回合** `POST /api/combat/next-round`

**请求**:
```json
{
  "combat_id": "combat_abc123",
  "player_actions": [
    {
      "actor_id": 1001,
      "action_type": "Attack",
      "target_id": 2001
    }
  ]
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "round": 2,
    "actions": [
      {
        "actor_name": "玩家1",
        "actor_id": 1001,
        "action_type": "Attack",
        "target_name": "小妖",
        "target_id": 2001,
        "damage": 23.5,
        "is_critical": true,
        "extra_effect": "暴击!"
      },
      {
        "actor_name": "小妖",
        "actor_id": 2001,
        "action_type": "Attack",
        "target_name": "玩家1",
        "target_id": 1001,
        "damage": 8.2,
        "is_critical": false,
        "extra_effect": null
      }
    ],
    "updated_states": { /* 更新后的HP等 */ },
    "combat_finished": false
  }
}
```

#### 3. **获取战斗结果** `GET /api/combat/{combat_id}/result`

**响应**:
```json
{
  "success": true,
  "data": {
    "result": "Victory",
    "rewards": {
      "exp": 5000,
      "gold": 1000,
      "items": [
        ["蓝晶剑", 1],
        ["金币", 500]
      ]
    },
    "member_rewards": {
      "1001": {
        "player_name": "玩家1",
        "exp_received": 2500,
        "gold_received": 500,
        "contribution_score": 60,
        "bonus_multiplier": 1.2
      },
      "1002": {
        "player_name": "玩家2",
        "exp_received": 2000,
        "gold_received": 400,
        "contribution_score": 48,
        "bonus_multiplier": 0.96
      }
    }
  }
}
```

### 队伍相关 API

#### 1. **创建���伍** `POST /api/party/create`

**请求**:
```json
{
  "leader_id": 1001,
  "leader_name": "李逍遥",
  "leader_level": 30,
  "max_members": 4,
  "distribution_method": "ByContribution"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "party_id": "party_xyz789",
    "leader_id": 1001,
    "members": [
      {
        "player_id": 1001,
        "player_name": "李逍遥",
        "level": 30,
        "joined_at": 1692345600
      }
    ],
    "max_members": 4,
    "experience_distribution": "ByContribution"
  }
}
```

#### 2. **加入队伍** `POST /api/party/{party_id}/join`

**请求**:
```json
{
  "player_id": 1002,
  "player_name": "赤火",
  "player_level": 28
}
```

**响应**:
```json
{
  "success": true,
  "message": "成功加入队伍 party_xyz789",
  "data": {
    "party_id": "party_xyz789",
    "members_count": 2,
    "members": [ /* 更新的成员列表 */ ]
  }
}
```

#### 3. **计算队伍奖励** `POST /api/party/{party_id}/calculate-rewards`

**请求**:
```json
{
  "base_exp": 5000,
  "base_gold": 1000,
  "items": [["宝石", 2]]
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "base_exp": 5000,
    "base_gold": 1000,
    "member_rewards": {
      "1001": {
        "exp_received": 2500,
        "gold_received": 500,
        "contribution_score": 50,
        "bonus_multiplier": 1.0
      },
      "1002": {
        "exp_received": 2500,
        "gold_received": 500,
        "contribution_score": 50,
        "bonus_multiplier": 1.0
      }
    }
  }
}
```

### 任务相关 API

#### 1. **获取任务列表** `GET /api/quests/available`

**请求参数**:
```
?player_id=1001&player_level=30
```

**响应**:
```json
{
  "success": true,
  "data": {
    "quests": [
      {
        "id": "quest_001",
        "quest_type": "Daily",
        "title": "清理妖怪",
        "description": "击杀小妖×5",
        "level_req": 10,
        "max_players": 3,
        "rewards": {
          "base_exp": 500,
          "base_gold": 100,
          "items": []
        }
      },
      {
        "id": "quest_002",
        "quest_type": "Escort",
        "title": "护送商人去长安",
        "description": "护送掌柜经过3个路点",
        "difficulty": 2,
        "waypoints": ["洛阳", "陈州", "开封", "长安"]
      }
    ]
  }
}
```

#### 2. **接取任务** `POST /api/quest/{quest_id}/accept`

**请求**:
```json
{
  "player_id": 1001
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "quest_id": "quest_001",
    "status": "InProgress",
    "accepted_at": 1692345600,
    "time_limit": 3600,
    "objectives": [
      {
        "id": 1,
        "description": "击杀小妖",
        "target_count": 5,
        "current_count": 0
      }
    ]
  }
}
```

#### 3. **完成任务** `POST /api/quest/{quest_id}/complete`

**请求**:
```json
{
  "player_id": 1001
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "quest_id": "quest_001",
    "status": "Completed",
    "rewards": {
      "exp": 500,
      "gold": 100,
      "items": []
    }
  }
}
```

### 宝宝相关 API

#### **发起捕捉** `POST /api/beast/capture`

**请求**:
```json
{
  "player_id": 1001,
  "beast_id": "beast_3001",
  "difficulty": 1
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "capture_attempt": 1,
    "max_attempts": 3,
    "capture_rate": 0.8,
    "captured": true,
    "beast": {
      "id": "beast_3001",
      "name": "小白鼠",
      "level": 1,
      "species": "鼠类",
      "rarity": "Common",
      "tameness": 0.5,
      "stats": { /* 属性 */ }
    }
  }
}
```

### 帮派相关 API

#### **发起求助** `POST /api/assistance/request`

**请求**:
```json
{
  "requester_id": 1001,
  "dungeon_name": "蜘蛛精老巢",
  "difficulty": 3,
  "location": "黑水河",
  "max_helpers": 3
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "request_id": "assist_abc123",
    "status": "Open",
    "reward_pool": {
      "base_exp": 2000,
      "base_gold": 400,
      "karma_points": 13,
      "helper_bonus": 1.5
    }
  }
}
```

---

## 代码示例

### 示例 1: 初始化战斗

```rust
use game::combat_engine::{CombatCharacter, TeamSide, TurnBasedCombatEngine};

fn start_combat() {
    let player = CombatCharacter {
        id: 1,
        name: "李逍遥".to_string(),
        level: 30,
        max_hp: 300.0,
        current_hp: 300.0,
        max_mp: 150.0,
        current_mp: 150.0,
        attack: 50.0,
        defense: 25.0,
        speed: 100,
        magic_attack: 30.0,
        magic_defense: 20.0,
        critical_rate: 0.1,
        dodge_rate: 0.05,
        buffs: vec![],
        debuffs: vec![],
        is_alive: true,
        team: TeamSide::Player,
    };

    let enemy = CombatCharacter {
        id: 2,
        name: "小妖".to_string(),
        level: 1,
        max_hp: 50.0,
        current_hp: 50.0,
        max_mp: 20.0,
        current_mp: 20.0,
        attack: 15.0,
        defense: 5.0,
        speed: 30,
        magic_attack: 10.0,
        magic_defense: 3.0,
        critical_rate: 0.05,
        dodge_rate: 0.02,
        buffs: vec![],
        debuffs: vec![],
        is_alive: true,
        team: TeamSide::Enemy,
    };

    let mut combat = TurnBasedCombatEngine::initialize_combat(
        vec![player],
        vec![enemy],
    );

    println!("出手顺序: {:?}", combat.rounds[0].turn_order);
    // 输出: 出手顺序: [("李逍遥", 1), ("小妖", 2)]
}
```

### 示例 2: 执行战斗回合

```rust
fn run_combat_loop() {
    let mut combat = /* 初始化的战斗 */;
    let mut players = vec![/* 玩家列表 */];
    let mut enemies = vec![/* 敌人列表 */];

    loop {
        // 执行一回合
        if let Some(result) = TurnBasedCombatEngine::execute_round(
            &mut combat,
            &mut players,
            &mut enemies,
        ) {
            match result {
                CombatResult::Victory { rewards, survivors } => {
                    println!("胜利! 获得经验: {}", rewards.exp);
                    // 分配奖励给存活者
                }
                CombatResult::Defeat { survivors, penalty } => {
                    println!("战败! 掉线{penalty}%的经验");
                }
                _ => {}
            }
            break;
        }

        // 显示当前回合
        if let Some(round_log) = combat.rounds.last() {
            println!("第{}回合:", round_log.round);
            for action in &round_log.actions {
                println!("  {} → {} (-{:.1} HP) {}", 
                    action.actor_name, 
                    action.target_name,
                    action.damage,
                    action.extra_effect.as_deref().unwrap_or("")
                );
            }
        }
    }
}
```

### 示例 3: 多人战斗奖励分配

```rust
use game::party::{Party, DistributionMethod};
use game::combat_engine::calculate_party_combat_reward;

fn distribute_team_rewards() {
    let mut party = Party::new(1001, "队长".to_string(), 30, 4);
    
    // 添加队员
    party.add_member(1002, "队员1".to_string(), 28).unwrap();
    party.add_member(1003, "队员2".to_string(), 29).unwrap();
    
    // 设置分配方式
    party.experience_distribution = DistributionMethod::ByContribution;
    
    // 获取战斗奖励
    let rewards = party.calculate_rewards(5000, 1000, vec![]);
    
    // 打印每个成员的奖励
    for (player_id, individual_reward) in &rewards.member_rewards {
        println!("{}: {} EXP, {} Gold (贡献度: {}%)", 
            individual_reward.player_name,
            individual_reward.exp_received,
            individual_reward.gold_received,
            individual_reward.contribution_score
        );
    }
}
```

---

## 常见问题

### Q1: 如何添加新的 Buff/Debuff?

在 `src/game/combat_engine.rs` 中修改:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BuffType {
    AttackUp,      // 现有
    DefenseUp,     // 现有
    SpeedUp,       // 现有
    LifeSteal,     // 现有
    // 新增:
    MagicUp,       // 魔法攻击+
    RegenPerRound, // 每回合回血
}
```

然后在 `execute_attack` 函数中添加处理逻辑。

### Q2: 如何自定义敌人AI?

当前 AI 在 `TurnBasedCombatEngine::execute_round` 中:

```rust
// 简单AI：敌人选择攻击生命值最低的玩家
let target = if team == TeamSide::Enemy {
    players.iter_mut()
        .filter(|p| p.is_alive)
        .min_by(|a, b| (a.current_hp as u32).cmp(&(b.current_hp as u32)))
} else {
    // ...
};
```

可以替换为更复杂的策略（如目标切换、逃跑判定等）。

### Q3: 支持多少个队伍成员?

默认最大 4 人，在 `Party::new()` 时指定 `max_members`。可根据需要调整。

### Q4: 如何调整经验倍数?

在 `Party::calculate_rewards()` 中修改:

```rust
let multiplier = match self.experience_distribution {
    DistributionMethod::Equal => 1.0,
    DistributionMethod::ByContribution => {
        (contribution_score as f32 / 100.0).max(0.5) // 改这里
    }
    // ...
};
```

### Q5: 怎样测试回合制战斗?

运行单元测试:

```bash
cargo test --lib game::combat_engine::tests
```

---

## 📚 相关文件速查表

| 功能 | 主要文件 | 备注 |
|------|--------|------|
| 回合制战斗 | `src/game/combat_engine.rs` | 370 行 |
| 多人队伍 | `src/game/party.rs` | 300 行 |
| 任务系统 | `src/game/dreamquest.rs` | 350 行 |
| 实体定义 | `src/game/entity.rs` | 200 行 |
| 世界管理 | `src/game/world.rs` | 100 行 |
| API 集成 | `src/main.rs` | 见行 600+ |

---

**最后更新**: 2026-08-17  
**下一个开发者**: 如有问题，查看本文档或对应的源代码注释。
