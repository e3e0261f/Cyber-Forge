mod storage_adapter;
mod world_topology;
mod network;

use macroquad::prelude::*;
use serde::{Deserialize, Serialize};
use cyber_forge_shared::GameConfig;
use storage_adapter::{LocalStorageDriver, PlayerPosition, StorageDriver};
use world_topology::{ClientTopology, MAP_SIZE, PORTAL_RADIUS};
use network::{ServerApiClient, NetworkStatus};

/// 背包物品
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackpackItem {
    pub id: String,
    pub name: String,
    pub tier: u8,
    pub stack_count: u32,
    pub weight: f64,
    pub item_id: String,
}

/// 角色境界与全局状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerStateModel {
    pub x: f64,
    pub y: f64,
    pub copper: u64,
    pub coins: u64,
    pub jade: u64,
    pub level: u32,
    pub sub_level: u32,
    pub hammer_name: String,
    pub realm_name: String,
    pub zone_id: String,
    pub zone_name: String,
    pub weather: String,
    pub weather_effect: String,
    pub melt_tier: String,
    pub melt_color: String,
    pub list_tier: String,
    pub list_color: String,
    pub is_auto_strike: bool,
    pub pending_breakthrough: bool,
    pub backpack: Vec<BackpackItem>,
    pub max_backpack: usize,
    pub current_weight: f64,
    pub max_weight: f64,
}

impl Default for PlayerStateModel {
    fn default() -> Self {
        Self {
            x: GameConfig::DEFAULT_SPAWN_X,
            y: GameConfig::DEFAULT_SPAWN_Y,
            copper: 0,
            coins: 1000,
            jade: 10,
            level: 1,
            sub_level: 1,
            hammer_name: "凡铁锻造锤".into(),
            realm_name: "炼体".into(),
            zone_id: "beijing".into(),
            zone_name: "北京 · 红皇城".into(),
            weather: "风沙".into(),
            weather_effect: "天道罡风淬火: 锻造暴击率 +10%".into(),
            melt_tier: "凡品".into(),
            melt_color: "#787878".into(),
            list_tier: "全品质".into(),
            list_color: "#787878".into(),
            is_auto_strike: false,
            pending_breakthrough: false,
            backpack: Vec::new(),
            max_backpack: GameConfig::DEFAULT_MAX_BACKPACK,
            current_weight: 0.0,
            max_weight: GameConfig::DEFAULT_MAX_WEIGHT,
        }
    }
}

pub struct NavButton {
    pub id: &'static str,
    pub label: &'static str,
    pub color: Color,
    pub key_desc: &'static str,
}

