 我d game;

use actix_files::Files;
use actix_web::{App, HttpResponse, HttpServer, Responder, get, post, web};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use game::dao_origin::DaoOrigin;
use game::numbers::format_compact_number;
use game::state::GameState;
use game::strike::do_strike;

struct Session {
    state: GameState,
    dao: DaoOrigin,
    cycle_start: Instant,
}

struct AppState(Mutex<HashMap<String, Session>>);

#[derive(Serialize, Clone)]
struct ItemView {
    id: u64,
    name: String,
    glyph: String,
    price: String,
    quality: String,
    color: String,
    is_tool: bool,
    detail: String,

    // 🌟 新增：结构化天道出生证明 (传给前端全息卡片展示)
    cert_code: String,
    cert_time: String,
    cert_location: String,
    cert_stamp: String,
    cert_creator: String,
}

#[derive(Serialize, Clone)]
struct LotView {
    name: String,
    bid: String,
    fair: String,
    time: u64,
    bids: u32,
    sold: bool,
    waiting: bool,
    color: String,
    status: String,
}

#[derive(Serialize, Clone)]
struct UiSnapshot {
    connected: bool,
    hammer_name: String,
    hammer_level: u32,
    hammer_power: String,
    level: u32,
    exp: u32,
    max_exp: u32,
    strikes: u32,
    max_strikes: u32,
    sub_strikes: f64,
    coins: String,
    copper: String,
    jade: String,
    progress: f64,
    in_crit: bool,
    interval_secs: f64,
    toast: String,
    log: String,
    logs: Vec<String>,
    backpack: Vec<ItemView>,
    max_backpack: usize,
    lots: Vec<LotView>,
    max_pavilion: usize,
    melt_tier: String,
    list_tier: String,
    melt_color: String,
    list_color: String,
    realm_name: String,
    title: String,
    sub_level: u32,
    realm_exp: String,
    exp_to_next: String,
    cultivation: String,
    god_rate: String,
    iron_slag: u32,
    apprentices: u32,
    max_apprentices: u32,
    forge_qte_hits: f64,
    flash: bool,
    market_news: String,
    auction_workers: u32,
    auctioneer_threads: u32,
    swarm_present: u32,
    swarm_bidding: u32,
    concurrent_hammers: u32,
    matrix_slots: u32,
    pending_breakthrough: bool,
    debug_mode: bool,
    sharpen_workers: u32,
    enchant_workers: u32,
    repair_workers: u32,
    forge_workers: u32,
    physique: u64,
    qi_sense: u64,
    spirit: u64,
    core_count: u32,
    core_size: u64,
    core_refine: u32,
    infant_size: u64,
    infant_count: u32,
    infant_power: u64,
    qi_machine: u64,
    matrix: u64,
    law_shards: u32,
    anti_gravity: u64,
    tribulation: u64,
    causality: u64,
    law_control: u64,
    causal_mastery: u64,
    thermo: u64,
    entropy_switch: u64,
    cost_hammer: String,
    cost_bellows: String,
    cost_hire: String,
    cost_house: String,
    cost_backpack: String,
    cost_pavilion: String,
    matrix_progresses: Vec<f64>,
    currency_protocol: String,
    currency_protocol_color: String,
    quests: Vec<game::quests::QuestOffer>,
    active_quests: Vec<game::quests::ActiveQuest>,
    quest_next_refresh_secs: u64,
    player_x: f32,
    player_y: f32,
}

