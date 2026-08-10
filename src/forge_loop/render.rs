use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    Terminal,
};
use std::io;
use crate::state::GameState;
use crate::ui::{
    help::{render_help_modal, render_quit_confirm},
    line1::{render_line_1, Line1State},
    line2::{render_line_2, Line2State},
    line3::{render_line_3, Line3State},
    line4::{render_line_4, Line4State},
    line5::{render_line_5, Line5State},
    line6::{render_line_6, Line6State},
    line7::{render_line_7, Line7State},
    line8::{render_line_8, Line8State},
    modal::{render_hover_detail, render_sword_modal},
};

pub fn render_frame(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    state: &GameState,
    progress: f64,
    tick_counter: u64,
    in_crit: bool,
    modal_ticks: u32,
    hover_idx: Option<usize>,
    show_help: bool,
    show_quit_confirm: bool,
) -> io::Result<()> {
    let l1_data = Line1State { level: state.level, current_exp: state.exp, max_exp: state.max_exp, coins: state.coins };
    let l2_data = Line2State {
        progress, tick_count: tick_counter,
        interval_secs: state.natural_interval_ticks as f32 / 10.0,
        show_crit_window: true, in_crit_zone: in_crit,
        current_strikes: state.strikes, max_strikes: state.max_strikes,
        qte_hits: state.forge_qte_hits, qte_bonus_pct: state.forge_qte_hits as f64 * 2.0,
        is_flashing: state.flash_ticks > 0,
        hammer_name: state.hammer_name(),
        hammer_level: state.hammer_level,
        hammer_power: state.hammer_power(),
        total_power: state.total_hammer_power(),
        physique_stat: state.realm.body.physique,
        hammer_cost: state.get_hammer_upgrade_cost(),
    };
    let l3_data = Line3State {
        apprentices: state.apprentices, max_apprentices: state.max_apprentices,
        sharpen_workers: state.sharpen_workers, enchant_workers: state.enchant_workers,
        repair_workers: state.repair_workers, forge_workers: state.forge_workers,
        auction_workers: state.auction_workers,
        next_cost: state.get_next_apprentice_cost(), house_cost: state.get_house_upgrade_cost(),
    };
    let l6_data = Line6State {
        realm_name: state.realm.realm.name(), sub_level: state.realm.sub_level,
        title: state.realm.title(), cultivation_exp: state.realm.cultivation_exp,
        masterworks: state.realm.masterwork_count, god_rate: state.bonus_god_rate,
        iron_slag: state.iron_slag, body: state.realm.body.clone(),
        realm_idx: state.realm.realm as u32,
    };
    let l7_data = Line7State {
        melt_tier_name: state.melt_tier.name(),
        melt_tier_color: state.melt_tier.color(),
        list_tier_name: state.list_tier.name(),
        list_tier_color: state.list_tier.color(),
        pending_breakthrough: state.realm.pending_breakthrough,
        market_news: &state.market_news,
    };

    let backpack_data = state.backpack.clone();
    let max_bp = state.max_backpack;
    let bp_cost = state.get_backpack_upgrade_cost();
    let pavilion_data = state.pavilion_market.clone();
    let max_pav = state.max_pavilion;
    let pav_cost = state.get_pavilion_upgrade_cost();
    let active_modal = state.active_sword_modal.clone();
    let log_data = state.logs.iter().cloned().collect::<Vec<String>>();
    let log_filter_name = state.log_filter.name();
    let log_scroll_offset = state.log_scroll_offset;

    terminal.draw(|f| {
        let size = f.size();
        let root = Layout::default().direction(Direction::Vertical).constraints([Constraint::Min(3), Constraint::Length(1)]).split(size);
        let columns = Layout::default().direction(Direction::Horizontal).constraints([Constraint::Percentage(22), Constraint::Percentage(50), Constraint::Percentage(28)]).split(root[0]);
        let middle = Layout::default().direction(Direction::Vertical).constraints([Constraint::Length(3), Constraint::Length(3), Constraint::Length(3), Constraint::Length(11), Constraint::Min(5)]).split(columns[1]);

        render_line_4(f, columns[0], &Line4State {
            backpack: &backpack_data,
            max_backpack: max_bp,
            expand_cost: bp_cost,
            copper: state.copper,
            coins: state.coins,
            jade: state.jade,
        });

        render_line_1(f, middle[0], &l1_data);
        render_line_2(f, middle[1], &l2_data);
        render_line_3(f, middle[2], &l3_data);
        render_line_6(f, middle[3], &l6_data);
        render_line_8(f, middle[4], &Line8State { logs: &log_data, filter_name: log_filter_name, scroll_offset: log_scroll_offset });

        render_line_5(f, columns[2], &Line5State {
            pavilion: &pavilion_data,
            max_pavilion: max_pav,
            expand_cost: pav_cost,
            spirit_stat: state.realm.body.spirit,
            auction_workers: state.auction_workers,
        });
        render_line_7(f, root[1], &l7_data);

        if let Some(ref sword) = active_modal {
            let remaining_secs = (600u32.saturating_sub(modal_ticks) + 59) / 60;
            render_sword_modal(f, size, sword, remaining_secs);
        } else if let Some(idx) = hover_idx {
            if let Some(sword) = backpack_data.get(idx) {
                render_hover_detail(f, size, sword);
            }
        }
        if show_help { render_help_modal(f, size); }
        if show_quit_confirm { render_quit_confirm(f, size); }
    })?;
    Ok(())
}
