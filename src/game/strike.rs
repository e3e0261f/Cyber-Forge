use super::dao_origin::DaoOrigin;
use super::state::{AutoListTier, GameState};
use super::sword_gen::SwordGenerator;
use super::types::ForgeResult;
use rand::Rng;
use std::time::Instant;

pub fn do_strike(state: &mut GameState, qte: bool, dao: &mut DaoOrigin) {
    let power = state.total_hammer_power() * state.concurrent_power_mul();
    let pulse = dao.on_strike_with_crit(qte, power);

    // 🌟 1. 恢复主进度条的正常推进（这样大进度条和倒计时就能动了！）
    let progress_gain = power * pulse.progress_mul;
    let cult = (power.max(1.0).floor() as u128)
        .saturating_mul(state.core_cult_bonus())
        .max(1);
    if pulse.is_perfect {
        state.forge_qte_hits += power;
        state.sub_strikes += progress_gain;
        // 完美 QTE：全额修为
        state.realm.add_cultivation(cult);
        state.trigger_flash();
    } else {
        state.sub_strikes += progress_gain;
        // 普通锤：也给修为（1/4），避免卡在 10 层后完全不动
        state.realm.add_cultivation((cult / 4).max(1));
    }

    dao.sync_perfect_from_state(state.forge_qte_hits);
    state.total_strikes_count = state.total_strikes_count.saturating_add(power as u64);
    state.sync_body_stats();
    state.strikes = state.sub_strikes as u32;
    state.exp = state
        .exp
        .saturating_add((1.0 * state.exp_multiplier()).round().max(1.0) as u32);

    // 🌟 2. 多轨道独立矩阵流水线结算逻辑
    let stations = state.matrix_slots().max(1) as usize;
    let hammers = state.concurrent_hammers().max(1) as usize;
    let total_tracks = stations * hammers;

    if state.matrix_progresses.len() < total_tracks {
        state.matrix_progresses.resize(total_tracks, 0.0);
    }

    // 每一锤会让所有激活的轨道各自大幅推进
    for i in 0..total_tracks {
        let track_gain = 0.25 + ((i as f64 * 0.05) % 0.15); // 每锤推进 25% 左右
        state.matrix_progresses[i] += track_gain;

        // 如果某一条轨道独立跑满了 (>= 1.0)
        if state.matrix_progresses[i] >= 1.0 {
            state.matrix_progresses[i] -= 1.0; // 扣除满额，重新蓄力

            let verdict = dao.verdict_for_forge(state.max_strikes, state.bonus_god_rate);
            let qi_bonus = (state.realm.body.qi_sense / 50) as u8;

            match SwordGenerator::generate(
                state.level,
                state.carbon_ratio,
                Instant::now().elapsed().as_nanos() as u64 ^ (i as u64),
                state.apprentices,
                state.effective_god_rate(0.0),
                0,
                state.max_strikes,
                qi_bonus,
                verdict.fail_rate,
                verdict.rank_boost,
            ) {
                ForgeResult::Success(sword) => {
                    let st_id = (i / hammers) + 1;
                    let hm_id = (i % hammers) + 1;
                    let log_msg = format!(
                        "流水线 [台{}-轨{}] 出炉：[{}]（估价金{}）",
                        st_id, hm_id, sword.name, sword.price
                    );
                    state.push_log(log_msg, sword.quality.rank() >= 36, false);

                    if state.backpack.len() < state.max_backpack {
                        state.backpack.push(sword);
                        state.sort_backpack();
                        if state.list_tier != AutoListTier::Off {
                            state.auto_fill_market();
                        }
                    }
                }
                ForgeResult::Shattered { slag_gained } => {
                    state.add_iron_slag(slag_gained);
                    let st_id = (i / hammers) + 1;
                    let hm_id = (i % hammers) + 1;
                    state.push_log(
                        format!(
                            "流水线 [台{}-轨{}] 炸炉：碎铁 +{}",
                            st_id, hm_id, slag_gained
                        ),
                        false,
                        false,
                    );
                }
            }
        }
    }

    // 🌟 3. 主锻造台满条常规结算
    if state.sub_strikes < state.max_strikes as f64 {
        return;
    }

    state.sub_strikes = 0.0;
    state.strikes = 0;
    state.forge_qte_hits = 0.0;
    dao.reset_sword();

    if state.exp >= state.max_exp {
        state.level += 1;
        state.exp -= state.max_exp;
        state.max_exp = (5000.0 * 1.25f64.powi(state.level as i32)) as u32;
        state.update_max_strikes();
        let log_msg = format!("作坊突破：升级至 Lv.{}", state.level);
        state.set_toast(&log_msg);
        state.push_log(log_msg, true, false);
    }
}
