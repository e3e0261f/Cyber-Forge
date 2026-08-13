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
            // 🌟 核心：计算矩阵总倍率 = 矩阵台数 × 单台并发数
            let stations = state.matrix_slots().max(1) as u64;
            let hammers = state.concurrent_hammers().max(1) as u64;
            let total_multiplier = stations * hammers; // 例如 5 * 7 = 35 倍！

            // 经验按总倍率暴增
            state.exp = state.exp.saturating_add(
                (sword.quality.bonus_exp() as f64 * state.exp_multiplier() * total_multiplier as f64).round() as u32
            );

            // 🌟 矩阵批量产出：一口气生成 35 把剑塞进背包！
            let mut produced_count = 0u64;
            for i in 0..total_multiplier {
                if state.backpack.len() < state.max_backpack {
                    let mut cloned_sword = sword.clone();
                    // 混淆 ID 避免冲突
                    cloned_sword.id ^= i.wrapping_mul(0x9e3779b97f4a7c15);
                    state.backpack.push(cloned_sword);
                    produced_count += 1;
                } else {
                    // 背包满了，触发提示并停止继续塞
                    break;
                }
            }
            state.sort_backpack();

            // 自动上架逻辑：如果开了自动上架，海量新剑会自动涌入藏宝阁拍卖
            if state.list_tier != AutoListTier::Off {
                state.auto_fill_market();
            }

            // 霸气的日志输出
            let total_price = sword.price * total_multiplier as u128;
            let log_msg = format!(
                "矩阵全开 [台×{}·并发×{}]：35脉齐鸣，一口气量产出炉 ×{} 柄 [{}]（总估价金{}）",
                stations, hammers, produced_count, sword.name, total_price
            );
            state.push_log(log_msg, produced_count >= 10, false);
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
