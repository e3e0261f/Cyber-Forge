use ratatui::{
    layout::Rect,
    style::{Color, Style},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub fn render_line_7(f: &mut Frame, area: Rect, toast: &str) {
    let block = Block::default()
        .borders(Borders::TOP)
        .border_style(Style::default().fg(Color::Rgb(60, 60, 60)));
    let inner = block.inner(area);
    f.render_widget(block, area);

    let text = if toast.is_empty() {
        "提示栏｜[T]自动熔凡品 [G]自动上架 [H]指南 [空格]锤击"
    } else {
        toast
    };
    f.render_widget(
        Paragraph::new(text).style(Style::default().fg(Color::Rgb(220, 200, 120))),
        inner,
    );
}
