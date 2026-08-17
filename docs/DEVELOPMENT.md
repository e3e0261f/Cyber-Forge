# 🔨 开发指南 - 如何添加新功能

> **版本**: `v1.0.0-beta`  
> **目标读者**: 想要扩展 DreamQuest 系统的开发者  
> **难度等级**: ⭐⭐⭐ 中等

---

## 目录

- [快速开始](#快速开始)
- [添加新 Buff/Debuff](#添加新-buffdeubff)
- [添加新任务类型](#添加新任务类型)
- [添加新 API 端点](#添加新-api-端点)
- [编码规范](#编码规范)
- [测试指南](#测试指南)
- [调试技巧](#调试技巧)
- [常见陷阱](#常见陷阱)

---

## 快速开始

### 开发环境设置

```bash
# 1. 克隆项目
git clone https://github.com/e3e0261f/Cyber-Forge.git
cd Cyber-Forge

# 2. 切换到开发分支
git checkout -b feature/your-feature-name

# 3. 构建项目
cargo build --release

# 4. 运行服务器
cargo run --release

# 5. 在另一个终端运行测试
cargo test --lib
```

### 文件树理解

```
src/game/
├── combat_engine.rs      ← 修改战斗逻辑
├── party.rs              ← 修改队伍分配
├── dreamquest.rs         ← 修改任务/副本/宝宝
├── entity.rs             ← 修改实体属性
├── world.rs              ← 修改世界管理
└── input.rs              ← 修改输入系统
```

---

## 添加新 Buff/Debuff

### 场景：添加"加速术" Buff（+50% 速度）

#### 步骤 1: 在 `combat_engine.rs` 中定义新效果

```rust
// 文件: src/game/combat_engine.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BuffType {
    AttackUp,      // 现有
    DefenseUp,     // 现有
    SpeedUp,       // 现有
    LifeSteal,     // 现有
    // 🆕 新增:
    AccelerateSpell, // 加速术: +50% 速度持续3回合
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DebuffType {
    Poison,        // 现有
    Freeze,        // 现有
    Bleed,         // 现有
    Cursed,        // 现有
    // 🆕 新增:
    Slow,          // 缓速: -50% 速度持续2回合
}
```

#### 步骤 2: 在 `execute_attack` 中应用效果

```rust
impl TurnBasedCombatEngine {
    fn execute_attack(
        attacker: &mut CombatCharacter,
        defender: &mut CombatCharacter,
        round: u32,
    ) -> CombatAction {
        // ... 现有代码 ...

        // 🆕 应用 Buff ���果 (加速术)
        let speed_multiplier = attacker.buffs
            .iter()
            .find(|b| b.effect_type == BuffType::AccelerateSpell)
            .map(|_| 1.5) // 速度提升50%
            .unwrap_or(1.0);
        
        let actual_attack = attacker.attack * speed_multiplier;

        // ... 继续计算伤害 ...
    }
}
```

#### 步骤 3: 在 `update_effects` 中管理持续时间

```rust
impl TurnBasedCombatEngine {
    fn update_effects(combatants: &mut Vec<CombatCharacter>) {
        for combatant in combatants {
            // 更新 buff 持续时间
            combatant.buffs.retain_mut(|buff| {
                buff.duration = buff.duration.saturating_sub(1);
                
                // 🆕 持续效果应用 (比如"灼烧术"每回合伤害)
                match buff.effect_type {
                    BuffType::LifeSteal => {
                        combatant.current_hp = (combatant.current_hp + 5.0)
                            .min(combatant.max_hp);
                    }
                    _ => {} // 其他buff无持续效果
                }
                
                buff.duration > 0
            });

            // 更新 debuff 持续时间
            combatant.debuffs.retain_mut(|debuff| {
                debuff.duration = debuff.duration.saturating_sub(1);
                
                // 🆕 应用 Debuff 效果
                match debuff.effect_type {
                    DebuffType::Slow => {
                        // 缓速削弱速度 (可选在这里应用)
                    }
                    _ => {}
                }
                
                debuff.duration > 0
            });
        }
    }
}
```

#### 步骤 4: 添加单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_accelerate_spell_buff() {
        let mut player = CombatCharacter {
            // ... 初始化 ...
            buffs: vec![Buff {
                name: "加速术".to_string(),
                effect_type: BuffType::AccelerateSpell,
                duration: 3,
                value: 0.5, // +50%
            }],
            // ...
        };

        let mut enemy = CombatCharacter {
            // ... 初始化 ...
        };

        let action = TurnBasedCombatEngine::execute_attack(&mut player, &mut enemy, 1);
        
        // 验证伤害提升
        assert!(action.damage > 10.0, "加速术应该增加伤害");
    }
}
```

#### 步骤 5: 运行测试

```bash
cargo test --lib game::combat_engine::tests::test_accelerate_spell_buff
```

---

## 添加新任务类型

### 场景：添加"双人竞技"任务类型

#### 步骤 1: 在 `dreamquest.rs` 中扩展任务类型

```rust
// 文件: src/game/dreamquest.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QuestType {
    Main,           // 现有
    Daily,          // 现有
    Escort,         // 现有
    BeastCapture,   // 现有
    CopyDungeon,    // 现有
    PvP,            // 现有
    Help,           // 现有
    // 🆕 新增:
    DuelArena,      // 竞技场1v1决斗
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuelArenaQuest {
    pub id: u64,
    pub challenger_id: u64,
    pub opponent_id: u64,
    pub arena_name: String,
    pub best_of: u32, // 3局2胜或5局3胜
    pub current_round: u32,
    pub challenger_wins: u32,
    pub opponent_wins: u32,
    pub prize_pool: u64,
    pub status: QuestStatus,
}
```

#### 步骤 2: 实现任务逻辑

```rust
impl DuelArenaQuest {
    pub fn new(
        challenger_id: u64,
        opponent_id: u64,
        arena_name: String,
        best_of: u32,
        prize_pool: u64,
    ) -> Self {
        Self {
            id: rand::random(),
            challenger_id,
            opponent_id,
            arena_name,
            best_of,
            current_round: 0,
            challenger_wins: 0,
            opponent_wins: 0,
            prize_pool,
            status: QuestStatus::InProgress,
        }
    }

    /// 记录一局战斗结果
    pub fn record_round_result(&mut self, winner_id: u64) {
        self.current_round += 1;
        
        if winner_id == self.challenger_id {
            self.challenger_wins += 1;
        } else {
            self.opponent_wins += 1;
        }

        // 检查是否结束
        let wins_needed = (self.best_of / 2) + 1;
        if self.challenger_wins >= wins_needed || self.opponent_wins >= wins_needed {
            self.status = QuestStatus::Completed;
        }
    }

    /// 获取竞技场最终结果
    pub fn get_result(&self) -> Option<(u64, u64)> { // (胜者ID, 奖金)
        if self.status == QuestStatus::Completed {
            let winner_id = if self.challenger_wins > self.opponent_wins {
                self.challenger_id
            } else {
                self.opponent_id
            };
            Some((winner_id, self.prize_pool))
        } else {
            None
        }
    }
}
```

#### 步骤 3: 集成到任务系统

```rust
impl Quest {
    pub fn from_duel_arena(duel: DuelArenaQuest) -> Self {
        Self {
            id: duel.id,
            quest_type: QuestType::DuelArena,
            title: format!("竞技场决斗: {}", duel.arena_name),
            description: format!(
                "与 {} 进行 {} 局最终赛",
                duel.opponent_id, duel.best_of
            ),
            level_req: 20,
            max_players: 2,
            current_party: vec![duel.challenger_id, duel.opponent_id],
            objectives: vec![
                Objective {
                    id: 1,
                    description: "赢得竞技场决斗".to_string(),
                    target_count: duel.best_of / 2 + 1,
                    current_count: 0,
                    objective_type: ObjectiveType::WinDuel {
                        arena: duel.arena_name.clone(),
                    },
                }
            ],
            progress: 0,
            rewards: QuestReward {
                base_exp: duel.prize_pool / 10,
                base_gold: duel.prize_pool,
                items: vec![],
                contribution_bonus: 1.0,
            },
            time_limit: 3600,
            status: QuestStatus::InProgress,
            dungeon_type: None,
        }
    }
}
```

#### 步骤 4: 添加到ObjectiveType

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ObjectiveType {
    KillMobs { enemy_name: String, count: u32 },
    CollectItems { item_name: String, count: u32 },
    EscortNPC { npc_name: String, destination: String },
    CaptureBeasts { beast_name: String, count: u32 },
    DefendLocation { location: String, time_secs: u32 },
    // 🆕 新增:
    WinDuel { arena: String },
}
```

---

## 添加新 API 端点

### 场景：添加 POST /api/duel/start 端点

#### 步骤 1: 在 `main.rs` 中定义请求/响应结构

```rust
// 文件: src/main.rs

#[derive(Deserialize)]
struct DuelStartRequest {
    challenger_id: u64,
    opponent_id: u64,
    arena_name: String,
    best_of: u32,
    prize_pool: u64,
}

#[derive(Serialize)]
struct DuelStartResponse {
    duel_id: u64,
    status: String,
    message: String,
}
```

#### 步骤 2: 在 Session 中添加决斗状态

```rust
// 文件: src/main.rs

struct Session {
    state: GameState,
    dao: DaoOrigin,
    cycle_start: Instant,
    // 🆕 新增:
    active_duels: HashMap<u64, DuelArenaQuest>, // duel_id -> quest
}
```

#### 步骤 3: 实现 API 端点

```rust
// 文件: src/main.rs

#[post("/api/duel/start")]
async fn api_duel_start(
    req: actix_web::HttpRequest,
    data: web::Data<AppState>,
    payload: web::Json<DuelStartRequest>,
) -> impl Responder {
    let account_id = get_account_id(&req);
    let mut sessions = data.0.lock().unwrap();
    let session = get_or_create_session(&mut sessions, &account_id);

    // 验证玩家
    if payload.challenger_id == payload.opponent_id {
        return HttpResponse::BadRequest().json(json!({
            "success": false,
            "message": "不能与自己决斗"
        }));
    }

    // 创建决斗
    let duel = DuelArenaQuest::new(
        payload.challenger_id,
        payload.opponent_id,
        payload.arena_name.clone(),
        payload.best_of,
        payload.prize_pool,
    );

    let duel_id = duel.id;
    session.active_duels.insert(duel_id, duel);

    HttpResponse::Ok().json(DuelStartResponse {
        duel_id,
        status: "InProgress".to_string(),
        message: format!("决斗 {} 已启动", duel_id),
    })
}
```

#### 步骤 4: 在主服务器中注册路由

```rust
// 文件: src/main.rs

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let app_state = web::Data::new(AppState(Mutex::new(HashMap::new())));

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .service(api_get_state)
            .service(api_player_strike)
            .service(api_game_tick)
            .service(api_action)
            // 🆕 新增:
            .service(api_duel_start)
            // ... 其他端点 ...
            .service(Files::new("/", "./ui").index_file("index.html"))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
```

#### 步骤 5: 测试端点

```bash
# 启动服务器
cargo run --release &

# 测试请求
curl -X POST http://127.0.0.1:8080/api/duel/start \
  -H 'Content-Type: application/json' \
  -H 'X-Auth-Token: player1' \
  -d '{
    "challenger_id": 1001,
    "opponent_id": 1002,
    "arena_name": "黄沙竞技场",
    "best_of": 3,
    "prize_pool": 5000
  }'
```

---

## 编码规范

### 命名规范

```rust
// ✅ 好的命名
pub struct PlayerCharacter { }
pub fn calculate_total_damage() { }
pub const MAX_PARTY_SIZE: u32 = 4;

// ❌ 避免
pub struct PC { }
pub fn calc_dmg() { }
pub const MAX_SIZE: u32 = 4;
```

### 注释规范

```rust
// ✅ 清晰的说明
/// 计算单人伤害，考虑防御和暴击
/// 
/// # 参数
/// * `attacker` - 攻击者角色
/// * `defender` - 防守者角色
/// 
/// # 返回
/// 计算后的伤害值 (浮点数)
pub fn calculate_damage(attacker: &CombatCharacter, defender: &CombatCharacter) -> f32 {
    // ...
}

// ❌ 避免过度注释
pub fn calc(a: &CC, d: &CC) -> f32 {
    // 计算伤害
    let dmg = a.attack - d.defense;
    // 返回伤害
    dmg
}
```

### 错误处理

```rust
// ✅ 使用 Result 类型
pub fn add_member(&mut self, player_id: u64, name: String, level: u32) -> Result<(), String> {
    if self.members.len() >= self.max_members as usize {
        return Err("队伍已满".to_string());
    }
    
    if self.members.iter().any(|m| m.player_id == player_id) {
        return Err("该玩家已在队伍中".to_string());
    }
    
    // 添加成员
    Ok(())
}

// ❌ 避免 unwrap/panic
pub fn add_member_bad(&mut self, player_id: u64) {
    self.members.push(PartyMember::new(player_id)); // 可能panic
}
```

---

## 测试指南

### 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_party_add_member() {
        let mut party = Party::new(1001, "队长".to_string(), 30, 4);
        
        // 测试成功加入
        assert!(party.add_member(1002, "队员1".to_string(), 28).is_ok());
        assert_eq!(party.members.len(), 2);
        
        // 测试重复加入
        assert!(party.add_member(1002, "队员1".to_string(), 28).is_err());
    }

    #[test]
    fn test_combat_calculation() {
        let mut player = CombatCharacter { /* ... */ };
        let mut enemy = CombatCharacter { /* ... */ };
        
        let damage = TurnBasedCombatEngine::execute_attack(&mut player, &mut enemy, 1);
        
        assert!(damage.damage > 0.0);
        assert!(!damage.actor_name.is_empty());
    }
}
```

### 集成测试

```bash
# 运行所有测试
cargo test

# 运行特定测试
cargo test party::tests::

# 运行时显示输出
cargo test -- --nocapture
```

---

## 调试技巧

### 添加调试日志

```rust
// 使用 eprintln! 输出调试信息
impl TurnBasedCombatEngine {
    pub fn execute_round(
        combat: &mut TurnBasedCombat,
        players: &mut Vec<CombatCharacter>,
        enemies: &mut Vec<CombatCharacter>,
    ) -> Option<CombatResult> {
        eprintln!("🔍 调试: 执行第 {} 回合", combat.current_round);
        
        // ... 战斗逻辑 ...
        
        eprintln!("  玩家1 HP: {}", players[0].current_hp);
        eprintln!("  敌人1 HP: {}", enemies[0].current_hp);
        
        // ...
    }
}
```

### 在 main.rs 中运行时查看

```bash
# 运行时看到 eprintln! 输出
cargo run --release 2>&1 | grep "🔍"
```

### 设置断点（使用 rust-gdb）

```bash
# 安装 rust-gdb
cargo install rust-gdb

# 编译调试版本
cargo build

# 启动调试器
rust-gdb ./target/debug/cyber_forge

# 在 gdb 中
(gdb) break src/game/combat_engine.rs:100
(gdb) run
(gdb) next
(gdb) print player.current_hp
```

---

## 常见陷阱

### 陷阱 1: 忘记更新相关文件

❌ 错误做法：
```rust
// 只在 combat_engine.rs 中添加了新 Buff
pub enum BuffType {
    NewBuff, // 新增
}
// 但忘记在测试中处理
```

✅ 正确做法：
```rust
// 1. 在 combat_engine.rs 中定义
pub enum BuffType {
    NewBuff,
}

// 2. 在 execute_attack 中应用效果
match buff.effect_type {
    BuffType::NewBuff => { /* 处理逻辑 */ }
    // ...
}

// 3. 在 update_effects 中管理
// ...

// 4. 添加测试
#[test]
fn test_new_buff() { /* ... */ }

// 5. 更新文档
// docs/DREAMQUEST_SYSTEM.md 中记录新Buff
```

### 陷阱 2: 竞态条件和多线程问题

❌ 错误做法：
```rust
// 直接修改共享状态而不加锁
pub struct GameWorld {
    pub players: Vec<Player>, // 危险!
}

world.players[0].hp = 50; // 可能被其他线程同时修改
```

✅ 正确做法：
```rust
// 使用 Mutex 保护
pub struct GameWorld {
    players: Mutex<Vec<Player>>,
}

let mut players = world.players.lock().unwrap();
players[0].hp = 50;
```

### 陷阱 3: 忘记处理边界情况

❌ 错误做法：
```rust
pub fn calculate_damage(attack: f32, defense: f32) -> f32 {
    attack - defense  // 如果 defense > attack，就是负数!
}
```

✅ 正确做法：
```rust
pub fn calculate_damage(attack: f32, defense: f32) -> f32 {
    (attack - defense * 0.7).max(1.0)  // 最小1点伤害
}
```

### 陷阱 4: 忽视性能影响

❌ 效率低：
```rust
// O(n²) 复杂度，搜索N次
for player in &players {
    for enemy in &enemies {
        if enemy.id == player.target_id {
            // 战斗...
        }
    }
}
```

✅ 使用哈希表：
```rust
// O(n) 复杂度
let enemy_map: HashMap<u64, &Enemy> = 
    enemies.iter().map(|e| (e.id, e)).collect();

for player in &players {
    if let Some(enemy) = enemy_map.get(&player.target_id) {
        // 战斗...
    }
}
```

---

## 提交清单

在提交 PR 前，确保：

- [ ] 代码通过 `cargo fmt` 格式检查
- [ ] 代码通过 `cargo clippy` 检查
- [ ] 所有测试通过 `cargo test`
- [ ] 新功能添加了单元测试
- [ ] 更新了 docs/CHANGELOG.md
- [ ] 更新了相关文档（如 docs/DREAMQUEST_SYSTEM.md）
- [ ] 编写了清晰的 commit message

```bash
# 提交前运行完整检查
cargo fmt --all
cargo clippy --all-targets
cargo test --all
cargo build --release
```

---

## 进阶话题

### 性能优化

如果发现性能瓶颈：

1. 使用 `cargo profile` 工具找到热点
2. 使用迭代器而非循环
3. 避免不必要的克隆
4. 考虑使用 `arc` 和 `crossbeam` 进行多线程优化

### 扩展指南

**想添加新系统？** 参考这个流程：

1. 在 `dreamquest.rs` 中定义核心数据结构
2. 在 `combat_engine.rs` 或新文件中实现逻辑
3. 在 `main.rs` 中添加 API 端点
4. 添加完整的单元测试
5. 更新文档和 CHANGELOG
6. 提交 PR

---

**需要帮助？** 查看已有的代码示例或在文档中提问。

**最后更新**: 2026-08-17  
**维护者**: @eef
