use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Paragraph},
    Frame,
};
use crate::numbers::format_compact_number;
use crate::types::{Element, Quality, Sword};

pub struct Line4State<'a> {
    pub backpack: &'a [Sword],
    pub max_backpack: usize,
    pub expand_cost: u128,
}

fn element_glyph(el: Element) -> &'static str {
    match el {
        Element::Gold => "[G]",
        Element::Wood => "[W]",
        Element::Water => "[A]", // Aqua
        Element::Fire => "[F]",
        Element::Earth => "[E]",
    }
}

fn quality_color(q: Quality) -> Color {
    q.color()
}

pub fn render_line_4(f: &mut Frame, area: Rect, state: &Line4State) {
    let outer_block = Block::default()
    .borders(Borders::ALL)
    .border_type(BorderType::Rounded)
    .border_style(Style::default().fg(Color::Rgb(60, 90, 100)))
    .title(format!(
        " 【矩阵背包】{}/{} ",
        state.backpack.len(),
                   state.max_backpack
    ));

    let inner = outer_block.inner(area);
    f.render_widget(outer_block, area);

    if inner.width < 4 || inner.height < 2 {
        return;
    }

    let cost = format_compact_number(state.expand_cost);
    let mut lines: Vec<Line> = Vec::new();

    // 顶行：操作简讯（极短，不抢矩阵）
    lines.push(Line::from(Span::styled(
        format!("[D]扩 [F]架 [S]熔 ·{}金", cost.trim()),
            Style::default().fg(Color::Rgb(90, 90, 90)),
    )));

    // 点阵：每格固定 3 字符宽 [G]，按行铺满
    let cell_w = 3u16;
    let cols = (inner.width / cell_w).max(1) as usize;

    // 核心修改：严格遵照实际背包上限，拒绝视觉膨胀。下方留黑代表未解锁的空间。
    let mut current_spans: Vec<Span> = Vec::with_capacity(cols);

    for i in 0..state.max_backpack {
        if i < state.backpack.len() {
            // 已有飞剑
            let sword = &state.backpack[i];
            let g = element_glyph(sword.element);
            let c = quality_color(sword.quality);
            current_spans.push(Span::styled(
                g,
                Style::default().fg(c).add_modifier(Modifier::BOLD),
            ));
        } else {
            // 已解锁但为空的可用插槽
            current_spans.push(Span::styled(
                "[·]",
                Style::default().fg(Color::Rgb(40, 40, 45)),
            ));
        }

        // 满列或到达容量末尾时，换行切断
        if (i + 1) % cols == 0 || i == state.max_backpack - 1 {
            lines.push(Line::from(current_spans.clone()));
            current_spans.clear();
        }
    }

    f.render_widget(Paragraph::new(lines), inner);
}
