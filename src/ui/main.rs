use std::{
    error::Error,
    io::{self, stdout},
    sync::Arc,
    time::{Duration, Instant},
};

use crossterm::{
    event::{
        DisableMouseCapture, EnableMouseCapture, Event, EventStream, KeyCode, MouseEventKind,
    },
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use futures::StreamExt;
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    Terminal,
};
use tokio::sync::RwLock;

use cyber_forge::{
    state::{GameState, SharedGameState},
    sword_gen::SwordGenerator,
    types::{ForgeResult, Quality},
    ui::{
        help::{render_help_modal, render_quit_confirm},
        line1::{render_line_1, Line1State},
        line2::{render_line_2, Line2State},
        line3::{render_line_3, Line3State},
        line4::{render_line_4, Line4State},
        line5::{render_line_5, Line5State},
        line6::{render_line_6, Line6State},
        line7::render_line_7,
        modal::{render_hover_detail, render_sword_modal},
    },
};

const CRIT_LO: f64 = 0.78;
const CRIT_HI: f64 = 0.85;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    enable_raw_mode()?;
    let mut stdout = stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    terminal.clear()?;

    let initial_state = GameState::load_from_disk();
    let game_state = SharedGameState(Arc::new(RwLock::new(initial_state)));

    let res = run_game_loop(&mut terminal, game_state.clone()).await;

    {
        let state = game_state.0.read().await;
        state.save_to_disk();
    }

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        DisableMouseCapture,
        LeaveAlternateScreen
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("❌ 熔炉崩溃: {:?}", err);
    } else {
        println!("✨ 赛博天道关机成功，存档已安全加密落盘。");
    }

    Ok(())
}

fn do_strike(state: &mut GameState, qte: bool) {
    state.strikes += 1;
    state.exp += 1;
    if qte {
        state.forge_qte_hits = state.forge_qte_hits.saturating_add(1);
    }

    if state.strikes < state.max_strikes {
        return;
    }

    state.strikes = 0;
    let qte_hits = state.forge_qte_hits;
    state.forge_qte_hits = 0;

    let god = state.effective_god_rate(qte_hits);
    let had_qte = qte_hits > 0;

    match SwordGenerator::generate(
        state.level,
        state.carbon_ratio,
        Instant::now().elapsed().as_nanos() as u64,
        state.apprentices,
        god,
    ) {
        ForgeResult::Success(sword) => {
            state.exp += sword.quality.bonus_exp();

            if had_qte && sword.quality.is_masterwork_tier() {
                let mut cult = (sword.price / 5).max(50);
                cult += ((sword.price as f64) * state.bonus_god_rate * 0.05) as u128;
                state.realm.add_cultivation(cult);
                state.realm.masterwork_count = state.realm.masterwork_count.saturating_add(1);
                state.set_toast(format!(
                    "代表作！{} {}｜QTE×{}｜修仙经验 +{}",
                    sword.quality.badge(),
                    sword.name,
                    qte_hits,
                    cult
                ));
            }

            if state.auto_melt_common && sword.quality.is_trash() {
                let slag = 5u32;
                let cult = sword.price / 10;
                state.realm.add_cultivation(cult);
                state.add_iron_slag(slag);
                state.set_toast(format!(
                    "自动熔凡品：碎铁 +{}（现有 {}）｜机缘 {:.2}%｜修仙 +{}",
                    slag,
                    state.iron_slag,
                    state.bonus_god_rate * 100.0,
                    cult
                ));
            } else if state.backpack.len() < state.max_backpack {
                let name = sword.name.clone();
                state.backpack.push(sword.clone());
                state.sort_backpack();
                state.active_sword_modal = Some(sword);
                if state.auto_list_market {
                    state.auto_fill_market();
                }
                if state.toast.is_empty() {
                    state.set_toast(format!("出炉成功 {}", name));
                }
            } else {
                state.set_toast("背包已满，剑无处可放");
            }
        }
        ForgeResult::Shattered { slag_gained } => {
            state.add_iron_slag(slag_gained);
            state.set_toast(format!(
                "锻造失败，剑变成了麻花 碎铁+{}（现有 {}）｜机缘 {:.2}%",
                slag_gained,
                state.iron_slag,
                state.bonus_god_rate * 100.0
            ));
        }
    }

    if state.exp >= state.max_exp {
        state.level += 1;
        state.exp -= state.max_exp;
        state.max_exp = (5000.0 * 1.25f64.powi(state.level as i32)) as u32;
        state.update_max_strikes();
        state.set_toast(format!("打铁等级提升至 Lv.{}", state.level));
    }
}

