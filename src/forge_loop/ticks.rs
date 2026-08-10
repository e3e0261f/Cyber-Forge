use crate::state::GameState;

pub fn handle_periodic_ticks(state: &mut GameState, tick_counter: u64, modal_ticks: &mut u32) {
    if tick_counter % 1800 == 0 {
        state.save_to_disk();
    }

    state.tick_toast();
    state.tick_flash();
    state.tick_market_rumor();

    if state.active_sword_modal.is_some() {
        *modal_ticks += 1;
        if *modal_ticks >= 600 {
            state.active_sword_modal = None;
            *modal_ticks = 0;
        }
    } else {
        *modal_ticks = 0;
    }

    if state.encounter_timer > 0 {
        state.encounter_timer -= 1;
    } else {
        state.process_encounters();
    }

    // 每秒钟轮询执行 3 秒延时自动熔炼与自动上架
    if tick_counter % 62 == 0 {
        state.process_auto_melt();
        state.process_auto_list();
        state.process_apprentice_work();
        state.process_immortal_buyers();
    }
}
