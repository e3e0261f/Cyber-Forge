use std::time::Instant;
use rand::Rng;
use super::dao_origin::DaoOrigin;
use super::state::{GameState, AutoListTier};
use super::sword_gen::SwordGenerator;
use super::types::ForgeResult;

pub fn do_strike(state: &mut GameState, qte: bool, dao: &mut DaoOrigin) {
    let power = state.total_hammer_power() * state.concurrent_power_mul();
    let pulse = dao.on_strike_with_crit(qte, power);
    let hammers = state.concurrent_hammers().max(1) as f64;
    let progress_gain = power * pulse.progress_mul * hammers;

    if pulse.is_perfect {
        state.forge_qte_hits += power * hammers;
        state.sub_strikes += progress_gain;
        state.realm.add_cultivation((power.max(1.0).floor() as u128).saturating_mul(hammers as u128).saturating_add(state.core_cult_bonus()));
        state.trigger_flash();
    } else {
        state.sub_strikes += progress_gain;
    }

    dao.sync_perfect_from_state(state.forge_qte_hits);
    state.total_strikes_count = state.total_strikes_count.saturating_add((power * hammers) as u64);
    state.sync_body_stats();
    state.strikes = state.sub_strikes as u32;
    state.exp = state.exp.saturating_add((1.0 * state.exp_multiplier()).round().max(1.0) as u32);

    if state.sub_strikes < state.max_strikes as f64 {
        return;
    }

    state.sub_strikes = 0.0;
    state.strikes = 0;
    let qte_hits = state.forge_qte_hits;
    state.forge_qte_hits = 0.0;

    let verdict = dao.verdict_for_forge(state.max_strikes, state.bonus_god_rate);
    let passive = if qte_hits <= 0.0 { state.passive_qte_god_bonus() } else { 0.0 };
    let god = state.effective_god_rate(qte_hits) + verdict.drop_bonus * 0.5 + passive;
    let is_manual_qte = qte_hits > 0.0;
    let qi_bonus = (state.realm.body.qi_sense / 50) as u8;
    let fail = (verdict.fail_rate - state.spirit_fail_reduction() - state.core_fail_reduction()).max(0.01);
    let rank_boost = verdict.rank_boost + state.core_rank_boost();

    match SwordGenerator::generate(
        state.level,
        state.carbon_ratio,
        Instant::now().elapsed().as_nanos() as u64,
        state.apprentices,
        god,
        qte_hits as u32,
        state.max_strikes,
        qi_bonus,
        fail,
        rank_boost,
    ) {
        ForgeResult::Success(sword) => {
            state.exp = state.exp.saturating_add((sword.quality.bonus_exp() as f64 * state.exp_multiplier()).round() as u32);
            if sword.quality.is_masterwork_tier() && is_manual_qte {
                let cult_bonus = ((sword.price / 50_000).max(10)).min(200);
                state.realm.add_cultivation(cult_bonus);
                state.realm.masterwork_count = state.realm.masterwork_count.saturating_add(1);
                state.bonus_god_rate = (state.bonus_god_rate + 0.0005).min(0.33);
                let log_msg = format!(
                    "手动代表作：{} {}（估价金{}，修仙+{}）",
                    sword.quality.badge(), sword.name, sword.price, cult_bonus
                );
                state.push_log(log_msg, true, true);
                if state.backpack.len() < state.max_backpack {
                    state.backpack.push(sword.clone());
                    state.sort_backpack();
                    state.active_sword_modal = Some(sword);
                }
            } else if sword.quality.is_masterwork_tier() {
                let log_msg = format!("挂机极品：{} {}（估价金{}）", sword.quality.badge(), sword.name, sword.price);
                state.push_log(log_msg, true, false);
                if state.backpack.len() < state.max_backpack {
                    state.backpack.push(sword.clone());
                    state.sort_backpack();
                    if state.list_tier != AutoListTier::Off {
                        state.auto_fill_market();
                    }
                }
            } else {
                let log_msg = format!("出炉：{} {}（估价金{}）", sword.quality.badge(), sword.name, sword.price);
                state.push_log(log_msg, false, false);
                if state.backpack.len() < state.max_backpack {
                    state.backpack.push(sword.clone());
                    state.sort_backpack();
                    if state.list_tier != AutoListTier::Off {
                        state.auto_fill_market();
                    }
                }
            }
        }
        ForgeResult::Shattered { slag_gained } => {
            state.add_iron_slag(slag_gained);
            state.master_shattered_count += 1;
            state.sync_body_stats();
            let fail_reasons = [
                "力道失控：锤劲过猛，武器被当场敲断！",
                "淬火失误：冷水骤降，兵刃瞬间爆裂成碎铁！",
                "低温锻打：炉温不足强行挥锤，剑身崩出剧烈裂纹！",
                "退火失控：形制考虑不周，冷却后缩成一坨废铁！",
                "过烧氧化：炉火过旺，铁料烧蚀风化化为残渣！",
            ];
            let mut rng = rand::thread_rng();
            let ri = rng.gen_range(0..fail_reasons.len());
            let reason = fail_reasons[ri];
            state.push_log(format!("锻造失败：{} 碎铁+{}", reason, slag_gained), false, false);
        }
    }

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
