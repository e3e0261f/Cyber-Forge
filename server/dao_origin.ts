// server/dao_origin.ts

export const CRIT_LO = 0.76;
export const CRIT_HI = 0.88;

export interface StrikePulse {
  is_perfect: boolean;
  progress_mul: number;
}

export interface ForgeVerdict {
  fail_rate: number;
  drop_bonus: number;
  rank_boost: number;
  all_perfect: boolean;
  perfect_hits: number;
}

export class DaoOrigin {
  public cycle_start: number;
  public perfect_hits: number;
  public strike_count: number;

  constructor() {
    this.cycle_start = Date.now();
    this.perfect_hits = 0;
    this.strike_count = 0;
  }

  public reset_cycle(): void {
    this.cycle_start = Date.now();
  }

  public reset_sword(): void {
    this.perfect_hits = 0;
    this.strike_count = 0;
    this.reset_cycle();
  }

  public progress(intervalSecs: number): number {
    const secs = Math.max(0.001, intervalSecs);
    const elapsedSecs = (Date.now() - this.cycle_start) / 1000.0;
    return Math.min(1.0, elapsedSecs / secs);
  }

  public in_crit_window(intervalSecs: number): boolean {
    const p = this.progress(intervalSecs);
    return p >= CRIT_LO && p < CRIT_HI;
  }

  public on_strike_with_crit(in_crit: boolean, power: number): StrikePulse {
    this.strike_count += 1;
    if (in_crit) {
      this.perfect_hits += power;
      return {
        is_perfect: true,
        progress_mul: 2.0,
      };
    } else {
      return {
        is_perfect: false,
        progress_mul: 1.0,
      };
    }
  }

  public verdict_for_forge(max_strikes: number, _base_god_rate: number): ForgeVerdict {
    const hits = this.perfect_hits;
    const hits_u = Math.floor(hits);
    const all_perfect = max_strikes > 0 && hits >= max_strikes;

    let fail_rate: number;
    if (all_perfect) {
      fail_rate = 0.0;
    } else if (hits_u >= 60) {
      fail_rate = 0.01;
    } else if (hits_u >= 50) {
      fail_rate = 0.02;
    } else if (hits_u >= 40) {
      fail_rate = 0.05;
    } else if (hits_u > 30) {
      fail_rate = 0.1;
    } else {
      fail_rate = 0.28;
    }

    const drop_bonus = Math.min(0.6, hits * 0.02);
    const rank_boost = Math.min(30, hits_u);

    return {
      fail_rate,
      drop_bonus,
      rank_boost,
      all_perfect,
      perfect_hits: hits,
    };
  }

  public sync_perfect_from_state(hits: number): void {
    this.perfect_hits = hits;
  }
}
