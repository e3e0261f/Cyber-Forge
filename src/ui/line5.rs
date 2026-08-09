use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::types::{MarketListing, Quality};

pub struct Line5State<'a> {
    pub pavilion: &'a [MarketListing],
    pub max_pavilion: usize,
    pub market_news: &'a str,
    pub expand_cost: u128,
}

fn q_color(q: Quality) -> Color {
    q.color()
}

pub fn render_line_5(f: &mut Frame, area: Rect, state: &Line5State) {
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
        .title(format!(
            " 【藏宝阁拍卖】{}/{} ",
            state.pavilion.len(),
            state.max_pavilion
        ));

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let cost = format_compact_number(state.expand_cost);
    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::from(format!("[E]扩柜({}金)  道友可加价", cost.trim())));

    if state.pavilion.is_empty() {
        lines.push(Line::from(Span::styled(
            "暂无上架",
            Style::default().fg(Color::Rgb(100, 100, 100)),
        )));
    } else {
        let max_show = inner.height.saturating_sub(3) as usize;
        for listing in state.pavilion.iter().take(max_show) {
            let fair = listing.fair_value.max(listing.sword.price).max(1);
            let bid = listing.listed_price;
            let tag = if bid >= fair.saturating_mul(12) / 10 {
                "天"
            } else if bid >= fair {
                "溢"
            } else if listing.bid_count > 0 {
                "抬"
            } else {
                "拍"
            };
            let col = q_color(listing.sword.quality);
            lines.push(Line::from(Span::styled(
                format!(
                    "{}{} 现价{} 估{} ×{} {}",
                    listing.sword.quality.badge(),
                    tag,
                    bid,
                    fair,
                    listing.bid_count,
                    listing.sword.name
                ),
                Style::default().fg(col),
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
