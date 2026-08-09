use ratatui::{
    layout::Rect,
    style::{Color, Style},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;

pub struct Line3State {
    pub apprentices: u32,
    pub max_apprentices: u32,
    pub sharpen_workers: u32,
    pub enchant_workers: u32,
    pub repair_workers: u32,
    pub next_cost: u128,
    pub house_cost: u128,
}

pub fn render_line_3(f: &mut Frame, area: Rect, state: &Line3State) {
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(" 【铁匠铺】 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let cost_str = format_compact_number(state.next_cost);
    let house_cost_str = format_compact_number(state.house_cost);

    let line3_text = format!(
        "学徒人数 {}/{} │ 磨剑台 {} · 附魔炉 {} · 精修坊 {} │ [A]需({}金) [R]需({}金)",
                             state.apprentices,
                             state.max_apprentices,
                             state.sharpen_workers,
                             state.enchant_workers,
                             state.repair_workers,
                             cost_str.trim(),
                             house_cost_str.trim()
    );

    f.render_widget(
        Paragraph::new(line3_text).style(Style::default().fg(Color::Rgb(180, 180, 180))),
                    inner_area,
    );
}
