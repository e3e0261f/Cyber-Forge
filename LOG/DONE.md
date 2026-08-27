# ✅ 已交付功能与任务归档 (DONE.md)

本文件记录 Cyber-Forge 已经完整交付并经过全栈双向验证的所有玩法功能、系统优化与工程重构记录。

---

## 📅 2026-08 交付归档

### 1. 🌲 特殊等级资源节点限时枯竭与 6 小时周期重置
- **核心机制**：
  - `1.4`、`2.4`、`3.4`、`4.4`、`5.4`、`6.4`、`7.4`、`8.4` 的高阶/珍稀资源节点在采集满 8 次储量耗尽后，立即彻底消失（化为天地灵气消散），关闭自然储量缓慢回升机制。
  - 仅在全局 6 小时纪元周期刷新（Epoch Refresh）时，重新进行滑动窗口全局加权投放，并在新的随机坐标生成满储量资源。
- **涉及模块**：
  - 前端读条采集引擎：`server/static/js/input.js`
  - 场景渲染器：`server/static/js/world.js`
  - 拓扑与纪元刷新系统：`server/static/js/world/world-topology.js`
  - Rust 服务端储量协程：`server/src/gathering.rs`

---

### 2. 🌀 重构传送门 (Portal) 交互逻辑与判定距离（哈利波特 9¾ 站台机制）
- **核心机制**：
  - **严格物理相交判定**：彻底废弃早期超大范围（320px~500px）自动吸附，改为实质性物理碰撞触发。
    - **城门豁口（东/西/南/北）**：门洞通行宽度 ±30px，且深度穿越门线容差 6px。
    - **中央阵眼/虚空法阵**：内核重合判定（距离核心 ≤ 24px）。
    - 玩家在传送门 5~10px 范围行走完全不会发生误吸。
  - **彻底杜绝互吸死循环 (Portal Bouncing)**：
    - 统一过图重生安全内推常数 `PORTAL_SAFE_INSET` 与 `PORTAL_FALLBACK_INSET` 为 `120.0px`。
    - 玩家传送到达目标地图后，出生在安全距离（114px 内侧），即使挂机或静止也不会被反向门误吸回原地图。
  - **全栈多端对齐**：
    - 前端 JavaScript 统一 `checkPortalTrigger`；
    - Rust 共享库 `shared/src/lib.rs`、TypeScript `src/types.ts`、Rust 客户端 `client/src/world_topology.rs` 及服务端 `server/src/world_topology.rs` 严格统一。

---

### 3. 🛡️ 过图保护与传送冷却系统
- 每次传送后附加 5 秒传送阵充能冷却（`TELEPORT_COOLDOWN_SECS`）。
- 成功过图时赋予 30 秒无敌状态（`INVULNERABLE_DURATION_SECS`），随后进入 60 秒无敌疲劳期（`INVULNERABLE_FATIGUE_SECS`），防止利用跨地图切图无限刷新无敌保护。

---

### 4. 📜 商票信用机制与防作弊校验
- 签发商票交纳 30,000 铜钱押金，获得 300,000 信用额度。
- 持有商票状态下封禁快速传送（Fast Travel），必须通过野外地图真实护送商票至目标主城完成交割清算。
- 采用加权移动平均（VWAP）计算货物综合成本，彻底修复分批低买高卖的刷钱漏洞。

---

### 5. 🛠️ Rust 双模架构与无瑕疵编译
- 统一 Cargo Workspace（`shared`、`server`、`client`）。
- 建立 `check_rust.sh` 与双向同步检查，修复 `GateDef` -> `PortalDef` 等类型未决问题，保障纯 Rust 原版全栈工程 100% 编译通过。

---

## 📂 相关日志与索引
- [查看详细开发流转日志 (0827.log)](./0827.log)
- [返回项目主文档 README.md](../README.md)
