// 在 main.rs 顶部引入
use cyber_forge::ui::{
    line1::{render_line_1, Line1State},
    line2::{render_line_2, Line2State},
    line3::{render_line_3, Line3State},
    line4::{render_line_4, Line4State},
};

// ... 在 terminal.draw 循环中：
let mut tick_counter: u64 = 0;

// 在循环内：
tick_counter = tick_counter.wrapping_add(1);

let state_read = futures::executor::block_on(shared_state.0.read());

// Line 1
render_line_1(f, chunks[0], &Line1State {
    current_strikes: state_read.strikes,
    max_strikes: state_read.max_strikes,
    level: state_read.level,
    current_exp: state_read.exp,
    max_exp: state_read.max_exp,
    coins: state_read.coins,
});

// Line 2
render_line_2(f, chunks[1], &Line2State {
    progress: state_read.strikes as f64 / state_read.max_strikes as f64,
    carbon_ratio: state_read.carbon_ratio,
    tick_count: tick_counter,
});

// Line 3
render_line_3(f, chunks[2], &Line3State {
    apprentices: state_read.apprentices,
    max_apprentices: state_read.max_apprentices,
    next_cost: state_read.get_next_apprentice_cost(),
    tick_count: tick_counter,
});

// Line 4
render_line_4(f, chunks[3], &Line4State {
    inventory: &state_read.inventory,
    max_inventory: state_read.max_inventory,
});