fn snapshot(inner: &Session) -> UiSnapshot {
    let s = &inner.state;
    let mut quest_board = s.quests.clone();
    quest_board.ensure(s);
    let interval = s.effective_interval_secs().max(0.01);
    let elapsed = inner.cycle_start.elapsed().as_secs_f64();
    let progress = (elapsed / interval).min(1.0);
    let in_crit = progress >= 0.76 && progress < 0.88;

    let auctioneer_threads: u32 = if s.auction_workers > 0 {
        ((s.auction_workers as u64 + 9) / 10) as u32
    } else {
        1
    };
    let teams = auctioneer_threads as usize;

    let backpack: Vec<ItemView> = s
        .backpack
        .iter()
        .take(s.max_backpack)
        .map(|sw| {
            // 🌟 实时逆向解密天道指纹
            let cert = game::fingerprint::Fingerprint64::decode(sw.fingerprint, "道友李逍遥");
            let detail = if sw.is_tool {
                format!("【家什】{}\n不可熔炼/上架", sw.name)
            } else {
                format!(
                    "{} {}\n五行：{} 品阶：{}\n估价：{} 金币\n碳比：{:.1}% 锋锐：{}",
                    sw.quality.badge(),
                    sw.name,
                    sw.element,
                    sw.quality.rank(),
                    format_compact_number(sw.price),
                    sw.carbon_ratio * 100.0,
                    sw.sharpness
                )
            };
            ItemView {
                id: sw.id,
                name: sw.name.clone(),
                glyph: sw.category_glyph().to_string(),
                price: format_compact_number(sw.price),
                quality: sw.quality.badge().to_string(),
                color: sw.quality.color_hex(),
                is_tool: sw.is_tool,
                detail,
                cert_code: cert.code,
                cert_time: cert.timestamp_str,
                cert_location: cert.location_str,
                cert_stamp: cert.dao_stamp,
                cert_creator: cert.creator,
            }
        })
        .collect();

    let lots: Vec<LotView> = s
        .pavilion_market
        .iter()
        .enumerate()
        .map(|(i, lot)| {
            let waiting = i >= teams;
            let status = if lot.is_sold {
                "成交".into()
            } else if waiting {
                format!("候场")
            } else {
                "拍卖中".into()
            };
            LotView {
                name: lot.sword.name.clone(),
                bid: format_compact_number(lot.listed_price),
                fair: format_compact_number(lot.fair_value.max(lot.sword.price)),
                time: lot.listing_time,
                bids: lot.bid_count,
                sold: lot.is_sold,
                waiting,
                color: lot.sword.quality.color_hex(),
                status,
            }
        })
        .collect();

    let log = s.logs.back().cloned().unwrap_or_else(|| s.toast.clone());
    let logs: Vec<String> = s.logs.iter().cloned().collect();

    UiSnapshot {
        connected: true,
        hammer_name: s.hammer_name().to_string(),
        hammer_level: s.hammer_level,
        hammer_power: format!("{:.2}", s.total_hammer_power()),
        level: s.level,
        exp: s.exp,
        max_exp: s.max_exp,
        strikes: s.strikes,
        max_strikes: s.max_strikes,
        sub_strikes: s.sub_strikes,
        coins: format_compact_number(s.coins),
        copper: format_compact_number(s.copper),
        jade: format_compact_number(s.jade),
        progress,
        in_crit,
        interval_secs: interval,
        toast: s.toast.clone(),
        log,
        logs,
        backpack,
        max_backpack: s.max_backpack,
        lots,
        max_pavilion: s.max_pavilion,
        melt_tier: s.melt_tier.name().to_string(),
        list_tier: s.list_tier.name().to_string(),
        melt_color: s.melt_tier.color_hex().to_string(),
        list_color: s.list_tier.color_hex().to_string(),
        realm_name: s.realm.realm.name().to_string(),
        title: s.realm.title().to_string(),
        sub_level: s.realm.sub_level,
        realm_exp: format_compact_number(s.realm.realm_exp),
        exp_to_next: format_compact_number(s.realm.exp_to_next_layer()),
        cultivation: format_compact_number(s.realm.cultivation_exp),
        god_rate: format!("{:.2}%", s.bonus_god_rate * 100.0),
        iron_slag: s.iron_slag,
        apprentices: s.apprentices,
        max_apprentices: s.max_apprentices,
        forge_qte_hits: s.forge_qte_hits,
        flash: s.flash_ticks > 0,
        market_news: s.market_news.clone(),
        auction_workers: s.auction_workers,
        auctioneer_threads,
        swarm_present: s.market_swarm.present,
        swarm_bidding: s.market_swarm.bidding,
        concurrent_hammers: s.concurrent_hammers(),
        matrix_slots: s.matrix_slots(),
        pending_breakthrough: s.realm.pending_breakthrough,
        debug_mode: s.debug_mode,
        sharpen_workers: s.sharpen_workers,
        enchant_workers: s.enchant_workers,
        repair_workers: s.repair_workers,
        forge_workers: s.forge_workers,
        physique: s.realm.body.physique,
        qi_sense: s.realm.body.qi_sense,
        spirit: s.realm.body.spirit,
        core_count: s.realm.body.core_count,
        core_size: s.realm.body.core_size,
        core_refine: u32::from(s.realm.body.core_refine),
        infant_size: s.realm.body.infant_size,
        infant_count: s.realm.body.infant_count,
        infant_power: s.realm.body.infant_power,
        qi_machine: s.realm.body.qi_machine,
        matrix: s.realm.body.matrix,
        law_shards: s.realm.body.law_shards,
        anti_gravity: s.realm.body.anti_gravity,
        tribulation: s.realm.body.tribulation,
        causality: s.realm.body.causality,
        law_control: s.realm.body.law_control,
        causal_mastery: s.realm.body.causal_mastery,
        thermo: s.realm.body.thermo,
        entropy_switch: s.realm.body.entropy_switch,
        cost_hammer: format_compact_number(s.get_hammer_upgrade_cost()),
        cost_bellows: format_compact_number(s.get_bellows_upgrade_cost()),
        cost_hire: format_compact_number(s.get_next_apprentice_cost()),
        cost_house: format_compact_number(s.get_house_upgrade_cost()),
        cost_backpack: format_compact_number(s.get_backpack_upgrade_cost()),
        cost_pavilion: format_compact_number(s.get_pavilion_upgrade_cost()),
        matrix_progresses: s.matrix_progresses.clone(),
        currency_protocol: s.currency_protocol_name().to_string(),
        currency_protocol_color: s.currency_protocol_color().to_string(),
        quests: quest_board.offers,
        active_quests: quest_board.active,
        quest_next_refresh_secs: quest_board.next_refresh_at.saturating_sub(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        ),
        player_x: s.player_x,
        player_y: s.player_y,
    }
}

