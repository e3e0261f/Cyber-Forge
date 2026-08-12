# P0+P1+P2 补丁说明

覆盖到项目根目录对应路径：

```
src-tauri/src/lib.rs
src-tauri/src/game/types.rs
src-tauri/src/game/state/actions.rs
src-tauri/src/game/state/upgrades.rs
src-tauri/src/game/state/market.rs
ui/js/body.js
ui/js/status.js
```

## 改动摘要

### P0
- `actions.rs`：删除未使用变量 `before`

### P1
- `game_tick`：每 5 tick 调用 `process_apprentice_work`（盲锻/磨/附/精）
- `action`：支持 `1_10`…`5_100` 批量调配（对接前端 Shift/Ctrl）
- `reassign_workers_n`：批量调配实现
- `UiSnapshot.title` + 前端身体素质标题显示称号

### P2
- `process_immortal_buyers` 开头驱动 `market_swarm.step`（云集人数更新）
- 拍场抬价记录 `last_buyer_title`
- 落槌成交调用 `grant_visitor_slag` 发铁浆

### 日志
- **未改** `push_log` / `LogFilter` / 滚动相关 API
- 网页仍全量刷新 `logs`，现有滚动行为保持不变
