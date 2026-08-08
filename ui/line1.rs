use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Gauge, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::titles::TitleSystem;

pub struct Line1State {
    pub current_strikes: u32,
    pub max_strikes: u32,
    pub level: u32,
    pub current_exp: u32,
    pub max_exp: u32,
    pub coins: u128,
}

pub fn render_line_1(f: &mut Frame, area: Rect, state: &Line1State) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(16), // 🔨 锤击数区
            Constraint::Length(20), // 🎓 职称等级区
            Constraint::Min(25),    // 📈 EXP 进度条区
            Constraint::Length(16), // 💰 财富区
        ])
        .split(area);

    // 1. 锤击数 (固定 4 位补零)
    let strike_text = format!("🔨 {:0>4}/{:0>4}", state.current_strikes, state.max_strikes);
    f.render_widget(
        Paragraph::new(strike_text).style(Style::default().fg(Color::Rgb(255, 215, 0)).add_modifier(Modifier::BOLD)),
        chunks[0],
    );

    // 2. 等级与职称
    let title = TitleSystem::get_title_by_level(state.level);
    let level_text = format!("Lv.{:0>3} {}", state.level, title);
    f.render_widget(
        Paragraph::new(level_text).style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
        chunks[1],
    );

    // 3. EXP 彩色填充进度条
    let exp_label = format!("EXP {:0>6}/{:0>6}", state.current_exp, state.max_exp);
    let ratio = if state.max_exp > 0 {
        (state.current_exp as f64 / state.max_exp as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let exp_gauge = Gauge::default()
        .gauge_style(Style::default().fg(Color::Rgb(0, 255, 127)).bg(Color::Rgb(40, 40, 40)))
        .ratio(ratio)
        .label(exp_label);
    f.render_widget(exp_gauge, chunks[2]);

    // 4. 金币高亮
    let coin_formatted = format_compact_number(state.coins);
    let coin_text = format!("💰 {}", coin_formatted.trim());
    f.render_widget(
        Paragraph::new(coin_text).style(Style::default().fg(Color::Rgb(255, 191, 0)).add_modifier(Modifier::BOLD)),
        chunks[3],
    );
}
