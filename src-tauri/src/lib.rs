mod game;

use std::sync::Mutex;
use std::time::Instant;
use serde::Serialize;
use tauri::State;

use game::dao_origin::DaoOrigin;
use game::numbers::format_compact_number;
use game::state::GameState;
use game::strike::do_strike;

struct AppInner {
    state: GameState,
    dao: DaoOrigin,
    cycle_start: Instant,
}

struct AppState(Mutex<AppInner>);

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
}

fn snapshot(inner: &AppInner) -> UiSnapshot {
    let s = &inner.state;
    let interval = s.effective_interval_secs().max(0.01);
    let elapsed = inner.cycle_start.elapsed().as_secs_f64();
    let progress = (elapsed / interval).min(1.0);
    let in_crit = progress >= 0.76 && progress < 0.88;

    let auctioneer_threads: u32 = if s.auction_workers > 0 {
        ((s.auction_workers as u64 + 9) / 10) as u32
    } else { 1 };
    let teams = auctioneer_threads as usize;

    let backpack: Vec<ItemView> = s
        .backpack
        .iter()
        .take(s.max_backpack)
        .map(|sw| {
            let detail = if sw.is_tool {
                format!("【家什】{}\n不可熔炼/上架", sw.name)
            } else {
                format!("{} {}\n五行：{} 品阶：{}\n估价：{} 金币\n碳比：{:.1}% 锋锐：{}",
                    sw.quality.badge(), sw.name, sw.element, sw.quality.rank(),
                    format_compact_number(sw.price), sw.carbon_ratio * 100.0, sw.sharpness)
            };
            ItemView {
                id: sw.id, name: sw.name.clone(), glyph: sw.category_glyph().to_string(),
                price: format_compact_number(sw.price), quality: sw.quality.badge().to_string(),
                color: sw.quality.color_hex(), is_tool: sw.is_tool, detail,
            }
        })
        .collect();

    let lots: Vec<LotView> = s
        .pavilion_market
        .iter()
        .enumerate()
        .map(|(i, lot)| {
            let waiting = i >= teams;
            let status = if lot.is_sold { "成交".into() }
                else if waiting { format!("候场") }
                else { "拍卖中".into() };
            LotView {
                name: lot.sword.name.clone(),
                bid: format_compact_number(lot.listed_price),
                fair: format_compact_number(lot.fair_value.max(lot.sword.price)),
                time: lot.listing_time, bids: lot.bid_count, sold: lot.is_sold,
                waiting, color: lot.sword.quality.color_hex(), status,
            }
        })
        .collect();

    let log = s
        .logs
        .back()
        .cloned()
        .unwrap_or_else(|| s.toast.clone());

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
        core_refine: s.realm.body.core_refine,
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
    }
}

#[tauri::command]
fn get_state(app: State<'_, AppState>) -> Result<UiSnapshot, String> {
    let inner = app.0.lock().map_err(|e| e.to_string())?;
    Ok(snapshot(&inner))
}

#[tauri::command]
fn player_strike(app: State<'_, AppState>) -> Result<UiSnapshot, String> {
    let mut inner = app.0.lock().map_err(|e| e.to_string())?;
    let interval = inner.state.effective_interval_secs().max(0.01);
    let progress = (inner.cycle_start.elapsed().as_secs_f64() / interval).min(1.0);
    let in_crit = progress >= 0.76 && progress < 0.88;
    // 拆分字段借用，避免 E0499
    {
        let AppInner { state, dao, cycle_start } = &mut *inner;
        do_strike(state, in_crit, dao);
        *cycle_start = Instant::now();
        dao.reset_cycle();
    }
    Ok(snapshot(&inner))
}

#[tauri::command]
fn game_tick(app: State<'_, AppState>) -> Result<UiSnapshot, String> {
    let mut inner = app.0.lock().map_err(|e| e.to_string())?;
    inner.state.tick_toast();
    inner.state.tick_flash();
    inner.state.tick_market_rumor();
    if inner.state.debug_mode { inner.state.debug_tick_boost(); }
    if inner.state.market_tick_counter % 300 == 0 { let _ = inner.state.save_to_disk(); }
    // market / encounters on slower cadence via counter inside those fns
    if inner.state.market_tick_counter % 10 == 0 {
        inner.state.process_immortal_buyers();
    }
    if inner.state.encounter_timer > 0 {
        inner.state.encounter_timer = inner.state.encounter_timer.saturating_sub(1);
        if inner.state.encounter_timer == 0 {
            inner.state.process_encounters();
        }
    }
    inner.state.process_auto_melt();
    inner.state.process_auto_list();
    // apprentice ticks light
    // AFK hammer
    let interval = inner.state.effective_interval_secs().max(0.01);
    if inner.cycle_start.elapsed().as_secs_f64() >= interval {
        let AppInner { state, dao, cycle_start } = &mut *inner;
        do_strike(state, false, dao);
        *cycle_start = Instant::now();
        dao.reset_cycle();
    }
    Ok(snapshot(&inner))
}

