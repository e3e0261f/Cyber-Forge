use cyber_forge_shared::GameConfig;

/// 服务端 API 客户端 (对接 HTTP 接口)
#[allow(dead_code)]
pub struct ServerApiClient {
    pub base_url: String,
    pub account_id: String,
    client: reqwest::Client,
}

impl ServerApiClient {
    pub fn new(base_url: &str, account_id: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            account_id: account_id.to_string(),
            client: reqwest::Client::new(),
        }
    }

    /// 向服务端发送 tick 请求获取最新状态
    #[allow(dead_code)]
    pub async fn fetch_state(&self) -> Option<serde_json::Value> {
        let url = format!("{}/api/state", self.base_url);
        let body = serde_json::json!({
            "token": self.account_id
        });

        match self.post_json(&url, &body).await {
            Ok(val) => Some(val),
            Err(e) => {
                eprintln!("[Network] 获取状态失败: {}", e);
                None
            }
        }
    }

    /// 向服务端发送动作指令
    pub async fn send_action(&self, action: &str, extra: Option<serde_json::Value>) -> Option<serde_json::Value> {
        let url = format!("{}/api/action", self.base_url);
        let mut body = serde_json::json!({
            "token": self.account_id,
            "key": action,
        });

        if let Some(extra) = extra {
            if let Some(obj) = body.as_object_mut() {
                if let Some(extra_obj) = extra.as_object() {
                    for (k, v) in extra_obj {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        match self.post_json(&url, &body).await {
            Ok(val) => Some(val),
            Err(e) => {
                eprintln!("[Network] 动作指令失败: {}", e);
                None
            }
        }
    }

    /// 同步坐标到服务端
    pub async fn sync_position(&self, x: f64, y: f64, zone_id: &str) -> Option<serde_json::Value> {
        self.send_action("sync_pos", Some(serde_json::json!({
            "player_x": x,
            "player_y": y,
            "zone_id": zone_id,
        }))).await
    }

    /// 请求传送到目标区域
    #[allow(dead_code)]
    pub async fn teleport(&self, target_zone_id: &str) -> Option<serde_json::Value> {
        self.send_action(&format!("teleport_zone:{}", target_zone_id), None).await
    }

    /// 内部 HTTP POST 实现 (使用 reqwest, 支持 WASM 和原生)
    async fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<serde_json::Value, String> {
        self.client
            .post(url)
            .header("Content-Type", "application/json")
            .header(GameConfig::AUTH_TOKEN_HEADER, &self.account_id)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("网络请求失败: {}", e))?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("JSON 解析失败: {}", e))
    }
}

/// 网络状态指示器
#[allow(dead_code)]
pub struct NetworkStatus {
    pub connected: bool,
    pub last_sync_time: f64,
    pub last_error: Option<String>,
    pub ping_ms: f64,
}

impl Default for NetworkStatus {
    fn default() -> Self {
        Self {
            connected: false,
            last_sync_time: 0.0,
            last_error: None,
            ping_ms: 0.0,
        }
    }
}
