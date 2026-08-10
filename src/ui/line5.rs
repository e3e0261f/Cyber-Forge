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

    let auctioneers = teams as usize;
    let tea_staff = w * 7 / 10;
    let greeters = w * 2 / 10;
    let seating_staff = 5 + teams * 5;
    let immortal_buyers_count = seating_staff + (state.spirit_stat / 350);

    // 颜色标识直接赋予“拍卖师:X人看管中”
    let team_color = if w <= ideal_headcount / 2 {
        Color::Rgb(0, 255, 127)   // 绿 (<=50%)
    } else if w < ideal_headcount {
        Color::Rgb(255, 215, 0)  // 黄 (50%~99%)
    } else {
        Color::Rgb(255, 80, 80)   // 红 (100%满员)
    };

    let bottom_title = Line::from(vec![
        Span::styled(format!(" 云集道友:{}人 (", immortal_buyers_count), Style::default().fg(Color::Rgb(180, 180, 180))),
                                  Span::styled(format!("拍卖师:{}人看管中", auctioneers), Style::default().fg(team_color).add_modifier(Modifier::BOLD)),
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

    let max_show = inner.height.saturating_sub(3) as usize; // 预留最底行给金融兑换

    if state.pavilion.is_empty() {
        lines.push(Line::from(Span::styled(
            "暂无上架",
            Style::default().fg(Color::Rgb(100, 100, 100)),
        )));
    } else {
        for (i, listing) in state.pavilion.iter().take(max_show).enumerate() {
            let fair = listing.fair_value.max(listing.sword.price).max(1);
            let bid = listing.listed_price;

            if listing.is_sold {
                lines.push(Line::from(Span::styled(
                    format!(
                        "[落槌] 成交{}金 估{}金 {}",
                        bid, fair, listing.sword.name
                    ),
                    Style::default().fg(Color::Rgb(100, 100, 100)),
                )));
            } else if i >= auctioneers {
                lines.push(Line::from(Span::styled(
                    format!(
                        "[候场] 起拍{}金 估{}金 {}",
                        bid, fair, listing.sword.name
                    ),
                    Style::default().fg(Color::Rgb(140, 140, 140)),
                )));
            } else {
                let col = q_color(listing.sword.quality);
                lines.push(Line::from(Span::styled(
                    format!(
                        "⏱️{:02}s 现价{}金 ×{} 估{}金 {}",
                        listing.listing_time, bid, listing.bid_count, fair, listing.sword.name
                    ),
                    Style::default().fg(col),
                )));
            }
        }
    }

    // 填充空白行，确保金融兑换信息紧贴窗口最下行对齐
    while lines.len() < inner.height.saturating_sub(1) as usize {
        lines.push(Line::from(""));
    }

    // 窗口底部对齐：货币金融兑换指引
    lines.push(Line::from(Span::styled(
        " 铜钱 ═ [i/I] ═ 金币 ═ [o/O] ═ 仙玉 (抽成5%)",
                                       Style::default().fg(Color::Rgb(140, 160, 180)),
    )));

    f.render_widget(
        Paragraph::new(lines).style(Style::default().fg(Color::Rgb(180, 180, 180))),
                    inner,
    );
}
