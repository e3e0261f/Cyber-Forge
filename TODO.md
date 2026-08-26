1 [DONE] 1.4、2.4、3.4、4.4、5.4、6.4、7.4、8.4的采集物和其他的采集物不一样，他们在采集次数结束后，便消失了。再次出现就是他们位置变动刷新的时间（6个小时以后）。
2 [DONE] 重构传送门 (Portal) 交互逻辑与判定判定距离（已实现“哈利波特9¾站台”严格实质接触判定，杜绝两门互传死循环）
一、 现状与问题 (The Problem) [已解决]
触发范围过大：已彻底解决，不再使用大半径感应，改为严格碰撞箱与极窄深度阈值判定。
两门互传死循环 (Portal Bouncing)：已彻底解决，过图重生安全内推设置为 120px，落点远超判定线，完全消除来回互吸问题。
二、 期望效果 (Expected Behavior) [已实现]
“哈利波特 9¾ 站台”体验：玩家必须主动“撞上”传送门，发生实质性的模型重合/碰撞才能触发。
极限交互距离：哪怕玩家距离传送门只有 5 到 10 个像素，也绝对不会被吸进去。
全局统一：游戏内所有类型的传送门（边界城门、中央虚空阵眼），强制统一使用 checkPortalTrigger 极短距离碰撞逻辑。
三、 具体的代码实现要求 (Action Items) [已交付]
统一抽象：全局统一 checkPortalTrigger 判定函数，前端（world-topology.js / input.js）、Rust 客户端（client/src/main.rs）、Rust 服务端（server/src/world_topology.rs）与 TypeScript（src/topology.ts）均已完全对齐。
修改触发阈值 (Radius / Collision)：方向门要求跨度 ±30px 且深度穿过门线 ±6px；中央阵眼要求核心重合 dist <= 24px。
安全重生偏移：PORTAL_SAFE_INSET / PORTAL_FALLBACK_INSET 统一为 120px。
3  
