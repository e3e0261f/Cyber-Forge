use ratatui::{
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
    layout::Rect,
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

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let cost = format_compact_number(state.expand_cost);
    let mut lines: Vec<Line> = Vec::new();

    lines.push(Line::from(format!(
        "囊 {}/{} [B]扩(${})",
                                  state.backpack.len(),
                                  state.max_backpack,
                                  cost.trim()
    )));
    lines.push(Line::from("[L]架 [R]熔 [S]卖"));

    if state.backpack.is_empty() {
        lines.push(Line::from(Span::styled(
            "囊中无剑",
            Style::default().fg(Color::Rgb(100, 100, 100)),
        )));
    } else {
        let max_show = inner.height.saturating_sub(3) as usize;
        for (i, sword) in state.backpack.iter().take(max_show).enumerate() {
            let tag = if sword.is_reforged {
                "[重铸]"
            } else if sword.enchantment.is_some() {
                "[附魔]"
            } else if sword.sharpness > 0 {
                "[精磨]"
            } else {
                sword.quality.badge()
            };

            let color = match sword.quality {
                Quality::Common => Color::Rgb(200, 200, 200),
                Quality::Fine => Color::Rgb(0, 255, 127),
                Quality::Rare => Color::Rgb(0, 229, 255),
                Quality::Epic => Color::Rgb(138, 43, 226),
                Quality::Legendary => Color::Rgb(255, 215, 0),
                Quality::Mythic => Color::Rgb(255, 0, 85),
            };

            lines.push(Line::from(Span::styled(
                format!("{}.{} {}", i + 1, tag, sword.name),
                    Style::default().fg(color),
            )));
        }
    }

    f.render_widget(Paragraph::new(lines), inner);
}
