use actix_web::{web, HttpRequest, HttpResponse};
use cyber_forge_shared::*;
use tracing::{info, warn};
use std::sync::Arc;

use crate::WorldState;
use crate::auth::extract_account_id;
use crate::commerce::CommerceEngine;
use crate::errors::ApiError;
use crate::gathering::migrate_legacy_gather_names;
use super::state::build_player_snapshot;

/// 专门用来响应前端游戏动作指令的 POST /api/action 接口
pub async fn api_action_handler(
    req: HttpRequest,
    world: web::Data<Arc<WorldState>>,
    body: Option<web::Json<serde_json::Value>>,
) -> Result<HttpResponse, ApiError> {
    let mut action_key = String::new();
    let mut custom_x: Option<f64> = None;
    let mut custom_y: Option<f64> = None;
    let mut custom_zone: Option<String> = None;

    let account_id = if let Some(ref b) = body {
        if let Some(act) = b.get("key").or_else(|| b.get("action")).and_then(|v| v.as_str()) {
            action_key = act.to_string();
        }
        if let Some(x) = b.get("player_x").or_else(|| b.get("x")).and_then(|v| v.as_f64()) {
            custom_x = Some(x);
        }
        if let Some(y) = b.get("player_y").or_else(|| b.get("y")).and_then(|v| v.as_f64()) {
            custom_y = Some(y);
        }
        if let Some(zid) = b.get("zone_id").and_then(|v| v.as_str()) {
            custom_zone = Some(zid.to_string());
        }
        extract_account_id(&req, Some(&b.0))
    } else {
        extract_account_id(&req, None)
    };

    info!("🎮 收到前端 HTTP 动作指令 [{}]: {}", account_id, action_key);

    // 使用原子操作获取并修改玩家状态
    let mut player = world.get_ref().get_or_create_player(&account_id);

    // 🌟 旧采集物命名迁移 (幂等): 背包与银行中无品阶后缀的采集物统一改为 名字·T品阶.子品阶,
    //    使旧账本与新版命名对齐 (四圆点可推导 / 同名即同物 / 堆叠隔离)
    migrate_legacy_gather_names(&mut player.backpack);
    migrate_legacy_gather_names(&mut player.bank_items);
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // 🌟 活动心跳: 任何动作指令均视为在线证据 (与 tick 轮询共同支撑真实在线判定)
    player.last_active_at = now_secs;

    // 若客户端随动作附带了最新物理坐标与区域，同步更新玩家当前所在坐标（传送门指令除外）
    if !action_key.starts_with("teleport_zone:") {
        if let Some(zid) = custom_zone {
            player.position.zone_id = zid;
        }
        if let (Some(x), Some(y)) = (custom_x, custom_y) {
            player.position.x = x.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
            player.position.y = y.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
            player.position.last_updated = now_secs;
        }
    }

    // 分发到具体的动作处理器
    let result = match action_key.as_str() {
        key if key.starts_with("teleport_zone:") => handle_teleport(&mut player, key, &world, now_secs, false),
        key if key.starts_with("fast_travel:") => handle_teleport(&mut player, key, &world, now_secs, true),
        "sync_pos" => handle_sync_pos(&mut player, custom_x, custom_y, now_secs),
        "strike_mine" | "gather_zone_resource" => handle_gather(&mut player, &body, &world, now_secs),
        key if key.starts_with("drop_item") => handle_drop_item(&mut player, key, &body),  
        "audit_movement_report" => handle_movement_audit(&mut player, &body, &world),
        "audit_item_drop" => handle_audit_item_drop(&account_id),
        "audit_item_gain" => handle_audit_item_gain(&account_id, &body),
        "sync_hash_chain" => handle_hash_chain_sync(&mut player, &body, &world),
        "cloud_state_snapshot" => handle_cloud_snapshot(&mut player, &body, &world),
        "buy_trade_good" => handle_buy_trade_good(&mut player, &body, &world),
        "sell_trade_good" => handle_sell_trade_good(&mut player, &body),
        "settle_merchant_ticket" => handle_settle_ticket(&mut player),
        "issue_merchant_ticket" => handle_issue_ticket(&mut player, &body),
        "build_caravan" => handle_build_caravan(&mut player, &body, &world, now_secs),
        "unload_caravan" => handle_unload_caravan(&mut player, &world),
        "bank_deposit" => handle_bank_deposit(&mut player, &body),
        "bank_withdraw" => handle_bank_withdraw(&mut player, &body),
        key if key.starts_with("list_item") => handle_list_item(&mut player, key, &body),
        key if key.starts_with("melt_item") => handle_melt_item(&mut player, key, &body),
        key if key.starts_with("recycle_equipment") => handle_recycle_equipment(&mut player, key, &body),
        key if key.starts_with("use_item") => handle_use_item(&mut player, key, &body),
        _ => Ok(None),
    };

    // 处理结果
    match result {
        Ok(Some(early_response)) => return Ok(early_response),
        Ok(None) => {},
        Err(api_err) => return Ok(ApiError::to_response(&api_err)),
    }

    // 更新回中央状态机 (含刚刷新的活动心跳)
    world.get_ref().players.insert(account_id.clone(), player.clone());
    let bp_items: Vec<String> = player.backpack.iter().map(|i| format!("{}x{}", i.name, i.stack_count)).collect();
    info!("🎮 玩家 [{}] 已写入中央状态机 (在线: {}, 注册: {}, 背包: {:?})", account_id, world.get_ref().online_count(), world.get_ref().players.len(), bp_items);

    // 直接返回平铺的标准快照 JSON
    Ok(HttpResponse::Ok().json(build_player_snapshot(&player, world.get_ref())))
}

