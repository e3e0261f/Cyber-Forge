# ⚙️ Cyber Forge

![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)
![Architecture](https://img.shields.io/badge/Architecture-Client%2FServer-blue.svg)
![Status](https://img.shields.io/badge/Status-Alpha_Refactoring-yellow.svg)

**Cyber Forge** 不是一个简单的“打怪升级”网页小游戏，而是一个基于 Rust 构建的**由服务器权威状态驱动的持久化沙盒世界**。

本项目旨在探索用纯 Rust 技术栈（WASM 前端 + Tokio/Actix 后端）构建一个具备真实动态经济、物理拓扑和持续演进的世界模型。

---

## 📜 游戏系统报告 (Game Systems Overview)

目前项目已经脱离了简单的功能堆砌，初步建立了一个具备高度逻辑自洽的“世界模拟器”：

* 🌍 **单一事实来源的世界状态 (`WorldState`)**  
  放弃了传统的“请求-改库-返回”模型，整个游戏世界作为一个持续运行的状态机在内存中演进。资源刷新、市场波动等行为由独立后台 Task 自动推进。
* ⚖️ **真实的动态市场经济 (`MarketEngine`)**  
  物价不再是固定常量。基于区域、供需关系和随机波动，系统生成实时的买入/卖出价（支持 60%~220% 动态浮动），并衍生出跨区域贸易玩法。
* 📜 **基于信用体系的商票系统 (`Commerce`)**  
  不同于普通的“买卖得金币”，游戏引入了“信用额度 → 货物采购 → 运输 → 销售 → 回款结算”的商业票据流转机制，记录未结算负债与累计现金流，打造真正的贸易体验。
* 🌲 **世界所属的资源节点 (`GatheringEngine`)**  
  资源产出不再绑定于玩家行为，而是归属于“世界”。玩家采集消耗的是节点的 `current_yield`，由世界引擎定期执行 Respawn 恢复。
* 🗺️ **复杂的区域拓扑与寻路 (`WorldTopology`)**  
  地图不再是一张图片，而是由 7 大主城、60 个野外据点、传送门构成的复杂图数据结构。依托 Dijkstra 算法计算真实旅行成本，影响商路与玩家移动。
* 🔗 **前后端强类型契约 (`Shared Crate`)**  
  客户端与服务端共享同一套 Rust 数据结构（Positions, PlayerStates, Items 等），杜绝了 API 字段不匹配的问题，将协议契约交由编译器保障。

---

## 🏗️ 架构愿景 (Architecture)

## 🎥 客户端账本设计理念：本地录像机，而不是第二个世界

> **核心原则：Server 是世界唯一真相（Single Source of Truth）。Client 不是第二个 Server。**

Cyber Forge 的客户端离线能力，并不是通过维护一份与服务器争夺权威的 `world_state` 来实现，而是通过一条**可验证、连续、可回放的玩家行为账本（Player Action Ledger）**来实现。

可以把客户端理解成三样东西：

- 🎥 **本地录像机（Recorder）**：把玩家在离线期间做过的动作按顺序记录下来。
- ▶️ **播放器（Replay / Playback）**：未来可以从某个已确认状态开始，重新播放这些动作，恢复当时的状态。
- 🎮 **游戏模拟器（Game Simulator）**：在没有网络时，依靠本地规则立即执行动作，让游戏保持流畅；但客户端计算出的结果不是最终世界真相。

### 账本记录“发生了什么”，而不是把客户端状态当成真相

理想模型：

```text
Confirmed Server State
        │
        ▼
   Client Simulator
        │
        ├── 玩家移动
        ├── 战斗
        ├── 采集
        ├── 掉落
        ├── 装备
        ├── 任务
        └── 其他可离线行为
        │
        ▼
 Player Action Ledger
        │
        ├── Block N
        ├── Block N+1
        ├── Block N+2
        └── ...
        │
        ▼
   恢复网络后提交
        │
        ▼
 Server 验证 / Replay / Reconciliation
        │
        ▼
 Server World State
```

账本中的每个区块应描述一个**可验证的行为或事件**，并通过 `prev_hash → block_hash` 形成连续哈希链。

因此，客户端保存的重点不是：

```text
“我现在有多少金币、多少装备、处于什么坐标”
```

而是：

```text
“我从上一个服务器确认点开始，依次做了什么”
```

状态可以由这些事件重新模拟得到。

### 为什么采用“录像带式账本”

这种设计的目标不仅是防篡改，还包括：

1. **离线游玩**：断网后仍可以继续进行大量不依赖实时世界的游戏行为。
2. **丝滑体验**：玩家操作首先进入本地模拟与账本，不需要每个动作都等待服务器往返。
3. **可验证性**：账本是连续的、带哈希链的，能够发现事后修改、缺块、乱序等问题。
4. **可回放**：服务器或调试工具未来可以从某个 checkpoint 重新播放玩家行为。
5. **可审计**：出现异常时，可以回答“这个状态是怎么一步一步产生的”。
6. **可恢复**：服务器可以在验证后从历史事件重建玩家状态，而不是盲目相信客户端上传的最终状态。

### 权力边界

客户端可以**计算**，但不能**裁决**。

例如客户端离线击杀怪物后，可以立即模拟：

```text
怪物死亡
→ 掉落
→ 拾取
→ 背包变化
→ UI 更新
```

这些结果用于提供离线游戏体验，同时写入账本。

重新联网后，服务器仍然拥有最高优先级：

```text
Client Ledger
    ↓
Hash Chain 验证
    ↓
事件合法性验证
    ↓
服务器规则 Replay
    ↓
接受 / 拒绝 / 修正
    ↓
Authoritative World State
```

因此客户端与服务器不存在“两个世界状态互相争夺权力”的问题：

> **Client 记录历史，Server 决定历史能否成为世界的一部分。**

### 客户端 `world_state` 的定位

如果客户端继续保留 `data/world_state.json` 或类似本地状态，它应被视为：

> **服务器已确认状态 + 本地未确认账本的播放结果所形成的缓存。**

它不是第二份权威世界状态，也不应该与 `server/data/world_state.json` 进行“谁的完整文件 Hash 一样才算正确”的竞争式验证。

### 账本与服务器快照

未来可以使用：

```text
Server Confirmed Revision
        +
Ledger Checkpoint
        +
Pending Blocks
```

来控制本地账本大小。

单个账本段可以先以约 **1 MB** 作为工程目标进行评估；实际容量应以事件数量、压缩率、设备性能和同步成本测试后决定，而不是把 1 MB 当成硬性协议限制。

### 未来可扩展能力

账本稳定后，可以逐步增加：

- [ ] 账本检查点（Checkpoint）
- [ ] Pending / Confirmed / Rejected 状态
- [ ] 账本分段与压缩
- [ ] 从指定 Block 开始 Replay
- [ ] 调试窗口中的 Ledger / Replay 标签页
- [ ] 单步播放、快进、暂停、跳转到指定 Block
- [ ] 服务器 Replay 验证工具
- [ ] 离线 RNG 的确定性设计与服务器重算
- [ ] 异常账本审计与差异报告
- [ ] 从服务器确认点恢复客户端缓存
- [ ] 玩家历史行为的可视化回放

---


## 🖥️ 窗口系统：正常尺寸可配置，最大化不破坏现有 UI

所有常规弹窗继续使用 `shared/src/lib.rs` 中的 `UIWindowConfig` 正常尺寸参数；前端 `ui-window-config.js` 与其保持对应。窗口右上角提供独立的最大化/恢复按钮。最大化窗口只占据上下 HUD 之间的游戏区域，并保留轻微透明度，使玩家仍可看见背后的角色与世界。

原则：
- [x] 任务窗口支持最大化。
- [x] 其他主要窗口统一支持最大化/恢复。
- [x] 最大化时禁止拖动，恢复后回到原来的正常尺寸与位置。
- [x] 不因为窗口系统改造删除或重做已有正常游戏 UI。
- [ ] 后续逐个检查最大化后的内容布局、滚动区域和交互命中区，确保大窗口空间被充分利用。

## 🛡️ GM 调试工具：从“玩家列表”进入玩家档案

Debug 模式的定位逐步从普通开发调试台升级为 **GM / 运维管理工具**。

在 `👥 玩家` 标签页中，GM 可以点击任意玩家，进入该玩家的详细档案：

```text
玩家列表
   ↓ 点击玩家
玩家详细档案
   ├── 当前状态
   ├── 位置 / 等级 / 资产摘要
   ├── 最近行为账本
   ├── 完整行为账本
   ├── 服务端账本校验
   └── 录像回放
```

回放不再作为 Debug 的独立标签页，而是属于**某个玩家档案的管理能力**。这样“谁的录像，就在谁的档案里看”，也更符合未来 GM 审计、排查异常和回溯玩家状态的方向。

服务端开始保存已经通过 Hash Chain 校验的玩家 Ledger，并单独持久化到 `data/player_ledgers.json`；世界状态仍然由 `data/world_state.json` 代表，账本只是玩家历史行为的权威审计材料，两者职责分离。

> 注意：当前阶段的服务端账本回放仍属于 Replay Foundation。完整游戏状态重建仍需要逐步把正式游戏 Action Reducer 接入 Replay。

## 🧭 UI 改动原则

**账本架构升级不意味着重做现有游戏 UI。**

当前已经完成的地图、角色、背包、战斗、传送、铁砧、资源等功能，应优先保持不变。

后续如果账本系统确实需要可视化入口：

- 优先放入现有的**调试窗口（Debug Window）**；
- 可以增加新的标签页，例如 `Ledger` / `Replay` / `Sync`；
- 或在现有调试标签页中增加相关诊断信息；
- 正常玩家 UI 不因为账本架构而被迫改造；
- 除非明确需要，否则不删除已有功能、不改变已有交互。

调试窗口可以逐步成为开发者观察客户端“录像机”的地方，例如：

```text
Ledger
├── 当前 Block Height
├── 当前 Block Hash
├── Pending Blocks
├── Confirmed Blocks
├── Ledger 大小
├── 最近事件
└── Hash Chain 校验结果

Replay
├── 当前播放 Block
├── 播放 / 暂停
├── 单步
├── 快进
└── 从 Checkpoint 重放
```

---


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

## 📋 玩法任务与交付记录 (Task Checklist & Changelog)

> 💡 **所有已交付功能的详细设计、影响范围与测试记录已归档至日志目录：**  
> 🔗 **[📄 查看已交付任务归档 (LOG/DONE.md)](./LOG/DONE.md)**  
> 🔗 **[📂 浏览开发流转与排查日志 (LOG/)](./LOG/)**

### 📌 最新待办业务功能 (Active Gameplay Tasks)
- [ ] *（在此处持续添加新的玩法、数值与系统需求）*

---

## 🛠️ 路线图与工程 TODO (Roadmap & Technical Debt)

当前项目正处于**“架构收敛与工程成熟度提升”**阶段。接下来的核心目标是打磨现有世界模型的稳定性、一致性和安全性。

### 🔴 高优先级：核心稳定性重构 (High Priority)
- [ ] **重构客户端账本为 Player Action Ledger：** 明确账本记录“玩家做了什么”，而不是把客户端最终状态当作服务器真相。
- [ ] **明确 Client / Server 权力边界：** Server 为唯一权威状态；Client 负责本地模拟、记录与回放，联网后由 Server Replay / Verify。
- [ ] **设计 Ledger Block 协议：** 统一 `height / prev_hash / block_hash / action / payload / timestamp` 等字段，并保证连续性与可验证性。
- [ ] **设计离线同步流程：** 以 Server Confirmed Revision + Pending Blocks 为基础，避免两份 `world_state.json` 进行竞争式整文件验证。
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

## 🛠️ 构建与运行指令

### 1. 服务端 (Tokio Server)
```bash
cd Cyber-Forge/server
cargo run --release
```
默认在 `0.0.0.0:3000` 启动高性能 WebSocket 游戏世界状态机服务。

### 2. 客户端 WASM 编译 (Macroquad Client)
```bash
cd Cyber-Forge/client
# 添加 WASM 目标架构
rustup target add wasm32-unknown-unknown

# 编译为 WASM
cargo build --target wasm32-unknown-unknown --release
```
编译产物可直接嵌入 HTML Canvas，享受无 GC、60/120 FPS 纯 Rust 渲染体验。

---

## 🤝 参与贡献 (Contributing)

Cyber Forge 欢迎任何关于系统设计、Rust 性能优化或测试用例的讨论与 PR。
如果你对大型 MMO 的状态同步、动态经济模型感兴趣，欢迎与我交流！

**"We are not just adding features, we are simulating a world."**


### 第二阶段：录像回放（Replay）

第二阶段建立了“播放器”基础：Ledger 可以在独立审计状态中按顺序重放，不直接修改正在运行的 GameStore。

已完成：
- [x] Ledger 按高度读取、排序、定位
- [x] 起点 / 单步 / 全部回放
- [x] 基础审计状态投影
- [x] Replay 不直接污染正式游戏状态

### 第三阶段：GM 管理、玩家档案与服务端录像审计

第三阶段开始把 Replay 从“开发者单独查看本机录像”的功能，提升为 GM 管理工具的一部分。

当前方向：
- [x] Debug 玩家列表可点选玩家
- [x] 玩家详情页整合最近账本、完整账本、校验与回放
- [x] 服务端保存已验证玩家 Ledger
- [x] 服务端提供玩家详情与账本完整性状态
- [x] 主要 UI 弹窗统一支持最大化 / 恢复
- [x] 最大化窗口位于上下 HUD 之间，并保持轻微透明
- [ ] 将完整游戏规则 Reducer 接入 Replay
- [ ] 服务端使用同一 Replay 规则进行权威验证
- [ ] 完成离线 RNG 的确定性设计
- [ ] 完善 Ledger Checkpoint、分段、压缩和冲突处理

第三阶段的核心目标仍然没有改变：**Server 是世界真相；Client 记录玩家历史；GM 可以审计、校验并回放这段历史。**
