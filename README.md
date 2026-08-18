# ⚔️ 《天道锻造大师 WEB版》 (Cyber-Forge)

> **当前版本**：`v2.5.10 (Game Feel Polish) + v1.0.0-beta (DreamQuest)`
> **版本代号**：`WEEB` (Web-Enabled Exponential Engine Base)
> **下一版本焦点**：🎮 Game Feel 游戏化打磨 (Juice 屏幕反馈 / 锻造动画状态机 / 成就系统)
> **核心架构**：Rust (Actix-web) 高并发微服务 + HTML5/Canvas 纯渲染引擎  
> **设计哲学**：**工业级高性能标准（零 DOM 污染、全屏硬件加速、0ms 打击感、无上限阶梯数值）**

---

## 🆕 最新更新：回合制MMORPG系统复刻 (v1.0.0-beta)

> **重大更新** - 完整的回合制战斗、多人队伍、任务系统、跑商、抓宝宝、帮派

### 📖 开发者必读 (Next Developer: Start Here!)

| 文档 | 内容 | 必读度 |
|------|------|--------|
| 📚 **[DreamQuest 系统手册](docs/DREAMQUEST_SYSTEM.md)** | 系统架构、API参考、代码示例 | ⭐⭐⭐⭐⭐ |
| 📝 **[更新日志](docs/CHANGELOG.md)** | 所有功能变更历史 | ⭐⭐⭐⭐ |
| 🔨 **[开发指南](docs/DEVELOPMENT.md)** | 如何添加新功能 | ⭐⭐⭐ |

### 🎮 系统速览

**回合制战斗** ⚡
```
玩家速度100 → 敌人速度60
第1回合: 玩家攻击 (-23.5 HP 暴击!) → 敌人攻击 (-8.2 HP)
第2回合: 玩家攻击 (-22 HP) → 敌人被冰冻无法行动
...战斗结束 → 胜利! 获得5000经验
```

**贡献度分配** 🤝
```
队伍4人打怪，获得1000经验
主输出(伤害50%) → 500 exp ✅ 赚翻了
辅助治疗(治疗40%) → 400 exp ✅ 感谢你们
坦克(防御10%) → 100 exp ✅ 还要感谢

帮助朋友打怪 → 获得1.5倍经验 + 友谊度 + 因果值
```

**任务类型** 📜
- **主线**: 推进剧情
- **日常**: 简单快速
- **副本**: 团队挑战
- **跑商**: 护送NPC过路点
- **抓宝宝**: 稀有度系统，低概率出极品
- **帮派**: 帮会日常

### 📂 文件导航

```
docs/
├── DREAMQUEST_SYSTEM.md    ← 系统使用手册 (必读!)
├── CHANGELOG.md             ← 更新日志
└── DEVELOPMENT.md           ← 开发指南 (待补充)

src/game/
├── combat_engine.rs         ← 回合制战斗引擎 (370行)
├── party.rs                 ← 多人队伍系统 (300行)
├── dreamquest.rs            ← 任务/副本/宝宝系统 (350行)
├── entity.rs                ← 实体定义 (200行)
├── world.rs                 ← 世界管理 (100行)
└── input.rs                 ← WASD输入系统 (80行)
```

### 🚀 快速开始 (5分钟)

1. **理解系统架构** (2分钟)
   ```bash
   # 打开这个文件，看系统架构图
   cat docs/DREAMQUEST_SYSTEM.md | head -50
   ```

2. **查看核心代码** (2分钟)
   ```bash
   # 查看战斗引擎的初始化方法
   grep -A 30 "initialize_combat" src/game/combat_engine.rs
   ```

3. **运行测试** (1分钟)
   ```bash
   cargo test --lib game::combat_engine::tests
   ```

---

## 🆕 增量更新：任务系统与交互增强

> 本节为最近一次增量更新说明，原有技术白皮书与开发路线保持不变。

### 更新内容

- **任务系统**：随机生成 3～8 个候选任务，最多同时接取 5 个；支持押镖、跑商、击杀目标、物品提交。
- **保证金**：接取时立即扣除任务指定的金币或仙玉；放弃任务损失全额保证金；完成并领取奖励时返还完整保证金。价值换算参考为 `1 仙玉 = 10,000` 金币。
- **离线倒计时**：押镖、跑商、击杀任务使用 Unix 时间戳，关闭页面后再次进入仍按真实时间计算；倒计时结束必定完成，不使用成功率判定。
- **手动物品提交**：玩家必须在任务窗口选择背包物品，后端会复核物品 ID、非工具属性和最低品质，提交成功后消耗物品。
- **奖励保护**：奖励支持金币、仙玉和神兵；背包满时神兵奖励保留在待领取任务中，不会丢失。
- **任务入口**：新增 `📋 任务(J)`，位置为 `拍阁(P) → 任务(J) → 学徒(M)`，快捷键为 `J`。
- **背包排序**：自动排序默认关闭，点击排序按钮后循环 `关闭 → 默认 → 品质 → 价格 → 时间 → 关闭`。
- **滚动条**：背包、拍卖行、日志页支持滚轮、轨道点击定位和滑块拖拽；任务窗口支持滚轮浏览。

