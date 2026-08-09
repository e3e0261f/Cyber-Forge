use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::types::MarketListing;

pub struct Line5State<'a> {
    pub pavilion: &'a [MarketListing],
    pub max_pavilion: usize,
    pub market_news: &'a str,
    pub expand_cost: u128,
}

pub fn render_line_5(f: &mut Frame, area: Rect, state: &Line5State) {
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(" 【藏宝阁拍卖】 ");

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let cost = format_compact_number(state.expand_cost);
    let mut lines: Vec<Line> = Vec::new();

    lines.push(Line::from(format!(
        "{}/{} [E]升级(金{})",
                                  state.pavilion.len(),
                                  state.max_pavilion,
                                  cost.trim()
    )));

    if state.pavilion.is_empty() {
        lines.push(Line::from(Span::styled(
            "暂无上架",
            Style::default().fg(Color::Rgb(100, 100, 100)),
        )));
    } else {
        let max_show = inner.height.saturating_sub(3) as usize;
        for (i, listing) in state.pavilion.iter().take(max_show).enumerate() {
            let badge = listing.sword.quality.badge();
            lines.push(Line::from(format!(
                "{:0>2}.{}金 {} {}",
                i + 1,
                listing.listed_price,
                badge,
                listing.sword.name
            )));
        }
    }

    lines.push(Line::from(Span::styled(
        state.market_news,
        Style::default().fg(Color::Rgb(180, 160, 100)),
    )));

    f.render_widget(
        Paragraph::new(lines).style(Style::default().fg(Color::Rgb(180, 180, 180))),
                    inner,
    );
}