/// 传送门 / 过图指令处理
fn handle_teleport(
    player: &mut PlayerState,
    action_key: &str,
    world: &WorldState,
    now_secs: u64,
    is_fast_travel: bool, // 🌟 新增参数
) -> Result<Option<HttpResponse>, ApiError> {
    
    // 🌟 商票跑商行动限制: 只有“远程飞行(fast_travel)”才会被拦截，物理走传送门放行！
    if is_fast_travel && player.merchant_ticket.as_ref().map(|t| t.is_active).unwrap_or(false) {
        let mut snap = build_player_snapshot(player, world);
        snap["toast"] = serde_json::Value::String("⚠️ 持有商票期间严禁飞行与快速传送，必须走过图点！".to_string());
        return Ok(Some(HttpResponse::Ok().json(snap)));
    }

    // 自动剥离前缀获取目标地图
    let target_zone = if action_key.starts_with("teleport_zone:") {
        action_key.strip_prefix("teleport_zone:").unwrap_or("beijing")
    } else {
        action_key.strip_prefix("fast_travel:").unwrap_or("beijing")
    };
    
    let from_zone_id = player.position.zone_id.clone();

    // 传送冷却判定
    if now_secs < player.teleport_cooldown_until {
        let cd_left = player.teleport_cooldown_until - now_secs;
        info!("⏳ 玩家 [{}] 传送冷却中，剩余 {} 秒", player.account_id, cd_left);
        return Ok(Some(HttpResponse::Ok().json(build_player_snapshot(player, world))));
    }

    // 附加传送冷却
    player.teleport_cooldown_until = now_secs + GameConfig::TELEPORT_COOLDOWN_SECS;

    // 无敌与疲劳状态机判定
    if now_secs >= player.invulnerable_fatigue_until {
        player.invulnerable_until = now_secs + GameConfig::INVULNERABLE_DURATION_SECS;
        player.invulnerable_fatigue_until = now_secs + GameConfig::INVULNERABLE_FATIGUE_SECS;
        info!("🛡️ 玩家 [{}] 获得 {} 秒过图无敌保护", player.account_id, GameConfig::INVULNERABLE_DURATION_SECS);
    } else {
        info!("💤 玩家 [{}] 处于无敌疲劳中，未获得无敌保护", player.account_id);
    }

    if let Some(zone) = world.topology.zones.get(target_zone) {
        let (rx, ry) = world.topology.get_portal_rebirth_pos(&from_zone_id, target_zone);
        player.position.zone_id = zone.id.clone();
        player.position.x = rx;
        player.position.y = ry;
    } else {
        player.position.zone_id = target_zone.to_string();
        player.position.x = GameConfig::DEFAULT_SPAWN_X;
        player.position.y = GameConfig::DEFAULT_SPAWN_Y;
    }
    player.position.last_updated = now_secs;
    info!("🌀 玩家 [{}] 成功传送至区域 [{}] 坐标 ({}, {})", player.account_id, player.position.zone_id, player.position.x, player.position.y);
    Ok(None)
}

/// 坐标平滑同步处理
fn handle_sync_pos(
    player: &mut PlayerState,
    custom_x: Option<f64>,
    custom_y: Option<f64>,
    now_secs: u64,
) -> Result<Option<HttpResponse>, ApiError> {
    if let (Some(x), Some(y)) = (custom_x, custom_y) {
        player.position.x = x.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
        player.position.y = y.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
        player.position.last_updated = now_secs;
    }
    Ok(None)
}

/// 采集处理
fn handle_gather(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
    world: &WorldState,
    now_secs: u64,
) -> Result<Option<HttpResponse>, ApiError> {
    if let (Some(x), Some(y)) = (
        body.as_ref().and_then(|b| b.get("player_x").or_else(|| b.get("x")).and_then(|v| v.as_f64())),
        body.as_ref().and_then(|b| b.get("player_y").or_else(|| b.get("y")).and_then(|v| v.as_f64())),
    ) {
        player.position.x = x.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
        player.position.y = y.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
        player.position.last_updated = now_secs;
    }

    let is_crit = body.as_ref().and_then(|b| b.get("is_crit").and_then(|v| v.as_bool())).unwrap_or(false);
    let is_perfect = body.as_ref().and_then(|b| b.get("is_perfect").and_then(|v| v.as_bool())).unwrap_or(false);
    let default_yield = if is_perfect { GameConfig::GATHER_YIELD_PERFECT } else if is_crit { GameConfig::GATHER_YIELD_CRIT } else { GameConfig::GATHER_YIELD_NORMAL };
    let requested_count = body.as_ref()
        .and_then(|b| b.get("count").and_then(|v| v.as_u64()))
        .map(|v| v as u32)
        .unwrap_or(default_yield);
    let final_harvest_count = requested_count.max(default_yield);

    let custom_node_id = body.as_ref()
        .and_then(|b| b.get("target_node_id").or_else(|| b.get("node_id")).or_else(|| b.get("target_node")).and_then(|v| v.as_str()))
        .unwrap_or("");
    
    let target_node_id = if !custom_node_id.is_empty() {
        custom_node_id.to_string()
    } else {
        // 自动检索当前区域最近矿物
        let mut nearest_id = String::new();
        let mut min_d = GameConfig::GATHER_DISTANCE_MAX;
        if let Some(zone) = world.topology.zones.get(&player.position.zone_id) {
            for res in &zone.resources {
                let d = ((player.position.x - res.x).powi(2) + (player.position.y - res.y).powi(2)).sqrt();
                if d <= min_d {
                    min_d = d;
                    nearest_id = res.id.clone();
                }
            }
        }
        nearest_id
    };

    if !target_node_id.is_empty() {
        info!("⛏️ 采集请求: node_id={}, is_crit={}, is_perfect={}, count={}", target_node_id, is_crit, is_perfect, final_harvest_count);

        // 🌟 解析客户端携带的节点自身定义 (动态节点不在服务端静态拓扑, 以此作为权威产出回退):
        //    target_item = yieldItem; target_resource = { tier, type, ... }
        let client_hint = body.as_ref().and_then(|b| {
            let name = b.get("target_item").and_then(|v| v.as_str()).map(|s| s.to_string());
            let res = b.get("target_resource");
            let tier = res.and_then(|r| r.get("tier")).and_then(|v| v.as_u64()).map(|v| v as u8).unwrap_or(1);
            let rtype = res.and_then(|r| r.get("type")).and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_default();
            name.map(|n| (n, tier, rtype))
        });

        match world.gathering.mine_node(
            &target_node_id,
            is_crit,
            is_perfect,
            player.position.x,
            player.position.y,
            &player.position.zone_id,
            &world.topology,
            client_hint,
        ) {
            Ok((item, _)) => {
                let incoming_weight = item.weight * (final_harvest_count as f64);
                info!("⛏️ mine_node 成功: name={}, id={}, weight={:.1}", item.name, item.item_id, incoming_weight);
                // 允许超重入包 (游戏设计: 背包可超容量上限最高10倍，超重仅减速不阻止入包)
                player.copper += GameConfig::GATHER_COPPER_PER_UNIT * (final_harvest_count as u64);
                // 🌟 堆叠条件: 仅按名字。采集物命名已含品阶后缀 (花岗岩·T5.1), 同名即同物;
                //    若叠加 item_id 相等条件, 快照落库物品 (item_id=物品名) 与结算新堆 (item_id=mat_tX_xxx)
                //    会因 item_id 不同而永不合并, 产生同名双堆 (快照/结算竞态下必现)
                if let Some(existing) = player.backpack.iter_mut().find(|i| i.name == item.name) {
                    let old_count = existing.stack_count;
                    existing.stack_count += final_harvest_count;
                    info!("⛏️ 堆叠: [{}] {} → {}", item.name, old_count, existing.stack_count);
                } else {
                    // 新物品类型 → 直接新增一格 (不限制格数硬上限，超重由负重惩罚系统处理)
                    let mut new_item = item.clone();
                    new_item.stack_count = final_harvest_count;
                    player.backpack.push(new_item);
                    info!("⛏️ 新增: [{}] x{} (格数: {}/{})", item.name, final_harvest_count, player.backpack.len(), player.max_backpack);
                }
                player.recalculate_weight();
                info!("⛏️ 入包完成: 格数={}/{}, 负重={:.1}/{:.1}KG", player.backpack.len(), player.max_backpack, player.current_weight, player.max_weight);
            }
            Err(err_msg) => {
                info!("⛏️ 开采失败: {}", err_msg);
            }
        }
    }
    Ok(None)
}