### 任务接口

统一使用 `POST /api/action`，请求体格式：

```json
{ "key": "quest_accept_<任务ID>" }
```

| 动作 key | 用途 |
| --- | --- |
| `quest_accept_<id>` | 接取候选任务并扣保证金 |
| `quest_abandon_<id>` | 放弃任务，保证金不返还 |
| `quest_submit_<quest_id>_<item_id>` | 提交指定背包物品 |
| `quest_claim_<id>` | 领取奖励并返还保证金 |

任务数据随 `GET /api/state`、`POST /api/tick` 和动作响应返回：

```json
{
  "quests": [],
  "active_quests": [],
  "quest_next_refresh_secs": 300
}
```

候选任务字段包括 `id`、`kind`、`title`、`description`、`advanced`、`duration_secs`、`deposit`、`currency`、`reward`、`required_rank`；进行中任务还包括 `accepted_at`、`cooldown_end_secs` 等字段。

### 现有 API 快速使用

```text
GET  /api/state   获取完整游戏快照
POST /api/strike  手动挥锤并返回快照
POST /api/tick    推进心跳、任务倒计时、市场和自动化逻辑
POST /api/action  执行升级、货币、背包、拍卖和任务动作
```

示例：

```sh
curl http://127.0.0.1:8080/api/state
curl -X POST http://127.0.0.1:8080/api/tick
curl -X POST http://127.0.0.1:8080/api/action \
  -H 'Content-Type: application/json' \
  -d '{"key":"quest_accept_<任务ID>"}'
```

### 任务模块位置

- `src/game/quests.rs`：任务模型、刷新、保证金、倒计时、提交、放弃、领奖。
- `src/game/state/mod.rs`：`GameState.quests` 存档字段。
- `src/main.rs`：任务快照、`/api/tick` 推进和 `/api/action` 路由。
- `ui/js/quest-view.js`：任务窗口、任务卡片和手动物品选择。
- `ui/js/config.js`、`ui/js/input.js`、`ui/js/hud.js`：任务按钮、J 快捷键、交互与绘制接入。

### 验证命令

```sh
cargo fmt --all
cargo check
cargo test
git diff --check
```

---

---

## 🌟 架构演进与全景概览

本项目经历了从 **桌面端混合架构 (Tauri + DOM)** 到 **工业级纯 Web 架构 (Actix-web + Canvas)** 的彻底蜕变：
* **彻底脱离桌面壳子**：无需安装客户端，直接在任意现代浏览器中以 **60~144 FPS** 满血运行。
* **前后端极致解耦**：
  * **后端 (Rust / Actix-web)**：充当"天道总账房"，负责权威数值计算、高并发异步状态机、防作弊校验与数据持久化。
  * **前端 (Canvas / Pixi.js)**：充当"全息大世界与操作终端"，拥有独立的本地高刷物理时钟与 0ms 实时 QTE 判定，彻底消除网络抖动带来的读条回跳。

---

## ✅ 已完成功能清单 (Completed Features)

### 1. 🚀 后端与通信架构 (Backend & Network Engine)
- [x] **Actix-web 纯 Web 服务**：提供 `/api/state`、`/api/strike`、`/api/tick`、`/api/action` 四大高速 API，并内嵌托管静态前端资产。
- [x] **全按键 $O(1)$ 批量瞬时计算**：重构了所有升级与货币兑换逻辑，彻底消除慢速循环与请求超时，支持单次千万级批处理秒级入账。
- [x] **阶梯渡劫与残酷惩罚机制**：
  - 10层 (75%) $\to$ 11层 (80%) $\to$ 12层 (90%) $\to$ 13层 (91%) $\to$ 之后每层 $+1\%$（最高封顶 99%）。
  - 渡劫失败触发天劫反噬：真元溃散，修为尽失，贬回炼体境一重。
