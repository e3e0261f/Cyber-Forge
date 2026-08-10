use std::{
    io,
    time::{Duration, Instant},
};

use crossterm::event::{Event, EventStream, KeyCode, MouseEventKind};
use futures::StreamExt;
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    Terminal,
};

use crate::{
    state::{GameState, SharedGameState},
    sword_gen::SwordGenerator,
    types::ForgeResult,
    ui::{
        help::{render_help_modal, render_quit_confirm},
        line1::{render_line_1, Line1State},
        line2::{render_line_2, Line2State},
        line3::{render_line_3, Line3State},
        line4::{render_line_4, Line4State},
        line5::{render_line_5, Line5State},
        line6::{render_line_6, Line6State},
        line7::{render_line_7, Line7State},
        line8::{render_line_8, Line8State},
        modal::{render_hover_detail, render_sword_modal},
    },
};

const CRIT_LO: f64 = 0.76;
const CRIT_HI: f64 = 0.88;

fn do_strike(state: &mut GameState, qte: bool) {
    state.strikes += 1;
    state.exp += 1;

    if qte {
        state.forge_qte_hits = state.forge_qte_hits.saturating_add(1);
        state.realm.add_cultivation(1);
        state.trigger_flash();
    }

    if state.strikes < state.max_strikes {
        return;
    }

    state.strikes = 0;
    let qte_hits = state.forge_qte_hits;
    state.forge_qte_hits = 0;

    let god = state.effective_god_rate(qte_hits);

    match SwordGenerator::generate(
        state.level,
        state.carbon_ratio,
        Instant::now().elapsed().as_nanos() as u64,
                                   state.apprentices,
                                   god,
                                   qte_hits,
                                   state.max_strikes,
    ) {
        ForgeResult::Success(sword) => {
            state.exp += sword.quality.bonus_exp();

            if sword.quality.is_masterwork_tier() {
                let cult_bonus = (sword.price / 1000).max(50);
                state.realm.add_cultivation(cult_bonus);
                state.realm.masterwork_count = state.realm.masterwork_count.saturating_add(1);

                let log_msg = format!("代表作降世：{} {}（估价金{}，修仙+{}）", sword.quality.badge(), sword.name, sword.price, cult_bonus);
                state.push_log(log_msg.clone(), true, true);
                state.set_toast(log_msg);

                if state.backpack.len() < state.max_backpack {
                    state.backpack.push(sword.clone());
                    state.sort_backpack();
                    state.active_sword_modal = Some(sword);
                }
            } else {
                // 普通兵刃与凡品：统一先行入包挂载 2s 驻留实体感，随后由 process_auto_melt 吸收
                if state.backpack.len() < state.max_backpack {
                    let log_msg = format!("出炉：{} {}（估价金{}）", sword.quality.badge(), sword.name, sword.price);
                    state.push_log(log_msg, false, false);
                    state.backpack.push(sword.clone());
                    state.sort_backpack();

                    if state.auto_list_market {
                        state.auto_fill_market();
                    }
                }
            }
        }
        ForgeResult::Shattered { slag_gained } => {
            state.add_iron_slag(slag_gained);
            let log_msg = format!("锻造炸炉：剑化为麻花，碎铁+{}", slag_gained);
            state.set_toast(&log_msg);
            state.push_log(log_msg, false, false);
        }
    }

    if state.exp >= state.max_exp {
        state.level += 1;
        state.exp -= state.max_exp;
        state.max_exp = (5000.0 * 1.25f64.powi(state.level as i32)) as u32;
        state.update_max_strikes();
        let log_msg = format!("作坊突破：升级至 Lv.{}", state.level);
        state.set_toast(&log_msg);
        state.push_log(log_msg, true, false);
    }
}

