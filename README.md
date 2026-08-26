这是一份为你量身定制的 `README.md` 模板。它不仅总结了你项目的核心愿景（游戏报告），还将那些技术债和架构建议转化为了专业、清晰的工程化 `TODO` 列表。

你可以直接将以下内容复制并覆盖到你 GitHub 项目的 `README.md` 中：

***

# ⚙️ Cyber Forge

![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)
![Architecture](https://img.shields.io/badge/Architecture-Client%2FServer-blue.svg)
![Status](https://img.shields.io/badge/Status-Alpha_Refactoring-yellow.svg)

**Cyber Forge** 不是一个简单的“打怪升级”网页小游戏，而是一个基于 Rust 构建的**由服务器权威状态驱动的持久化沙盒世界**。

本项目旨在探索用纯 Rust 技术栈（WASM 前端 + Tokio/Actix 后端）构建一个具备真实动态经济、物理拓扑和持续演进的世界模型。

## 📜 游戏系统报告 (Game Systems Overview)

目前项目已经脱离了简单的功能堆砌，初步建立了一个具备高度逻辑自洽的“世界模拟器”：

*   🌍 **单一事实来源的世界状态 (`WorldState`)**
    放弃了传统的“请求-改库-返回”模型，整个游戏世界作为一个持续运行的状态机在内存中演进。资源刷新、市场波动等行为由独立后台 Task 自动推进。
*   ⚖️ **真实的动态市场经济 (`MarketEngine`)**
    物价不再是固定常量。基于区域、供需关系和随机波动，系统生成实时的买入/卖出价（支持 60%~220% 动态浮动），并衍生出跨区域贸易玩法。
*   📜 **基于信用体系的商票系统 (`Commerce`)**
    不同于普通的“买卖得金币”，游戏引入了“信用额度 → 货物采购 → 运输 → 销售 → 回款结算”的商业票据流转机制，记录未结算负债与累计现金流，打造真正的贸易体验。
*   🌲 **世界所属的资源节点 (`GatheringEngine`)**
    资源产出不再绑定于玩家行为，而是归属于“世界”。玩家采集消耗的是节点的 `current_yield`，由世界引擎定期执行 Respawn 恢复。
*   🗺️ **复杂的区域拓扑与寻路 (`WorldTopology`)**
    地图不再是一张图片，而是由 7 大主城、60 个野外据点、传送门构成的复杂图数据结构。依托 Dijkstra 算法计算真实旅行成本，影响商路与玩家移动。
*   🔗 **前后端强类型契约 (`Shared Crate`)**
    客户端与服务端共享同一套 Rust 数据结构（Positions, PlayerStates, Items 等），杜绝了 API 字段不匹配的问题，将协议契约交由编译器保障。

---

## 🏗️ 架构愿景 (Architecture)

```text
                 ┌──────────────┐
                 │    Client    │
                 │ Rust/Macroquad│
                 │    WASM      │
                 └──────┬───────┘
                        │
                HTTP / WebSocket
                        │
                 ┌──────▼───────┐
                 │    Server    │
                 │ Actix/Tokio  │
                 └──────┬───────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                │
       ▼                ▼                ▼
 WorldState        MarketEngine    GatheringEngine
       │
       ├── PlayerState
       ├── WorldTopology
       ├── Commerce
       └── Persistence / EventStream (Kafka/TiKV 规划中)
```

---

## 🛠️ 路线图与 TODO (Roadmap & Action Items)

当前项目正处于**“架构收敛与工程成熟度提升”**阶段。接下来的核心目标不是盲目堆砌新系统或分布式组件，而是打磨现有世界模型的稳定性、一致性和安全性。

### 🔴 高优先级：核心稳定性重构 (High Priority)
- [ ] **经济系统高精度重构：** 消除核心经济和价格计算中的 `f64` 浮点数，统一使用 `u64` 表示货币，使用整数（如万分比）表示价格倍率，防止精度丢失与经济漏洞。
- [ ] **防御性类型重构 (Newtype Pattern)：** 消除“基本类型偏执”。将 `String` 类型的 ID 替换为强类型的 Tuple Struct（如 `ZoneId(String)`, `ItemId(String)`），依靠编译器防止不同概念的 ID 误传。
- [ ] **拆解 `GameConfig` 上帝对象：** 将庞大的全局配置拆分为独立的领域配置模块（`WorldConfig`, `MarketConfig`, `GatheringConfig` 等），为未来的热更新做准备。
- [ ] **解决 C/S 逻辑双写问题：** 移除 `client/src/world_topology.rs`，将拓扑规则完全沉淀到 `shared` 并由 Server 掌握绝对权威，Client 仅保留寻路预测与渲染逻辑。

### 🟡 中优先级：测试与系统边界 (Medium Priority)
- [ ] **提升核心业务测试覆盖率：** 重点针对 `action.rs`（600+行）、`commerce` 和 `market` 编写自动化单元测试。编写模拟脚本测试极端情况下的经济系统（如高频并发交易），确保无刷钱 Bug。
- [ ] **业务逻辑解耦与重构：** 对庞大的 `action.rs` 进行模块化拆分，明确各个 Action 处理器的工作职责。
- [ ] **重构错误处理哲学：** 梳理全盘的 `unwrap()` 与 `expect()`。保留旨在“保护业务不变量”的 Fail-fast Panic，将预期内的业务异常转化为标准的 `Result` 抛出。
- [ ] **建立身份认证与安全体系：** 移除 `DEFAULT_ACCOUNT_ID` 等硬编码，实现基于 JWT 或 Session 的真实认证机制，防御 Replay 攻击，加入接口限流（Rate Limit）。

### 🟢 低优先级：分布式与持久化演进 (Low Priority / Future)
*注：在单机内存版本（WorldState）达到极高稳定性前，暂缓下述系统的强依赖。*
- [ ] **Kafka 角色重新定义：** 放弃将 Kafka 作为状态数据库的思路，将其降级并明确为**“世界事件日志” (Event Log)**，仅用于记录发生过的历史（如 `TradeCompleted`, `PlayerDied`）。
- [ ] **持久化抽象与 TiKV：** 巩固 `WorldState` 作为 Single Source of Truth 的地位，JSON / TiKV 仅作为定期 Snapshot 归档方案，避免多状态源导致的数据不一致。
- [ ] **多实例扩展：** 探索无缝的世界状态切片或跨服通信方案。

---

## 🤝 参与贡献 (Contributing)

Cyber Forge 欢迎任何关于系统设计、Rust 性能优化或测试用例的讨论与 PR。
如果你对大型 MMO 的状态同步、动态经济模型感兴趣，欢迎与我交流！

**"We are not just adding features, we are simulating a world."**


## 🛠️ 构建与运行指令

### 1. 服务端 (Tokio Server)
```bash
cd rustCF2513/server
cargo run --release
```
默认在 `0.0.0.0:3000` 启动高性能 WebSocket 游戏世界状态机服务。

### 2. 客户端 WASM 编译 (Macroquad Client)
```bash
cd rustCF2513/client
# 添加 WASM 目标架构
rustup target add wasm32-unknown-unknown

# 编译为 WASM
cargo build --target wasm32-unknown-unknown --release
```
编译产物可直接嵌入 HTML Canvas，享受无 GC、60/120 FPS 纯 Rust 渲染体验。
# rustCF2513
