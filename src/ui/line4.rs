use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
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
    .title(" 【背包】 ");

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let cost = format_compact_number(state.expand_cost);
    let mut lines: Vec<Line> = Vec::new();

    lines.push(Line::from(format!(
        "{}/{} [D]升级背包(金{})",
                                  state.backpack.len(),
                                  state.max_backpack,
                                  cost.trim()
    )));
    lines.push(Line::from("[F]上架出售 [S]熔炼"));

    if state.backpack.is_empty() {
        lines.push(Line::from(Span::styled(
            "无剑可售",
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
                format!("{:0>2}.金{} {} {}", i + 1, sword.price, tag, sword.name),
                    Style::default().fg(color),
            )));
        }
    }

    f.render_widget(Paragraph::new(lines), inner);
}