#[macroquad::main("CyberForgeWASM")]
async fn main() {
    let storage = LocalStorageDriver::new();
    let topology = ClientTopology::new();

    // 服务端 API 客户端 (连接本地或远程服务器)
    let server_url = std::env::var("SERVER_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let api_client = ServerApiClient::new(&server_url, "wasm_cultivator");
    let mut net_status = NetworkStatus::default();
    let mut last_server_sync: f64 = 0.0;

    // 1. 初始化并恢复持久化坐标 (100% 对齐 JS 体系)
    let saved_pos = storage.load_position();
    let mut player = PlayerStateModel::default();

    if let Some(pos) = saved_pos {
        player.x = pos.x.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
        player.y = pos.y.clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
        player.zone_id = pos.zone_id;
    }

    // 确保初始区域信息正确
    if let Some(zone) = topology.zones.get(&player.zone_id) {
        player.zone_name = zone.name.clone();
        player.weather = zone.weather.clone();
        player.weather_effect = zone.weather_buff.clone();
    }

    let mut camera_x = player.x as f32;
    let mut camera_y = player.y as f32;
    let mut last_save_time = get_time();
    let mut _last_teleport_time = 0.0;
    let mut teleport_cooldown_until = 0.0;
    let mut invulnerable_until = 0.0;
    let mut invulnerable_fatigue_until = 0.0;
    let mut toast_message = String::new();
    let mut toast_time = 0.0;

    // 活跃弹窗管理 (对齐 JS 体系: 最多 3 个同时激活)
    let mut active_modal: Option<&'static str> = None;

    let mut fps_counter = 60;
    let mut frame_count = 0;
    let mut last_fps_time = get_time();

    let nav_buttons = vec![
        NavButton { id: "map_world", label: "🗺️ 九州(L)", color: Color::new(0.0, 1.0, 0.78, 1.0), key_desc: "L" },
        NavButton { id: "map_zone", label: "🧭 区域(M)", color: Color::new(0.22, 0.74, 0.97, 1.0), key_desc: "M" },
        NavButton { id: "stash", label: "🎒 锦囊(B)", color: Color::new(0.22, 0.74, 0.97, 1.0), key_desc: "B" },
        NavButton { id: "auction", label: "🏛️ 拍阁(P)", color: Color::new(0.88, 0.63, 0.31, 1.0), key_desc: "P" },
        NavButton { id: "quest", label: "📋 任务(J)", color: Color::new(0.98, 0.45, 0.09, 1.0), key_desc: "J" },
        NavButton { id: "apprentice", label: "🛠️ 学徒(N)", color: Color::new(0.96, 0.62, 0.04, 1.0), key_desc: "N" },
        NavButton { id: "logs", label: "📜 日志(I)", color: Color::new(0.66, 0.33, 0.97, 1.0), key_desc: "I" },
        NavButton { id: "body", label: "👤 身体(C)", color: Color::new(0.13, 0.77, 0.37, 1.0), key_desc: "C" },
        NavButton { id: "debug", label: "🎛️ 调试(F3)", color: Color::new(0.93, 0.28, 0.6, 1.0), key_desc: "F3" },
    ];

    loop {
        let now = get_time();

        // 计算 FPS
        frame_count += 1;
        if now - last_fps_time >= 0.5 {
            fps_counter = ((frame_count as f64 * 1000.0) / ((now - last_fps_time) * 1000.0)).round() as i32;
            frame_count = 0;
            last_fps_time = now;
        }

        let screen_w = screen_width();
        let screen_h = screen_height();

        // 快捷键弹窗切换 (对齐 JS 快捷键)
        if is_key_pressed(KeyCode::L) {
            active_modal = if active_modal == Some("map_world") { None } else { Some("map_world") };
        }
        if is_key_pressed(KeyCode::M) {
            active_modal = if active_modal == Some("map_zone") { None } else { Some("map_zone") };
        }
        if is_key_pressed(KeyCode::B) {
            active_modal = if active_modal == Some("stash") { None } else { Some("stash") };
        }
        if is_key_pressed(KeyCode::F3) {
            active_modal = if active_modal == Some("debug") { None } else { Some("debug") };
        }
        if is_key_pressed(KeyCode::Escape) {
            active_modal = None;
        }

        // 2. WASM 键盘物理位移系统 (100% 对齐 JS input.js)
        let mut move_x = 0.0;
        let mut move_y = 0.0;
        let speed = 8.0;

        if is_key_down(KeyCode::W) || is_key_down(KeyCode::Up) { move_y -= speed; }
        if is_key_down(KeyCode::S) || is_key_down(KeyCode::Down) { move_y += speed; }
        if is_key_down(KeyCode::A) || is_key_down(KeyCode::Left) { move_x -= speed; }
        if is_key_down(KeyCode::D) || is_key_down(KeyCode::Right) { move_x += speed; }

        if move_x != 0.0 || move_y != 0.0 {
            player.x = (player.x + move_x).clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);
            player.y = (player.y + move_y).clamp(GameConfig::COORD_MIN, GameConfig::COORD_MAX);

            // 500ms 节流持久化
            if now - last_save_time >= 0.5 {
                storage.save_position(&PlayerPosition {
                    x: player.x,
                    y: player.y,
                    zone_id: player.zone_id.clone(),
                    last_updated: (now * 1000.0) as u64,
                });
                last_save_time = now;
            }

            // 每 3 秒向服务端同步一次坐标
            if now - last_server_sync >= 3.0 {
                let _ = api_client.sync_position(player.x, player.y, &player.zone_id).await;
                last_server_sync = now;
                net_status.connected = true;
                net_status.last_sync_time = now;
            }
        }

        // ==========================================
        // 3. 传送门碰撞检测与过图逻辑 (严格 5s 冷却 / 30s 无敌 / 1m 疲劳)
        // ==========================================
        if let Some(current_zone) = topology.zones.get(&player.zone_id) {
            for gate in &current_zone.gates {
                let dist = ((player.x - gate.x).powi(2) + (player.y - gate.y).powi(2)).sqrt();
                if dist <= PORTAL_RADIUS {
                    if now < teleport_cooldown_until {
                        // 处于传送冷却中
                        let cd_left = teleport_cooldown_until - now;
                        if now - toast_time >= 1.0 {
                            toast_message = format!("⏳ 传送阵充能冷却中，剩余 {:.1} 秒", cd_left);
                            toast_time = now;
                        }
                    } else {
                        // 触发过图传送
                        let from_zone_id = player.zone_id.clone();
                        let target_zone_id = gate.target_zone_id.clone();

                        if let Some(target_zone) = topology.zones.get(&target_zone_id) {
                            let (rebirth_x, rebirth_y) = topology.get_portal_rebirth_pos(&from_zone_id, &target_zone_id);
                            
                            // 附加传送冷却
                            teleport_cooldown_until = now + GameConfig::TELEPORT_COOLDOWN_SECS as f64;

                            // 判定无敌与疲劳
                            let got_invul = if now >= invulnerable_fatigue_until {
                                invulnerable_until = now + GameConfig::INVULNERABLE_DURATION_SECS as f64;
                                invulnerable_fatigue_until = now + GameConfig::INVULNERABLE_FATIGUE_SECS as f64;
                                true
                            } else {
                                false
                            };

                            player.zone_id = target_zone.id.clone();
                            player.zone_name = target_zone.name.clone();
                            player.weather = target_zone.weather.clone();
                            player.weather_effect = target_zone.weather_buff.clone();
                            player.x = rebirth_x;
                            player.y = rebirth_y;

                            // 立即更新相机，消除跳跃感
                            camera_x = player.x as f32;
                            camera_y = player.y as f32;

                            _last_teleport_time = now;
                            if got_invul {
                                toast_message = format!("🌀 踏入【{}】 🛡️ 获得30秒过图无敌保护！", target_zone.name);
                            } else {
                                toast_message = format!("🌀 踏入【{}】 (无敌疲劳中，未获保护)", target_zone.name);
                            }
                            toast_time = now;

                            // 强制立即持久化新坐标与区域
                            storage.save_position(&PlayerPosition {
                                x: player.x,
                                y: player.y,
                                zone_id: player.zone_id.clone(),
                                last_updated: (now * 1000.0) as u64,
                            });
                            last_save_time = now;
                            break;
                        }
                    }
                }
            }
        }

        // 相机平滑插值追踪
        camera_x += (player.x as f32 - camera_x) * 0.12;
        camera_y += (player.y as f32 - camera_y) * 0.12;

        // 4. 渲染世界底板 (根据当前区域主背景色定制)
        let cur_zone = topology.zones.get(&player.zone_id);
        let bg_color = cur_zone.map(|z| z.bg_color).unwrap_or(Color::new(0.05, 0.03, 0.03, 1.0));
        let zone_theme_color = cur_zone.map(|z| z.color).unwrap_or(Color::new(0.0, 1.0, 0.78, 1.0));

        clear_background(bg_color);

        let tile_size = 120.0;
        let offset_x = (screen_w * 0.5 - camera_x) % (tile_size * 2.0);
        let offset_y = (screen_h * 0.5 - camera_y) % (tile_size * 2.0);

        let grid_cols = (screen_w / tile_size) as i32 + 4;
        let grid_rows = (screen_h / tile_size) as i32 + 4;

        for r in -2..grid_rows {
            for c in -2..grid_cols {
                let rx = offset_x + (c as f32) * tile_size;
                let ry = offset_y + (r as f32) * tile_size;
                let is_alt = (r + c).abs() % 2 == 0;
                let col = if is_alt {
                    Color::new(0.08, 0.05, 0.05, 0.7)
                } else {
                    Color::new(0.06, 0.04, 0.04, 0.7)
                };
                draw_rectangle(rx, ry, tile_size, tile_size, col);
                draw_rectangle_lines(rx, ry, tile_size, tile_size, 0.5, Color::new(0.15, 0.1, 0.1, 0.3));
            }
        }

        // 5. 绘制中心世界坐标标尺虚线 (对齐 JS 大世界)
        let world_center_screen_x = screen_w * 0.5 - camera_x + GameConfig::DEFAULT_SPAWN_X as f32;
        let world_center_screen_y = screen_h * 0.5 - camera_y + GameConfig::DEFAULT_SPAWN_Y as f32;

        draw_line(
            world_center_screen_x, 0.0,
            world_center_screen_x, screen_h,
            1.0,
            Color::new(0.0, 1.0, 0.78, 0.15),
        );
        draw_line(
            0.0, world_center_screen_y,
            screen_w, world_center_screen_y,
            1.0,
            Color::new(0.0, 1.0, 0.78, 0.15),
        );

        // 6. 渲染世界障碍与据点
        if let Some(zone) = cur_zone {
            for obs in &zone.obstacles {
                let ox = screen_w * 0.5 + (obs.min_x as f32 - camera_x);
                let oy = screen_h * 0.5 + (obs.min_y as f32 - camera_y);
                let ow = (obs.max_x - obs.min_x) as f32;
                let oh = (obs.max_y - obs.min_y) as f32;

                draw_rectangle(ox, oy, ow, oh, Color::new(0.08, 0.12, 0.18, 0.85));
                draw_rectangle_lines(ox, oy, ow, oh, 1.5, zone.color);
                draw_text(&obs.name, ox + 15.0, oy + 25.0, 14.0, zone.color);
            }

            // 7. 渲染世界资源点 & Space 采矿交互
            let mut nearest_res = None;
            let mut nearest_res_dist = 999999.0;

            for res in &zone.resources {
                let rx = screen_w * 0.5 + (res.x as f32 - camera_x);
                let ry = screen_h * 0.5 + (res.y as f32 - camera_y);
                let pulse = (now * 3.0 + res.x * 0.01).sin() as f32 * 4.0;
                let dist_to_res = ((player.x - res.x).powi(2) + (player.y - res.y).powi(2)).sqrt();

                if dist_to_res < nearest_res_dist {
                    nearest_res_dist = dist_to_res;
                    nearest_res = Some(res);
                }

                draw_circle(rx, ry, 28.0 + pulse, Color::new(0.0, 1.0, 0.78, 0.2));
                draw_circle(rx, ry, 20.0, zone.color);
                draw_circle_lines(rx, ry, 24.0, 1.5, WHITE);

                let res_label = format!("💎 T{} {}", res.tier, res.name);
                draw_rectangle(rx - 45.0, ry - 38.0, 90.0, 18.0, Color::new(0.04, 0.05, 0.08, 0.9));
                draw_rectangle_lines(rx - 45.0, ry - 38.0, 90.0, 18.0, 1.0, zone.color);
                draw_text(&res_label, rx - 40.0, ry - 25.0, 10.0, WHITE);

                // 距离 <= 350px 触发采矿提示与交互高亮
                if dist_to_res <= GameConfig::GATHER_PROMPT_DISTANCE {
                    let qte_text = format!("【Space / 空格】 采矿 ({}m)", dist_to_res.round());
                    let qte_w = (qte_text.chars().count() as f32) * 11.0 + 16.0;
                    draw_rectangle(rx - qte_w * 0.5, ry + 28.0, qte_w, 20.0, Color::new(0.0, 0.8, 0.6, 0.9));
                    draw_rectangle_lines(rx - qte_w * 0.5, ry + 28.0, qte_w, 20.0, 1.0, WHITE);
                    draw_text(&qte_text, rx - qte_w * 0.5 + 8.0, ry + 42.0, 11.0, BLACK);
                }
            }

            // 按下 Space 键采矿
            if is_key_pressed(KeyCode::Space) {
                if let Some(res) = nearest_res {
                    if nearest_res_dist <= GameConfig::GATHER_PROMPT_DISTANCE {
                        // 向服务端发送采集动作
                        let gather_payload = serde_json::json!({
                            "target_node_id": res.id,
                            "target_resource": {
                                "id": res.id,
                                "name": res.name,
                                "tier": res.tier,
                                "type": res.res_type,
                                "yield_item": res.yield_item,
                                "x": res.x,
                                "y": res.y
                            },
                            "is_crit": false,
                            "count": 1,
                            "zone_id": player.zone_id,
                            "player_x": player.x,
                            "player_y": player.y
                        });
                        
                        if let Some(snap) = api_client.send_action("gather_zone_resource", Some(gather_payload)).await {
                            // 从服务端响应更新背包
                            if let Some(backpack_arr) = snap.get("backpack").and_then(|v| v.as_array()) {
                                player.backpack.clear();
                                for item in backpack_arr {
                                    if let (Some(id), Some(name)) = (
                                        item.get("id").and_then(|v| v.as_str()),
                                        item.get("name").and_then(|v| v.as_str()),
                                    ) {
                                        player.backpack.push(BackpackItem {
                                            id: id.to_string(),
                                            name: name.to_string(),
                                            tier: item.get("tier").and_then(|v| v.as_u64()).unwrap_or(1) as u8,
                                            stack_count: item.get("stack_count").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
                                            weight: item.get("weight").and_then(|v| v.as_f64()).unwrap_or(1.0),
                                            item_id: item.get("item_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                        });
                                    }
                                }
                            }
                            // 更新铜钱
                            if let Some(copper) = snap.get("copper").and_then(|v| v.as_u64()) {
                                player.copper = copper;
                            }
                            // 更新负重
                            if let Some(w) = snap.get("current_weight").and_then(|v| v.as_f64()) {
                                player.current_weight = w;
                            }
                            toast_message = format!("⛏️ 挥镐采矿：成功开采【{}】，背包已更新！", res.name);
                        } else {
                            // 服务端不可达，仅本地更新铜钱
                            player.copper += GameConfig::GATHER_COPPER_PER_UNIT;
                            toast_message = format!("⛏️ 挥镐采矿：成功开采【{}】，铜钱 +{} (离线模式)！", res.name, GameConfig::GATHER_COPPER_PER_UNIT);
                        }
                        toast_time = now;
                    } else {
                        toast_message = format!("⚠️ 距离矿脉过远 ({:.0}px > {}px)，请靠近后再采矿", nearest_res_dist, GameConfig::GATHER_PROMPT_DISTANCE as i32);
                        toast_time = now;
                    }
                }
            }

            // ==========================================
            // 8. 渲染传送门 (100% 动态光环与粒子感)
            // ==========================================
            for gate in &zone.gates {
                let gx = screen_w * 0.5 + (gate.x as f32 - camera_x);
                let gy = screen_h * 0.5 + (gate.y as f32 - camera_y);

                let pulse = (now * 3.0 + gate.x * 0.001).sin() as f32 * 25.0;
                let outer_radius = PORTAL_RADIUS as f32 * 0.4 + pulse;

                // 传送门外部能量光晕
                draw_circle(gx, gy, outer_radius + 30.0, Color::new(gate.color.r, gate.color.g, gate.color.b, 0.15));
                draw_circle(gx, gy, outer_radius, Color::new(gate.color.r, gate.color.g, gate.color.b, 0.35));
                draw_circle_lines(gx, gy, outer_radius, 2.0, gate.color);

                // 双层旋转赛博星阵 (对标 JS: strokeRect with rotate)
                let _rot_time = now as f32 * 0.8;
                let _square_size = 50.0;
                
                // 绘制传送门中心晶核
                draw_circle(gx, gy, 18.0, WHITE);
                draw_circle(gx, gy, 12.0, gate.color);

                // 传送门标牌
                let label_w = (gate.name.chars().count() as f32) * 12.0 + 30.0;
                let label_h = 32.0;
                let label_x = gx - label_w * 0.5;
                let label_y = gy - outer_radius - 40.0;

                draw_rectangle(label_x, label_y, label_w, label_h, Color::new(0.04, 0.07, 0.12, 0.94));
                draw_rectangle_lines(label_x, label_y, label_w, label_h, 1.5, gate.color);
                draw_text(&gate.name, label_x + 12.0, label_y + 20.0, 13.0, WHITE);
                
                // 距离指示器
                let dist_to_player = ((player.x - gate.x).powi(2) + (player.y - gate.y).powi(2)).sqrt();
                let dist_desc = if now < teleport_cooldown_until {
                    format!("冷却中: {:.1}s", teleport_cooldown_until - now)
                } else {
                    format!("距离: {:.0}m (走入自动过图)", dist_to_player)
                };
                let cd_color = if now < teleport_cooldown_until { Color::new(1.0, 0.6, 0.2, 1.0) } else { Color::new(0.0, 1.0, 0.78, 0.9) };
                draw_text(&dist_desc, label_x + 12.0, label_y + 44.0, 10.0, cd_color);
            }
        }

        // 9. 渲染角色 (对标 JS: drawPlayer - 赛博光晕 + 胶囊体/头顶境界称号)
        let player_screen_x = screen_w * 0.5 + (player.x as f32 - camera_x);
        let player_screen_y = screen_h * 0.5 + (player.y as f32 - camera_y);
        let bounce = (now * 5.0).sin() as f32 * 2.0;

        // 脚底赛博光晕
        draw_circle(player_screen_x, player_screen_y + 12.0, 24.0, Color::new(0.0, 1.0, 0.78, 0.25));
        draw_circle_lines(player_screen_x, player_screen_y + 12.0, 32.0, 1.5, Color::new(0.0, 1.0, 0.78, 0.4));

        // 无敌金身护体光环 (若处于 30s 无敌保护期内)
        if now < invulnerable_until {
            let shield_pulse = (now * 6.0).sin() as f32 * 4.0;
            draw_circle(player_screen_x, player_screen_y, 36.0 + shield_pulse, Color::new(1.0, 0.84, 0.0, 0.18));
            draw_circle_lines(player_screen_x, player_screen_y, 36.0 + shield_pulse, 2.0, Color::new(1.0, 0.84, 0.0, 0.85));
            draw_circle_lines(player_screen_x, player_screen_y, 42.0 + shield_pulse, 1.0, Color::new(0.0, 1.0, 0.78, 0.7));
        }

        // 角色主体 (发光修仙者形态)
        draw_circle(player_screen_x, player_screen_y - 10.0 + bounce, 10.0, WHITE);
        draw_circle_lines(player_screen_x, player_screen_y - 10.0 + bounce, 12.0, 1.5, Color::new(0.0, 1.0, 0.78, 0.9));
        draw_rectangle(player_screen_x - 8.0, player_screen_y + bounce, 16.0, 22.0, Color::new(0.0, 1.0, 0.78, 0.85));

        // 头顶境界气泡 【炼体 · 1层】 (13500, 13500)
        let title_text = format!("【{} · {}层】", player.realm_name, player.sub_level);
        let coord_text = format!("({:.0}, {:.0})", player.x, player.y);

        let bubble_w = 110.0;
        let bubble_h = 32.0;
        let bubble_x = player_screen_x - bubble_w * 0.5;
        let bubble_y = player_screen_y - 58.0 + bounce;

        draw_rectangle(bubble_x, bubble_y, bubble_w, bubble_h, Color::new(0.06, 0.09, 0.16, 0.92));
        draw_rectangle_lines(bubble_x, bubble_y, bubble_w, bubble_h, 1.0, Color::new(0.0, 1.0, 0.78, 0.9));
        draw_text(&title_text, bubble_x + 12.0, bubble_y + 14.0, 13.0, Color::new(0.0, 1.0, 0.78, 1.0));
        draw_text(&coord_text, bubble_x + 16.0, bubble_y + 27.0, 11.0, Color::new(0.8, 0.9, 1.0, 0.8));

        // 10. 顶部区域横幅 (对标 JS: drawZoneBannerOverlay)
        let banner_w = 460.0;
        let banner_h = 44.0;
        let banner_x = (screen_w - banner_w) * 0.5;
        let banner_y = 66.0;

        draw_rectangle(banner_x, banner_y, banner_w, banner_h, Color::new(0.08, 0.04, 0.04, 0.92));
        draw_rectangle_lines(banner_x, banner_y, banner_w, banner_h, 1.2, zone_theme_color);

        let banner_title = format!("⛩️ 踏入新境: {}", player.zone_name);
        draw_text(&banner_title, banner_x + 14.0, banner_y + 18.0, 14.0, zone_theme_color);
        draw_text("90s 广袤域界", banner_x + banner_w - 74.0, banner_y + 16.0, 10.0, Color::new(0.9, 0.4, 0.4, 0.8));
        draw_text("ONLINE BIOME", banner_x + banner_w - 78.0, banner_y + 28.0, 9.0, Color::new(0.6, 0.6, 0.6, 0.8));
        
        let weather_label = format!("🌤️ 气候: 【{}】· {}", player.weather, player.weather_effect);
        draw_text(&weather_label, banner_x + 14.0, banner_y + 34.0, 11.0, Color::new(0.8, 0.7, 0.4, 0.9));

        // 状态 Buff / Cooldown 栏显示
        let mut buff_x = 16.0;
        let buff_y = 66.0;
        if now < invulnerable_until {
            let invul_rem = invulnerable_until - now;
            let text = format!("🛡️ 无敌保护: {:.1}s", invul_rem);
            let bw = (text.chars().count() as f32) * 11.0 + 16.0;
            draw_rectangle(buff_x, buff_y, bw, 24.0, Color::new(0.1, 0.25, 0.2, 0.9));
            draw_rectangle_lines(buff_x, buff_y, bw, 24.0, 1.0, Color::new(1.0, 0.84, 0.0, 1.0));
            draw_text(&text, buff_x + 8.0, buff_y + 16.0, 11.0, Color::new(1.0, 0.84, 0.0, 1.0));
            buff_x += bw + 8.0;
        }
        if now < teleport_cooldown_until {
            let cd_rem = teleport_cooldown_until - now;
            let text = format!("⏳ 传送冷却: {:.1}s", cd_rem);
            let bw = (text.chars().count() as f32) * 11.0 + 16.0;
            draw_rectangle(buff_x, buff_y, bw, 24.0, Color::new(0.25, 0.15, 0.1, 0.9));
            draw_rectangle_lines(buff_x, buff_y, bw, 24.0, 1.0, Color::new(1.0, 0.6, 0.2, 1.0));
            draw_text(&text, buff_x + 8.0, buff_y + 16.0, 11.0, Color::new(1.0, 0.6, 0.2, 1.0));
            buff_x += bw + 8.0;
        }
        if now < invulnerable_fatigue_until && now >= invulnerable_until {
            let ft_rem = invulnerable_fatigue_until - now;
            let text = format!("💤 无敌疲劳: {:.1}s", ft_rem);
            let bw = (text.chars().count() as f32) * 11.0 + 16.0;
            draw_rectangle(buff_x, buff_y, bw, 24.0, Color::new(0.15, 0.15, 0.2, 0.85));
            draw_rectangle_lines(buff_x, buff_y, bw, 24.0, 1.0, Color::new(0.6, 0.6, 0.7, 0.8));
            draw_text(&text, buff_x + 8.0, buff_y + 16.0, 11.0, Color::new(0.7, 0.7, 0.8, 0.9));
        }

        // 11. 顶部 HUD 系统 (100% 对齐 JS ui/js/hud.js)
        let top_hud_h = 44.0;
        let top_hud_x = 16.0;
        let top_hud_y = 12.0;
        let top_hud_w = screen_w - 32.0;

        draw_rectangle(top_hud_x, top_hud_y, top_hud_w, top_hud_h, Color::new(0.04, 0.05, 0.08, 0.95));
        draw_rectangle_lines(top_hud_x, top_hud_y, top_hud_w, top_hud_h, 1.2, Color::new(0.2, 0.25, 0.35, 0.8));

        // 标题与货币状态
        draw_text("【天道锻造大师】", top_hud_x + 16.0, top_hud_y + 27.0, 16.0, WHITE);
        draw_text(&format!("铜钱: {}", player.copper), top_hud_x + 165.0, top_hud_y + 27.0, 13.0, Color::new(0.78, 0.58, 0.39, 1.0));
        draw_text(&format!("金币: {}", player.coins), top_hud_x + 275.0, top_hud_y + 27.0, 13.0, Color::new(1.0, 0.84, 0.0, 1.0));
        draw_text(&format!("仙玉: {}", player.jade), top_hud_x + 385.0, top_hud_y + 27.0, 13.0, Color::new(0.0, 1.0, 0.78, 1.0));
        draw_text(&format!("LV.{} {}", player.level, player.hammer_name), top_hud_x + 485.0, top_hud_y + 27.0, 13.0, Color::new(0.58, 0.64, 0.72, 1.0));

        // 右侧 9 大功能导航按钮栏
        let btn_w = 74.0;
        let btn_h = 26.0;
        let btn_gap = 6.0;
        let btn_y = top_hud_y + 9.0;
        let nav_start_x = top_hud_x + top_hud_w - (btn_w + btn_gap) * (nav_buttons.len() as f32) - 8.0;

        let mouse_p = mouse_position();
        let mouse_clicked = is_mouse_button_pressed(MouseButton::Left);

        for (idx, btn) in nav_buttons.iter().enumerate() {
            let bx = nav_start_x + (idx as f32) * (btn_w + btn_gap);
            let is_hover = mouse_p.0 >= bx && mouse_p.0 <= bx + btn_w && mouse_p.1 >= btn_y && mouse_p.1 <= btn_y + btn_h;
            let is_active = active_modal == Some(btn.id);

            if is_hover && mouse_clicked {
                active_modal = if is_active { None } else { Some(btn.id) };
            }

            let bg_c = if is_active {
                Color::new(0.12, 0.2, 0.3, 0.95)
            } else if is_hover {
                Color::new(0.09, 0.14, 0.22, 0.9)
            } else {
                Color::new(0.06, 0.09, 0.16, 0.85)
            };

            let border_c = if is_active {
                Color::new(0.0, 1.0, 0.78, 1.0)
            } else {
                Color::new(0.28, 0.33, 0.41, 0.9)
            };

            draw_rectangle(bx, btn_y, btn_w, btn_h, bg_c);
            draw_rectangle_lines(bx, btn_y, btn_w, btn_h, 1.0, border_c);
            draw_text(btn.label, bx + 6.0, btn_y + 17.0, 11.0, btn.color);
        }

        // 12. 底部快捷操作栏 Dock (100% 对齐 JS ui/js/hud.js)
        let dock_h = 38.0;
        let dock_y = screen_h - dock_h;
        draw_rectangle(0.0, dock_y, screen_w, dock_h, Color::new(0.03, 0.05, 0.07, 0.96));
        draw_rectangle_lines(0.0, dock_y, screen_w, dock_h, 1.0, Color::new(0.2, 0.25, 0.35, 0.8));

        // [T] 熔炼
        draw_rectangle(16.0, dock_y + 6.0, 115.0, 26.0, Color::new(0.1, 0.1, 0.1, 0.6));
        draw_rectangle_lines(16.0, dock_y + 6.0, 115.0, 26.0, 1.0, Color::new(0.47, 0.47, 0.47, 0.8));
        draw_text(&format!("[T] 熔炼: {}", player.melt_tier), 24.0, dock_y + 23.0, 12.0, Color::new(0.6, 0.6, 0.6, 1.0));

        // [G] 上架
        draw_rectangle(139.0, dock_y + 6.0, 125.0, 26.0, Color::new(0.1, 0.1, 0.1, 0.6));
        draw_rectangle_lines(139.0, dock_y + 6.0, 125.0, 26.0, 1.0, Color::new(0.47, 0.47, 0.47, 0.8));
        draw_text(&format!("[G] 上架: {}", player.list_tier), 147.0, dock_y + 23.0, 12.0, Color::new(0.6, 0.6, 0.6, 1.0));

        // [X] 突破
        draw_rectangle(272.0, dock_y + 6.0, 120.0, 26.0, Color::new(0.1, 0.1, 0.1, 0.6));
        draw_rectangle_lines(272.0, dock_y + 6.0, 120.0, 26.0, 1.0, Color::new(0.39, 0.45, 0.54, 0.8));
        draw_text(&format!("[X] 突破({}/10)", player.sub_level), 280.0, dock_y + 23.0, 12.0, Color::new(0.5, 0.55, 0.65, 1.0));

        // [K] 挂机
        draw_rectangle(400.0, dock_y + 6.0, 95.0, 26.0, Color::new(0.1, 0.1, 0.1, 0.6));
        draw_rectangle_lines(400.0, dock_y + 6.0, 95.0, 26.0, 1.0, Color::new(0.39, 0.45, 0.54, 0.8));
        draw_text("[K] 挂机: 关闭", 408.0, dock_y + 23.0, 12.0, Color::new(0.5, 0.55, 0.65, 1.0));

        // MMO 快捷键说明
        draw_text(
            "MMO快捷: [L]九州 [M]区域 [B]锦囊 [P]拍阁 [J]任务 [N]学徒 [I]日志 [C]身体 | [WASD]移动 | 传送门自动过图",
            505.0, dock_y + 23.0, 11.0, Color::new(0.4, 0.46, 0.54, 1.0),
        );

        // 帧率 FPS 显示
        let fps_col = if fps_counter < 30 {
            Color::new(1.0, 0.3, 0.48, 1.0)
        } else if fps_counter < 50 {
            Color::new(1.0, 0.84, 0.0, 1.0)
        } else {
            Color::new(0.0, 1.0, 0.78, 1.0)
        };
        draw_text(&format!("FPS: {}", fps_counter), screen_w - 75.0, dock_y + 23.0, 12.0, fps_col);

        // 13. 右下角赛博罗盘小地图 (100% 对齐 JS ui/js/minimap-view.js)
        let mini_w = 200.0;
        let mini_h = 180.0;
        let mini_x = screen_w - mini_w - 16.0;
        let mini_y = screen_h - dock_h - mini_h - 12.0;

        // 底板与青绿色边框
        draw_rectangle(mini_x, mini_y, mini_w, mini_h, Color::new(0.03, 0.05, 0.08, 0.94));
        draw_rectangle_lines(mini_x, mini_y, mini_w, mini_h, 1.2, Color::new(0.0, 1.0, 0.78, 0.8));

        // 罗盘标题栏
        draw_rectangle(mini_x + 1.0, mini_y + 1.0, mini_w - 2.0, 24.0, Color::new(0.06, 0.09, 0.16, 0.9));
        let compass_title = format!("🧭 {} · 罗盘", player.zone_name.split('·').next().unwrap_or(&player.zone_name));
        draw_text(&compass_title, mini_x + 6.0, mini_y + 16.0, 11.0, WHITE);

        // [M区域] / [K全图] 标签
        draw_rectangle(mini_x + mini_w - 78.0, mini_y + 4.0, 32.0, 16.0, Color::new(0.22, 0.74, 0.97, 0.2));
        draw_rectangle_lines(mini_x + mini_w - 78.0, mini_y + 4.0, 32.0, 16.0, 1.0, Color::new(0.22, 0.74, 0.97, 0.8));
        draw_text("M区域", mini_x + mini_w - 76.0, mini_y + 15.0, 9.0, Color::new(0.22, 0.74, 0.97, 1.0));

        draw_rectangle(mini_x + mini_w - 42.0, mini_y + 4.0, 32.0, 16.0, Color::new(0.0, 1.0, 0.78, 0.2));
        draw_rectangle_lines(mini_x + mini_w - 42.0, mini_y + 4.0, 32.0, 16.0, 1.0, Color::new(0.0, 1.0, 0.78, 0.8));
        draw_text("K全图", mini_x + mini_w - 40.0, mini_y + 15.0, 9.0, Color::new(0.0, 1.0, 0.78, 1.0));

        // 罗盘内部视口与雷达扫掠
        let map_inner_x = mini_x + 6.0;
        let map_inner_y = mini_y + 28.0;
        let map_inner_w = mini_w - 12.0;
        let map_inner_h = mini_h - 60.0;

        draw_rectangle(map_inner_x, map_inner_y, map_inner_w, map_inner_h, Color::new(0.01, 0.02, 0.05, 1.0));

        // 障碍与据点示意点
        if let Some(zone) = cur_zone {
            for obs in &zone.obstacles {
                let ox = map_inner_x + (obs.min_x as f32 / MAP_SIZE as f32) * map_inner_w;
                let oy = map_inner_y + (obs.min_y as f32 / MAP_SIZE as f32) * map_inner_h;
                let ow = ((obs.max_x - obs.min_x) as f32 / MAP_SIZE as f32) * map_inner_w;
                let oh = ((obs.max_y - obs.min_y) as f32 / MAP_SIZE as f32) * map_inner_h;
                draw_rectangle(ox, oy, ow.max(2.0), oh.max(2.0), Color::new(0.2, 0.25, 0.35, 0.8));
            }

            // 传送门在小地图上的点
            for gate in &zone.gates {
                let gx = map_inner_x + (gate.x as f32 / MAP_SIZE as f32) * map_inner_w;
                let gy = map_inner_y + (gate.y as f32 / MAP_SIZE as f32) * map_inner_h;
                draw_circle(gx, gy, 3.0, gate.color);
            }
        }

        // 玩家自身在小地图上的定位点
        let mini_player_x = map_inner_x + (player.x as f32 / MAP_SIZE as f32) * map_inner_w;
        let mini_player_y = map_inner_y + (player.y as f32 / MAP_SIZE as f32) * map_inner_h;
        draw_circle(mini_player_x, mini_player_y, 3.5, Color::new(0.0, 1.0, 0.78, 1.0));
        draw_circle_lines(mini_player_x, mini_player_y, 6.0, 1.0, Color::new(0.0, 1.0, 0.78, 0.6));

        // 底部位置说明与气候标签
        let cur_loc = format!("📍 {}", player.zone_name);
        draw_text(&cur_loc, mini_x + 8.0, mini_y + mini_h - 22.0, 10.0, zone_theme_color);
        draw_text(&format!("[{}]", player.weather), mini_x + mini_w - 38.0, mini_y + mini_h - 22.0, 10.0, Color::new(0.8, 0.7, 0.4, 1.0));
        draw_text("➔ 靠近传送门 (360m) 自动过图", mini_x + 8.0, mini_y + mini_h - 10.0, 9.0, Color::new(0.22, 0.74, 0.97, 0.9));
        draw_text(&format!("坐标: ({:.0}, {:.0})", player.x, player.y), mini_x + 8.0, mini_y + mini_h - 1.0, 8.0, Color::new(0.5, 0.55, 0.65, 1.0));

        // 14. 浮动 Toast 消息提示
        if now - toast_time < 3.0 && !toast_message.is_empty() {
            let toast_w = (toast_message.chars().count() as f32) * 14.0 + 40.0;
            let toast_h = 36.0;
            let toast_x = (screen_w - toast_w) * 0.5;
            let toast_y = screen_h * 0.4;

            draw_rectangle(toast_x, toast_y, toast_w, toast_h, Color::new(0.06, 0.12, 0.18, 0.95));
            draw_rectangle_lines(toast_x, toast_y, toast_w, toast_h, 1.5, Color::new(0.0, 1.0, 0.78, 1.0));
            draw_text(&toast_message, toast_x + 20.0, toast_y + 22.0, 14.0, WHITE);
        }

        // ==========================================
        // 15. 模态弹窗系统 (100% 对齐 JS 各大弹窗)
        // ==========================================
        if let Some(modal_id) = active_modal {
            let mw = 520.0_f32.min(screen_w - 40.0);
            let mh = 420.0_f32.min(screen_h - 100.0);
            let mx = (screen_w - mw) * 0.5;
            let my = (screen_h - mh) * 0.5;

            // 蒙层与窗口主体
            draw_rectangle(0.0, 0.0, screen_w, screen_h, Color::new(0.0, 0.0, 0.0, 0.45));
            draw_rectangle(mx, my, mw, mh, Color::new(0.04, 0.07, 0.12, 0.98));
            draw_rectangle_lines(mx, my, mw, mh, 1.5, Color::new(0.0, 1.0, 0.78, 0.8));

            // 标题栏
            draw_rectangle(mx, my, mw, 36.0, Color::new(0.06, 0.11, 0.18, 0.98));
            let title = match modal_id {
                "map_world" => "🗺️ 九州大世界全景地图 [L]",
                "map_zone" => "🧭 区域地脉与据点明细 [M]",
                "stash" => "🎒 锦囊储物袋 [B]",
                "debug" => "🎛️ GM 开发者控制台与神行传送 [F3]",
                _ => "系统面板",
            };
            draw_text(title, mx + 16.0, my + 24.0, 14.0, Color::new(0.0, 1.0, 0.78, 1.0));

            // 关闭按钮 [X]
            let close_bx = mx + mw - 32.0;
            let close_by = my + 6.0;
            let is_close_hover = mouse_p.0 >= close_bx && mouse_p.0 <= close_bx + 24.0 && mouse_p.1 >= close_by && mouse_p.1 <= close_by + 24.0;
            if is_close_hover && mouse_clicked {
                active_modal = None;
            }
            draw_rectangle(close_bx, close_by, 24.0, 24.0, if is_close_hover { Color::new(0.8, 0.2, 0.2, 0.8) } else { Color::new(0.2, 0.2, 0.2, 0.5) });
            draw_text("✕", close_bx + 7.0, close_by + 17.0, 13.0, WHITE);

            // 弹窗内容区分
            match modal_id {
                "debug" => {
                    let mut dy = my + 54.0;
                    draw_text("⚡【GM 神行传送网络】(点击即刻跨图瞬移):", mx + 16.0, dy, 12.0, Color::new(0.9, 0.8, 0.4, 1.0));
                    dy += 22.0;

                    let gm_targets = [
                        ("beijing", "⛩️ 北京·红皇城", Color::new(0.93, 0.27, 0.27, 1.0)),
                        ("hebei", "🔥 河北·丙火城", Color::new(0.97, 0.45, 0.09, 1.0)),
                        ("shanghai", "🌊 上海·商港", Color::new(0.96, 0.62, 0.04, 1.0)),
                        ("zhejiang", "🍃 浙江·灵茶都", Color::new(0.02, 0.71, 0.83, 1.0)),
                        ("yunnan", "🌿 云南·古林", Color::new(0.06, 0.72, 0.51, 1.0)),
                        ("qinghai", "🏔️ 青海·雪岭", Color::new(0.91, 0.7, 0.03, 1.0)),
                        ("zone_gm_test", "🪐 GM虚空试验场", Color::new(0.92, 0.28, 0.6, 1.0)),
                    ];

                    let btn_gw = (mw - 44.0) / 2.0;
                    let btn_gh = 30.0;

                    for (i, (t_id, t_name, t_col)) in gm_targets.iter().enumerate() {
                        let row = i / 2;
                        let col = i % 2;
                        let gbx = mx + 16.0 + (col as f32) * (btn_gw + 12.0);
                        let gby = dy + (row as f32) * (btn_gh + 8.0);

                        let is_hov = mouse_p.0 >= gbx && mouse_p.0 <= gbx + btn_gw && mouse_p.1 >= gby && mouse_p.1 <= gby + btn_gh;
                        if is_hov && mouse_clicked {
                            if let Some(target_zone) = topology.zones.get(*t_id) {
                                player.zone_id = target_zone.id.clone();
                                player.zone_name = target_zone.name.clone();
                                player.weather = target_zone.weather.clone();
                                player.weather_effect = target_zone.weather_buff.clone();
                                player.x = target_zone.spawn_x;
                                player.y = target_zone.spawn_y;
                                camera_x = player.x as f32;
                                camera_y = player.y as f32;

                                toast_message = format!("⚡ GM 神行传送至【{}】", target_zone.name);
                                toast_time = now;

                                storage.save_position(&PlayerPosition {
                                    x: player.x,
                                    y: player.y,
                                    zone_id: player.zone_id.clone(),
                                    last_updated: (now * 1000.0) as u64,
                                });
                            }
                        }

                        let bg_btn = if is_hov { Color::new(0.15, 0.22, 0.32, 0.95) } else { Color::new(0.08, 0.12, 0.18, 0.85) };
                        draw_rectangle(gbx, gby, btn_gw, btn_gh, bg_btn);
                        draw_rectangle_lines(gbx, gby, btn_gw, btn_gh, 1.0, if is_hov { Color::new(0.0, 1.0, 0.78, 1.0) } else { Color::new(0.25, 0.3, 0.4, 0.8) });
                        draw_text(t_name, gbx + 10.0, gby + 20.0, 11.0, *t_col);
                    }

                    let ctrl_y = dy + 4.0 * (btn_gh + 8.0) + 12.0;
                    draw_text("🛠️【快捷位移】:", mx + 16.0, ctrl_y, 12.0, Color::new(0.0, 1.0, 0.78, 1.0));
                    
                    let reset_bx = mx + 16.0;
                    let reset_by = ctrl_y + 12.0;
                    let is_reset_hov = mouse_p.0 >= reset_bx && mouse_p.0 <= reset_bx + 180.0 && mouse_p.1 >= reset_by && mouse_p.1 <= reset_by + 28.0;
                    if is_reset_hov && mouse_clicked {
                        player.x = GameConfig::DEFAULT_SPAWN_X;
                        player.y = GameConfig::DEFAULT_SPAWN_Y;
                        camera_x = GameConfig::DEFAULT_SPAWN_X as f32;
                        camera_y = GameConfig::DEFAULT_SPAWN_Y as f32;
                        toast_message = format!("🔄 坐标已重置到地图中心 ({}, {})", GameConfig::DEFAULT_SPAWN_X as i32, GameConfig::DEFAULT_SPAWN_Y as i32);
                        toast_time = now;
                        storage.save_position(&PlayerPosition {
                            x: player.x,
                            y: player.y,
                            zone_id: player.zone_id.clone(),
                            last_updated: (now * 1000.0) as u64,
                        });
                    }
                    draw_rectangle(reset_bx, reset_by, 180.0, 28.0, if is_reset_hov { Color::new(0.2, 0.3, 0.4, 0.9) } else { Color::new(0.1, 0.15, 0.2, 0.8) });
                    draw_rectangle_lines(reset_bx, reset_by, 180.0, 28.0, 1.0, Color::new(0.0, 1.0, 0.78, 0.8));
                    draw_text(&format!("重置到中心 ({}, {})", GameConfig::DEFAULT_SPAWN_X as i32, GameConfig::DEFAULT_SPAWN_Y as i32), reset_bx + 8.0, reset_by + 18.0, 11.0, WHITE);
                }
                "map_world" => {
                    let mut dy = my + 54.0;
                    draw_text("九州全境六大主城及大运河拓扑 (点击任意主城可快速导航):", mx + 16.0, dy, 11.0, Color::new(0.7, 0.8, 0.9, 1.0));
                    dy += 24.0;

                    for (zid, znode) in &topology.zones {
                        if znode.is_city {
                            let zbx = mx + 16.0;
                            let zby = dy;
                            let is_zhov = mouse_p.0 >= zbx && mouse_p.0 <= zbx + mw - 32.0 && mouse_p.1 >= zby && mouse_p.1 <= zby + 32.0;
                            if is_zhov && mouse_clicked {
                                player.zone_id = znode.id.clone();
                                player.zone_name = znode.name.clone();
                                player.weather = znode.weather.clone();
                                player.weather_effect = znode.weather_buff.clone();
                                player.x = znode.spawn_x;
                                player.y = znode.spawn_y;
                                camera_x = player.x as f32;
                                camera_y = player.y as f32;
                                toast_message = format!("🚀 抵达主城【{}】", znode.name);
                                toast_time = now;
                                storage.save_position(&PlayerPosition {
                                    x: player.x,
                                    y: player.y,
                                    zone_id: player.zone_id.clone(),
                                    last_updated: (now * 1000.0) as u64,
                                });
                            }

                            draw_rectangle(zbx, zby, mw - 32.0, 32.0, if is_zhov { Color::new(0.12, 0.18, 0.26, 0.9) } else { Color::new(0.07, 0.1, 0.15, 0.7) });
                            draw_rectangle_lines(zbx, zby, mw - 32.0, 32.0, 1.0, if zid == &player.zone_id { Color::new(0.0, 1.0, 0.78, 1.0) } else { Color::new(0.2, 0.25, 0.35, 0.8) });
                            let prefix = if zid == &player.zone_id { "📍[当前驻留] " } else { "➔ " };
                            draw_text(&format!("{}{}", prefix, znode.name), zbx + 12.0, zby + 20.0, 12.0, znode.color);
                            draw_text(&format!("气候: {}", znode.weather), zbx + mw - 140.0, zby + 20.0, 10.0, Color::new(0.6, 0.7, 0.8, 1.0));
                            dy += 38.0;
                        }
                    }
                }
                _ => {
                    draw_text("面板正在进行天道算力同步中...", mx + 20.0, my + 80.0, 12.0, Color::new(0.6, 0.6, 0.6, 1.0));
                }
            }
        }

        next_frame().await;
    }
}