- [x] **大境界突破战力巅峰记忆**：重构 `total_level` 计算，引入 `max_total_level` 机制，确保大境界突破后战力与增益只涨不跌。
- [x] **神兵 64-bit 天道四维指纹位域打包** (`Fingerprint64`)：
  - 将 `24-bit 时辰天干` + `11-bit 地轴太极` + `12-bit 道德经印记` + `17-bit 始祖哈希` 压缩入单个 `u64`。
  - 通过 Base62 无损转码生成 8~10 位天道铭文短码（如 `#Z7kQ-9mA3F2`）。

---

### 2. 🎨 2D 赛博修真大世界 (2D Canvas / WebGL Visuals)
- [x] **全屏单一画布渲染**：彻底清除 HTML 布局标签，全屏 100vw $\times$ 100vh 由 GPU 直接绘制，零 DOM 布局开销。
- [x] **太古灵石神坛全景原画背景**：采用无损 Aspect-Ratio Cover 算法铺满，彻底消除拉伸畸变。
- [x] **黑金天道铁砧绝对锚定**：铁砧死死吸附在背景中央八卦石台的同心圆中心，随窗口缩放永不脱节。
- [x] **铁砧参数化自由微调面板** (`ANVIL_CONFIG`)：在代码顶部直接调节铁砧与圣剑的缩放、旋转角度与像素偏移。
- [x] **真实 2D 原画资产全盘接入**。
- [x] **0 延迟挥锤打击感系统**。
- [x] **纯本地 144Hz 物理时钟**。

---

### 3. 🖥️ 路线 A 全息赛博弹窗与交互 (Interactive Modals)
- [x] **顶部 HUD 看板与导航**。
- [x] **多窗口并存与拖拽记忆**。
- [x] **矩阵锦囊 (背包) 深度重构**。
- [x] **自动货币协议内置于背包页**。
- [x] **藏宝阁拍卖大厅全息弹窗**。
- [x] **学徒工坊全息弹窗**。
- [x] **全息神兵出生证明卡片**。
- [x] **右键赛博快捷菜单**。

---

### 4. ⌨️ 全键盘输入控制 (Input Engine)
- [x] **空格键疯狂扫射**。
- [x] **无极变速系统 CCVT** (Cyber-Forge Continuously Variable Transmission)：原"非空格键无上限指数级阶梯加速"算法系统，现正式命名为 CCVT 系统，提供丝滑、无上限的极速连击体验。
- [x] **MMO 独立开关键位**。
- [x] **系统快捷键放行**。
- [x] **独立系统配置文件**。

---

### 5. 🎮 MMORPG 系统 (DreamQuest System)
- [x] **回合制战斗引擎**：按速度排序、Buff/Debuff、暴击闪避、完整日志。
- [x] **多人队伍系统**：4种经验分配方式、贡献度计算、帮助朋友奖励。
- [x] **任务系统**：6种任务类型、目标系统、倒计时。
- [x] **跑商护送系统**：多路点、随机遭遇、动态奖励。
- [x] **宠物宝宝系统**：稀有度、捕捉率、属性成长。
- [x] **帮派工会系统**：成员管理、日常任务、基金系统。
- [x] **音效系统**：关键事件触发。
- [x] **文档系统**：完整手册、API参考、代码示例。

---

## 📌 未完成与未来开发路线图 (TODO List)

---

## 🎮 v2.5.10 游戏化打磨 (Game Feel Polish)

> **目标**：让《天道锻造大师》从"功能完整"进化到"像一个真正的游戏"
> **优先级**：🔴 P0(立竿见影) / 🟡 P1(重大提升) / 🟢 P2(锦上添花)
> **来源**：2026-08-18 全项目游戏感诊断

### 🔴 P0 — 游戏感四件套 (立即感知)

- [x] **音频系统**：WebAudio 程序化合成音效（锻造打击/升级突破/拍卖熔炼/地牢战斗/背景音乐），零外部资源依赖 ✅ v2.5.10
- [x] **Juice 屏幕反馈**：屏幕震动(弹簧式衰减 挥锤4px/暴击9px/渡劫24px) + 全屏闪光(暴击金色/渡劫白金+慢镜头) + 大飘字(完美暴击/天劫降临) + 连击聚能光晕(10连粉/20连白) ✅ v2.5.10
- [ ] **锻造动画状态机**：锤子惯性回弹 + 铁砧受击微缩回弹 + 火星四溅 + 三段式锻造进度(挥锤→融化→成形) + 圣剑成形金光爆发
- [ ] **成就系统**：后端 `achievements` 字段 + 前端全屏成就横幅弹窗（千锤百炼/神兵初成/渡劫飞升），奖励加成

### 🟡 P1 — 重大提升

