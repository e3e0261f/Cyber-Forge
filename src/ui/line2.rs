use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, BorderType, Borders, Gauge, Paragraph},
    Frame,
};

pub struct Line2State {
    pub progress: f64,
    pub carbon_ratio: f32,
    pub tick_count: u64,
}

pub fn render_line_2(f: &mut Frame, area: Rect, state: &Line2State) {
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Rgb(255, 140, 0)))
        .title(" ⚙️ 熔炉炼化 ");

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(18),
            Constraint::Min(20),
            Constraint::Length(22),
        ])
        .split(inner_area);

    let anim_frames = ["🔨 ──► 💥", " 🔨 ─► 💥", "  🔨 ► 💥", "   🔨 💥 "];
    let frame_idx = (state.tick_count as usize) % anim_frames.len();
    f.render_widget(
        Paragraph::new(format!("⚙️ {}", anim_frames[frame_idx]))
            .style(Style::default().fg(Color::Rgb(255, 140, 0)).add_modifier(Modifier::BOLD)),
        chunks[0],
    );

    let forge_gauge = Gauge::default()
        .gauge_style(Style::default().fg(Color::Rgb(138, 43, 226)).bg(Color::Rgb(30, 30, 30)))
        .ratio(state.progress.clamp(0.0, 1.0))
        .label(format!("开锋进度 {:.0}%", state.progress * 100.0));
    f.render_widget(forge_gauge, chunks[1]);

    let (carbon_color, status_str) = if (0.7..=0.9).contains(&state.carbon_ratio) {
        (Color::Green, "黄金")
    } else {
        (Color::Red, "失衡")
    };

    f.render_widget(
        Paragraph::new(format!(" 碳含量: {:.2}% ({})", state.carbon_ratio, status_str))
            .style(Style::default().fg(carbon_color).add_modifier(Modifier::BOLD)),
        chunks[2],
    );
}
