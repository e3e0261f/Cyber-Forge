//! 天道本源：击键、读条、完美与出剑判定的唯一解释权。
//! 不负责 UI、货币兑换(iIoO)、拍场键位。

use std::time::Instant;

/// 关键帧窗口（读条进度比例）
pub const CRIT_LO: f64 = 0.76;
pub const CRIT_HI: f64 = 0.88;

/// 一次击锤的天道宣判（给 strike 用）
#[derive(Debug, Clone, Copy)]
pub struct StrikePulse {
    pub is_perfect: bool,
    /// 写入进度的倍率（完美 2.0，普通 1.0）
    pub progress_mul: f64,
}

/// 出剑前的天道宣判（给 SwordGenerator 用）
#[derive(Debug, Clone, Copy)]
pub struct ForgeVerdict {
    pub fail_rate: f64,
    pub drop_bonus: f64,
    pub rank_boost: u32,
    pub all_perfect: bool,
    pub perfect_hits: f64,
}

/// 天道本源：本轮读条 + 本剑熵
#[derive(Debug, Clone)]
pub struct DaoOrigin {
    pub cycle_start: Instant,
    /// 本剑完美累计（可与 GameState.forge_qte_hits 同步）
    pub perfect_hits: f64,
    pub strike_count: u32,
}

impl Default for DaoOrigin {
    fn default() -> Self {
        Self::new()
    }
}

impl DaoOrigin {
    pub fn new() -> Self {
        Self {
            cycle_start: Instant::now(),
            perfect_hits: 0.0,
            strike_count: 0,
        }
    }

    pub fn reset_cycle(&mut self) {
        self.cycle_start = Instant::now();
    }

    pub fn reset_sword(&mut self) {
        self.perfect_hits = 0.0;
        self.strike_count = 0;
        self.reset_cycle();
    }

    /// 当前读条进度 0~1
    pub fn progress(&self, interval_secs: f64) -> f64 {
        let secs = interval_secs.max(0.001);
        (self.cycle_start.elapsed().as_secs_f64() / secs).min(1.0)
    }

    pub fn in_crit_window(&self, interval_secs: f64) -> bool {
        let p = self.progress(interval_secs);
        p >= CRIT_LO && p < CRIT_HI
    }

    /// 手动空格或挂机满条
    pub fn on_strike(&mut self, manual: bool, power: f64) -> StrikePulse {
        let interval_guess = 1.0; // 仅用于帧内判定时由外部传入更准；保留 API
        let _ = interval_guess;
        self.strike_count = self.strike_count.saturating_add(1);

        if manual {
            // 帧内判定由调用方传入 is_perfect 更清晰——见 on_strike_crit
        }
        let _ = power;
        StrikePulse {
            is_perfect: false,
            progress_mul: 1.0,
        }
    }

    /// 推荐：调用方已算好是否帧内
    pub fn on_strike_with_crit(&mut self, in_crit: bool, power: f64) -> StrikePulse {
        self.strike_count = self.strike_count.saturating_add(1);
        if in_crit {
            self.perfect_hits += power;
            StrikePulse {
                is_perfect: true,
                progress_mul: 2.0,
            }
        } else {
            StrikePulse {
                is_perfect: false,
                progress_mul: 1.0,
            }
        }
    }

    /// 出剑结算：失败率 / 掉宝 / 品阶
    pub fn verdict_for_forge(&self, max_strikes: u32, base_god_rate: f64) -> ForgeVerdict {
        let hits = self.perfect_hits;
        let hits_u = hits.floor() as u32;
        let all_perfect = max_strikes > 0 && hits >= max_strikes as f64;

        let fail_rate = if all_perfect {
            0.0
        } else if hits_u >= 60 {
            0.01
        } else if hits_u >= 50 {
            0.02
        } else if hits_u >= 40 {
            0.05
        } else if hits_u > 30 {
            0.10
        } else {
            0.28
        };

        // 每次完美按威力折合：约 +2% 掉宝（与基线一致）
        let drop_bonus = (hits * 0.02).min(0.60);
        let rank_boost = hits_u.min(30);

        let _ = base_god_rate; // 合成在 state.effective_god_rate

        ForgeVerdict {
            fail_rate,
            drop_bonus,
            rank_boost,
            all_perfect,
            perfect_hits: hits,
        }
    }

    /// 与 state.forge_qte_hits 对齐时用
    pub fn sync_perfect_from_state(&mut self, hits: f64) {
        self.perfect_hits = hits;
    }
}
