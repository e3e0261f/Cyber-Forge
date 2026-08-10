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
    let popup_area = centered_rect(72, 80, area);
    f.render_widget(Clear, popup_area);

    let block = Block::default()
    .title(" 赛博天道指南 [H] ")
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(180, 180, 180)))
    .style(Style::default().bg(Color::Rgb(20, 20, 20)));

    let gold = Style::default().fg(Color::Rgb(255, 215, 0)).add_modifier(Modifier::BOLD);
    let dim = Style::default().fg(Color::Rgb(120, 120, 120));

    let text = vec![
        Line::from(""),
        Line::from(Span::styled("锤击与工具升阶", gold)),
        Line::from("  Space              加速锤击（关键帧内锤击增加掉宝与修仙经验）"),
        Line::from("  [U]  升级重锤      一锤顶 N 下，Late-game 支持一锤 50 锤！"),
        Line::from(""),
        Line::from(Span::styled("作坊管理 (ASDF/QWER)", gold)),
        Line::from("  [A]  招募学徒      [S]  熔炼末位最低价兵刃"),
        Line::from("  [D]  扩容背包      [F]  上架最高价兵刃"),
        Line::from("  [W]  升级风箱      [E]  扩建拍卖展位"),
        Line::from("  [R]  扩建厢房      [Q]  安全保存并退出"),
        Line::from(""),
        Line::from(Span::styled("自动化与过滤", gold)),
        Line::from("  [T]  自动熔炼凡品开关（保留在背包 2 秒后自动消化）"),
        Line::from("  [G]  自动上架开关（自动排除灰色凡品）"),
        Line::from("  [L]  日志过滤模式（全量 / 重要 / 仅代表作）"),
        Line::from(""),
        Line::from(Span::styled("再按 H 或 Esc 关闭指南", dim)),
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

    let text = Paragraph::new("当前天道锻造进度将自动加密落盘\n\n[Y] 确认退出    [N] / Esc 继续")
    .block(block)
    .alignment(Alignment::Center)
    .style(Style::default().fg(Color::Rgb(220, 220, 220)));

    f.render_widget(text, popup_area);
}