/// 丢弃物品处理
fn handle_drop_item(
    player: &mut PlayerState,
    action_key: &str,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    let target_item_id = body.as_ref().and_then(|b| b.get("item_id").and_then(|v| v.as_str()))
        .or_else(|| action_key.strip_prefix("drop_item:"));
    let drop_index = body.as_ref().and_then(|b| b.get("index").and_then(|v| v.as_u64())).map(|i| i as usize);

    if let Some(idx) = drop_index {
        if idx < player.backpack.len() {
            let dropped = player.backpack.remove(idx);
            info!("🗑️ 玩家 [{}] 丢弃第 [{}] 格物品 [{}] x{} (释放 {:.1}KG)", 
                player.account_id, idx, dropped.name, dropped.stack_count, dropped.weight * (dropped.stack_count as f64));
        }
    } else if let Some(iid) = target_item_id {
        if let Some(pos) = player.backpack.iter().position(|it| it.id == iid || it.item_id == iid) {
            let dropped = player.backpack.remove(pos);
            info!("🗑️ 玩家 [{}] 丢弃物品 [{}] x{} (释放 {:.1}KG)", 
                player.account_id, dropped.name, dropped.stack_count, dropped.weight * (dropped.stack_count as f64));
        }
    }
    player.recalculate_weight();
    Ok(None)
}

/// 移动审计处理
fn handle_movement_audit(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
    world: &WorldState,
) -> Result<Option<HttpResponse>, ApiError> {
    if let Some(b) = body.as_ref() {
        let start_x = b.get("start_x").and_then(|v| v.as_f64()).unwrap_or(player.position.x);
        let start_y = b.get("start_y").and_then(|v| v.as_f64()).unwrap_or(player.position.y);
        let end_x = b.get("end_x").and_then(|v| v.as_f64()).unwrap_or(player.position.x);
        let end_y = b.get("end_y").and_then(|v| v.as_f64()).unwrap_or(player.position.y);
        let duration = b.get("duration_secs").and_then(|v| v.as_f64()).unwrap_or(1.0).max(0.1);

        let dist = ((end_x - start_x).powi(2) + (end_y - start_y).powi(2)).sqrt();
        let avg_speed = dist / duration;
        if avg_speed > GameConfig::MAX_MOVE_SPEED {
            warn!("🚨 [AntiCheat] 玩家 [{}] 移动超速瞬移违规: {:.1} px/s", player.account_id, avg_speed);
            let mut snap = build_player_snapshot(player, world);
            snap["security_violation"] = serde_json::Value::Bool(true);
            snap["kick"] = serde_json::Value::Bool(true);
            snap["reason"] = serde_json::Value::String(format!("移动超速瞬移 (平均移速: {:.0} px/s, 超过极限 {} px/s)", avg_speed, GameConfig::MAX_MOVE_SPEED as i32));
            return Ok(Some(HttpResponse::Ok().json(snap)));
        }
        player.position.x = end_x.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
        player.position.y = end_y.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
    }
    Ok(None)
}

/// 物品丢弃审计处理
fn handle_audit_item_drop(account_id: &str) -> Result<Option<HttpResponse>, ApiError> {
    info!("🛡️ [Audit] 收到玩家 [{}] 物品丢弃审计报告", account_id);
    Ok(None)
}

/// 物品获得审计处理 (区块链背书: 本地 HashChain gain 块 + 云端快照双保险)
fn handle_audit_item_gain(account_id: &str, body: &Option<web::Json<serde_json::Value>>) -> Result<Option<HttpResponse>, ApiError> {
    let name = body.as_ref().and_then(|b| b.get("name").and_then(|v| v.as_str())).unwrap_or("未知物品");
    let count = body.as_ref().and_then(|b| b.get("count").and_then(|v| v.as_u64())).unwrap_or(1);
    let source = body.as_ref().and_then(|b| b.get("source").and_then(|v| v.as_str())).unwrap_or("unknown");
    info!("🛡️ [Audit] 收到玩家 [{}] 物品获得审计报告: [{}] x{} (来源: {})", account_id, name, count, source);
    Ok(None)
}

