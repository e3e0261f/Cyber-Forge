// server/market_swarm.ts

export type AgentPhase = 'Outside' | 'Browsing' | 'Bidding' | 'Leaving';

export interface CultivatorAgent {
  id: number;
  title: string;
  realm_hint: number;
  wealth: number;
  element_pref: number;
  patience: number;
  aggression: number;
  impulse: number;
  phase: AgentPhase;
  focus_lot: number | null;
  ticks_in_phase: number;
}

export class MarketSwarm {
  public agents: CultivatorAgent[] = [];
  public next_id: number = 1;
  public present: number = 0;
  public browsing: number = 0;
  public bidding: number = 0;

  public static spawnAgent(id: number): CultivatorAgent {
    const roll = Math.random();
    let title: string;
    let realm_hint: number;
    let wealth: number;
    let aggression: number;
    let impulse: number;

    if (roll < 0.45) {
      title = '过路散修';
      realm_hint = 0;
      wealth = 0.3 + Math.random() * 0.5;
      aggression = 0.2 + Math.random() * 0.3;
      impulse = 0.05 + Math.random() * 0.1;
    } else if (roll < 0.75) {
      title = '宗门执事';
      realm_hint = 1;
      wealth = 0.8 + Math.random() * 0.6;
      aggression = 0.4 + Math.random() * 0.3;
      impulse = 0.08 + Math.random() * 0.12;
    } else if (roll < 0.92) {
      title = '富商修士';
      realm_hint = 2;
      wealth = 1.4 + Math.random() * 0.8;
      aggression = 0.5 + Math.random() * 0.35;
      impulse = 0.1 + Math.random() * 0.2;
    } else {
      title = '合体老怪';
      realm_hint = 3;
      wealth = 2.5 + Math.random() * 2.5;
      aggression = 0.7 + Math.random() * 0.5;
      impulse = 0.2 + Math.random() * 0.3;
    }

    return {
      id,
      title,
      realm_hint,
      wealth,
      element_pref: Math.floor(Math.random() * 5),
      patience: 20 + Math.random() * 60,
      aggression,
      impulse,
      phase: 'Outside',
      focus_lot: null,
      ticks_in_phase: 0,
    };
  }

  public ensure_population(target: number = 24): void {
    while (this.agents.length < target) {
      const id = this.next_id++;
      this.agents.push(MarketSwarm.spawnAgent(id));
    }
  }

  public step(
    activeLots: number,
    hype: number,
    traffic: number
  ): Array<{ lot_idx: number; title: string; element_pref: number; impulsive: boolean }> {
    this.ensure_population(24);
    const bids: Array<{ lot_idx: number; title: string; element_pref: number; impulsive: boolean }> = [];
    this.present = 0;
    this.browsing = 0;
    this.bidding = 0;

    for (const a of this.agents) {
      a.ticks_in_phase += 1;
      switch (a.phase) {
        case 'Outside': {
          const enterP = Math.max(0.01, Math.min(0.25, 0.02 + traffic * 0.04 + hype * 0.03));
          if (activeLots > 0 && Math.random() < enterP) {
            a.phase = 'Browsing';
            a.ticks_in_phase = 0;
            a.focus_lot = Math.floor(Math.random() * activeLots);
          }
          break;
        }
        case 'Browsing': {
          this.present += 1;
          this.browsing += 1;
          if (a.ticks_in_phase > a.patience) {
            a.phase = 'Leaving';
            a.ticks_in_phase = 0;
            continue;
          }
          const bidP = Math.max(0.02, Math.min(0.45, a.aggression * 0.15 * (1.0 + hype)));
          if (a.focus_lot !== null && Math.random() < bidP) {
            a.phase = 'Bidding';
            a.ticks_in_phase = 0;
          }
          break;
        }
        case 'Bidding': {
          this.present += 1;
          this.bidding += 1;
          if (a.focus_lot !== null && a.focus_lot < activeLots) {
            const impulsive = Math.random() < Math.max(0.01, Math.min(0.5, a.impulse));
            bids.push({
              lot_idx: a.focus_lot,
              title: a.title,
              element_pref: a.element_pref,
              impulsive,
            });
          }
          a.phase = Math.random() < 0.35 ? 'Leaving' : 'Browsing';
          a.ticks_in_phase = 0;
          break;
        }
        case 'Leaving': {
          if (a.ticks_in_phase > 3) {
            a.phase = 'Outside';
            a.focus_lot = null;
            a.ticks_in_phase = 0;
          }
          break;
        }
      }
    }

    return bids;
  }
}
