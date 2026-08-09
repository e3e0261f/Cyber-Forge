use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, BorderType, Borders, Clear, Paragraph},
    Frame,
};
use crate::types::Sword;

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

pub fn render_sword_modal(f: &mut Frame, area: Rect, sword: &Sword) {
    let popup = centered_rect(50, 40, area);
    f.render_widget(Clear, popup);

    let block = Block::default()
    .title(" ═══ 🗡️ 天道神兵出炉 ═══ ")
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(255, 215, 0)))
    .style(Style::default().bg(Color::Rgb(20, 20, 20)));

    let text = format!(
        "\n{} {}\n估价 金 {}\n经验 +{}\n\n按任意键收纳",
        sword.quality.badge(),
                       sword.name,
                       sword.price,
                       sword.quality.bonus_exp()
    );

    f.render_widget(
        Paragraph::new(text)
        .block(block)
        .alignment(Alignment::Center)
        .style(
            Style::default()
            .fg(Color::Rgb(220, 220, 220))
            .add_modifier(Modifier::BOLD),
        ),
        popup,
    );
}
