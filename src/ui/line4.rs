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
    let rows_avail = inner.height.saturating_sub(1) as usize;

    // 槽位总数：至少 max_backpack，铺满可视格
    let slots = state.max_backpack.max(cols * rows_avail.min(32));
    let mut cells: Vec<Option<&Sword>> = state.backpack.iter().map(Some).collect();
    while cells.len() < slots {
        cells.push(None);
    }

    let max_cells = cols * rows_avail;
    let cells = &cells[..cells.len().min(max_cells)];

    for row in 0..rows_avail {
        let start = row * cols;
        if start >= cells.len() {
            break;
        }
        let end = (start + cols).min(cells.len());
        let mut spans: Vec<Span> = Vec::with_capacity(cols);
        for slot in &cells[start..end] {
            match slot {
                Some(sword) => {
                    let g = element_glyph(sword.element);
                    let c = quality_color(sword.quality);
                    spans.push(Span::styled(
                        g,
                        Style::default().fg(c).add_modifier(Modifier::BOLD),
                    ));
                }
                None => {
                    spans.push(Span::styled(
                        "[·]",
                        Style::default().fg(Color::Rgb(40, 40, 45)),
                    ));
                }
            }
        }
        lines.push(Line::from(spans));
    }

    f.render_widget(Paragraph::new(lines), inner);
}
