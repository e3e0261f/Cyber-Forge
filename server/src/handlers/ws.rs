use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_ws::Message;
use cyber_forge_shared::*;
use futures_util::StreamExt;
use tracing::info;
use std::sync::Arc;

use crate::WorldState;
use crate::auth::validate_token;

/// 专供 WebSocket 升级接入点 (ws://0.0.0.0:3000/ws)
pub async fn ws_handler(
    req: HttpRequest,
    stream: web::Payload,
    world: web::Data<Arc<WorldState>>,
) -> Result<HttpResponse, Error> {
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;
    let world_state = world.get_ref().clone();

    actix_web::rt::spawn(async move {
        let mut current_account: Option<String> = None;

        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(client_cmd) = serde_json::from_str::<ClientMessage>(&text) {
                        match client_cmd {
                            ClientMessage::Auth { token } => {
                                if !validate_token(&token) {
                                    let err = ServerMessage::Error { message: "无效的认证令牌".into() };
                                    if let Ok(json) = serde_json::to_string(&err) {
                                        let _ = session.text(json).await;
                                    }
                                    continue;
                                }

                                let player = world_state.get_or_create_player(&token);
                                current_account = Some(token);
                                // 🌟 活动心跳: WS 认证成功即视为在线证据 (后续移动/采集消息持续保活)
                                if let Some(ref acc) = current_account {
                                    if let Some(mut p) = world_state.players.get_mut(acc) {
                                        p.last_active_at = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();
                                    }
                                }

                                let resp = ServerMessage::StateSnapshot(player);
                                if let Ok(json) = serde_json::to_string(&resp) {
                                    let _ = session.text(json).await;
                                }
                            }
                            ClientMessage::MoveSync { x, y, zone_id } => {
                                if let Some(ref acc) = current_account {
                                    if let Some(mut player_ref) = world_state.players.get_mut(acc) {
                                        player_ref.position.x = x.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
                                        player_ref.position.y = y.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
                                        player_ref.position.zone_id = zone_id;
                                        player_ref.position.last_updated = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();
                                    }
                                }
                            }
                            ClientMessage::StrikeMine { target_node_id, is_crit } => {
                                if let Some(ref acc) = current_account {
                                    if let Some(mut player_ref) = world_state.players.get_mut(acc) {
                                        match world_state.gathering.mine_node(
                                            &target_node_id,
                                            is_crit,
                                            false, // is_perfect: WebSocket 旧路径不支持完美区
                                            player_ref.position.x,
                                            player_ref.position.y,
                                            &player_ref.position.zone_id,
                                            &world_state.topology,
                                            None, // client_hint: WS 旧协议不携带节点定义, 保留拓扑/品阶回退
                                        ) {
                                            Ok((item, count)) => {
                                                let incoming_weight = item.weight * (item.stack_count as f64);
                                                if !player_ref.can_add_weight(incoming_weight) {
                                                    let err_resp = ServerMessage::Error { 
                                                        message: format!("背包超重 (当前负重 {:.1}/{:.1} KG)，无法继续装入！", player_ref.current_weight, GameConfig::DEFAULT_MAX_WEIGHT) 
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&err_resp) {
                                                        let _ = session.text(json).await;
                                                    }
                                                } else {
                                                    player_ref.copper += (count as u64) * GameConfig::GATHER_COPPER_PER_UNIT;
                                                    if player_ref.backpack.len() < player_ref.max_backpack {
                                                        player_ref.backpack.push(item);
                                                    } else if let Some(existing) = player_ref.backpack.iter_mut().find(|i| i.name == item.name) {
                                                        existing.stack_count += item.stack_count;
                                                    }
                                                    player_ref.recalculate_weight();
                                                    let resp = ServerMessage::StateSnapshot(player_ref.clone());
                                                    if let Ok(json) = serde_json::to_string(&resp) {
                                                        let _ = session.text(json).await;
                                                    }
                                                }
                                            }
                                            Err(err_msg) => {
                                                let err_resp = ServerMessage::Error { message: err_msg.into() };
                                                if let Ok(json) = serde_json::to_string(&err_resp) {
                                                    let _ = session.text(json).await;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            ClientMessage::DropItem { item_id, count } => {
                                if let Some(ref acc) = current_account {
                                    if let Some(mut player_ref) = world_state.players.get_mut(acc) {
                                        if let Some(pos) = player_ref.backpack.iter().position(|it| it.id == item_id || it.item_id == item_id) {
                                            let drop_cnt = count.unwrap_or(player_ref.backpack[pos].stack_count);
                                            if drop_cnt >= player_ref.backpack[pos].stack_count {
                                                let dropped = player_ref.backpack.remove(pos);
                                                info!("🗑️ WS: 玩家 [{}] 丢弃物品 [{}] x{}", acc, dropped.name, dropped.stack_count);
                                            } else {
                                                player_ref.backpack[pos].stack_count -= drop_cnt;
                                                info!("🗑️ WS: 玩家 [{}] 丢弃物品 [{}] x{}", acc, player_ref.backpack[pos].name, drop_cnt);
                                            }
                                            player_ref.recalculate_weight();
                                            let resp = ServerMessage::StateSnapshot(player_ref.clone());
                                            if let Ok(json) = serde_json::to_string(&resp) {
                                                let _ = session.text(json).await;
                                            }
                                        }
                                    }
                                }
                            }
                            ClientMessage::TeleportZone { target_zone_id } => {
                                if let Some(ref acc) = current_account {
                                    if let Some(mut player_ref) = world_state.players.get_mut(acc) {
                                        let now_secs = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();

                                        // 传送冷却校验
                                        if now_secs < player_ref.teleport_cooldown_until {
                                            let remaining = player_ref.teleport_cooldown_until - now_secs;
                                            let err_resp = ServerMessage::Error {
                                                message: format!("传送阵冷却中，剩余 {} 秒", remaining),
                                            };
                                            if let Ok(json) = serde_json::to_string(&err_resp) {
                                                let _ = session.text(json).await;
                                            }
                                            continue;
                                        }

                                        player_ref.teleport_cooldown_until = now_secs + GameConfig::TELEPORT_COOLDOWN_SECS;

                                        // 无敌与疲劳状态机
                                        if now_secs >= player_ref.invulnerable_fatigue_until {
                                            player_ref.invulnerable_until = now_secs + GameConfig::INVULNERABLE_DURATION_SECS;
                                            player_ref.invulnerable_fatigue_until = now_secs + GameConfig::INVULNERABLE_FATIGUE_SECS;
                                            info!("🛡️ 玩家 [{}] 获得 {} 秒过图无敌保护", acc, GameConfig::INVULNERABLE_DURATION_SECS);
                                        } else {
                                            info!("💤 玩家 [{}] 处于无敌疲劳中，未获得无敌保护", acc);
                                        }

                                        let from_zone_id = player_ref.position.zone_id.clone();
                                        
                                        if let Some(target_zone) = world_state.topology.zones.get(&target_zone_id) {
                                            let (rx, ry) = world_state.topology.get_portal_rebirth_pos(&from_zone_id, &target_zone_id);

                                            player_ref.position.zone_id = target_zone.id.clone();
                                            player_ref.position.x = rx;
                                            player_ref.position.y = ry;
                                            player_ref.position.last_updated = now_secs;

                                            info!("✨ 【自动化过图系统】玩家 [{}] 成功由 [{}] 传送至 [{}] 坐标: ({}, {})", 
                                                acc, from_zone_id, target_zone_id, rx, ry);

                                            let resp = ServerMessage::StateSnapshot(player_ref.clone());
                                            if let Ok(json) = serde_json::to_string(&resp) {
                                                let _ = session.text(json).await;
                                            }
                                        } else {
                                            let err_resp = ServerMessage::Error { message: format!("过图失败：目标区域 [{}] 不存在", target_zone_id) };
                                            if let Ok(json) = serde_json::to_string(&err_resp) {
                                                let _ = session.text(json).await;
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                Message::Ping(bytes) => {
                    let _ = session.pong(&bytes).await;
                }
                Message::Close(reason) => {
                    let _ = session.close(reason).await;
                    break;
                }
                _ => {}
            }
        }

        if let Some(acc) = current_account {
            info!("🔌 玩家离线，已在中央状态机中锁定其最终坐标: {}", acc);
        }
    });

    Ok(response)
}