- [ ] **新手引导**：黑色遮罩 + 聚光灯 + 指向箭头，引导挥锤→查看神兵→上架拍卖→接取任务的前 3 分钟完整流程
- [ ] **3D 化世界观表现**：昼夜循环 + 天气系统(雪/雨/雷劫乌云) + 远景多层视差 + 环境粒子(灵火/花瓣/铁屑)
- [ ] **地牢玩法接入真实奖励**：掉落铜钱/仙玉/铸造图纸，BOSS 掉稀有图纸，地牢进度接入任务系统（"深入地牢5层"）
- [ ] **数据可视化看板**：锻造统计(今日/平均品质/最佳神兵) + 成长曲线(等级/货币时间序列) + 拍卖行情走势 + 境界突破树

### 🟢 P2 — 锦上添花

- [ ] **弹幕飘字系统**：挥锤时随机飘出赛博修真语录（"天地为炉，造化为工！"）
- [ ] **角色化身系统**：可切换外观(铁匠/修士/机械师)，锻造时化身做挥锤动作，增加代入感
- [ ] **剧情碎片系统**：突破时弹出剧情文字（"天劫降临，苍穹雷动..."），收集记忆碎片解锁世界观档案
- [ ] **工坊升级视觉化**：背景随等级变换(破旧→崭新→赛博豪华)，炉火随等级增大变蓝，学徒数量随等级增加

---

### 阶段一：MMORPG API 实现 (Sprint 7)
- [ ] **战斗API端点**：`/api/combat/start`, `/api/combat/next-round`
- [ ] **队伍API端点**：`/api/party/create`, `/api/party/join`, `/api/party/leave`
- [ ] **任务API端点**：`/api/quest/accept`, `/api/quest/complete`
- [ ] **宝宝API端点**：`/api/beast/capture`, `/api/beast/train`

### 阶段二：MMORPG 前端UI (Sprint 8)
- [ ] **战斗日志窗口**
- [ ] **队伍管理界面**
- [ ] **任务列表面板**
- [ ] **宝宝养成界面**

### 阶段三：神兵四维生态深化与真实流转 (Sprint 2 残余)
- [ ] **神兵全息详情交互打磨**。

### 阶段四：密码学账号与天道安全体系 (Sprint 3)
- [ ] **《天道四言真经》助记词账号系统**。
- [ ] **非对称签名与信封加密体系 (KEK / DEK)**。
- [ ] **Actix-web 令牌桶限流与 Hashcash 反向算力反制**。

### 阶段五：凡人实业与现代赛博金融工程 (Sprint 4)
- [ ] **宗门外包代工工单 (B2B Manufacturing Orders)**。
- [ ] **五行大宗原料跨域跑商与空间套利**。
- [ ] **五行大宗原料期货合约 (Commodity Futures)**。
- [ ] **蓬莱离岸群岛避税与天劫隔离信托**。
- [ ] **神兵质押借贷与资产证券化 (ABS)**。

### 阶段六：天道法则、全服事件与量子双修 (Sprint 5)
- [ ] **全服【天道熵池】状态机**。
- [ ] **全服大天劫 (Server Tribulation) & 世界 Raid 事件**。
- [ ] **量子纠缠双修 (EPR Pair)**。
- [ ] **天道合道者与诸天反抗军**。

### 阶段七：2D 打怪大世界与地图引擎融合 (Sprint 6)
- [ ] **三位一体地图寻路引擎集成**。
- [ ] **玩家 2D 角色出门打怪与战斗视口**。
- [ ] **@pixi/ui 与 @pixi/sound 深度集成**。

### 阶段八：量子叠加态装备 (v2.5.2 规划)
- [ ] **未观测的混沌剑胚**。
- [ ] **神识观测 / 波函数坍缩开光**。

### 阶段九：2D 随机地牢探索与精美卡通骨骼动画 (Sprint 9 规划)
- [x] **Rogue-like 地牢生成算法核心**：实现基于 BSP (二叉空间分割) 的随机房间与走廊生成算法，先在控制台用打印二维数组的方式打通纯逻辑。
- [x] **高性能 2D 地牢渲染器**：结合 `PixiJS` + `@pixi/tilemap`，将地牢二维数组映射为画面，添加基于格子的移动和简单的 A* 寻路怪物 AI（深刻体会纯 Web 2D 开发中“数据与渲染分离”的快乐）。
- [x] **高品质人物骨骼动画表现**：引入 `Spine` 与 `@esotericsoftware/spine-pixi` 插件，打造精美绝伦的 2D / 矢量 / 欧美卡通风角色动画。

---

## 🏗️ 目录结构规范 (Current Structure)

