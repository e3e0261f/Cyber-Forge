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
    ui::{
        line1::{render_line_1, Line1State},
        line2::{render_line_2, Line2State},
        line3::{render_line_3, Line3State},
        line4::{render_line_4, Line4State},
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

    let game_state = SharedGameState(Arc::new(RwLock::new(GameState {
        strikes: 0,
        max_strikes: 10,
        level: 1,
        exp: 0,
        max_exp: 100,
        coins: 1000,
        inventory: Vec::new(),
        max_inventory: 8,
        carbon_ratio: 0.85,
        apprentices: 0,
        max_apprentices: 5,
    })));

    let res = run_game_loop(&mut terminal, game_state).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("❌ 熔炉崩溃: {:?}", err);
    } else {
        println!("✨ 赛博天道关机成功，存档已保存。");
    }

    Ok(())
}

async fn run_game_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    shared_state: SharedGameState,
) -> io::Result<()> {
    let mut tick_counter: u64 = 0;
    let mut reader = EventStream::new();
    let mut tick_interval = tokio::time::interval(Duration::from_millis(100));

    loop {
        tick_counter = tick_counter.wrapping_add(1);

        // 1. 异步锁隔离：提前提取 UI 状态数据，不阻塞 Ratatui 闭包
        let (l1_data, l2_data, l3_data, inv_data, max_inv) = {
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
                    progress: state.strikes as f64 / state.max_strikes as f64,
                    carbon_ratio: state.carbon_ratio,
                    tick_count: tick_counter,
                },
                Line3State {
                    apprentices: state.apprentices,
                    max_apprentices: state.max_apprentices,
                    next_cost: state.get_next_apprentice_cost(),
                    tick_count: tick_counter,
                },
                state.inventory.clone(),
                state.max_inventory,
            )
        };

        // 2. Ratatui 原生圆角控制舱渲染
        terminal.draw(|f| {
            let size = f.size();
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .margin(0)
                .constraints([
                    Constraint::Length(3), // Panel 1
                    Constraint::Length(3), // Panel 2
                    Constraint::Length(3), // Panel 3
                    Constraint::Length(3), // Panel 4
                    Constraint::Min(0),
                ])
                .split(size);

            render_line_1(f, chunks[0], &l1_data);
            render_line_2(f, chunks[1], &l2_data);
            render_line_3(f, chunks[2], &l3_data);
            render_line_4(f, chunks[3], &Line4State {
                inventory: &inv_data,
                max_inventory: max_inv,
            });
        })?;

        // 3. Tokio 异步事件驱动循环
        tokio::select! {
            maybe_event = reader.next() => {
                if let Some(Ok(Event::Key(key))) = maybe_event {
                    match key.code {
                        KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('Q') => {
                            return Ok(());
                        }
                        KeyCode::Char('a') | KeyCode::Char('A') => {
                            let mut state = shared_state.0.write().await;
                            let _ = state.hire_apprentice();
                        }
                        KeyCode::Char('b') | KeyCode::Char('B') => {
                            let mut state = shared_state.0.write().await;
                            if state.coins >= 500 {
                                state.coins -= 500;
                                state.max_inventory += 2;
                            }
                        }
                        KeyCode::Char('s') | KeyCode::Char('S') => {
                            shared_state.safe_sell_all(true).await;
                        }
                        _ => {
                            let mut state = shared_state.0.write().await;
                            state.strikes += 1;

                            if state.strikes >= state.max_strikes {
                                state.strikes = 0;
                                let new_sword = SwordGenerator::generate(
                                    state.level,
                                    state.carbon_ratio,
                                    Instant::now().elapsed().as_nanos() as u64,
                                );

                                state.exp += new_sword.exp_reward;
                                if state.inventory.len() < state.max_inventory {
                                    state.inventory.push(new_sword);
                                }

                                if state.exp >= state.max_exp {
                                    state.level += 1;
                                    state.exp -= state.max_exp;
                                    state.max_exp = (state.max_exp as f64 * 1.5) as u32;

                                    if state.level > 10 {
                                        state.max_strikes = 12 + ((state.level - 10) / 10) * 5;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            _ = tick_interval.tick() => {
                let mut state = shared_state.0.write().await;
                if state.apprentices > 0 {
                    if tick_counter % 5 == 0 {
                        state.strikes += state.apprentices;

                        if state.strikes >= state.max_strikes {
                            state.strikes = 0;
                            let new_sword = SwordGenerator::generate(
                                state.level,
                                state.carbon_ratio,
                                Instant::now().elapsed().as_nanos() as u64,
                            );
                            state.exp += new_sword.exp_reward;
                            if state.inventory.len() < state.max_inventory {
                                state.inventory.push(new_sword);
                            }
                        }
                    }
                }
            }
        }
    }
}
