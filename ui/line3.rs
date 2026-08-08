use ratatui::{
    style::{Color, Modifier, Style},
    widgets::Paragraph,
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
    let cost_str = format_compact_number(state.next_cost);
    
    // 熵池脉冲盲文动画
    let spinner = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
    let pulse = spinner[(state.tick_count as usize) % spinner.len()];

    let line3_text = if state.apprentices < state.max_apprentices {
        format!(
            "🤖 学徒: {}/{} [A]招募(${}) | 熔炉: 丙火(攻击+15%) | 混沌熵池: {} 256 B/s",
            state.apprentices, state.max_apprentices, cost_str.trim(), pulse
        )
    } else {
        format!(
            "🤖 学徒: {}/{} (名额满) | 熔炉: 丙火(攻击+15%) | 混沌熵池: {} 256 B/s",
            state.apprentices, state.max_apprentices, pulse
        )
    };

    let p = Paragraph::new(line3_text).style(Style::default().fg(Color::Rgb(0, 229, 255)));
    f.render_widget(p, area);
}