// ----------------------------------------------------------------
// 会话获取助手函数
// ----------------------------------------------------------------

fn get_account_id(req: &actix_web::HttpRequest) -> String {
    req.headers()
        .get("X-Auth-Token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("default_account")
        .to_string()
}

fn get_or_create_session<'a>(
    sessions: &'a mut HashMap<String, Session>,
    account_id: &str,
) -> &'a mut Session {
    if !sessions.contains_key(account_id) {
        let mut state = GameState::load_from_disk(account_id);
        state.ensure_quests();
        let session = Session {
            state,
            dao: DaoOrigin::new(),
            cycle_start: Instant::now(),
        };
        sessions.insert(account_id.to_string(), session);
    }
    sessions.get_mut(account_id).unwrap()
}

// ----------------------------------------------------------------
// Actix-web API 路由
// ----------------------------------------------------------------

#[get("/api/state")]
async fn api_get_state(req: actix_web::HttpRequest, data: web::Data<AppState>) -> impl Responder {
    let account_id = get_account_id(&req);
    let mut sessions = data.0.lock().unwrap();
    let session = get_or_create_session(&mut sessions, &account_id);
    HttpResponse::Ok().json(snapshot(session))
}

#[post("/api/strike")]
async fn api_player_strike(
    req: actix_web::HttpRequest,
    data: web::Data<AppState>,
) -> impl Responder {
    let account_id = get_account_id(&req);
    let mut sessions = data.0.lock().unwrap();
    let session = get_or_create_session(&mut sessions, &account_id);

    let interval = session.state.effective_interval_secs().max(0.01);
    let progress = (session.cycle_start.elapsed().as_secs_f64() / interval).min(1.0);
    let in_crit = progress >= 0.76 && progress < 0.88;

    let Session {
        state,
        dao,
        cycle_start,
    } = session;
    do_strike(state, in_crit, dao);
    *cycle_start = Instant::now();
    dao.reset_cycle();

    HttpResponse::Ok().json(snapshot(session))
}

