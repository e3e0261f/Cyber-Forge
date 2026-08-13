mod game;

use std::sync::Mutex;
use std::time::Instant;
use serde::Serialize;
use tauri::State;

use game::dao_origin::DaoOrigin;
use game::numbers::format_compact_number;
use game::state::GameState;
use game::strike::do_strike;
use rand::Rng;

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
            // 🌟 必须的矩阵进度字段，传给前端渲染 35 个并发条
            matrix_progresses: Vec<f64>,
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
                // 🌟 正确克隆并传递矩阵轨道进度数组
                matrix_progresses: s.matrix_progresses.clone(),
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

    // 🌟 后台矩阵轨道随时间自动向前流转
    let tick_delta = 0.05;
    for prog in &mut inner.state.matrix_progresses {
        if *prog < 1.0 {
            *prog = (*prog + tick_delta).min(1.0);
        }
    }

    if inner.state.debug_mode { inner.state.debug_tick_boost(); }
    if inner.state.market_tick_counter % 300 == 0 { let _ = inner.state.save_to_disk(); }
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
    if inner.state.market_tick_counter % 5 == 0 {
        inner.state.process_apprentice_work();
    }

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
        k if k.starts_with("u_") => { if let Ok(n) = k.trim_start_matches("u_").parse::<u32>() { for _ in 0..n { s.upgrade_hammer(); } } }

        "w" | "W" => s.upgrade_bellows(),
        k if k.starts_with("w_") => { if let Ok(n) = k.trim_start_matches("w_").parse::<u32>() { for _ in 0..n { s.upgrade_bellows(); } } }

        "a" | "A" => s.hire_apprentice(),
        k if k.starts_with("a_") => { if let Ok(n) = k.trim_start_matches("a_").parse::<u32>() { for _ in 0..n { s.hire_apprentice(); } } }

        "r" | "R" => s.upgrade_house(),
        k if k.starts_with("r_") => { if let Ok(n) = k.trim_start_matches("r_").parse::<u32>() { for _ in 0..n { s.upgrade_house(); } } }

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
        k if k.starts_with("d_") => {
            if let Ok(n) = k.trim_start_matches("d_").parse::<u32>() {
                let mut upgraded = 0;
                for _ in 0..n {
                    let cost = s.get_backpack_upgrade_cost();
                    if s.coins >= cost {
                        s.coins -= cost;
                        s.max_backpack += 2;
                        upgraded += 1;
                    } else {
                        break;
                    }
                }
                if upgraded > 0 {
                    s.set_toast(format!("批量扩容：背包提升至 {} 格", s.max_backpack));
                } else {
                    s.set_toast("金币不足，无法继续扩容");
                }
            }
        }

        "e" | "E" => s.upgrade_pavilion(),
        k if k.starts_with("e_") => { if let Ok(n) = k.trim_start_matches("e_").parse::<u32>() { for _ in 0..n { s.upgrade_pavilion(); } } }

        "s" | "S" => s.melt_lowest_sword(),
        "f" | "F" => s.list_top_sword_to_market(),
        "t" | "T" => s.toggle_auto_melt(),
        "g" | "G" => s.toggle_auto_list(),
        "0" => {
            s.toggle_debug_mode();
        }
        "b" | "B" => {
            if s.realm.sub_level < 10 {
                s.set_toast(format!("尚未圆满：当前 {}层，需≥10层", s.realm.sub_level));
            } else {
                let success_rate = match s.realm.sub_level {
                    10 => 0.75,
                    11 => 0.80,
                    12 => 0.90,
                    13 => 0.91,
                    l if l > 13 => (0.91 + (l - 13) as f64 * 0.01).min(0.99),
                    _ => 0.75,
                };

                let mut rng = rand::thread_rng();
                if rng.gen_bool(success_rate) && s.realm.manual_breakthrough() {
                    let msg = format!("天道引劫：成功突破至 [{}]！(概率 {:.0}%)", s.realm.realm.name(), success_rate * 100.0);
                    s.set_toast(&msg);
                    s.push_log(msg, true, true);
                } else {
                    s.realm.realm = crate::game::realm::Realm::BodyRefining;
                    s.realm.sub_level = 1;
                    s.realm.realm_exp = 0;
                    s.realm.pending_breakthrough = false;
                    s.sync_body_stats();

                    let fail_msg = format!("天劫反噬：渡劫失败（概率 {:.0}% 翻车）！真元溃散，贬回炼体境一重！", success_rate * 100.0);
                    s.set_toast(&fail_msg);
                    s.push_log(fail_msg, true, true);
                }
            }
        }
        // 岗位 1：磨剑台
        "1" => s.reassign_workers(1),
        k if k.starts_with("1_") => {
            if let Ok(n) = k.trim_start_matches("1_").parse::<u32>() {
                s.reassign_workers_n(1, n);
            }
        }

        // 岗位 2：附魔台
        "2" => s.reassign_workers(2),
        k if k.starts_with("2_") => {
            if let Ok(n) = k.trim_start_matches("2_").parse::<u32>() {
                s.reassign_workers_n(2, n);
            }
        }

        // 岗位 3：熔铸台
        "3" => s.reassign_workers(3),
        k if k.starts_with("3_") => {
            if let Ok(n) = k.trim_start_matches("3_").parse::<u32>() {
                s.reassign_workers_n(3, n);
            }
        }

        // 岗位 4：锻造台
        "4" => s.reassign_workers(4),
        k if k.starts_with("4_") => {
            if let Ok(n) = k.trim_start_matches("4_").parse::<u32>() {
                s.reassign_workers_n(4, n);
            }
        }

        // 岗位 5：拍卖行
        "5" => s.reassign_workers(5),
        k if k.starts_with("5_") => {
            if let Ok(n) = k.trim_start_matches("5_").parse::<u32>() {
                s.reassign_workers_n(5, n);
            }
        }

        "1_10" => s.reassign_workers_n(1, 10),
        "2_10" => s.reassign_workers_n(2, 10),
        "3_10" => s.reassign_workers_n(3, 10),
        "4_10" => s.reassign_workers_n(4, 10),
        "5_10" => s.reassign_workers_n(5, 10),
        "1_100" => s.reassign_workers_n(1, 100),
        "2_100" => s.reassign_workers_n(2, 100),
        "3_100" => s.reassign_workers_n(3, 100),
        "4_100" => s.reassign_workers_n(4, 100),
        "5_100" => s.reassign_workers_n(5, 100),
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
