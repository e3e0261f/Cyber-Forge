use actix_web::HttpRequest;
use cyber_forge_shared::GameConfig;

/// 从请求中提取账户ID (优先 body token，其次 header，最后默认值)
pub fn extract_account_id(req: &HttpRequest, body: Option<&serde_json::Value>) -> String {
    body.and_then(|b| {
        b.get("token")
            .or_else(|| b.get("account_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    })
    .or_else(|| {
        req.headers()
            .get(GameConfig::AUTH_TOKEN_HEADER)
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string())
    })
    .unwrap_or_else(|| GameConfig::DEFAULT_ACCOUNT_ID.to_string())
}

/// 验证 token 是否有效 (基础实现：非空即有效)
/// TODO: 后续可升级为 JWT 签名校验或 OAuth 验证
pub fn validate_token(token: &str) -> bool {
    !token.is_empty() && token.len() >= 3
}
