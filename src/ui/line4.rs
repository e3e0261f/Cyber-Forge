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
}

fn quality_color(q: Quality) -> Color {
    q.color()
}

pub fn render_line_4(f: &mut Frame, area: Rect, state: &Line4State) {
    let cost = format_compact_number(state.expand_cost);

    // 将扩容按键 [D] 与金钱费用直接融入标题栏
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(60, 90, 100)))
    .title(format!(
        " 【矩阵背包】{}/{} [D]扩(金{}) ",
                   state.backpack.len(),
                   state.max_backpack,
                   cost.trim()
    ));

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    if inner.width < 4 || inner.height < 2 {
        return;
    }

    let mut lines: Vec<Line> = Vec::new();

    // 内部顶行：精简操作提示
    lines.push(Line::from(Span::styled(
        "[F]架最贵 [S]熔最低",
        Style::default().fg(Color::Rgb(120, 120, 120)),
    )));

    // 点阵：每格固定 4 字符宽 [剑]，全角绝对对齐
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
