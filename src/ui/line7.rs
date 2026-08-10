use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

pub struct Line7State<'a> {
    pub melt_tier_name: &'static str,
    pub melt_tier_color: Color,
    pub list_tier_name: &'static str,
    pub list_tier_color: Color,
    pub pending_breakthrough: bool,
    pub market_news: &'a str,
}

pub fn render_line_7(f: &mut Frame, area: Rect, state: &Line7State) {
    let chunks = Layout::default()
    .direction(Direction::Horizontal)
    .constraints([
        Constraint::Min(42),
                 Constraint::Length(38),
    ])
    .split(area);

    let mut left_spans = Vec::new();

    if state.pending_breakthrough {
        left_spans.push(Span::styled("⚡[B]突破引劫 ", Style::default().fg(Color::Rgb(255, 215, 0)).add_modifier(Modifier::BOLD)));
        left_spans.push(Span::styled("│ ", Style::default().fg(Color::Rgb(80, 80, 80))));
    }

    // [T] 多阶熔炼彩色名呈现
    left_spans.push(Span::styled("[T]熔炼:", Style::default().fg(Color::Rgb(180, 180, 180))));
    left_spans.push(Span::styled(state.melt_tier_name, Style::default().fg(state.melt_tier_color).add_modifier(Modifier::BOLD)));

    // [G] 多阶上架彩色门槛呈现
    left_spans.push(Span::styled(" [G]上架:", Style::default().fg(Color::Rgb(180, 180, 180))));
    left_spans.push(Span::styled(state.list_tier_name, Style::default().fg(state.list_tier_color).add_modifier(Modifier::BOLD)));

    left_spans.push(Span::styled(" │ [L]日志 [H]指南 [空格]锤", Style::default().fg(Color::Rgb(140, 140, 140))));

    f.render_widget(Paragraph::new(Line::from(left_spans)), chunks[0]);

    if !state.market_news.is_empty() {
        let news_text = format!("杂闻: {}", state.market_news);
        f.render_widget(
            Paragraph::new(news_text)
            .alignment(Alignment::Right)
            .style(Style::default().fg(Color::Rgb(180, 160, 100))),
                        chunks[1],
        );
    }
}
