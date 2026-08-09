use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Clear, Paragraph, Wrap},
    Frame,
};

fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let popup = Layout::default()
    .direction(Direction::Vertical)
    .constraints([
        Constraint::Percentage((100 - percent_y) / 2),
                 Constraint::Percentage(percent_y),
                 Constraint::Percentage((100 - percent_y) / 2),
    ])
    .split(area);

    Layout::default()
    .direction(Direction::Horizontal)
    .constraints([
        Constraint::Percentage((100 - percent_x) / 2),
                 Constraint::Percentage(percent_x),
                 Constraint::Percentage((100 - percent_x) / 2),
    ])
    .split(popup[1])[1]
}

pub fn render_help_modal(f: &mut Frame, area: Rect) {
    let popup_area = centered_rect(72, 78, area);
    f.render_widget(Clear, popup_area);

    let block = Block::default()
    .title(" 操作指南 [H] ")
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(180, 180, 180)))
    .style(Style::default().bg(Color::Rgb(20, 20, 20)));

    let gold = Style::default()
    .fg(Color::Rgb(255, 215, 0))
    .add_modifier(Modifier::BOLD);
    let dim = Style::default().fg(Color::Rgb(120, 120, 120));

    let text = vec![
        Line::from(""),
        Line::from(Span::styled("锤击", gold)),
        Line::from("  Space              加速锤击"),
        Line::from(""),
        Line::from(Span::styled("ASDF", gold)),
        Line::from("  [A]  招学徒          [S]  熔炼背包全部"),
        Line::from("  [D]  扩容背包        [F]  上架最贵一把"),
        Line::from(""),
        Line::from(Span::styled("QWER", gold)),
        Line::from("  [Q]  退出(需确认)    [W]  升级风箱"),
        Line::from("  [E]  扩建展位        [R]  扩建厢房"),
        Line::from(""),
        Line::from(Span::styled("学徒工坊", gold)),
        Line::from("  [1]  磨剑台          [2]  附魔炉"),
        Line::from("  [3]  精修坊"),
        Line::from(Span::styled(
            "  （行情流转，何台更赚需自行体悟）",
            dim,
        )),
        Line::from(""),
        Line::from(Span::styled("其它", gold)),
        Line::from("  [H]  打开/关闭本指南"),
        Line::from(""),
        Line::from(Span::styled("  再按 H 或 Esc 关闭", dim)),
    ];

    f.render_widget(
        Paragraph::new(text)
        .block(block)
        .wrap(Wrap { trim: false })
        .style(Style::default().fg(Color::Rgb(200, 200, 200))),
                    popup_area,
    );
}

pub fn render_quit_confirm(f: &mut Frame, area: Rect) {
    let popup_area = centered_rect(50, 28, area);
    f.render_widget(Clear, popup_area);

    let block = Block::default()
    .title(" 确认退出？ ")
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(255, 180, 80)))
    .style(Style::default().bg(Color::Rgb(20, 20, 20)));

    let text = Paragraph::new("当前锻造进度将自动保存\n\n[Y] 确认退出    [N] / Esc 继续")
    .block(block)
    .alignment(Alignment::Center)
    .style(Style::default().fg(Color::Rgb(220, 220, 220)));

    f.render_widget(text, popup_area);
}
