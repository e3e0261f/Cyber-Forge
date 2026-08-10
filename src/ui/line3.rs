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
    pub forge_workers: u32,
    pub auction_workers: u32, // 第 5 岗位：拍卖行学徒
    pub next_cost: u128,
    pub house_cost: u128,
}

pub fn render_line_3(f: &mut Frame, area: Rect, state: &Line3State) {
    let cost_str = format_compact_number(state.next_cost);
    let house_cost_str = format_compact_number(state.house_cost);

    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(format!(
        " 【铁匠铺】学徒 {}/{} [A]招(金{}) [R]扩(金{}) ",
                   state.apprentices,
                   state.max_apprentices,
                   cost_str.trim(),
                   house_cost_str.trim()
    ));

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    // 展示 1.磨剑 2.附魔 3.精修 4.盲锻 5.拍卖 五个岗位
    let line3_text = format!(
        " 磨剑 {} · 附魔 {} · 精修 {} · 盲锻 {} · 拍卖 {} ",
        state.sharpen_workers,
        state.enchant_workers,
        state.repair_workers,
        state.forge_workers,
        state.auction_workers
    );

    f.render_widget(
        Paragraph::new(line3_text).style(Style::default().fg(Color::Rgb(180, 180, 180))),
                    inner_area,
    );
}