```text
Cyber-Forge/
├── Cargo.toml                  # Rust 依赖声明
├── Cargo.lock
├── README.md                   # 本技术白皮书
│
├── docs/                       # 📖 文档中心 (必读!)
│   ├── DREAMQUEST_SYSTEM.md    # 🎮 MMORPG系统手册 ⭐⭐⭐⭐⭐
│   ├── CHANGELOG.md            # 更新日志
│   └── DEVELOPMENT.md          # 开发指南 (待补充)
│
├── src/
│   ├── main.rs                 # Actix-web 服务器、API 路由
│   │
│   └── game/                   # 纯 Rust 游戏核心逻辑
│       ├── mod.rs
│       ├── dao_origin.rs
│       ├── fingerprint.rs      # 64-bit 四维指纹压缩引擎
│       ├── market_swarm.rs
│       ├── numbers.rs
│       ├── realm.rs
│       ├── strike.rs
│       ├── sword_gen.rs
│       ├── titles.rs
│       ├── types.rs
│       │
│       ├── 🎮 DreamQuest MMORPG 模块 (新增)
│       ├── combat_engine.rs    # ⚡ 回合制战斗引擎
│       ├── party.rs            # 👥 多人队伍系统
│       ├── dreamquest.rs       # 📜 任务/副本/宝宝/跑商/帮派
│       ├── entity.rs           # 🎭 实体定义
│       ├── world.rs            # 🌍 世界管理
│       ├── input.rs            # ⌨️ WASD输入系统
│       │
│       └── state/              # 游戏状态管理
│           ├── mod.rs
│           ├── actions.rs
│           ├── encounters.rs
│           ├── market.rs
│           └── save.rs
│
└── ui/
    ├── assets/                 # 2D 高清原画切片素材库
    ├── index.html              # 纯净单一全屏 Canvas 入口
    ├── styles.css              # 全屏画布无边距重置
    └── js/
        ├── app.js              # 游戏引擎总调度器
        ├── core.js             # Web API 通信
        ├── config.js           # 全局系统参数
        ├── state.js            # 全局状态机
        ├── hud.js              # HUD 与弹窗框架
        ├── input.js            # 交互总控
        ├── stash-view.js       # 背包
        ├── auction-view.js     # 拍卖行
        ├── apprentice-view.js  # 学徒工坊
        └── world/              # 2D 工坊大世界
            ├── assets.js
            ├── environment.js
            ├── fx.js
            ├── workshop.js
            └── world.js
```

---

## 🔗 快速链接

### 文档中心 (必读!)

- 📚 **[DreamQuest MMORPG 系统手册](docs/DREAMQUEST_SYSTEM.md)** - 完整的API参考和使用指南
- 📝 **[更新日志](docs/CHANGELOG.md)** - 所有功能变更历史
- 🔨 **[开发指南](docs/DEVELOPMENT.md)** - 如何添加新功能 (待补充)

### 代码导航

- 🎮 **[回合制战斗引擎](src/game/combat_engine.rs)** - 370行，核心战斗逻辑
- 👥 **[多人队伍系统](src/game/party.rs)** - 300行，贡献度分配
- 📜 **[任务系统](src/game/dreamquest.rs)** - 350行，6种任务类型

---

## 💡 开发者指南

### 我是新开发者，从哪里开始?

1. 📖 **读这个** (5分钟)
   ```bash
   cat docs/DREAMQUEST_SYSTEM.md | head -100
   ```

2. 🔍 **看代码** (10分钟)
   ```bash
   # 查看战斗系统是如何初始化的
   grep -A 50 "impl TurnBasedCombatEngine" src/game/combat_engine.rs | head -30
   ```

3. ✅ **运行测试** (2分钟)
   ```bash
   cargo test --lib game::combat_engine
   ```

4. 🚀 **提交第一个改动**
   ```bash
   # 比如：添加新的Buff类型
   # 编辑 src/game/combat_engine.rs
   # 在 BuffType enum 中添加你的效果
   ```

### 我想添加什么功能?

| 功能 | 文件 | 难度 | 时间 |
|------|------|------|------|
| 新Buff类型 | `combat_engine.rs` | ⭐ 简单 | 30分钟 |
| 新任务类型 | `dreamquest.rs` | ⭐⭐ 中等 | 1小时 |
| 新API端点 | `src/main.rs` | ⭐⭐⭐ 困难 | 2小时 |
| 前端UI界面 | `ui/js/` | ⭐⭐⭐ 困难 | 3小时 |

---

## 🐛 报告问题

遇到bug或有改进建议? 欢迎提issue!

常见问题见 [DreamQuest系统手册 - 常见问题](docs/DREAMQUEST_SYSTEM.md#常见问题)

---

**维护者**: @eef  
**最后更新**: 2026-08-18  
**许可证**: MIT
