use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;
use crate::WorldState;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: Option<String>,
    pub mnemonic: Option<String>,
    // 🌟 预留字段: 当前为助记词免密登录, 密码校验待接入 (保留以兼容客户端上行协议)
    #[allow(dead_code)]
    pub password: Option<String>,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: Option<String>,
    pub token: Option<String>,
    pub account_id: Option<String>,
}

/// 简单的登录处理 (基于用户名或天道四句话密证生成 account_id)
pub async fn login_handler(
    world: web::Data<Arc<WorldState>>,
    body: web::Json<LoginRequest>,
) -> HttpResponse {
    let mnemonic = body.mnemonic.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let username = body.username.as_deref().map(str::trim).filter(|s| !s.is_empty());

    let (account_id, log_name) = if let Some(mn) = mnemonic {
        (format!("account_{}", simple_hash(mn)), format!("天道密证[{}]", mn))
    } else if let Some(un) = username {
        (format!("account_{}", simple_hash(un)), un.to_string())
    } else {
        return HttpResponse::Ok().json(LoginResponse {
            success: false,
            message: Some("用户名或天道四句话密证不能为空".into()),
            token: None,
            account_id: None,
        });
    };

    // 生成 token (简单实现，生产环境应使用 JWT)
    let token = format!("token_{}_{}", &account_id, chrono_timestamp());

    // 检查或创建玩家
    let _player = world.get_or_create_player(&account_id);
    
    info!("🔐 玩家登录: {} -> {}", log_name, account_id);

    HttpResponse::Ok().json(LoginResponse {
        success: true,
        message: None,
        token: Some(token),
        account_id: Some(account_id),
    })
}

/// 简单哈希 (生产环境应使用 bcrypt/argon2)
fn simple_hash(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
