pub mod input;
pub mod render;
pub mod strike;
pub mod ticks;

use std::{io, time::{Duration, Instant}};
use crossterm::event::{Event, EventStream, KeyCode, MouseEventKind};
use futures::StreamExt;
use ratatui::{backend::CrosstermBackend, Terminal};

use crate::state::SharedGameState;
use input::handle_key_code;
use render::render_frame;
use strike::do_strike;
use ticks::handle_periodic_ticks;

const CRIT_LO: f64 = 0.76;
const CRIT_HI: f64 = 0.88;

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
        let (progress, in_crit, interval_ticks) = {
            let state = shared_state.0.read().await;
            let interval_secs = state.natural_interval_ticks.max(1) as f64 / 10.0;
            let elapsed = hammer_cycle_instant.elapsed().as_secs_f64();
            let p = (elapsed / interval_secs).min(1.0);
            (p, p >= CRIT_LO && p < CRIT_HI, state.natural_interval_ticks)
        };

        {
            let state = shared_state.0.read().await;
            render_frame(terminal, &state, progress, tick_counter, in_crit, modal_ticks, hover_idx, show_help, show_quit_confirm)?;
        }

        tokio::select! {
            maybe_event = reader.next() => {
                if let Some(Ok(Event::Mouse(me))) = maybe_event {
                    let size = terminal.size()?;
                    let main_h = size.height.saturating_sub(1);
                    let left_w = size.width * 22 / 100;
                    let (mx, my) = (me.column, me.row);
                    if matches!(me.kind, MouseEventKind::Moved | MouseEventKind::Drag(_)) {
                        if my >= 1 && my < main_h && mx < left_w {
                            let (inner_x, inner_y) = (mx.saturating_sub(1), my.saturating_sub(1));
                            if inner_y >= 1 {
                                let cell_w = 4u16;
                                let cols = ((left_w.saturating_sub(2)) / cell_w).max(1);
                                let (row, col) = ((inner_y - 1) as usize, (inner_x / cell_w) as usize);
                                let idx = row * cols as usize + col;
                                let state = shared_state.0.read().await;
                                if idx < state.backpack.len() { hover_idx = Some(idx); } else { hover_idx = None; }
                            } else { hover_idx = None; }
                        } else { hover_idx = None; }
                    }
                } else if let Some(Ok(Event::Key(key))) = maybe_event {
                    let mut state = shared_state.0.write().await;
                    let should_exit = handle_key_code(key.code, &mut state, &mut show_help, &mut show_quit_confirm, &mut modal_ticks, in_crit);
                    if key.code == KeyCode::Char(' ') { hammer_cycle_instant = Instant::now(); }
                    if should_exit { return Ok(()); }
                }
            }

            _ = tick_interval.tick() => {
                tick_counter = tick_counter.wrapping_add(1);
                let mut state = shared_state.0.write().await;
                handle_periodic_ticks(&mut state, tick_counter, &mut modal_ticks);

                if interval_ticks > 0 {
                    let interval_secs = interval_ticks as f64 / 10.0;
                    if hammer_cycle_instant.elapsed().as_secs_f64() >= interval_secs {
                        do_strike(&mut state, false);
                        hammer_cycle_instant = Instant::now();
                    }
                }
            }
        }
    }
}
