use ratatui::{
    style::{Color, Modifier, Style},
    widgets::Paragraph,
    Frame, layout::Rect,
};
use crate::types::{Quality, Sword};

pub struct Line4State<'a> {
    pub inventory: &'a [Sword],
    pub max_inventory: usize,
}

pub fn render_line_4(f: &mut Frame, area: Rect, state: &Line4State) {
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
        "🎒 [{}/{}] {} ... | [A]招募学徒 [B]扩容($500) [S]卖出全废品 [ESC]退出",
        inv_count, state.max_inventory, summary
    );

    let p = Paragraph::new(line4_text).style(Style::default().fg(Color::Rgb(240, 240, 240)).bg(Color::Rgb(20, 20, 20)));
    f.render_widget(p, area);
}
