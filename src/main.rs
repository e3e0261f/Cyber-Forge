use std::{error::Error, io::stdout, sync::Arc};
use crossterm::{
    event::{DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use tokio::sync::RwLock;

use cyber_forge::{
    forge_loop::run_game_loop,
        state::{GameState, SharedGameState},
};

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
        println!("✨ 赛博天道关机成功，存档已加密落盘。");
    }

    Ok(())
}
