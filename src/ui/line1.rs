use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, BorderType, Borders, Gauge, Paragraph},
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
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(" 【锻造师】 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let chunks = Layout::default()
    .direction(Direction::Horizontal)
    .constraints([
        Constraint::Length(15),
                 Constraint::Length(18),
                 Constraint::Min(20),
                 Constraint::Length(16),
    ])
    .split(inner_area);

    let strike_text = format!("需要锤击次数{:0>2}/{:0>2}", state.current_strikes, state.max_strikes);
    f.render_widget(
        Paragraph::new(strike_text).style(
            Style::default()
            .fg(Color::Rgb(200, 200, 200))
            .add_modifier(Modifier::BOLD),
        ),
        chunks[0],
    );

    let title = TitleSystem::get_title_by_level(state.level);
    let level_text = format!("LV. {:0}{}", state.level, title);
    f.render_widget(
        Paragraph::new(level_text).style(Style::default().fg(Color::Rgb(180, 180, 180))),
                    chunks[1],
    );

    let exp_label = format!("EX. {}/{}", state.current_exp, state.max_exp);
    let ratio = if state.max_exp > 0 {
        (state.current_exp as f64 / state.max_exp as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let exp_gauge = Gauge::default()
    .gauge_style(
        Style::default()
        .fg(Color::Rgb(100, 100, 100))
        .bg(Color::Rgb(30, 30, 30)),
    )
    .ratio(ratio)
    .label(exp_label);
    f.render_widget(exp_gauge, chunks[2]);

    let coin_formatted = format_compact_number(state.coins);
    f.render_widget(
        Paragraph::new(format!("金币数量 {}", coin_formatted.trim())).style(
            Style::default()
            .fg(Color::Rgb(255, 215, 0))
            .add_modifier(Modifier::BOLD),
        ),
        chunks[3],
    );
}
