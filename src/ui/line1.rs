use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Gauge, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::titles::TitleSystem;

pub struct Line1State {
    pub current_strikes: u32,
    pub max_strikes: u32,
    pub level: u32,
    pub current_exp: u32,
    pub max_exp: u32,
    pub coins: u128,
}

pub fn render_line_1(f: &mut Frame, area: Rect, state: &Line1State) {
    // 将 Line 1 横向分割为 4 个严格比例的区块，彻底锁死宽度
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(15), // 🔨 锤击数区: [🔨 0012/0100]
            Constraint::Length(20), // 🎓 职称等级区: [Lv.015 赛博炼器师]
            Constraint::Min(25),    // 📈 经验条区:   [EXP: 000120/000500] (可自适应扩展)
            Constraint::Length(15), // 💰 财富区:     [💰   12.34M]
        ])
        .split(area);

    // 1. 锤击数 (固定 4 位补零对齐，防止跳动)
    let strike_text = format!("[🔨 {:0>4}/{:0>4}]", state.current_strikes, state.max_strikes);
    let strike_p = Paragraph::new(strike_text)
        .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD));
    f.render_widget(strike_p, chunks[0]);

    // 2. 等级与定宽职称
    let title = TitleSystem::get_title_by_level(state.level);
    let level_text = format!("[Lv.{:0>3} {}]", state.level, title);
    let level_p = Paragraph::new(level_text)
        .style(Style::default().fg(Color::Cyan));
    f.render_widget(level_p, chunks[1]);

    // 3. 经验进度条与定宽数值
    let exp_label = format!("{:0>6}/{:0>6}", state.current_exp, state.max_exp);
    let ratio = (state.current_exp as f64 / state.max_exp as f64).clamp(0.0, 1.0);
    let exp_gauge = Gauge::default()
        .gauge_style(Style::default().fg(Color::Green).bg(Color::DarkGray))
        .ratio(ratio)
        .label(exp_label);
    f.render_widget(exp_gauge, chunks[2]);

    // 4. 💰 财富数 (防爆引擎计算输出)
    let coin_formatted = format_compact_number(state.coins);
    let coin_text = format!("[💰 {}]", coin_formatted);
    let coin_p = Paragraph::new(coin_text)
        .style(Style::default().fg(Color::Gold));
    f.render_widget(coin_p, chunks[3]);
}
