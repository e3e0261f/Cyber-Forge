use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    widgets::{Block, BorderType, Borders, Gauge, Paragraph},
    Frame,
};

pub struct Line2State {
    pub progress: f64,
    pub carbon_ratio: f32,
    pub tick_count: u64,
    pub interval_secs: f32,
}

pub fn render_line_2(f: &mut Frame, area: Rect, state: &Line2State) {
    let outer_block = Block::default().title(" 【锻造台】")
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(" 下一锤倒计时 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let chunks = Layout::default()
    .direction(Direction::Horizontal)
    .constraints([
        Constraint::Length(1),
                 Constraint::Min(2),
                 Constraint::Length(1),
    ])
    .split(inner_area);


    // 1. time_ratio 现已是【时间流逝比例】（0.0 ~ 1.0）
    let time_ratio = state.progress.clamp(0.0, 1.0);

    // 2. 计算倒计时剩余秒数
    let remaining_secs = (1.0 - time_ratio) * (state.interval_secs as f64);

    let forge_gauge = Gauge::default()
    .gauge_style(
        Style::default()
        .fg(Color::Rgb(255, 140, 0)) // 橘黄火候色
        .bg(Color::Rgb(30, 30, 30)),
    )
    .ratio(time_ratio)
    // 3. 完美动态显示倒计时！
    .use_unicode(true)
    .label(format!("{:.1}s", remaining_secs));

    f.render_widget(forge_gauge, chunks[1]);

    let (carbon_color, status_str) = if (0.7..=0.9).contains(&state.carbon_ratio) {
        (Color::Rgb(0, 255, 127), "正")
    } else {
        (Color::Rgb(255, 80, 80), "偏")
    };
    f.render_widget(
        Paragraph::new(format!(
            "{:.1}s│{:.2}%碳({}) ",
                              state.interval_secs, state.carbon_ratio, status_str
        ))
        .style(Style::default().fg(carbon_color)),
                    chunks[2],
    );
}
