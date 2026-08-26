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



# 🚀 Cyber Forge - 100% 纯 Rust / WASM 全栈架构 (rustCF2513)

本目录为全新重构的 **100% 纯 Rust 游戏全栈工程**，采用 Cargo Workspace 统一多包管理。

剑意 - 不同阶段剑剑意增加敌军DEBUFF持续时间增益。



---
## 📁 目录工程架构

```
rustCF2513/
├── Cargo.toml                  # 顶层 Workspace 配置文件
├── README.md                   # 架构与构建指南
├── shared/                     # 前后端共享数据契约 (Serde Struct / Enum)
│   ├── Cargo.toml
│   └── src/lib.rs              # 坐标、背包、商票、物价、阿尔比恩矿脉、WS 通信协议
├── server/                     # Tokio 异步并发服务端 (数万 CCU 高性能)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs             # Tokio 主事件循环与 WebSocket 会话分发
│       ├── market.rs           # 25-45分钟动态物价刷新与行情波动引擎
│       ├── gathering.rs        # 阿尔比恩式矿物储量递减 (Yield Pool) 与重生状态机
│       ├── commerce.rs         # 跨城商票签发、货殖防存仓漏洞校验与交割清算
│       └── world_topology.rs   # 九州 7 大主城与 60 野外据点拓扑网格及 Dijkstra 寻路
└── client/                     # 纯 Rust 客户端 (Macroquad 编译为 WASM)
    ├── Cargo.toml
    └── src/
        └── main.rs             # 纯 Rust Canvas 渲染、相机追踪与物理控制
```

---

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