/// 区块链对账处理
fn handle_hash_chain_sync(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
    world: &WorldState,
) -> Result<Option<HttpResponse>, ApiError> {
    if let Some(b) = body.as_ref() {
        if let Some(blocks_val) = b.get("blocks").and_then(|v| v.as_array()) {
            let mut curr_h = player.block_height;
            let mut curr_hash = player.block_hash.clone();
            let mut is_valid = true;
            let mut is_tampered = false;
            let mut violation_msg = String::new();
            let mut verified_count = 0;
            let mut verified_blocks: Vec<ActionLogBlock> = Vec::new();

            for blk_val in blocks_val {
                if let Ok(block) = serde_json::from_value::<ActionLogBlock>(blk_val.clone()) {
                    if block.height <= player.block_height {
                        continue;
                    }
                    if block.height != curr_h + 1 {
                        is_valid = false;
                        violation_msg = format!("区块高度不连续 (期望 #{}, 实际 #{})", curr_h + 1, block.height);
                        break;
                    }
                    if block.prev_hash != curr_hash {
                        is_valid = false;
                        violation_msg = format!("父哈希不匹配 (期望 {}, 实际 {})", curr_hash, block.prev_hash);
                        break;
                    }
                    if !block.verify() {
                        is_valid = false;
                        is_tampered = true;
                        violation_msg = format!("区块哈希签名校验失败 (Block #{})", block.height);
                        break;
                    }

                    // 🌟 服务端 Rust 经济验证协程 (抽检动作合法性、状态重放与数值界限)
                    let mut replayed_copper_delta: i64 = 0;
                    let mut replayed_exp_delta: u64 = 0;

                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&block.payload_json) {
                        match block.action_type.as_str() {
                            "gain" | "coin_change" => {
                                if let Some(delta) = val.get("delta").or_else(|| val.get("count")).and_then(|v| v.as_i64()) {
                                    if delta.abs() > 10_000_000 {
                                        is_valid = false;
                                        is_tampered = true;
                                        violation_msg = format!("检测到异常经济数值注入 (Block #{}, delta: {})", block.height, delta);
                                        break;
                                    }
                                    replayed_copper_delta += delta;
                                }
                            }
                            "strike_forge" => {
                                let tier = val.get("tier").and_then(|v| v.as_u64()).unwrap_or(1);
                                if tier > 10 {
                                    is_valid = false;
                                    is_tampered = true;
                                    violation_msg = format!("锻造品阶超限 (Block #{}, tier: {})", block.height, tier);
                                    break;
                                }
                                replayed_exp_delta += 20 * tier;
                            }
                            "strike_mine" | "gather" => {
                                let count = val.get("count").and_then(|v| v.as_u64()).unwrap_or(1);
                                if count > 100 {
                                    is_valid = false;
                                    is_tampered = true;
                                    violation_msg = format!("单次采集产出异常 (Block #{}, count: {})", block.height, count);
                                    break;
                                }
                                replayed_copper_delta += (GameConfig::GATHER_COPPER_PER_UNIT * count) as i64;
                            }
                            "trade_sell" => {
                                let price = val.get("unit_price").or_else(|| val.get("price")).and_then(|v| v.as_i64()).unwrap_or(0);
                                let count = val.get("count").and_then(|v| v.as_i64()).unwrap_or(1);
                                let total = price * count;
                                if total < 0 || total > 5_000_000 {
                                    is_valid = false;
                                    is_tampered = true;
                                    violation_msg = format!("单笔特产售出金额异常 (Block #{}, total: {})", block.height, total);
                                    break;
                                }
                                replayed_copper_delta += total;
                            }
                            "trade_buy" => {
                                let price = val.get("unit_price").or_else(|| val.get("price")).and_then(|v| v.as_i64()).unwrap_or(0);
                                let count = val.get("count").and_then(|v| v.as_i64()).unwrap_or(1);
                                let total = price * count;
                                replayed_copper_delta -= total;
                            }
                            _ => {}
                        }
                    }

                    // 抽检客户端断言数值与服务端重放一致性
                    if let Some(asserted_copper) = b.get("asserted_copper").or_else(|| b.get("client_copper")).and_then(|v| v.as_i64()) {
                        let expected_copper = (player.copper as i64) + replayed_copper_delta;
                        if (asserted_copper - expected_copper).abs() > 500_000 {
                            is_valid = false;
                            is_tampered = true;
                            violation_msg = format!("账本重放断言失败: 服务端计算期望铜钱 {}, 客户端断言 {}, 差距过大", expected_copper, asserted_copper);
                            break;
                        }
                    }
                    curr_h = block.height;
                    curr_hash = block.block_hash.clone();
                    verified_blocks.push(block);
                    verified_count += 1;
                }
            }

            if !is_valid {
                if is_tampered {
                    warn!("🚨 [AntiCheat] 玩家 [{}] 区块链签名篡改: {}", player.account_id, violation_msg);
                    let mut snap = build_player_snapshot(player, world);
                    snap["security_violation"] = serde_json::Value::Bool(true);
                    snap["kick"] = serde_json::Value::Bool(true);
                    snap["reason"] = serde_json::Value::String(format!("区块链篡改: {}", violation_msg));
                    snap["rollback_height"] = serde_json::Value::Number(serde_json::Number::from(player.block_height));
                    snap["rollback_hash"] = serde_json::Value::String(player.block_hash.clone());
                    return Ok(Some(HttpResponse::Ok().json(snap)));
                } else {
                    info!("🔄 [HashChain] 玩家 [{}] 区块链断层 ({})，自动以云端权威基线 (#{}) 重新同步", player.account_id, violation_msg, player.block_height);
                    let mut snap = build_player_snapshot(player, world);
                    snap["override_with_cloud"] = serde_json::Value::Bool(true);
                    snap["block_height"] = serde_json::Value::Number(serde_json::Number::from(player.block_height));
                    snap["block_hash"] = serde_json::Value::String(player.block_hash.clone());
                    return Ok(Some(HttpResponse::Ok().json(snap)));
                }
            } else {
                if !verified_blocks.is_empty() {
                    world.player_ledgers.entry(player.account_id.clone()).or_default().extend(verified_blocks);
                }
                let prev_h = player.block_height;
                player.block_height = curr_h;
                player.block_hash = curr_hash;
                if verified_count > 0 && curr_h > prev_h {
                    info!("⛓️ [HashChain] 玩家 [{}] 对账通过，更新最新高度 #{} (+{} blocks)", player.account_id, player.block_height, verified_count);
                }
            }
        }
    }
    Ok(None)
}

