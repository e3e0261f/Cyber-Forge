use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, BorderType, Borders, Clear, Paragraph},
    Frame,
};
use crate::types::{Element, Sword};

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

fn el_name(e: Element) -> &'static str {
    match e {
        Element::Gold => "庚金",
        Element::Wood => "乙木",
        Element::Water => "癸水",
        Element::Fire => "丙火",
        Element::Earth => "戊土",
    }
}

pub fn derived_stats(sword: &Sword) -> (u64, u64, u64) {
    let base = sword.quality.atk_base();
    let sharp_bonus = sword.sharpness as u64;
    let atk = base + sharp_bonus / 2;
    let durability = 40 + sword.sharpness as u64 + base / 2;
    let weight = 8 + (base / 30);
    (atk, durability, weight)
}

pub fn format_sword_detail(sword: &Sword) -> String {
    let (atk, dur, weight) = derived_stats(sword);
    let ench = sword
    .enchantment
    .map(|e| format!("附魔·{}", el_name(e)))
    .unwrap_or_else(|| "无附魔".into());
    let flag = if sword.is_reforged {
        "重铸"
    } else {
        "原锻"
    };
    format!(
        "{}\n{}\n\n\
品质 {}\n五行 {}\n{}\n工艺 {}\n\n\
攻击 {}\n耐久 {}\n重量 {}\n锋利 {}/100\n\n\
素质估价 金 {}",
sword.quality.badge(),
            sword.name,
            sword.quality.badge(),
            el_name(sword.element),
            ench,
            flag,
            atk,
            dur,
            weight,
            sword.sharpness,
            sword.price
    )
}

pub fn render_sword_modal(f: &mut Frame, area: Rect, sword: &Sword, remaining_secs: u32) {
    let popup = centered_rect(46, 52, area);
    f.render_widget(Clear, popup);

    let block = Block::default()
    .title(" ═══ 🗡️ 天道代表作降世 ═══ ")
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(255, 215, 0)))
    .style(Style::default().bg(Color::Rgb(20, 20, 20)));

    let detail = format_sword_detail(sword);

    let text = format!(
        "\n{}\n\n⏱️ {:02}s 后自动收纳  │  按任意键立即关闭",
        detail, remaining_secs
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

pub fn render_hover_detail(f: &mut Frame, area: Rect, sword: &Sword) {
    let popup = Rect {
        x: area.x + area.width * 22 / 100 + 1,
        y: area.y + 2,
        width: (area.width * 36 / 100).max(28).min(42),
        height: 16.min(area.height.saturating_sub(4)),
    };
    f.render_widget(Clear, popup);

    let block = Block::default()
    .title(" 兵器鉴 ")
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(0, 200, 255)))
    .style(Style::default().bg(Color::Rgb(12, 16, 22)));

    f.render_widget(
        Paragraph::new(format!("{}\n\n（悬停查看 · 移开关闭）", format_sword_detail(sword)))
        .block(block)
        .style(Style::default().fg(Color::Rgb(210, 210, 210))),
                    popup,
    );
}
