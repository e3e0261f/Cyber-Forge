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
    let cost = format_compact_number(state.expand_cost);

    // 将扩柜按键 [E] 与金钱费用直接融入标题栏
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(format!(
        " 【藏宝阁拍卖】{}/{} [E]扩(金{}) ",
                   state.pavilion.len(),
                   state.max_pavilion,
                   cost.trim()
    ));

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::from(Span::styled(
        "倒计时归零落槌 道友竞价",
        Style::default().fg(Color::Rgb(120, 120, 120)),
    )));

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
            let col = q_color(listing.sword.quality);

            lines.push(Line::from(Span::styled(
                format!(
                    "⏱️{:02}s 现价{} ×{} 估价{} {}",
                    listing.listing_time,
                    bid,
                    listing.bid_count,
                    fair,
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