#[post("/api/tick")]
async fn api_game_tick(req: actix_web::HttpRequest, data: web::Data<AppState>) -> impl Responder {
    let account_id = get_account_id(&req);
    let mut sessions = data.0.lock().unwrap();
    let session = get_or_create_session(&mut sessions, &account_id);

    session.state.tick_toast();
    session.state.tick_quests();
    session.state.tick_flash();
    session.state.tick_market_rumor();

    // 🌟 核心：只执行听从用户模式的协议（模式0时完全不自动动钱）
    session.state.process_currency_protocol();

    // 后台矩阵轨道推进
    let tick_delta = 0.05;
    for prog in &mut session.state.matrix_progresses {
        if *prog < 1.0 {
            *prog = (*prog + tick_delta).min(1.0);
        }
    }

    if session.state.debug_mode {
        session.state.debug_tick_boost();
    }
    if session.state.market_tick_counter % 300 == 0 {
        let _ = session.state.save_to_disk(&account_id);
    }
    if session.state.market_tick_counter % 10 == 0 {
        session.state.process_immortal_buyers();
    }
    if session.state.encounter_timer > 0 {
        session.state.encounter_timer = session.state.encounter_timer.saturating_sub(1);
        if session.state.encounter_timer == 0 {
            session.state.process_encounters();
        }
    }
    session.state.process_auto_melt();
    session.state.process_auto_list();
    if session.state.market_tick_counter % 5 == 0 {
        session.state.process_apprentice_work();
    }

    let interval = session.state.effective_interval_secs().max(0.01);
    if session.cycle_start.elapsed().as_secs_f64() >= interval {
        let Session {
            state,
            dao,
            cycle_start,
        } = session;
        do_strike(state, false, dao);
        *cycle_start = Instant::now();
        dao.reset_cycle();
    }

    HttpResponse::Ok().json(snapshot(session))
}

#[derive(Deserialize)]
struct ActionPayload {
    key: String,
    x: Option<f32>,
    y: Option<f32>,
}