/// 云端快照处理 (🌟 区块链背书: 快照携带的背包在此落库, 保证刷新页面后资产从云端账本恢复)
fn handle_cloud_snapshot(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
    world: &WorldState,
) -> Result<Option<HttpResponse>, ApiError> {
    if let Some(b) = body.as_ref() {
        let client_h = b.get("block_height").and_then(|v| v.as_u64()).unwrap_or(0);
        let client_hash = b.get("block_hash").and_then(|v| v.as_str()).unwrap_or("0000000000000000genesis_hash");
        let prev_h = player.block_height;
        if client_h >= prev_h {
            player.block_height = client_h;
            player.block_hash = client_hash.to_string();
            if let Some(px) = b.get("player_x").and_then(|v| v.as_f64()) { player.position.x = px.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX); }
            if let Some(py) = b.get("player_y").and_then(|v| v.as_f64()) { player.position.y = py.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX); }
            if let Some(zid) = b.get("current_zone_id").and_then(|v| v.as_str()) { player.position.zone_id = zid.to_string(); }
            if let Some(c) = b.get("copper").and_then(|v| v.as_u64()) { player.copper = c; }
            if let Some(c) = b.get("coins").and_then(|v| v.as_u64()) { player.coins = c; }
            if let Some(j) = b.get("jade").or_else(|| b.get("sky_jade")).and_then(|v| v.as_u64()) { player.jade = j; }

            // 🌟 快照背包落库: 客户端 HashChain 锚定的全量资产快照是权威账本,
            //    落库后刷新页面 /api/state 即可恢复, 解决物品刷新丢失问题。
            //    安全规则: 拒绝用空快照覆盖非空服务端背包, 除非客户端区块高度严格领先 (防止陈旧快照误删)
            if let Some(bp) = b.get("backpack").and_then(|v| v.as_array()) {
                let parsed: Vec<GameItem> = bp.iter().filter_map(parse_snapshot_item).collect();
                if !parsed.is_empty() || client_h > prev_h || player.backpack.is_empty() {
                    let old_len = player.backpack.len();
                    // 🌟 落库前同名堆归并 (防御快照自身携带重复堆, 保持服务端账本无同名双堆)
                    let mut deduped: Vec<GameItem> = Vec::new();
                    for it in parsed {
                        if let Some(exist) = deduped.iter_mut().find(|x| x.name == it.name) {
                            exist.stack_count = exist.stack_count.saturating_add(it.stack_count);
                        } else {
                            deduped.push(it);
                        }
                    }
                    // 🌟 陈旧快照可能仍携带旧命名 (客户端尚未同步迁移), 落库前再迁移一次防回弹
                    migrate_legacy_gather_names(&mut deduped);
                    player.backpack = deduped;
                    player.recalculate_weight();
                    info!("☁️ [Snapshot] 玩家 [{}] 云端快照背包已落库 ({} 格 → {} 格, 负重 {:.1}KG)", player.account_id, old_len, player.backpack.len(), player.current_weight);
                } else {
                    warn!("☁️ [Snapshot] 拒绝用空快照覆盖玩家 [{}] 非空服务端背包 (客户端高度 #{} = 服务端 #{} 且未推进)", player.account_id, client_h, prev_h);
                }
            }

            info!("☁️ [Snapshot] 成功保存玩家 [{}] 延迟云端快照 (Block #{})", player.account_id, player.block_height);
        } else {
            let mut snap = build_player_snapshot(player, world);
            snap["override_with_cloud"] = serde_json::Value::Bool(true);
            return Ok(Some(HttpResponse::Ok().json(snap)));
        }
    }
    Ok(None)
}

/// 🌟 字段宽容解析客户端快照物品 (客户端驼峰/下划线混用且携带额外渲染字段, 缺失字段回退默认值)
fn parse_snapshot_item(v: &serde_json::Value) -> Option<GameItem> {
    if !v.is_object() { return None; } // 过滤 null 空槽位与非对象项
    let name = v.get("name").and_then(|x| x.as_str()).filter(|s| !s.is_empty())?.to_string();
    let id = v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string())
        .unwrap_or_else(|| format!("snap_{}", calculate_hash(&name)));
    let item_id = v.get("item_id").or_else(|| v.get("itemId")).and_then(|x| x.as_str()).map(|s| s.to_string())
        .unwrap_or_else(|| name.clone());
    let item_type = match v.get("itemType").or_else(|| v.get("item_type")).and_then(|x| x.as_str()).unwrap_or("Material") {
        "Equipment" => ItemType::Equipment,
        "Consumable" => ItemType::Consumable,
        "TradeGood" => ItemType::TradeGood,
        _ => ItemType::Material, // 'Tool' 等未知类型统一归为 Material
    };
    let stack_count = v.get("stack_count").or_else(|| v.get("stackCount")).and_then(|x| x.as_u64()).unwrap_or(1).max(1) as u32;
    let max_stack = v.get("max_stack").and_then(|x| x.as_u64()).unwrap_or(99999999).max(1) as u32;
    let tier = v.get("tier").and_then(|x| x.as_u64()).unwrap_or(1).min(255) as u8;
    let weight = v.get("weight").and_then(|x| x.as_f64()).unwrap_or(GameConfig::WEIGHT_DEFAULT);
    Some(GameItem {
        id,
        item_id,
        name,
        item_type,
        tier,
        stack_count,
        max_stack,
        is_bound: v.get("is_bound").and_then(|x| x.as_bool()).unwrap_or(true),
        weight,
        attributes: std::collections::HashMap::new(),
    })
}

