use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};

pub struct Line2State {
    pub progress: f64,
    pub tick_count: u64,
    pub interval_secs: f32,
    pub show_crit_window: bool,
    pub in_crit_zone: bool,
    pub current_strikes: u32,
    pub max_strikes: u32,
    pub qte_hits: u32,
    pub qte_bonus_pct: f64,
}

fn pulse(tick: u64) -> f64 {
    // 更细的呼吸（配合更高刷新）
    let phase = (tick % 40) as f64 / 40.0;
    if phase < 0.5 {
        phase * 2.0
    } else {
        (1.0 - phase) * 2.0
    }
}

fn lerp_u8(a: u8, b: u8, t: f64) -> u8 {
    (a as f64 + (b as f64 - a as f64) * t.clamp(0.0, 1.0)).round() as u8
}

pub fn render_line_2(f: &mut Frame, area: Rect, state: &Line2State) {
    let strike = format!("{}/{}", state.current_strikes, state.max_strikes);
    // 数字只在边框标题：完美次数 + 暴击率
    let qte_info = if state.qte_hits > 0 {
        format!(" · 完美击锤{} +{:.0}%掉宝率", state.qte_hits, state.qte_bonus_pct)
    } else if state.show_crit_window {
        " · 帧内空格=完美".to_string()
    } else {
        String::new()
    };
    let title = if state.in_crit_zone {
        format!(" 下一锤 · {}{} · 帧内！ ", strike, qte_info)
    } else {
        format!(" 下一锤 · {}{} ", strike, qte_info)
    };

    let border_color = if state.in_crit_zone {
        Color::Rgb(255, 80, 120)
    } else {
        Color::Rgb(80, 80, 80)
    };

    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(border_color))
        .title(title);

    let inner_area = outer_block.inner(area);
    f.render_widget(outer_block, area);

    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(8), Constraint::Length(6)])
        .split(inner_area);

    let ratio = state.progress.clamp(0.0, 1.0);
    let w = chunks[0].width.max(1) as usize;
    // 亚像素感：用半格字符让推进更细
    let pos = ratio * w as f64;
    let filled = pos.floor() as usize;
    let frac = pos - filled as f64;

    let (crit_lo, crit_hi) = if state.show_crit_window {
        let mut lo = ((0.76 * w as f64).floor() as usize).min(w);
        let mut hi = ((0.88 * w as f64).ceil() as usize).min(w);
        // 至少 3 格宽，避免窗口“消失”
        if hi.saturating_sub(lo) < 3 {
            hi = (lo + 3).min(w);
            if hi.saturating_sub(lo) < 3 {
                lo = hi.saturating_sub(3);
            }
        }
        (lo, hi)
    } else {
        (w + 1, 0)
    };

    let p = pulse(state.tick_count);
    let mut spans = Vec::with_capacity(w);

    for i in 0..w {
        let in_crit_band = state.show_crit_window && i >= crit_lo && i < crit_hi;
        let is_full = i < filled;
        let is_head = i == filled && filled < w;

        if in_crit_band {
            // 醒目 QTE 色条：呼吸高光，不写字
            let r = lerp_u8(200, 255, p);
            let g = lerp_u8(40, 90, p);
            let b = lerp_u8(80, 140, p);
            let base = Color::Rgb(r, g, b);
            let dim = Color::Rgb(
                lerp_u8(60, 140, p),
                lerp_u8(20, 50, p),
                lerp_u8(40, 80, p),
            );
            let (ch, c) = if is_full {
                ("█", base)
            } else if is_head {
                let partial = if frac > 0.66 {
                    "▓"
                } else if frac > 0.33 {
                    "▒"
                } else {
                    "░"
                };
                (partial, base)
            } else {
                ("░", dim)
            };
            spans.push(Span::styled(
                ch,
                Style::default().fg(c).add_modifier(Modifier::BOLD),
            ));
        } else if is_full {
            spans.push(Span::styled("█", Style::default().fg(Color::Rgb(0, 190, 210))));
        } else if is_head {
            let partial = if frac > 0.66 {
                "▓"
            } else if frac > 0.33 {
                "▒"
            } else {
                "░"
            };
            spans.push(Span::styled(
                partial,
                Style::default().fg(Color::Rgb(100, 210, 230)),
            ));
        } else {
            spans.push(Span::styled("─", Style::default().fg(Color::Rgb(40, 45, 50))));
        }
    }

    f.render_widget(Paragraph::new(Line::from(spans)), chunks[0]);

    let remaining = ((1.0 - ratio) * state.interval_secs as f64).max(0.0);
    f.render_widget(
        Paragraph::new(format!("{:.2}s", remaining))
            .style(Style::default().fg(Color::Rgb(160, 160, 160))),
        chunks[1],
    );
}
