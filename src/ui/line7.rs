use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

// 拥有型结构体：脱离 RwLock 读锁生命周期限制，无 Borrow 冲突
pub struct Line7State {
    pub auto_melt: bool,
    pub auto_list: bool,
    pub toast: String,
}

pub fn render_line_7(f: &mut Frame, area: Rect, state: &Line7State) {
    let mut spans = Vec::new();

    // 1. 动态消息通知
    if !state.toast.is_empty() {
        spans.push(Span::styled("📢 ", Style::default().fg(Color::Rgb(255, 215, 0))));
        spans.push(Span::styled(
            &state.toast,
            Style::default().fg(Color::Rgb(255, 220, 120)).add_modifier(Modifier::BOLD),
        ));
        spans.push(Span::styled("  │  ", Style::default().fg(Color::Rgb(80, 80, 80))));
    }

    // 2. 彩色开关标识：开(亮绿) / 关(暗灰)
    spans.push(Span::styled("[T]熔凡品:", Style::default().fg(Color::Rgb(180, 180, 180))));
    if state.auto_melt {
        spans.push(Span::styled("开 ", Style::default().fg(Color::Rgb(0, 255, 127)).add_modifier(Modifier::BOLD)));
    } else {
        spans.push(Span::styled("关 ", Style::default().fg(Color::Rgb(120, 120, 120))));
    }

    spans.push(Span::styled("[G]自动上架:", Style::default().fg(Color::Rgb(180, 180, 180))));
    if state.auto_list {
        spans.push(Span::styled("开 ", Style::default().fg(Color::Rgb(0, 255, 127)).add_modifier(Modifier::BOLD)));
    } else {
        spans.push(Span::styled("关 ", Style::default().fg(Color::Rgb(120, 120, 120))));
    }

    // 3. 常驻功能指引
    spans.push(Span::styled(" │ [L]日志 [H]指南 [空格]锤击", Style::default().fg(Color::Rgb(140, 140, 140))));

    f.render_widget(Paragraph::new(Line::from(spans)), area);
}
