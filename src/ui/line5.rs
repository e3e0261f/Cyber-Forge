use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::types::{MarketListing, Quality};

pub struct Line5State<'a> {
    pub pavilion: &'a [MarketListing],
    pub max_pavilion: usize,
    pub expand_cost: u128,
    pub spirit_stat: u64,
    pub auction_workers: u32,
}

fn q_color(q: Quality) -> Color {
    q.color()
}

pub fn render_line_5(f: &mut Frame, area: Rect, state: &Line5State) {
    let cost = format_compact_number(state.expand_cost);
    
    let w = state.auction_workers as u64;
    let teams = if w > 0 { (w + 9) / 10 } else { 1 };
    let ideal_headcount = teams * 10;

    let active_auctioneers = (state.pavilion.len()).min(teams as usize); // 正在工作中主拍人数
    let tea_staff = w * 7 / 10;
    let greeters = w * 2 / 10;
    let seating_staff = 5 + teams * 5;
    let immortal_buyers_count = seating_staff + (state.spirit_stat / 350);

    let team_color = if w <= 5 {
        Color::Rgb(255, 80, 80)
    } else if w <= 10 {
        Color::Rgb(255, 215, 0)
    } else {
        Color::Rgb(0, 255, 127)
    };

    // 格式矫正：拍卖师410/12人工作中（12人工作中 带色彩）
    let bottom_title = Line::from(vec![
        Span::styled(format!(" 云集道友:{}人 (拍卖师{}", immortal_buyers_count, w), Style::default().fg(Color::Rgb(180, 180, 180))),
        Span::styled(format!("/{}人工作中", active_auctioneers), Style::default().fg(team_color).add_modifier(Modifier::BOLD)),
        Span::styled(format!(" 茶水{} 迎宾{}) ", tea_staff, greeters), Style::default().fg(Color::Rgb(180, 180, 180))),
    ]);

    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
        .title(format!(
            " 【藏宝阁拍卖】{}/{} [E]扩(金{}) ",
            state.pavilion.len(),
            state.max_pavilion,
            cost.trim()
        ))
        .title_bottom(bottom_title);

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::from(Span::styled(
        "倒计时零落槌  加价重置至30s  阶梯阻尼成交",
        Style::default().fg(Color::Rgb(120, 120, 120)),
    )));

    if state.pavilion.is_empty() {
        lines.push(Line::from(Span::styled(
            "暂无上架",
            Style::default().fg(Color::Rgb(100, 100, 100)),
        )));
    } else {
        let max_show = inner.height.saturating_sub(2) as usize;
        for (i, listing) in state.pavilion.iter().take(max_show).enumerate() {
            let fair = listing.fair_value.max(listing.sword.price).max(1);
            let bid = listing.listed_price;

            if listing.is_sold {
                lines.push(Line::from(Span::styled(
                    format!(
                        "[落槌] 成交金{} 估价{} {}",
                        bid, fair, listing.sword.name
                    ),
                    Style::default().fg(Color::Rgb(100, 100, 100)),
                )));
            } else if i >= active_auctioneers {
                lines.push(Line::from(Span::styled(
                    format!(
                        "[候场] 起拍金{} 估价{} {}",
                        bid, fair, listing.sword.name
                    ),
                    Style::default().fg(Color::Rgb(140, 140, 140)),
                )));
            } else {
                let col = q_color(listing.sword.quality);
                lines.push(Line::from(Span::styled(
                    format!(
                        "⏱️{:02}s 现价{}金 ×{} 估价{}金 {}",
                        listing.listing_time, bid, listing.bid_count, fair, listing.sword.name
                    ),
                    Style::default().fg(col),
                )));
            }
        }
    }

    f.render_widget(
        Paragraph::new(lines).style(Style::default().fg(Color::Rgb(180, 180, 180))),
        inner,
    );
}