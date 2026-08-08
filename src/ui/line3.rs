use ratatui::{
    style::{Color, Style},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame, layout::Rect,
};
use crate::numbers::format_compact_number;

pub struct Line3State {
    pub apprentices: u32,
    pub max_apprentices: u32,
    pub next_cost: u128,
    pub tick_count: u64,
}

pub fn render_line_3(f: &mut Frame, area: Rect, state: &Line3State) {
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Rgb(0, 229, 255)))
        .title(" 🤖 宗门与混沌熵池 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let cost_str = format_compact_number(state.next_cost);
    let spinner = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
    let pulse = spinner[(state.tick_count as usize) % spinner.len()];

    let line3_text = format!(
        "🤖 学徒: {}/{} [A]招募(${}) │ 熔炉相性: 丙火 (+15%) │ 混沌熵池: {} 256 B/s",
        state.apprentices, state.max_apprentices, cost_str.trim(), pulse
    );

    f.render_widget(Paragraph::new(line3_text).style(Style::default().fg(Color::Rgb(0, 229, 255))), inner_area);
}
