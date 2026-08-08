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
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(80, 80, 80)))
    .title(" 【天道炉火】 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let chunks = Layout::default()
    .direction(Direction::Horizontal)
    .constraints([
        Constraint::Length(18),
                 Constraint::Min(20),
                 Constraint::Length(24),
    ])
    .split(inner_area);

    let anim_frames = ["🔨 ──► 💥", " 🔨 ─► 💥", "  🔨 ► 💥", "   🔨 💥 "];
    let frame_idx = (state.tick_count as usize) % anim_frames.len();
    f.render_widget(Paragraph::new(format!("⚙️ {}", anim_frames[frame_idx])).style(Style::default().fg(Color::Rgb(180, 180, 180))), chunks[0]);

    let forge_gauge = Gauge::default()
    .gauge_style(Style::default().fg(Color::Rgb(120, 120, 120)).bg(Color::Rgb(30, 30, 30)))
    .ratio(state.progress.clamp(0.0, 1.0))
    .label(format!("开锋 {:.0}%", state.progress * 100.0));
    f.render_widget(forge_gauge, chunks[1]);

    let (carbon_color, status_str) = if (0.7..=0.9).contains(&state.carbon_ratio) { (Color::Rgb(0, 255, 127), "正") } else { (Color::Rgb(255, 80, 80), "偏") };
    f.render_widget(Paragraph::new(format!("碳 {:.2}% ({}) │ 息 {:.1}s [F]风", state.carbon_ratio, status_str, state.interval_secs)).style(Style::default().fg(carbon_color)), chunks[2]);
}
