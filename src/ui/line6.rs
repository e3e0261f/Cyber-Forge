use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::realm::BodyStats;

pub struct Line6State {
    pub realm_name: String,
    pub sub_level: u32,
    pub title: String,
    pub cultivation_exp: u128,
    pub masterworks: u32,
    pub god_rate: f64,
    pub iron_slag: u32,
    pub body: BodyStats,
    pub realm_idx: u32,
}

/// 十二境专属边框色（满屏一眼定境界）
fn realm_border_color(idx: u32) -> Color {
    match idx {
        1 => Color::Rgb(140, 120, 90),   // 炼体 凡铁褐
        2 => Color::Rgb(70, 160, 200),   // 炼气 引气青
        3 => Color::Rgb(120, 100, 220),  // 练神 识海紫
        4 => Color::Rgb(220, 180, 40),   // 金丹 内核金
        5 => Color::Rgb(80, 220, 180),   // 元婴 数字青
        6 => Color::Rgb(160, 80, 255),   // 化神 量子紫
        7 => Color::Rgb(0, 200, 160),    // 合体 矩阵翠
        8 => Color::Rgb(255, 100, 60),   // 大乘 雷劫橙
        9 => Color::Rgb(255, 215, 0),    // 仙人 专属金
        10 => Color::Rgb(255, 255, 255), // 圣人 白
        11 => Color::Rgb(100, 220, 255), // 天道 宙蓝
        _ => Color::Rgb(255, 40, 120),  // 至尊 熵红
    }
}

fn dim() -> Style {
    Style::default().fg(Color::Rgb(110, 110, 110))
}
fn normal() -> Style {
    Style::default().fg(Color::Rgb(180, 180, 180))
}
fn active() -> Style {
    Style::default()
        .fg(Color::Rgb(160, 220, 180))
        .add_modifier(Modifier::BOLD)
}
fn head() -> Style {
    Style::default().fg(Color::Rgb(200, 200, 160))
}

fn sty(idx: u32, current: u32) -> Style {
    if idx == current {
        active()
    } else if idx < current {
        normal()
    } else {
        dim()
    }
}

pub fn render_line_6(f: &mut Frame, area: Rect, state: &Line6State) {
    let border_c = realm_border_color(state.realm_idx);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(border_c))
        .title(format!(
            " 【身体素质】{} {}层 ",
            state.realm_name, state.sub_level
        ));

    let inner = block.inner(area);
    f.render_widget(block, area);

    let b = &state.body;
    let cult = format_compact_number(state.cultivation_exp);
    let cur = state.realm_idx;

    let lines = vec![
        Line::from(vec![Span::styled(
            format!(
                "{} │ 修仙经验 {} │ 代表作 {} │ 碎铁 {} │ 机缘 {:.2}%/33%",
                state.title,
                cult.trim(),
                state.masterworks,
                state.iron_slag,
                state.god_rate * 100.0
            ),
            head(),
        )]),
        Line::from(vec![Span::styled(
            format!("炼体 体魄:{}", b.physique),
            sty(1, cur),
        )]),
        Line::from(vec![Span::styled(
            format!("炼气 气感:{}", b.qi_sense),
            sty(2, cur),
        )]),
        Line::from(vec![Span::styled(
            format!("练神 精神力:{}", b.spirit),
            sty(3, cur),
        )]),
        Line::from(vec![Span::styled(
            format!(
                "金丹 个数:{} 大小:{} 凝炼:{}",
                b.core_count, b.core_size, b.core_refine
            ),
            sty(4, cur),
        )]),
        Line::from(vec![Span::styled(
            format!(
                "元婴 大小:{} 个数:{} 强度:{}",
                b.infant_size, b.infant_count, b.infant_power
            ),
            sty(5, cur),
        )]),
        Line::from(vec![Span::styled(
            format!("化神 气机:{} 矩阵:{}", b.qi_machine, b.matrix),
            sty(6, cur),
        )]),
        Line::from(vec![Span::styled(
            format!("合体 法则碎片:{} 反重力:{}", b.law_shards, b.anti_gravity),
            sty(7, cur),
        )]),
        Line::from(vec![Span::styled(
            format!("大乘 雷劫:{} 因果律:{}", b.tribulation, b.causality),
            sty(8, cur),
        )]),
        Line::from(vec![Span::styled(
            format!(
                "仙人 法则:{} │ 圣人 因果:{} │ 天道 热力:{} │ 至尊 熵增:{}",
                b.law_control, b.causal_mastery, b.thermo, b.entropy_switch
            ),
            sty(9, cur),
        )]),
    ];

    f.render_widget(Paragraph::new(lines), inner);
}