#[post("/api/action")]
async fn api_action(
    req: actix_web::HttpRequest,
    data: web::Data<AppState>,
    payload: web::Json<ActionPayload>,
) -> impl Responder {
    let account_id = get_account_id(&req);
    let mut sessions = data.0.lock().unwrap();
    let session = get_or_create_session(&mut sessions, &account_id);
    let s = &mut session.state;
    let key = &payload.key;

    if let Some(id) = key
        .strip_prefix("quest_accept_")
        .and_then(|v| v.parse::<u64>().ok())
    {
        s.quest_accept(id);
        return HttpResponse::Ok().json(snapshot(session));
    }
    if let Some(id) = key
        .strip_prefix("quest_abandon_")
        .and_then(|v| v.parse::<u64>().ok())
    {
        s.quest_abandon(id);
        return HttpResponse::Ok().json(snapshot(session));
    }
    if let Some(rest) = key.strip_prefix("quest_submit_") {
        let mut parts = rest.split('_');
        if let (Some(q), Some(item)) = (
            parts.next().and_then(|v| v.parse().ok()),
            parts.next().and_then(|v| v.parse().ok()),
        ) {
            s.quest_submit(q, item);
        }
        return HttpResponse::Ok().json(snapshot(session));
    }
    if let Some(id) = key
        .strip_prefix("quest_claim_")
        .and_then(|v| v.parse::<u64>().ok())
    {
        s.quest_claim(id);
        return HttpResponse::Ok().json(snapshot(session));
    }

    // 🌟 1. 优先匹配下拉菜单协议设置
    if let Some(mode_str) = key.strip_prefix("set_currency_protocol_") {
        if let Ok(mode) = mode_str.parse::<u8>() {
            s.set_currency_protocol(mode);
        }
        return HttpResponse::Ok().json(snapshot(session));
    }

    // 📍 客户端心跳同步坐标 (防加速挂)
    if key == "sync_pos" {
        if let (Some(x), Some(y)) = (payload.x, payload.y) {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64; // ms 级校验

            let dt = now.saturating_sub(s.last_sync_time);
            
            // 粗略算一下两点距离
            let dx = x - s.player_x;
            let dy = y - s.player_y;
            let dist = (dx * dx + dy * dy).sqrt();

            // 设玩家基础移动速度为 300 像素/秒，即 0.3 像素/ms
            // 给定 50% 的网络延迟和预测容差
            let max_dist = (dt as f32 * 0.3) * 1.5;

            // 只有距离合理（或者首次同步、长时间未同步等特例）才允许更新坐标
            if dist <= max_dist || dt > 10000 || s.last_sync_time == 0 {
                s.player_x = x;
                s.player_y = y;
                s.last_sync_time = now;
            } else {
                // 如果发现开挂，这里就不更新 s.player_x，强制让接下来的 snapshot 把他拉回老位置
                println!("⚠️ [防加速挂] 移动过快被拦截: dt={}ms, dist={}, max_dist={}", dt, dist, max_dist);
                s.last_sync_time = now; // 时间依然要推移
            }
        }
        return HttpResponse::Ok().json(snapshot(session));
    }

    // 右键菜单：按神兵 id 熔炼 / 上架
    if let Some(id_str) = key.strip_prefix("melt_id_") {
        if let Ok(id) = id_str.parse::<u64>() {
            s.melt_sword_by_id(id);
        }
        return HttpResponse::Ok().json(snapshot(session));
    }
    if let Some(id_str) = key.strip_prefix("list_id_") {
        if let Ok(id) = id_str.parse::<u64>() {
            s.list_sword_by_id(id);
        }
        return HttpResponse::Ok().json(snapshot(session));
    }

    // 🌟 2. 通用一视同仁解析器：自动拆解 (基础按键, 批量次数)
    let (base_key, count): (&str, u128) = match key.rsplit_once('_') {
        Some((b, n_str)) if n_str.chars().all(|c| c.is_ascii_digit()) => {
            (b, n_str.parse::<u128>().unwrap_or(1))
        }
        _ => (key.as_str(), 1),
    };

    match base_key {
        // 重锤升级 (U)
        "u" | "U" => {
            let mut up = 0;
            for _ in 0..count.min(10_000) {
                let cost = s.get_hammer_upgrade_cost();
                if s.coins < cost {
                    break;
                }
                s.upgrade_hammer();
                up += 1;
            }
            if count > 1 && up > 0 {
                s.set_toast(format!(
                    "连续升级重锤 ×{}：[{}] Lv.{}",
                    up,
                    s.hammer_name(),
                    s.hammer_level
                ));
            }
        }
        // 风箱升级 (W)
        "w" | "W" => {
            let mut up = 0;
            for _ in 0..count.min(10_000) {
                if s.natural_interval_ticks <= 10 {
                    break;
                }
                let cost = s.get_bellows_upgrade_cost();
                if s.coins < cost {
                    break;
                }
                s.upgrade_bellows();
                up += 1;
            }
            if count > 1 && up > 0 {
                s.set_toast(format!("连续升级风箱 ×{}：Lv.{}/500", up, s.bellows_level));
            }
        }
        // 招募学徒 (N)
        "n" | "N" => {
            let mut up = 0;
            for _ in 0..count.min(10_000) {
                if s.apprentices >= s.max_apprentices {
                    break;
                }
                let cost = s.get_next_apprentice_cost();
                if s.coins < cost {
                    break;
                }
                s.hire_apprentice();
                up += 1;
            }
            if count > 1 && up > 0 {
                s.set_toast(format!("批量招募学徒 ×{}：当前共 {} 人", up, s.apprentices));
            }
        }
        // 扩建厢房 (R)
        "r" | "R" => {
            let mut up = 0;
            for _ in 0..count.min(10_000) {
                let cost = s.get_house_upgrade_cost();
                if s.coins < cost {
                    break;
                }
                s.upgrade_house();
                up += 1;
            }
            if count > 1 && up > 0 {
                s.set_toast(format!(
                    "批量扩建厢房 ×{}：名额升至 {} 人",
                    up, s.max_apprentices
                ));
            }
        }
        // 扩充背包 (D)
        "d" | "D" => {
            let mut up = 0;
            for _ in 0..count.min(10_000) {
                let cost = s.get_backpack_upgrade_cost();
                if s.coins < cost {
                    break;
                }
                s.coins -= cost;
                s.max_backpack += 2;
                up += 1;
            }
            if up > 0 {
                s.set_toast(format!("背包扩容至 {} 格 (升级×{})", s.max_backpack, up));
            } else {
                s.set_toast(format!("扩容需 金{}", s.get_backpack_upgrade_cost()));
            }
        }
        // 扩建展位 (E)
        "e" | "E" => {
            let mut up = 0;
            for _ in 0..count.min(10_000) {
                let cost = s.get_pavilion_upgrade_cost();
                if s.coins < cost {
                    break;
                }
                s.upgrade_pavilion();
                up += 1;
            }
            if count > 1 && up > 0 {
                s.set_toast(format!("展位批量扩建 ×{}：升至 {} 个", up, s.max_pavilion));
            }
        }
        "s" | "S" => s.melt_lowest_sword(),
        "f" | "F" => s.list_top_sword_to_market(),
        "t" | "T" => s.toggle_auto_melt(),
        "g" | "G" => s.toggle_auto_list(),
        "0" => s.toggle_debug_mode(),
        "b" | "B" => {
            if s.realm.sub_level < 10 {
                s.set_toast(format!("尚未圆满：当前 {}层，需≥10层", s.realm.sub_level));
            } else {
                let success_rate: f64 = match s.realm.sub_level {
                    10 => 0.75_f64,
                    11 => 0.80_f64,
                    12 => 0.90_f64,
                    13 => 0.91_f64,
                    l if l > 13 => (0.91_f64 + ((l - 13) as f64) * 0.01_f64).min(0.99_f64),
                    _ => 0.75_f64,
                };
                let mut rng = rand::thread_rng();
                if rng.r#gen_bool(success_rate) && s.realm.manual_breakthrough() {
                    let msg = format!(
                        "天道引劫：成功突破至 [{}]！(概率 {:.0}%)",
                        s.realm.realm.name(),
                        success_rate * 100.0
                    );
                    s.set_toast(&msg);
                    s.push_log(msg, true, true);
                } else {
                    s.realm.realm = game::realm::Realm::BodyRefining;
                    s.realm.sub_level = 1;
                    s.realm.realm_exp = 0;
                    s.realm.pending_breakthrough = false;
                    s.sync_body_stats();
                    let fail_msg = format!(
                        "天劫反噬：渡劫失败（概率 {:.0}% 翻车）！真元溃散，贬回炼体境一重！",
                        success_rate * 100.0
                    );
                    s.set_toast(&fail_msg);
                    s.push_log(fail_msg, true, true);
                }
            }
        }
        // 岗位调配 1~5 (支持自动阶梯批量)
        "1" => s.reassign_workers_n(1, count.min(100_000) as u32),
        "2" => s.reassign_workers_n(2, count.min(100_000) as u32),
        "3" => s.reassign_workers_n(3, count.min(100_000) as u32),
        "4" => s.reassign_workers_n(4, count.min(100_000) as u32),
        "5" => s.reassign_workers_n(5, count.min(100_000) as u32),

        // 🌟 货币瞬时 O(1) 批量无损兑换
        "i" => s.exchange_copper_to_gold_n(count),
        "I" => s.exchange_gold_to_copper_n(count),
        "o" => s.exchange_gold_to_jade_n(count),
        "O" => s.exchange_jade_to_gold_n(count),

        // 🌟 放在 _ => {} 之前，确保可以被正常匹配执行
        "toggle_currency_protocol" => s.toggle_currency_protocol(),

        _ => {}
    }
    HttpResponse::Ok().json(snapshot(session))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let app_state = web::Data::new(AppState(Mutex::new(HashMap::new())));

    println!("【天道锻造大师 WEB版 v2.5.0 (WEEB)】服务器已启动：http://127.0.0.1:8080");

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .service(api_get_state)
            .service(api_player_strike)
            .service(api_game_tick)
            .service(api_action)
            .service(Files::new("/", "./ui").index_file("index.html"))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
