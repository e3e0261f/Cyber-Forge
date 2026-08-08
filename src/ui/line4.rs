use ratatui::{
    style::{Color, Style},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame, layout::Rect,
};
use crate::types::{Quality, Sword};

pub struct Line4State<'a> {
    pub inventory: &'a [Sword],
    pub max_inventory: usize,
}

pub fn render_line_4(f: &mut Frame, area: Rect, state: &Line4State) {
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Rgb(255, 215, 0)))
        .title(" 🎒 藏宝阁 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let inv_count = state.inventory.len();
    let summary = if let Some(first) = state.inventory.first() {
        let tag = match first.quality {
            Quality::Common => "[凡]",
            Quality::Fine => "[优]",
            Quality::Rare => "[稀]",
            Quality::Epic => "[史]",
            Quality::Legendary => "[神]",
            Quality::Mythic => "[道]",
        };
        format!("1.{} {} (${})", tag, first.name, first.price)
    } else {
        "暂无宝剑".to_string()
    };

    let line4_text = format!(
        "🎒 [{}/{}] {} ... │ [A]招募学徒 [B]扩容($500) [S]卖出全废品 [ESC]退出",
        inv_count, state.max_inventory, summary
    );

    f.render_widget(Paragraph::new(line4_text).style(Style::default().fg(Color::White)), inner_area);
}
