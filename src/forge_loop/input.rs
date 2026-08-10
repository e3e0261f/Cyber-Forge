use crossterm::event::KeyCode;
use crate::state::GameState;
use super::strike::do_strike;

pub fn handle_key_code(
    key_code: KeyCode,
    state: &mut GameState,
    show_help: &mut bool,
    show_quit_confirm: &mut bool,
    modal_ticks: &mut u32,
    in_crit: bool,
) -> bool {
    if state.active_sword_modal.is_some() {
        state.active_sword_modal = None;
        *modal_ticks = 0;
        return false;
    }

    if *show_quit_confirm {
        match key_code {
            KeyCode::Char('y') | KeyCode::Char('Y') => return true,
            KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                *show_quit_confirm = false;
            }
            _ => {}
        }
        return false;
    }

    if *show_help {
        match key_code {
            KeyCode::Char('h') | KeyCode::Char('H') | KeyCode::Esc => {
                *show_help = false;
            }
            _ => {}
        }
        return false;
    }

    match key_code {
        KeyCode::Char('h') | KeyCode::Char('H') => *show_help = true,
        KeyCode::Char('l') | KeyCode::Char('L') => state.toggle_log_filter(),
        // 藏宝阁单手金融兑换快捷键
        KeyCode::Char('i') => state.exchange_copper_to_gold(),
        KeyCode::Char('I') => state.exchange_gold_to_copper(),
        KeyCode::Char('o') => state.exchange_gold_to_jade(),
        KeyCode::Char('O') => state.exchange_jade_to_gold(),
        KeyCode::Char('b') | KeyCode::Char('B') => {
            if state.realm.manual_breakthrough() {
                let msg = format!("天道引劫：成功突破至 [{}]！", state.realm.realm.name());
                state.push_log(msg, true, true);
            }
        }
        KeyCode::PageUp => state.scroll_log_up(),
        KeyCode::PageDown => state.scroll_log_down(),
        KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => *show_quit_confirm = true,
        KeyCode::Char('u') | KeyCode::Char('U') => state.upgrade_hammer(),
        KeyCode::Char('a') | KeyCode::Char('A') => state.hire_apprentice(),
        KeyCode::Char('s') | KeyCode::Char('S') => state.melt_lowest_sword(),
        KeyCode::Char('d') | KeyCode::Char('D') => {
            let cost = state.get_backpack_upgrade_cost();
            if state.coins >= cost {
                state.coins -= cost;
                state.max_backpack += 2;
                let n = state.max_backpack;
                state.set_toast(format!("背包扩至 {} 格", n));
            } else { state.set_toast(format!("扩容需 金{}", cost)); }
        }
        KeyCode::Char('f') | KeyCode::Char('F') => state.list_top_sword_to_market(),
        KeyCode::Char('t') | KeyCode::Char('T') => state.toggle_auto_melt(),
        KeyCode::Char('g') | KeyCode::Char('G') => state.toggle_auto_list(),
        KeyCode::Char('w') | KeyCode::Char('W') => state.upgrade_bellows(),
        KeyCode::Char('e') | KeyCode::Char('E') => state.upgrade_pavilion(),
        KeyCode::Char('r') | KeyCode::Char('R') => state.upgrade_house(),
        KeyCode::Char('1') => state.reassign_workers(1),
        KeyCode::Char('2') => state.reassign_workers(2),
        KeyCode::Char('3') => state.reassign_workers(3),
        KeyCode::Char('4') => state.reassign_workers(4),
        KeyCode::Char('5') => state.reassign_workers(5),
        KeyCode::Char(' ') => do_strike(state, in_crit),
        _ => {}
    }
    false
}
