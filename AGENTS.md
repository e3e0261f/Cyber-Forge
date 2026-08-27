# Project Instructions & Rules

## 核心开发规范
1. **Rust 原版双向同步与编译验证（强制）**：
   - 任何涉及游戏逻辑、前端页面（`server/static/`）、通信协议、静态资源、拓扑数据、算法或配置的修改，必须**同时同步更新**到 `/Cyber-Forge/` 目录下的纯 Rust 原版工程。
   - 每次修改后，必须运行 `cargo check --manifest-path Cyber-Forge/Cargo.toml`（或针对 workspace 编译），检测 Rust 版本是否存在编译报错、类型不匹配或生命周期问题，并彻底除错直至编译通过。

2. **双模并行架构**：
   - 根目录环境：负责 Web 开发、快速调试、UI 原型与实时容器热览。
   - `Cyber-Forge/` 目录：负责纯 Rust 原版全栈工程（包含 Tokio 服务端、Macroquad/WASM 客户端、九州拓扑与 Shared 协议库），保持生产级无瑕疵编译。

3. **TODO 与日志管理路径**：
   - 需求待办统一维护在 `/Cyber-Forge/README.md` 的【玩法任务与交付记录】及【路线图与工程 TODO】中。
   - 所有已交付功能的归档及历史流转日志统一维护在 `/Cyber-Forge/LOG/` 目录下（如 `/Cyber-Forge/LOG/DONE.md` 与 `LOG/*.log`），并在 `README.md` 中保留索引链接。