/// 采购特产处理 (商票系统)
fn handle_buy_trade_good(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
    _world: &WorldState,
) -> Result<Option<HttpResponse>, ApiError> {
    if let Some(b) = body.as_ref() {
        let good_id = b.get("good_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = b.get("name").and_then(|v| v.as_str()).unwrap_or("特产").to_string();
        let count = b.get("count").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
        let unit_price = b.get("unit_price").and_then(|v| v.as_u64()).unwrap_or(100);
        let current_city = player.position.zone_id.clone();

        match CommerceEngine::buy_trade_good(player, &current_city, &good_id, &name, unit_price, count) {
            Ok(()) => {
                info!("📦 玩家 [{}] 采购特产成功", player.account_id);
            }
            Err(e) => {
                warn!("📦 采购失败: {}", e);
                return Err(ApiError::BadRequest(e.to_string()));
            }
        }
    }
    Ok(None)
}

/// 🌟 向驿馆出售商票货物 (只识别背包内货物, 存银行不可售)
fn handle_sell_trade_good(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    if let Some(b) = body.as_ref() {
        let good_id = b.get("good_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let unit_price = b.get("unit_price").and_then(|v| v.as_u64()).unwrap_or(0);
        let count = b.get("count").and_then(|v| v.as_u64()).unwrap_or(1) as u32;

        match CommerceEngine::sell_trade_good(player, &good_id, unit_price, count) {
            Ok(revenue) => {
                info!("💰 玩家 [{}] 驿馆售出货物成功, 回款 {} 铜", player.account_id, revenue);
            }
            Err(e) => {
                warn!("💰 出售失败: {}", e);
                return Err(ApiError::BadRequest(e.to_string()));
            }
        }
    }
    Ok(None)
}

/// 🌟 交割商票 (累计回款达交割目标后方可交割)
fn handle_settle_ticket(
    player: &mut PlayerState,
) -> Result<Option<HttpResponse>, ApiError> {
    let current_city = player.position.zone_id.clone();
    match CommerceEngine::settle_merchant_ticket(player, &current_city) {
        Ok(bonus) => {
            info!("🎉 玩家 [{}] 交割商票成功，奖励金 {} 铜", player.account_id, bonus);
        }
        Err(e) => {
            warn!("🎉 交割失败: {}", e);
            return Err(ApiError::BadRequest(e.to_string()));
        }
    }
    Ok(None)
}

/// 办理商票 (免费领取, 初始额度 3 万, 商票入背包)
fn handle_issue_ticket(
    player: &mut PlayerState,
    _body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    let issue_city = player.position.zone_id.clone();
    match CommerceEngine::issue_merchant_ticket(player, &issue_city) {
        Ok(()) => {
            info!("📜 玩家 [{}] 在 [{}] 免费领取商票", player.account_id, issue_city);
        }
        Err(e) => {
            warn!("📜 办理商票失败: {}", e);
            return Err(ApiError::BadRequest(e.to_string()));
        }
    }
    Ok(None)
}

/// 判定物品是否属于跑商专属特产或商票 (受通商律法限制，严禁存入万宝金库、上架拍卖行或熔炼)
fn is_trade_restricted_item(item: &GameItem) -> bool {
    item.item_id.starts_with("trade_") || 
    item.item_type == ItemType::TradeGood || 
    item.item_id == "merchant_ticket" || 
    item.name.contains("特产") || 
    item.name.contains("商票")
}

/// 🌟 组建贸易车队处理 (将背包所有跑商特产移交车队货舱，瞬间清空背包重负)
fn handle_build_caravan(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
    _world: &WorldState,
    now_secs: u64,
) -> Result<Option<HttpResponse>, ApiError> {
    let origin_city = player.position.zone_id.clone();
    let target_city = body.as_ref()
        .and_then(|b| b.get("target_city").and_then(|v| v.as_str()))
        .unwrap_or("shanghai")
        .to_string();

    let mut trade_items: Vec<GameItem> = Vec::new();
    let mut remaining_backpack: Vec<GameItem> = Vec::new();
    let mut total_items = 0u32;
    let mut total_cost = 0u64;

    for item in player.backpack.drain(..) {
        if is_trade_restricted_item(&item) && item.item_id != "merchant_ticket" && !item.name.contains("商票") {
            total_items += item.stack_count;
            total_cost += 200 * (item.stack_count as u64);
            trade_items.push(item);
        } else {
            remaining_backpack.push(item);
        }
    }

    player.backpack = remaining_backpack;
    player.recalculate_weight();

    if trade_items.is_empty() {
        return Err(ApiError::BadRequest("背包中没有可供车队装载的跑商特产！请先在特产货架采购特产。".to_string()));
    }

    let fleet = CaravanFleet {
        is_active: true,
        origin_city,
        target_city,
        cargo: trade_items,
        total_items,
        total_cost,
        start_time: now_secs,
        duration_secs: 45,
        status: "escorting".to_string(),
    };

    info!("🚚 玩家 [{}] 成功组建贸易车队: {} 件特产货物已装车 (始发: {}, 目的: {})",
        player.account_id, total_items, fleet.origin_city, fleet.target_city);

    player.caravan = Some(fleet);
    Ok(None)
}

/// 🌟 卸货交割贸易车队货物
fn handle_unload_caravan(
    player: &mut PlayerState,
    _world: &WorldState,
) -> Result<Option<HttpResponse>, ApiError> {
    let Some(caravan) = player.caravan.take() else {
        return Err(ApiError::BadRequest("当前没有正在护送的贸易车队！".to_string()));
    };

    let base_cost = caravan.total_cost.max(100);
    let revenue = (base_cost as f64 * 1.8) as u64;

    if let Some(ticket) = &mut player.merchant_ticket {
        ticket.earned_total += revenue;
        info!("📦 玩家 [{}] 车队到达目的地卸货交割成功！回款 {} 铜钱计入商票 (累计回款: {}/{})",
            player.account_id, revenue, ticket.earned_total, GameConfig::TICKET_SETTLE_TARGET);
    } else {
        player.copper += revenue;
        info!("📦 玩家 [{}] 车队卸货结算成功，获得 {} 铜钱", player.account_id, revenue);
    }

    Ok(None)
}

/// 银行存入物品
fn handle_bank_deposit(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    if let Some(b) = body.as_ref() {
        let backpack_idx = b.get("idx").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let count = b.get("count").and_then(|v| v.as_u64()).unwrap_or(1) as u32;

        let target_idx = match b.get("item_name").and_then(|v| v.as_str()) {
            Some(name) => player.backpack.iter().position(|i| i.name == name),
            None => {
                if backpack_idx < player.backpack.len() { Some(backpack_idx) } else { None }
            }
        };
        let Some(idx) = target_idx else {
            return Ok(None);
        };

        let item = &player.backpack[idx];
        // 跑商特产与商票严禁存入万宝金库/仓库
        if is_trade_restricted_item(item) {
            warn!("⚠️ 玩家 [{}] 尝试存入跑商物资/商票: {}", player.account_id, item.name);
            return Err(ApiError::BadRequest("跑商特产与商票受九洲通商律法限制，严禁存入万宝金库！".to_string()));
        }

        let item = &mut player.backpack[idx];
        let deposit_count = count.min(item.stack_count);

        if deposit_count == 0 {
            return Ok(None);
        }

        if let Some(bank_item) = player.bank_items.iter_mut().find(|i| i.name == item.name && i.item_id == item.item_id) {
            bank_item.stack_count += deposit_count;
        } else {
            let mut new_bank_item = item.clone();
            new_bank_item.stack_count = deposit_count;
            player.bank_items.push(new_bank_item);
        }

        let item_name = item.name.clone();

        item.stack_count -= deposit_count;
        if item.stack_count == 0 {
            player.backpack.remove(idx);
        }
        player.recalculate_weight();

        info!("🏦 玩家 [{}] 存入银行: {} x{}", player.account_id, item_name, deposit_count);
    }
    Ok(None)
}

/// 银行取出物品
fn handle_bank_withdraw(
    player: &mut PlayerState,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    if let Some(b) = body.as_ref() {
        let bank_idx = b.get("idx").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let count = b.get("count").and_then(|v| v.as_u64()).unwrap_or(1) as u32;

        // 🌟 优先按物品身份匹配, 未携带身份信息时回退下标
        let target_idx = match b.get("item_name").and_then(|v| v.as_str()) {
            Some(name) => player.bank_items.iter().position(|i| i.name == name),
            None => {
                if bank_idx < player.bank_items.len() { Some(bank_idx) } else { None }
            }
        };
        let Some(idx) = target_idx else {
            return Ok(None);
        };

        let bank_item = &mut player.bank_items[idx];
        let withdraw_count = count.min(bank_item.stack_count);

        if withdraw_count == 0 {
            return Ok(None);
        }

        let item_name = bank_item.name.clone();

        // 查找背包中是否已有同类物品
        if let Some(bp_item) = player.backpack.iter_mut().find(|i| i.name == bank_item.name && i.item_id == bank_item.item_id) {
            bp_item.stack_count += withdraw_count;
        } else {
            let mut new_bp_item = bank_item.clone();
            new_bp_item.stack_count = withdraw_count;
            player.backpack.push(new_bp_item);
        }

        // 从银行扣除
        bank_item.stack_count -= withdraw_count;
        if bank_item.stack_count == 0 {
            player.bank_items.remove(idx);
        }
        player.recalculate_weight();

        info!("🏦 玩家 [{}] 从银行取出: {} x{}", player.account_id, item_name, withdraw_count);
    }
    Ok(None)
}

/// 上架藏宝阁 / 拍卖行处理
fn handle_list_item(
    player: &mut PlayerState,
    action_key: &str,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    let item_id = action_key.strip_prefix("list_item:").unwrap_or("");
    let body_id = body.as_ref().and_then(|b| b.get("item_id").or_else(|| b.get("id")).and_then(|v| v.as_str())).unwrap_or("");
    let body_name = body.as_ref().and_then(|b| b.get("name").and_then(|v| v.as_str())).unwrap_or("");

    let target_idx = player.backpack.iter().position(|i| {
        (!item_id.is_empty() && (i.id == item_id || i.item_id == item_id)) ||
        (!body_id.is_empty() && (i.id == body_id || i.item_id == body_id)) ||
        (!body_name.is_empty() && i.name == body_name)
    });

    if let Some(idx) = target_idx {
        if is_trade_restricted_item(&player.backpack[idx]) {
            return Err(ApiError::BadRequest("跑商特产与商票受九洲通商律法限制，严禁上架拍卖行！".to_string()));
        }
        let item_name = player.backpack[idx].name.clone();
        if player.backpack[idx].stack_count > 1 {
            player.backpack[idx].stack_count -= 1;
        } else {
            player.backpack.remove(idx);
        }
        player.recalculate_weight();
        info!("🏛️ 玩家 [{}] 上架藏宝阁成功: {}", player.account_id, item_name);
    }
    Ok(None)
}

/// 熔炼成渣处理
fn handle_melt_item(
    player: &mut PlayerState,
    action_key: &str,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    let item_id = action_key.strip_prefix("melt_item:").unwrap_or("");
    let body_id = body.as_ref().and_then(|b| b.get("item_id").or_else(|| b.get("id")).and_then(|v| v.as_str())).unwrap_or("");
    let body_name = body.as_ref().and_then(|b| b.get("name").and_then(|v| v.as_str())).unwrap_or("");

    let target_idx = player.backpack.iter().position(|i| {
        (!item_id.is_empty() && (i.id == item_id || i.item_id == item_id)) ||
        (!body_id.is_empty() && (i.id == body_id || i.item_id == body_id)) ||
        (!body_name.is_empty() && i.name == body_name)
    });

    if let Some(idx) = target_idx {
        if is_trade_restricted_item(&player.backpack[idx]) {
            return Err(ApiError::BadRequest("跑商特产与商票严禁熔炼！".to_string()));
        }
        let item = &mut player.backpack[idx];
        let tier = item.tier.max(1);
        let slag_name = format!("玄铁矿渣·T{}", tier);
        let slag_item_id = format!("mat_slag_t{}", tier);

        if item.stack_count > 1 {
            item.stack_count -= 1;
        } else {
            player.backpack.remove(idx);
        }

        // 给予熔炼产物: 玄铁矿渣
        if let Some(existing_slag) = player.backpack.iter_mut().find(|i| i.name == slag_name) {
            existing_slag.stack_count += 1;
        } else {
            player.backpack.push(GameItem {
                id: format!("slag_{}_{}", tier, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
                item_id: slag_item_id,
                name: slag_name.clone(),
                item_type: ItemType::Material,
                tier,
                stack_count: 1,
                max_stack: 999,
                is_bound: false,
                weight: 0.5,
                attributes: std::collections::HashMap::new(),
            });
        }

        // 熔炼返还微量铜钱
        let copper_gain = (tier as u64) * 50;
        player.copper += copper_gain;
        player.recalculate_weight();
        info!("🔥 玩家 [{}] 熔炼成功: 产出 {} + {} 铜钱", player.account_id, slag_name, copper_gain);
    }
    Ok(None)
}

/// 装备回收 (炼铁返金, 仅限装备)
fn handle_recycle_equipment(
    player: &mut PlayerState,
    action_key: &str,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    let item_id = action_key.strip_prefix("recycle_equipment:").unwrap_or("");
    let body_id = body.as_ref().and_then(|b| b.get("item_id").or_else(|| b.get("id")).and_then(|v| v.as_str())).unwrap_or("");
    let body_name = body.as_ref().and_then(|b| b.get("name").and_then(|v| v.as_str())).unwrap_or("");

    let target_idx = player.backpack.iter().position(|i| {
        (!item_id.is_empty() && (i.id == item_id || i.item_id == item_id)) ||
        (!body_id.is_empty() && (i.id == body_id || i.item_id == body_id)) ||
        (!body_name.is_empty() && i.name == body_name)
    });

    let Some(idx) = target_idx else {
        return Ok(None);
    };

    let item = &player.backpack[idx];
    
    // 🌟 严格限制: 仅限装备进行回收
    let is_equipment = item.item_type == ItemType::Equipment || {
        let name = &item.name;
        let eq_keywords = ["剑", "刀", "枪", "甲", "盔", "靴", "盾", "佩", "袍", "冠", "戒", "履", "刃", "杖", "弓", "神兵", "法器", "道袍", "铠"];
        let mat_keywords = ["矿", "木", "草", "花", "皮", "石", "麻", "棉", "渣", "特产", "商票", "铜钱", "金币", "仙玉", "纳玉", "玄晶", "神晶", "镐", "锤", "斧"];
        !mat_keywords.iter().any(|k| name.contains(k)) && eq_keywords.iter().any(|k| name.contains(k))
    };

    if !is_equipment {
        warn!("⚠️ 玩家 [{}] 尝试回收非装备物品: {}", player.account_id, item.name);
        return Err(ApiError::BadRequest("仅限装备可进行回收炼铁返金！".to_string()));
    }

    let tier = item.tier.max(1);
    let item_name = item.name.clone();
    let is_beijing = player.position.zone_id == "beijing";
    let copper_refund = (tier as u64) * if is_beijing { 1000 } else { 500 };
    let coins_refund = (tier as u64) * if is_beijing { 20 } else { 10 };

    let iron_name = format!("精铁锭·T{}", tier);
    let iron_id = format!("mat_iron_ingot_t{}", tier);

    player.backpack.remove(idx);

    // 产出精铁锭
    if let Some(existing_iron) = player.backpack.iter_mut().find(|i| i.name == iron_name) {
        existing_iron.stack_count += 1;
    } else {
        player.backpack.push(GameItem {
            id: format!("iron_{}_{}", tier, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
            item_id: iron_id,
            name: iron_name.clone(),
            item_type: ItemType::Material,
            tier,
            stack_count: 1,
            max_stack: 999,
            is_bound: false,
            weight: 1.0,
            attributes: std::collections::HashMap::new(),
        });
    }

    player.copper += copper_refund;
    player.coins += coins_refund;
    player.recalculate_weight();

    info!("♻️ 玩家 [{}] 装备回收成功: {} → 产出 {} + {} 金币 + {} 铜钱", player.account_id, item_name, iron_name, coins_refund, copper_refund);
    Ok(None)
}

/// 🌟 物品使用处理器 (货币存入、丹药吞服、宝箱开启、秘籍研读)
fn handle_use_item(
    player: &mut PlayerState,
    action_key: &str,
    body: &Option<web::Json<serde_json::Value>>,
) -> Result<Option<HttpResponse>, ApiError> {
    let item_id = action_key.strip_prefix("use_item:").unwrap_or("");
    let body_id = body.as_ref().and_then(|b| b.get("item_id").or_else(|| b.get("id")).and_then(|v| v.as_str())).unwrap_or("");
    let body_name = body.as_ref().and_then(|b| b.get("name").and_then(|v| v.as_str())).unwrap_or("");
    let usage_type = body.as_ref().and_then(|b| b.get("type").and_then(|v| v.as_str())).unwrap_or("");
    let curr_key = body.as_ref().and_then(|b| b.get("currency_key").and_then(|v| v.as_str())).unwrap_or("");
    let count = body.as_ref().and_then(|b| b.get("count").and_then(|v| v.as_u64())).unwrap_or(1);

    let target_idx = player.backpack.iter().position(|i| {
        (!item_id.is_empty() && (i.id == item_id || i.item_id == item_id)) ||
        (!body_id.is_empty() && (i.id == body_id || i.item_id == body_id)) ||
        (!body_name.is_empty() && i.name == body_name)
    });

    let (item_name, item_tier) = if let Some(idx) = target_idx {
        let item = &mut player.backpack[idx];
        let name = item.name.clone();
        let tier = item.tier.max(1);
        let consume = count.min(item.stack_count as u64) as u32;

        if item.stack_count > consume {
            item.stack_count -= consume;
        } else {
            player.backpack.remove(idx);
        }
        (name, tier)
    } else {
        (body_name.to_string(), 1)
    };

    // 货币处理
    if usage_type == "currency" || curr_key == "copper" || curr_key == "coins" || curr_key == "jade" ||
       item_name.contains("铜钱") || item_name.contains("金币") || item_name.contains("仙玉") || item_name.contains("纳玉") {
        if curr_key == "copper" || item_name.contains("铜钱") {
            player.copper += count;
        } else if curr_key == "coins" || item_name.contains("金币") {
            player.coins += count;
        } else if curr_key == "jade" || item_name.contains("仙玉") || item_name.contains("纳玉") {
            player.jade += count;
        }
        info!("✨ 玩家 [{}] 使用存入货币 [{}] x{} (余额: copper={}, coins={}, jade={})", player.account_id, item_name, count, player.copper, player.coins, player.jade);
    } else if usage_type == "chest" {
        let copper_rew = (item_tier as u64) * 500;
        let coins_rew = (item_tier as u64) * 10;
        player.copper += copper_rew;
        player.coins += coins_rew;
        info!("📦 玩家 [{}] 开启宝箱 [{}] (获得 copper+{}, coins+{})", player.account_id, item_name, copper_rew, coins_rew);
    } else {
        info!("✨ 玩家 [{}] 使用物品 [{}] x{} (类型: {})", player.account_id, item_name, count, usage_type);
    }

    player.recalculate_weight();
    Ok(None)
}
