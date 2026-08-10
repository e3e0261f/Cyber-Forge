use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};

pub struct Line8State<'a> {
    pub logs: &'a [String],
    pub filter_name: &'static str,
}

pub fn render_line_8(f: &mut Frame, area: Rect, state: &Line8State) {
    let block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(70, 100, 120)))
    .title(format!(" 【天道纪事·日志】[L]:{} ", state.filter_name));

    let inner = block.inner(area);
    f.render_widget(block, area);

    let max_lines = inner.height as usize;
    let mut lines = Vec::new();

    // 倒序展示最新推栈的日志
    for log in state.logs.iter().rev().take(max_lines) {
        lines.push(Line::from(Span::styled(
            log.as_str(),
                                           Style::default().fg(Color::Rgb(180, 180, 180)),
        )));
    }
    lines.reverse();

    f.render_widget(Paragraph::new(lines), inner);
}
