use actix_web::HttpResponse;
use serde::Serialize;

/// 统一 API 错误响应格式
#[derive(Debug, Serialize)]
pub struct ApiErrorResponse {
    pub success: bool,
    pub error: String,
    pub code: u16,
}

/// 统一 API 错误类型
#[derive(Debug)]
#[allow(dead_code)]
pub enum ApiError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Conflict(String),
    Internal(String),
}

impl ApiError {
    pub fn to_response(&self) -> HttpResponse {
        let (status, code, message) = match self {
            ApiError::BadRequest(msg) => (actix_web::http::StatusCode::BAD_REQUEST, 400, msg.clone()),
            ApiError::Unauthorized(msg) => (actix_web::http::StatusCode::UNAUTHORIZED, 401, msg.clone()),
            ApiError::Forbidden(msg) => (actix_web::http::StatusCode::FORBIDDEN, 403, msg.clone()),
            ApiError::NotFound(msg) => (actix_web::http::StatusCode::NOT_FOUND, 404, msg.clone()),
            ApiError::Conflict(msg) => (actix_web::http::StatusCode::CONFLICT, 409, msg.clone()),
            ApiError::Internal(msg) => (actix_web::http::StatusCode::INTERNAL_SERVER_ERROR, 500, msg.clone()),
        };

        HttpResponse::build(status).json(ApiErrorResponse {
            success: false,
            error: message,
            code,
        })
    }
}

impl actix_web::ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        self.to_response()
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::BadRequest(msg) => write!(f, "Bad Request: {}", msg),
            ApiError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            ApiError::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            ApiError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            ApiError::Conflict(msg) => write!(f, "Conflict: {}", msg),
            ApiError::Internal(msg) => write!(f, "Internal Error: {}", msg),
        }
    }
}