pub async fn run_game_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    shared_state: SharedGameState,
) -> io::Result<()> {
    let mut tick_counter: u64 = 0;
    let mut hammer_cycle_instant = Instant::now();
    let mut reader = EventStream::new();
    let mut tick_interval = tokio::time::interval(Duration::from_millis(16));
    let mut show_help = false;
    let mut show_quit_confirm = false;
    let mut modal_ticks: u32 = 0;
    let mut hover_idx: Option<usize> = None;

    loop {
        let state_guard = shared_state.0.read().await;
        let interval_secs = state_guard.natural_interval_ticks.max(1) as f64 / 10.0;
        let elapsed = hammer_cycle_instant.elapsed().as_secs_f64();
        let progress = (elapsed / interval_secs).min(1.0);
        let in_crit = progress >= CRIT_LO && progress < CRIT_HI;

        let l1_data = Line1State {
            level: state_guard.level,
            current_exp: state_guard.exp,
            max_exp: state_guard.max_exp,
            coins: state_guard.coins,
        };
        let l2_data = Line2State {
            progress,
            tick_count: tick_counter,
            interval_secs: state_guard.natural_interval_ticks as f32 / 10.0,
            show_crit_window: true,
            in_crit_zone: in_crit,
            current_strikes: state_guard.strikes,
            max_strikes: state_guard.max_strikes,
            qte_hits: state_guard.forge_qte_hits,
            qte_bonus_pct: state_guard.forge_qte_hits as f64 * 2.0,
            is_flashing: state_guard.flash_ticks > 0,
        };
        let l3_data = Line3State {
            apprentices: state_guard.apprentices,
            max_apprentices: state_guard.max_apprentices,
            sharpen_workers: state_guard.sharpen_workers,
            enchant_workers: state_guard.enchant_workers,
            repair_workers: state_guard.repair_workers,
            next_cost: state_guard.get_next_apprentice_cost(),
            house_cost: state_guard.get_house_upgrade_cost(),
        };
        let l6_data = Line6State {
            realm_name: state_guard.realm.realm.name(),
            sub_level: state_guard.realm.sub_level,
            title: state_guard.realm.title(),
            cultivation_exp: state_guard.realm.cultivation_exp,
            masterworks: state_guard.realm.masterwork_count,
            god_rate: state_guard.bonus_god_rate,
            iron_slag: state_guard.iron_slag,
            body: state_guard.realm.body.clone(),
            realm_idx: state_guard.realm.realm as u32,
        };
        let l7_data = Line7State {
            auto_melt: state_guard.auto_melt_common,
            auto_list: state_guard.auto_list_market,
            toast: state_guard.toast.clone(), // Owned 克隆，安全解除读锁借用
        };

        let backpack_data = state_guard.backpack.clone();
        let max_bp = state_guard.max_backpack;
        let bp_cost = state_guard.get_backpack_upgrade_cost();
        let pavilion_data = state_guard.pavilion_market.clone();
        let max_pav = state_guard.max_pavilion;
        let pav_cost = state_guard.get_pavilion_upgrade_cost();
        let news = state_guard.market_news.clone();
        let active_modal = state_guard.active_sword_modal.clone();
        let interval_ticks = state_guard.natural_interval_ticks;
        let log_data = state_guard.logs.iter().cloned().collect::<Vec<String>>();
        let log_filter_name = state_guard.log_filter.name();

        drop(state_guard);

        terminal.draw(|f| {
            let size = f.size();

            let root = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(3), Constraint::Length(1)])
            .split(size);

            let columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(22),
                         Constraint::Percentage(50),
                         Constraint::Percentage(28),
            ])
            .split(root[0]);

            let middle = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),  // Line1: 作坊信息
                         Constraint::Length(3),  // Line2: 锻造台
                         Constraint::Length(3),  // Line3: 学徒工坊
                         Constraint::Length(11), // Line6: 身体素质
                         Constraint::Min(5),     // Line8: 天道日志
            ])
            .split(columns[1]);

            render_line_4(f, columns[0], &Line4State { backpack: &backpack_data, max_backpack: max_bp, expand_cost: bp_cost });

            render_line_1(f, middle[0], &l1_data);
            render_line_2(f, middle[1], &l2_data);
            render_line_3(f, middle[2], &l3_data);
            render_line_6(f, middle[3], &l6_data);
            render_line_8(f, middle[4], &Line8State { logs: &log_data, filter_name: log_filter_name });

            render_line_5(f, columns[2], &Line5State { pavilion: &pavilion_data, max_pavilion: max_pav, market_news: &news, expand_cost: pav_cost });
            render_line_7(f, root[1], &l7_data);

            if let Some(ref sword) = active_modal {
                let remaining_secs = (600u32.saturating_sub(modal_ticks) + 59) / 60;
                render_sword_modal(f, size, sword, remaining_secs);
            }
            if active_modal.is_none() {
                if let Some(idx) = hover_idx {
                    if let Some(sword) = backpack_data.get(idx) {
                        render_hover_detail(f, size, sword);
                    }
                }
            }
            if show_help { render_help_modal(f, size); }
            if show_quit_confirm { render_quit_confirm(f, size); }
        })?;

        tokio::select! {
            maybe_event = reader.next() => {
                if let Some(Ok(Event::Mouse(me))) = maybe_event {
                    let size = terminal.size()?;
                    let main_h = size.height.saturating_sub(1);
                    let left_w = size.width * 22 / 100;
                    let mx = me.column;
                    let my = me.row;
                    if matches!(me.kind, MouseEventKind::Moved | MouseEventKind::Drag(_)) {
                        if my >= 1 && my < main_h && mx < left_w {
                            let inner_x = mx.saturating_sub(1);
                            let inner_y = my.saturating_sub(1);
                            if inner_y >= 1 {
                                let cell_w = 4u16;
                                let cols = ((left_w.saturating_sub(2)) / cell_w).max(1);
                                let row = (inner_y - 1) as usize;
                                let col = (inner_x / cell_w) as usize;
                                let idx = row * cols as usize + col;
                                let state = shared_state.0.read().await;
                                if idx < state.backpack.len() { hover_idx = Some(idx); } else { hover_idx = None; }
                            } else { hover_idx = None; }
                        } else { hover_idx = None; }
                    }
                } else if let Some(Ok(Event::Key(key))) = maybe_event {
                    let mut state = shared_state.0.write().await;

                    if state.active_sword_modal.is_some() {
                        state.active_sword_modal = None;
                        modal_ticks = 0;
                        continue;
                    }

                    if show_quit_confirm {
                        match key.code {
                            KeyCode::Char('y') | KeyCode::Char('Y') => return Ok(()),
                            KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => { show_quit_confirm = false; }
                            _ => {}
                        }
                        continue;
                    }

                    if show_help {
                        match key.code {
                            KeyCode::Char('h') | KeyCode::Char('H') | KeyCode::Esc => { show_help = false; }
                            _ => {}
                        }
                        continue;
                    }

                    match key.code {
                        KeyCode::Char('h') | KeyCode::Char('H') => show_help = true,
                        KeyCode::Char('l') | KeyCode::Char('L') => state.toggle_log_filter(),
                        KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => { show_quit_confirm = true; }
                        KeyCode::Char('a') | KeyCode::Char('A') => state.hire_apprentice(),
                        KeyCode::Char('s') | KeyCode::Char('S') => state.melt_lowest_sword(),
                        KeyCode::Char('d') | KeyCode::Char('D') => {
                            let cost = state.get_backpack_upgrade_cost();
                            if state.coins >= cost {
                                state.coins -= cost;
                                state.max_backpack += 2;
                                let n = state.max_backpack;
                                state.set_toast(format!("背包扩至 {} 格", n));
                            } else { state.set_toast(format!("扩容需 金{}", cost)); }
                        }
                        KeyCode::Char('f') | KeyCode::Char('F') => state.list_top_sword_to_market(),
                        KeyCode::Char('t') | KeyCode::Char('T') => state.toggle_auto_melt(),
                        KeyCode::Char('g') | KeyCode::Char('G') => state.toggle_auto_list(),
                        KeyCode::Char('w') | KeyCode::Char('W') => state.upgrade_bellows(),
                        KeyCode::Char('e') | KeyCode::Char('E') => state.upgrade_pavilion(),
                        KeyCode::Char('r') | KeyCode::Char('R') => state.upgrade_house(),
                        KeyCode::Char('1') => state.reassign_workers(1),
                        KeyCode::Char('2') => state.reassign_workers(2),
                        KeyCode::Char('3') => state.reassign_workers(3),
                        KeyCode::Char(' ') => {
                            let interval_secs = state.natural_interval_ticks.max(1) as f64 / 10.0;
                            let elapsed = hammer_cycle_instant.elapsed().as_secs_f64();
                            let progress = (elapsed / interval_secs).min(1.0);
                            let in_crit = progress >= CRIT_LO && progress < CRIT_HI;
                            do_strike(&mut state, in_crit);
                            hammer_cycle_instant = Instant::now();
                        }
                        _ => {}
                    }
                }
            }

            _ = tick_interval.tick() => {
                tick_counter = tick_counter.wrapping_add(1);
                let mut state = shared_state.0.write().await;

                if tick_counter % 1800 == 0 { state.save_to_disk(); }

                state.tick_toast();
                state.tick_flash();
                state.tick_market_rumor();

                if state.active_sword_modal.is_some() {
                    modal_ticks += 1;
                    if modal_ticks >= 600 {
                        state.active_sword_modal = None;
                        modal_ticks = 0;
                    }
                } else {
                    modal_ticks = 0;
                }

                if tick_counter % 250 == 0 { state.process_encounters(); }

                // 2 秒延时自动熔炼逻辑：每秒轮询一次入包兵刃驻留时间
                if tick_counter % 62 == 0 { state.process_auto_melt(); }

                if interval_ticks > 0 {
                    let interval_secs = interval_ticks as f64 / 10.0;
                    if hammer_cycle_instant.elapsed().as_secs_f64() >= interval_secs {
                        do_strike(&mut state, false);
                        hammer_cycle_instant = Instant::now();
                    }
                }

                if tick_counter % 62 == 0 { state.process_apprentice_work(); }
                if tick_counter % 62 == 0 { state.process_immortal_buyers(); }
            }
        }
    }
}
