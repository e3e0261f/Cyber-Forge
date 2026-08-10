use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;

pub struct Line2State<'a> {
    pub progress: f64,
    pub tick_count: u64,
    pub interval_secs: f32,
    pub show_crit_window: bool,
    pub in_crit_zone: bool,
    pub current_strikes: u32,
    pub max_strikes: u32,
    pub qte_hits: f64,
    pub qte_bonus_pct: f64,
    pub is_flashing: bool,
    pub hammer_name: &'a str,
    pub hammer_level: u32,
    pub hammer_power: f64,
    pub total_power: f64,
    pub physique_stat: u64,
    pub hammer_cost: u128,
}

pub fn render_line_2(f: &mut Frame, area: Rect, state: &Line2State) {
    let strike = format!("{}/{}", state.current_strikes, state.max_strikes);
    let cost = format_compact_number(state.hammer_cost);

    // 百分比拆算：重锤基础% + 体魄百分比
    let level_boost_pct = (state.hammer_power * 100.0) as u32;
    let physique_boost_pct = state.physique_stat as f64 / 10.0;
    let total_boost_pct = state.total_power * 100.0;

    // 精确显示：锤加成 1056.7% [重锤+800% 体魄+256.7%]
    let title = format!(
        " 【锻造台】{} (Lv.{} · 锤加成 {:.1}% [重锤+{}% 体魄+{:.1}%]) [U]升(金{}) ",
                        state.hammer_name,
                        state.hammer_level,
                        total_boost_pct,
                        level_boost_pct,
                        physique_boost_pct,
                        cost.trim()
    );

    let border_color = if state.is_flashing {
        Color::Rgb(0, 255, 127)
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
    .constraints([Constraint::Min(8), Constraint::Length(12)])
    .split(inner_area);

    let ratio = state.progress.clamp(0.0, 1.0);
    let w = chunks[0].width.max(1) as usize;
    let pos = ratio * w as f64;
    let filled = pos.floor() as usize;
    let frac = pos - filled as f64;

    let (crit_lo, crit_hi) = if state.show_crit_window {
        let mut lo = ((0.76 * w as f64).floor() as usize).min(w);
        let mut hi = ((0.88 * w as f64).ceil() as usize).min(w);
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

    let mut spans = Vec::with_capacity(w);

    for i in 0..w {
        let in_crit_band = state.show_crit_window && i >= crit_lo && i < crit_hi;
        let is_full = i < filled;
        let is_head = i == filled && filled < w;

        if state.is_flashing {
            spans.push(Span::styled("█", Style::default().fg(Color::Rgb(0, 255, 127))));
        } else if in_crit_band {
            let (ch, c) = if is_full {
                ("█", Color::Rgb(220, 80, 160))
            } else if is_head {
                let partial = if frac > 0.66 { "▓" } else if frac > 0.33 { "▒" } else { "░" };
                (partial, Color::Rgb(220, 80, 160))
            } else {
                ("░", Color::Rgb(100, 40, 80))
            };
            spans.push(Span::styled(ch, Style::default().fg(c)));
        } else if is_full {
            spans.push(Span::styled("█", Style::default().fg(Color::Rgb(0, 190, 210))));
        } else if is_head {
            let partial = if frac > 0.66 { "▓" } else if frac > 0.33 { "▒" } else { "░" };
            spans.push(Span::styled(partial, Style::default().fg(Color::Rgb(100, 210, 230))));
        } else {
            spans.push(Span::styled("─", Style::default().fg(Color::Rgb(40, 45, 50))));
        }
    }

    f.render_widget(Paragraph::new(Line::from(spans)), chunks[0]);

    let remaining = ((1.0 - ratio) * state.interval_secs as f64).max(0.0);
    f.render_widget(
        Paragraph::new(format!("{} {:.1}s", strike, remaining))
        .style(Style::default().fg(Color::Rgb(160, 160, 160))),
                    chunks[1],
    );
}