#[tauri::command]
fn action(app: State<'_, AppState>, key: String) -> Result<UiSnapshot, String> {
    let mut inner = app.0.lock().map_err(|e| e.to_string())?;
    let s = &mut inner.state;
    match key.as_str() {
        "u" | "U" => s.upgrade_hammer(),
        "w" | "W" => s.upgrade_bellows(),
        "a" | "A" => s.hire_apprentice(),
        "r" | "R" => s.upgrade_house(),
        "d" | "D" => {
            let cost = s.get_backpack_upgrade_cost();
            if s.coins >= cost {
                s.coins -= cost;
                s.max_backpack += 2;
                let n = s.max_backpack;
                s.set_toast(format!("背包扩至 {} 格", n));
            } else {
                s.set_toast(format!("扩容需 金{}", cost));
            }
        }
        "s" | "S" => s.melt_lowest_sword(),
        "f" | "F" => s.list_top_sword_to_market(),
        "t" | "T" => s.toggle_auto_melt(),
        "g" | "G" => s.toggle_auto_list(),
        "e" | "E" => s.upgrade_pavilion(),
        "b" | "B" => {
            if s.realm.sub_level < 10 {
                s.set_toast(format!("尚未圆满：当前 {}层，需≥10层", s.realm.sub_level));
            } else if s.realm.manual_breakthrough() {
                let msg = format!("天道引劫：成功突破至 [{}]！", s.realm.realm.name());
                s.set_toast(&msg); s.push_log(msg, true, true);
            } else { s.set_toast("引劫失败"); }
        }
        "0" => { s.toggle_debug_mode(); }
        "p" | "P" | "save" => {
            if s.save_to_disk() {
                s.set_toast(format!("存档 {}", game::state::save_file_path().display()));
            } else { s.set_toast("存档失败"); }
        }
        "1" => s.reassign_workers(1),
        "2" => s.reassign_workers(2),
        "3" => s.reassign_workers(3),
        "4" => s.reassign_workers(4),
        "5" => s.reassign_workers(5),
        "i" => s.exchange_copper_to_gold(),
        "I" => s.exchange_gold_to_copper(),
        "o" => s.exchange_gold_to_jade(),
        "O" => s.exchange_jade_to_gold(),
        _ => {}
    }
    Ok(snapshot(&inner))
}

#[tauri::command]
fn export_save(app: State<'_, AppState>) -> Result<String, String> {
    let inner = app.0.lock().map_err(|e| e.to_string())?;
    inner.state.to_save_json().ok_or_else(|| "序列化失败".into())
}
#[tauri::command]
fn import_save(app: State<'_, AppState>, payload: String) -> Result<UiSnapshot, String> {
    let mut inner = app.0.lock().map_err(|e| e.to_string())?;
    let state = game::state::GameState::from_save_json(&payload).ok_or_else(|| "存档损坏".to_string())?;
    inner.state = state; inner.state.sync_equipped_hammer_tool();
    inner.dao = game::dao_origin::DaoOrigin::new(); inner.cycle_start = Instant::now();
    let _ = inner.state.save_to_disk(); Ok(snapshot(&inner))
}
#[tauri::command]
fn save_path_info() -> Result<String, String> { Ok(game::state::save_file_path().display().to_string()) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut state = GameState::load_from_disk();
    state.sync_equipped_hammer_tool();
    let inner = AppInner {
        state,
        dao: DaoOrigin::new(),
        cycle_start: Instant::now(),
    };

    tauri::Builder::default()
        .manage(AppState(Mutex::new(inner)))
        .invoke_handler(tauri::generate_handler![get_state, player_strike, game_tick, action, export_save, import_save, save_path_info])
        .run(tauri::generate_context!())
        .expect("Cyber-Forge Tauri 启动失败");
}
