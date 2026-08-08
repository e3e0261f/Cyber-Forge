use ratatui::{
    style::{Color, Style},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame, layout::Rect,
};
use crate::numbers::format_compact_number;
use crate::types::{Quality, Sword};

pub struct Line4State<'a> {
    pub backpack: &'a [Sword],
    pub max_backpack: usize,
    pub expand_cost: u128,
}

pub fn render_line_4(f: &mut Frame, area: Rect, state: &Line4State) {
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(" 【储剑锦囊】 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let count = state.backpack.len();
    let (summary, color) = if let Some(first) = state.backpack.first() {
        let tag = if first.is_reforged {
            "[重铸]"
        } else if first.enchantment.is_some() {
            "[附魔]"
        } else if first.sharpness > 0 {
            "[精磨]"
        } else {
            first.quality.badge()
        };

        let color = match first.quality {
            Quality::Common => Color::Rgb(200, 200, 200),
            Quality::Fine => Color::Rgb(0, 255, 127),
            Quality::Rare => Color::Rgb(0, 229, 255),
            Quality::Epic => Color::Rgb(138, 43, 226),
            Quality::Legendary => Color::Rgb(255, 215, 0),
            Quality::Mythic => Color::Rgb(255, 0, 85),
        };

        (format!("1.{} {} (${})", tag, first.name, first.price), color)
    } else {
        ("囊中无剑".to_string(), Color::Rgb(120, 120, 120))
    };

    let cost_str = format_compact_number(state.expand_cost);
    let line4_text = format!(
        "囊 {}/{} │ {} │ [L]架 [R]熔 [B]扩(${})",
                             count, state.max_backpack, summary, cost_str.trim()
    );

    f.render_widget(Paragraph::new(line4_text).style(Style::default().fg(color)), inner_area);
}