async fn run_game_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    shared_state: SharedGameState,
) -> io::Result<()> {
    let mut tick_counter: u64 = 0;
    let mut hammer_cycle_start: u64 = 0;
    let mut hammer_cycle_instant = Instant::now();
    let mut reader = EventStream::new();
    let mut tick_interval = tokio::time::interval(Duration::from_millis(16));
    let mut show_help = false;
    let mut show_quit_confirm = false;
    let mut modal_ticks: u32 = 0;
    let mut hover_idx: Option<usize> = None;

    loop {
        // 时间只在 tick 分支推进；鼠标/键盘不得推进读条或击锤
        let snapshot = {
            let state = shared_state.0.read().await;
            let interval_secs = state.natural_interval_ticks.max(1) as f64 / 10.0;
            let elapsed = hammer_cycle_instant.elapsed().as_secs_f64();
            let progress = (elapsed / interval_secs).min(1.0);
            let in_crit = state.level >= 2 && progress >= CRIT_LO && progress < CRIT_HI;
            (
                Line1State {
                    level: state.level,
                    current_exp: state.exp,
                    max_exp: state.max_exp,
                    coins: state.coins,
                },
                Line2State {
                    progress,
                    tick_count: tick_counter,
                    interval_secs: state.natural_interval_ticks as f32 / 10.0,
                    show_crit_window: state.level >= 2,
                    in_crit_zone: in_crit,
                    current_strikes: state.strikes,
                    max_strikes: state.max_strikes,
                    qte_hits: state.forge_qte_hits,
                    qte_bonus_pct: state.forge_qte_hits as f64 * 2.0,
                },
                Line3State {
                    apprentices: state.apprentices,
                    max_apprentices: state.max_apprentices,
                    sharpen_workers: state.sharpen_workers,
                    enchant_workers: state.enchant_workers,
                    repair_workers: state.repair_workers,
                    next_cost: state.get_next_apprentice_cost(),
                    house_cost: state.get_house_upgrade_cost(),
                },
                state.backpack.clone(),
                state.max_backpack,
                state.get_backpack_upgrade_cost(),
                state.pavilion_market.clone(),
                state.max_pavilion,
                state.get_pavilion_upgrade_cost(),
                state.market_news.clone(),
                state.active_sword_modal.clone(),
                state.natural_interval_ticks,
                state.toast.clone(),
                Line6State {
                    realm_name: state.realm.realm.name().to_string(),
                    sub_level: state.realm.sub_level,
                    title: state.realm.title().to_string(),
                    cultivation_exp: state.realm.cultivation_exp,
                    masterworks: state.realm.masterwork_count,
                    god_rate: state.bonus_god_rate,
                    iron_slag: state.iron_slag,
                    body: state.realm.body.clone(),
                    realm_idx: state.realm.realm as u32,
                },
            )
        };

        let (
            l1_data,
            l2_data,
            l3_data,
            backpack_data,
            max_bp,
            bp_cost,
            pavilion_data,
            max_pav,
            pav_cost,
            news,
            active_modal,
            interval_ticks,
            toast,
            l6_data,
        ) = snapshot;

        terminal.draw(|f| {
            let size = f.size();
            let root = Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Min(3), Constraint::Length(3)])
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
                    Constraint::Length(3),
                    Constraint::Length(3),
                    Constraint::Length(3),
                    Constraint::Min(5),
                ])
                .split(columns[1]);

            render_line_4(
                f,
                columns[0],
                &Line4State {
                    backpack: &backpack_data,
                    max_backpack: max_bp,
                    expand_cost: bp_cost,
                },
            );
            render_line_1(f, middle[0], &l1_data);
            render_line_2(f, middle[1], &l2_data);
            render_line_3(f, middle[2], &l3_data);
            render_line_6(f, middle[3], &l6_data);
            render_line_5(
                f,
                columns[2],
                &Line5State {
                    pavilion: &pavilion_data,
                    max_pavilion: max_pav,
                    market_news: &news,
                    expand_cost: pav_cost,
                },
            );
            render_line_7(f, root[1], &toast);

            if let Some(ref sword) = active_modal {
                render_sword_modal(f, size, sword);
            }
            if active_modal.is_none() {
                if let Some(idx) = hover_idx {
                    if let Some(sword) = backpack_data.get(idx) {
                        render_hover_detail(f, size, sword);
                    }
                }
            }
            if show_help {
                render_help_modal(f, size);
            }
            if show_quit_confirm {
                render_quit_confirm(f, size);
            }
        })?;

        tokio::select! {
            maybe_event = reader.next() => {
                if let Some(Ok(Event::Mouse(me))) = maybe_event {
                    // 左栏矩阵命中（与 line4 点阵一致：顶行说明 + 每格宽3）
                    let size = terminal.size()?;
                    let main_h = size.height.saturating_sub(3);
                    let left_w = size.width * 22 / 100;
                    let mx = me.column;
                    let my = me.row;
                    if matches!(
                        me.kind,
                        MouseEventKind::Moved | MouseEventKind::Drag(_)
                    ) {
                        if my >= 1 && my < main_h && mx < left_w {
                            let inner_x = mx.saturating_sub(1);
                            let inner_y = my.saturating_sub(1);
                            // 第0行是操作说明，点阵从第1行开始
                            if inner_y >= 1 {
                                let cell_w = 3u16;
                                let cols = ((left_w.saturating_sub(2)) / cell_w).max(1);
                                let row = (inner_y - 1) as usize;
                                let col = (inner_x / cell_w) as usize;
                                let idx = row * cols as usize + col;
                                let state = shared_state.0.read().await;
                                if idx < state.backpack.len() {
                                    hover_idx = Some(idx);
                                } else {
                                    hover_idx = None;
                                }
                            } else {
                                hover_idx = None;
                            }
                        } else {
                            hover_idx = None;
                        }
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
                            KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                                show_quit_confirm = false;
                            }
                            _ => {}
                        }
                        continue;
                    }

                    if show_help {
                        match key.code {
                            KeyCode::Char('h') | KeyCode::Char('H') | KeyCode::Esc => {
                                show_help = false;
                            }
                            _ => {}
                        }
                        continue;
                    }

                    match key.code {
                        KeyCode::Char('h') | KeyCode::Char('H') => show_help = true,
                        KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => {
                            show_quit_confirm = true;
                        }
                        KeyCode::Char('a') | KeyCode::Char('A') => state.hire_apprentice(),
                        KeyCode::Char('s') | KeyCode::Char('S') => state.melt_all_backpack(),
                        KeyCode::Char('d') | KeyCode::Char('D') => {
                            let cost = state.get_backpack_upgrade_cost();
                            if state.coins >= cost {
                                state.coins -= cost;
                                state.max_backpack += 2;
                                let n = state.max_backpack;
                                state.set_toast(format!("背包扩至 {} 格", n));
                            } else {
                                state.set_toast(format!("扩容需 金{}", cost));
                            }
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
                            let interval_secs =
                                state.natural_interval_ticks.max(1) as f64 / 10.0;
                            let elapsed = hammer_cycle_instant.elapsed().as_secs_f64();
                            let progress = (elapsed / interval_secs).min(1.0);
                            let in_crit =
                                state.level >= 2 && progress >= CRIT_LO && progress < CRIT_HI;
                            if state.level < 2 {
                                do_strike(&mut state, false);
                            } else {
                                do_strike(&mut state, in_crit);
                            }
                            hammer_cycle_start = tick_counter;
                            hammer_cycle_instant = Instant::now();
                        }
                        _ => {}
                    }
                }
            }

            _ = tick_interval.tick() => {
                tick_counter = tick_counter.wrapping_add(1);
                let mut state = shared_state.0.write().await;

                if tick_counter % 1800 == 0 {
                    state.save_to_disk();
                }

                state.tick_toast();
                state.tick_market_rumor();

                if state.active_sword_modal.is_some() {
                    modal_ticks += 1;
                    if modal_ticks >= 15 {
                        state.active_sword_modal = None;
                        modal_ticks = 0;
                    }
                } else {
                    modal_ticks = 0;
                }

                // --- 曾用：满条停住等空格（仅手动锤）---
                // hammer_cycle_instant 到期不 do_strike，只重置

                // 挂机满条：按真实时间判定，丝滑读条走满后普通锤
                if interval_ticks > 0 {
                    let interval_secs = interval_ticks as f64 / 10.0;
                    if hammer_cycle_instant.elapsed().as_secs_f64() >= interval_secs {
                        do_strike(&mut state, false);
                        hammer_cycle_start = tick_counter;
                        hammer_cycle_instant = Instant::now();
                    }
                }

                if tick_counter % 62 == 0 {
                    state.process_apprentice_work();
                }
                if tick_counter % 186 == 0 {
                    state.process_immortal_buyers();
                }
            }
        }
    }
}
