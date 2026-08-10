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
    pub scroll_offset: usize, // 支持 PgUp / PgDn 日志自由滚动
}

pub fn render_line_8(f: &mut Frame, area: Rect, state: &Line8State) {
    let scroll_tag = if state.scroll_offset > 0 {
        format!(" [PgUp/PgDn滚动:+{}] ", state.scroll_offset)
    } else {
        String::new()
    };

    let block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(70, 100, 120)))
    .title(format!(" 【天道纪事·日志】[L]:{}{} ", state.filter_name, scroll_tag));

    let inner = block.inner(area);
    f.render_widget(block, area);

    let max_lines = inner.height as usize;
    let mut lines = Vec::new();

    // 支持滚动偏移量历史回溯
    let total = state.logs.len();
    let start_idx = total.saturating_sub(max_lines + state.scroll_offset);
    let end_idx = total.saturating_sub(state.scroll_offset);

    for log in state.logs.iter().skip(start_idx).take(end_idx.saturating_sub(start_idx)) {
        lines.push(Line::from(Span::styled(
            log.as_str(),
                                           Style::default().fg(Color::Rgb(180, 180, 180)),
        )));
    }

    f.render_widget(Paragraph::new(lines), inner);
}
