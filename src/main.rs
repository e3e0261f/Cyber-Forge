use std::{
    error::Error,
    io::{self, stdout},
    sync::Arc,
    time::{Duration, Instant},
};

use crossterm::{
    event::{Event, EventStream, KeyCode},
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
    types::{ForgeResult},
    ui::{
        help::{render_help_modal, render_quit_confirm},
        line1::{render_line_1, Line1State},
        line2::{render_line_2, Line2State},
        line3::{render_line_3, Line3State},
        line4::{render_line_4, Line4State},
        line5::{render_line_5, Line5State},
        modal::render_sword_modal,
    },
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    enable_raw_mode()?;
    let mut stdout = stdout();
    execute!(stdout, EnterAlternateScreen)?;
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
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("❌ 熔炉崩溃: {:?}", err);
    } else {
        println!("✨ 赛博天道关机成功，存档已安全加密落盘。");
    }

    Ok(())
}

fn do_strike(state: &mut GameState) {
    state.strikes += 1;
    state.exp += 1;

    if state.strikes >= state.max_strikes {
        state.strikes = 0;

        match SwordGenerator::generate(
            state.level,
            state.carbon_ratio,
            Instant::now().elapsed().as_nanos() as u64,
                                       state.apprentices,
                                       state.bonus_god_rate,
        ) {
            ForgeResult::Success(sword) => {
                state.exp += sword.quality.bonus_exp();

                // 斩断自动换金！无论何等品质，成功皆尝试入包
                if state.backpack.len() < state.max_backpack {
                    state.backpack.push(sword.clone());
                    state.sort_backpack();
                    state.active_sword_modal = Some(sword);
                } else if state.backpack.len() < state.max_backpack {
                    state.backpack.push(sword.clone());
                    state.sort_backpack();
                    state.active_sword_modal = Some(sword);
                }
            }
            ForgeResult::Shattered { slag_gained } => {
                state.add_iron_slag(slag_gained);
            }
        }

        if state.exp >= state.max_exp {
            state.level += 1;
            state.exp -= state.max_exp;
            state.max_exp = (5000.0 * 1.25f64.powi(state.level as i32)) as u32;
            state.update_max_strikes();
        }
    }
}

async fn run_game_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    shared_state: SharedGameState,
) -> io::Result<()> {
    let mut tick_counter: u64 = 0;
    let mut reader = EventStream::new();
    let mut tick_interval = tokio::time::interval(Duration::from_millis(100));
    let mut show_help = false;
    let mut show_quit_confirm = false;

    loop {
        tick_counter = tick_counter.wrapping_add(1);

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
        ) = {
            let state = shared_state.0.read().await;
            (
                Line1State {
                    current_strikes: state.strikes,
                    max_strikes: state.max_strikes,
                    level: state.level,
                    current_exp: state.exp,
                    max_exp: state.max_exp,
                    coins: state.coins,
                },
             Line2State {
                 // 【关键修改】：用 % 取余算出当前周期内之时间流逝比例 (0.0 ~ 1.0)
                 progress: (tick_counter % state.natural_interval_ticks.max(1) as u64) as f64
                 / state.natural_interval_ticks.max(1) as f64,

             carbon_ratio: state.carbon_ratio,
             tick_count: tick_counter,
             interval_secs: state.natural_interval_ticks as f32 / 10.0,
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
            )
        };

        terminal.draw(|f| {
            let size = f.size();

            let columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(22),
                         Constraint::Percentage(50),
                         Constraint::Percentage(28),
            ])
            .split(size);

            let middle = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),
                         Constraint::Length(3),
                         Constraint::Min(3),
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

            if let Some(ref sword) = active_modal {
                render_sword_modal(f, size, sword);
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
                if let Some(Ok(Event::Key(key))) = maybe_event {
                    let mut state = shared_state.0.write().await;

                    if state.active_sword_modal.is_some() {
                        state.active_sword_modal = None;
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
                        KeyCode::Char('h') | KeyCode::Char('H') => {
                            show_help = true;
                        }
                        KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => {
                            show_quit_confirm = true;
                        }
                        KeyCode::Char('a') | KeyCode::Char('A') => state.hire_apprentice(),
                        KeyCode::Char('s') | KeyCode::Char('S') => {
                            state.melt_all_backpack();
                        }
                        KeyCode::Char('d') | KeyCode::Char('D') => {
                            let cost = state.get_backpack_upgrade_cost();
                            if state.coins >= cost {
                                state.coins -= cost;
                                state.max_backpack += 2;
                                state.market_news =
                                format!("🎒 锦囊扩至 {} 格。", state.max_backpack);
                            } else {
                                state.market_news = format!("❌ 扩囊需 金{}。", cost);
                            }
                        }
                        KeyCode::Char('f') | KeyCode::Char('F') => {
                            state.list_top_sword_to_market();
                        }
                        KeyCode::Char('w') | KeyCode::Char('W') => state.upgrade_bellows(),
                        KeyCode::Char('e') | KeyCode::Char('E') => state.upgrade_pavilion(),
                        KeyCode::Char('r') | KeyCode::Char('R') => state.upgrade_house(),
                        KeyCode::Char('1') => state.reassign_workers(1),
                        KeyCode::Char('2') => state.reassign_workers(2),
                        KeyCode::Char('3') => state.reassign_workers(3),
                        KeyCode::Char(' ') => {
                            do_strike(&mut state);
                        }
                        _ => {}
                    }
                }
            }

            _ = tick_interval.tick() => {
                let mut state = shared_state.0.write().await;

                if tick_counter % 300 == 0 {
                    state.save_to_disk();
                }

                state.tick_market_rumor();

                if interval_ticks > 0 && tick_counter % interval_ticks == 0 {
                    do_strike(&mut state);
                }

                if tick_counter % 10 == 0 {
                    state.process_apprentice_work();
                }

                if tick_counter % 30 == 0 {
                    state.process_immortal_buyers();
                }
            }
        }
    }
}
