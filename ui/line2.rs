use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Gauge, Paragraph},
    Frame,
};

pub struct Line2State {
    pub progress: f64,
    pub carbon_ratio: f32,
    pub tick_count: u64,
}

pub fn render_line_2(f: &mut Frame, area: Rect, state: &Line2State) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(18), // 锤打火花动画区
            Constraint::Min(25),    // 开锋进度条区
            Constraint::Length(22), // 碳含量温控区
        ])
        .split(area);

    // 1. 小锤击打帧动画
    let anim_frames = ["🔨 ──► 💥", " 🔨 ─► 💥", "  🔨 ► 💥", "   🔨 💥 "];
    let frame_idx = (state.tick_count as usize) % anim_frames.len();
    let anim_text = format!("⚙️ {}", anim_frames[frame_idx]);
    f.render_widget(
        Paragraph::new(anim_text).style(Style::default().fg(Color::Rgb(255, 140, 0)).add_modifier(Modifier::BOLD)),
        chunks[0],
    );

    // 2. 开锋进度条 (Rgb 赛博紫/天蓝)
    let gauge_label = format!("开锋进度 {:.0}%", state.progress * 100.0);
    let forge_gauge = Gauge::default()
        .gauge_style(Style::default().fg(Color::Rgb(138, 43, 226)).bg(Color::Rgb(30, 30, 30)))
        .ratio(state.progress.clamp(0.0, 1.0))
        .label(gauge_label);
    f.render_widget(forge_gauge, chunks[1]);

    // 3. 碳含量与色温 (黄金区绿色，偏离报警)
    let (carbon_color, status_str) = if (0.7..=0.9).contains(&state.carbon_ratio) {
        (Color::Green, "黄金")
    } else {
        (Color::Red, "失衡")
    };

    let carbon_text = format!(" 碳含量: {:.2}% ({})", state.carbon_ratio, status_str);
    f.render_widget(
        Paragraph::new(carbon_text).style(Style::default().fg(carbon_color).add_modifier(Modifier::BOLD)),
        chunks[2],
    );
}
