use actix_web::{web, HttpRequest, HttpResponse, Responder};
use cyber_forge_shared::*;
use crate::WorldState;
use crate::auth::extract_account_id;
use crate::errors::ApiError;
use std::sync::Arc;

/// 健康检查 API
pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

/// 构造给前端标准消费的 GameState 快照 JSON 结构
pub fn build_player_snapshot(player: &PlayerState, world: &WorldState) -> serde_json::Value {
    let (weather, weather_buff) = if let Some(zone) = world.topology.zones.get(&player.position.zone_id) {
        (zone.weather.clone(), zone.weather_buff.clone())
    } else {
        ("风沙".to_string(), "天道罡风淬火：锻造暴击率 +10%".to_string())
    };

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let teleport_cd_left = if player.teleport_cooldown_until > now_secs {
        player.teleport_cooldown_until - now_secs
    } else {
        0
    };

    let invul_left = if player.invulnerable_until > now_secs {
        player.invulnerable_until - now_secs
    } else {
        0
    };

    let fatigue_left = if player.invulnerable_fatigue_until > now_secs {
        player.invulnerable_fatigue_until - now_secs
    } else {
        0
    };

    let current_w = if player.current_weight > 0.0 {
        player.current_weight
    } else {
        let mut temp = player.clone();
        temp.recalculate_weight()
    };

    serde_json::json!({
        "account_id": player.account_id,
        "player_x": player.position.x,
        "player_y": player.position.y,
        "current_zone_id": player.position.zone_id,
        "current_city_id": player.position.zone_id,
        "copper": player.copper,
        "coins": player.coins,
        "jade": player.jade,
        "level": player.level,
        "sub_level": 1,
        "realm_name": "炼气期",
        "interval_secs": 1.0,
        "backpack": player.backpack,
        "max_backpack": player.max_backpack,
        "current_weight": current_w,
        "max_weight": if player.max_weight > 0.0 { player.max_weight } else { GameConfig::DEFAULT_MAX_WEIGHT },
        "merchant_ticket": player.merchant_ticket,
        "bank_items": player.bank_items,
        "teleport_cooldown_until": player.teleport_cooldown_until,
        "teleport_cd_left": teleport_cd_left,
        "invulnerable_until": player.invulnerable_until,
        "invul_left": invul_left,
        "is_invulnerable": invul_left > 0,
        "invulnerable_fatigue_until": player.invulnerable_fatigue_until,
        "fatigue_left": fatigue_left,
        "current_weather": weather,
        "current_weather_effect": weather_buff,
        "last_active_at": player.last_active_at,
        // 🌟 真实在线人数 (最近 ONLINE_WINDOW_SECS 内有心跳), 而非 players 表总长 (表含全部历史玩家且从不淘汰, 只增不减)
        "online_count": world.online_count()
    })
}

/// 专门用来响应前端前端周期性轮询的 POST /api/tick 与 GET /api/state 接口
pub async fn api_tick_handler(
    req: HttpRequest,
    world: web::Data<Arc<WorldState>>,
    body: Option<web::Json<serde_json::Value>>,
) -> Result<HttpResponse, ApiError> {
    let account_id = extract_account_id(&req, body.as_ref().map(|b| &b.0));
    let mut player = world.get_ref().get_or_create_player(&account_id);
    // 🌟 活动心跳: 客户端每秒轮询即刷新, 作为在线判定依据 (旧实现从不记录 → 在线数只能取表长 = 增量假象)
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    player.last_active_at = now_secs;
    if let Some(mut p) = world.get_ref().players.get_mut(&account_id) {
        p.last_active_at = now_secs;
    }
    Ok(HttpResponse::Ok().json(build_player_snapshot(&player, world.get_ref())))
}

/// 🌟 调试专用: 在线/离线玩家报表 (在线 = 最近 ONLINE_WINDOW_SECS 内有心跳; 离线 = 表内其余全部历史玩家)。
///    账号即助记词凭证, 一律脱敏返回 (首4末2), 绝不回传全文。
pub async fn api_players_report_handler(
    req: HttpRequest,
    world: web::Data<Arc<WorldState>>,
    body: Option<web::Json<serde_json::Value>>,
) -> Result<HttpResponse, ApiError> {
    let _account_id = extract_account_id(&req, body.as_ref().map(|b| &b.0));
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut online: Vec<(u64, serde_json::Value)> = Vec::new();
    let mut offline: Vec<(u64, serde_json::Value)> = Vec::new();
    for entry in world.get_ref().players.iter() {
        let p = entry.value();
        let idle = now_secs.saturating_sub(p.last_active_at);
        let info = serde_json::json!({
            "account": mask_account_id(&p.account_id),
            "zone": p.position.zone_id,
            "x": p.position.x,
            "y": p.position.y,
            "level": p.level,
            "copper": p.copper,
            "coins": p.coins,
            "jade": p.jade,
            "backpack": p.backpack.len(),
            "bank": p.bank_items.len(),
            "weight": p.current_weight,
            "last_active_at": p.last_active_at,
            "idle_secs": idle,
        });
        if p.last_active_at > 0 && idle <= GameConfig::ONLINE_WINDOW_SECS {
            online.push((idle, info));
        } else {
            offline.push((idle, info));
        }
    }
    online.sort_by_key(|(idle, _)| *idle);      // 最近活跃在前
    offline.sort_by_key(|(idle, _)| *idle);    // 最近下线在前
    let online: Vec<serde_json::Value> = online.into_iter().map(|(_, v)| v).collect();
    let offline: Vec<serde_json::Value> = offline.into_iter().map(|(_, v)| v).take(100).collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "now": now_secs,
        "online_window_secs": GameConfig::ONLINE_WINDOW_SECS,
        "online_count": online.len(),
        "offline_count": world.get_ref().players.len().saturating_sub(online.len()),
        "total_registered": world.get_ref().players.len(),
        "online": online,
        "offline": offline,
    })))
}

/// 账号脱敏 (账号即助记词凭证): 首 4 字符 + 末 2 字符, 过短全遮 (按 char 切割避免 UTF-8 边界崩溃)
fn mask_account_id(id: &str) -> String {
    let chars: Vec<char> = id.chars().collect();
    if chars.len() <= 6 {
        return "*".repeat(chars.len().max(1));
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[chars.len() - 2..].iter().collect();
    format!("{}…{}", head, tail)
}
