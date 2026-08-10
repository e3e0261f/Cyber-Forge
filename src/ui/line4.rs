use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::types::{Quality, Sword};

pub struct Line4State<'a> {
    pub backpack: &'a [Sword],
    pub max_backpack: usize,
    pub expand_cost: u128,
    pub copper: u128,
    pub coins: u128,
    pub jade: u128,
}

fn quality_color(q: Quality) -> Color {
    q.color()
}

pub fn render_line_4(f: &mut Frame, area: Rect, state: &Line4State) {
    let cost = format_compact_number(state.expand_cost);

    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(60, 90, 100)))
    .title(format!(
        " 【矩阵锦囊】{}/{} [D]扩(金{}) ",
                   state.backpack.len(),
                   state.max_backpack,
                   cost.trim()
    ));

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    if inner.width < 4 || inner.height < 3 {
        return;
    }

    let mut lines: Vec<Line> = Vec::new();

    // 1. 顶行：快捷功能指引
    lines.push(Line::from(Span::styled(
        "[F]架最贵 [S]熔最低",
        Style::default().fg(Color::Rgb(120, 120, 120)),
    )));

    // 2. 三体资产仪表盘（铜钱 │ 金币 │ 仙玉）
    let copper_str = format_compact_number(state.copper);
    let coins_str = format_compact_number(state.coins);
    let jade_str = format_compact_number(state.jade);

    lines.push(Line::from(vec![
        Span::styled(format!("铜钱:{}", copper_str.trim()), Style::default().fg(Color::Rgb(200, 150, 100))),
                          Span::styled(" │ ", Style::default().fg(Color::Rgb(80, 80, 80))),
                          Span::styled(format!("金币:{}", coins_str.trim()), Style::default().fg(Color::Rgb(255, 215, 0))),
                          Span::styled(" │ ", Style::default().fg(Color::Rgb(80, 80, 80))),
                          Span::styled(format!("仙玉:{}", jade_str.trim()), Style::default().fg(Color::Rgb(0, 255, 200))),
    ]));

    // 3. 矩阵点阵：全角 [剑][刀][具][件][物] 绝对对齐
    let cell_w = 4u16;
    let cols = (inner.width / cell_w).max(1) as usize;

    let mut current_spans: Vec<Span> = Vec::with_capacity(cols);

    for i in 0..state.max_backpack {
        if i < state.backpack.len() {
            let sword = &state.backpack[i];
            let g = sword.category_glyph();
            let c = quality_color(sword.quality);
            current_spans.push(Span::styled(
                g,
                Style::default().fg(c).add_modifier(Modifier::BOLD),
            ));
        } else {
            current_spans.push(Span::styled(
                "[空]",
                Style::default().fg(Color::Rgb(40, 40, 45)),
            ));
        }

        if (i + 1) % cols == 0 || i == state.max_backpack - 1 {
            lines.push(Line::from(current_spans.clone()));
            current_spans.clear();
        }
    }

    f.render_widget(Paragraph::new(lines), inner);
}
