// server/realm.ts

import { BodyStats, Realm, REALM_NAMES } from './types';
import { TitleSystem } from './titles';

export function createDefaultBodyStats(): BodyStats {
  return {
    physique: 1n,
    qi_sense: 0n,
    spirit: 0n,
    core_count: 0,
    core_size: 0n,
    core_refine: 0,
    infant_size: 0n,
    infant_count: 0,
    infant_power: 0n,
    qi_machine: 0n,
    matrix: 0n,
    law_shards: 0,
    anti_gravity: 0n,
    tribulation: 0n,
    causality: 0n,
    law_control: 0n,
    causal_mastery: 0n,
    thermo: 0n,
    entropy_switch: 0n,
  };
}

export class RealmState {
  public realm: Realm;
  public sub_level: number;
  public cultivation_exp: bigint;
  public realm_exp: bigint;
  public body: BodyStats;
  public masterwork_count: number;
  public pending_breakthrough: boolean;
  public max_total_level: number;

  constructor() {
    this.realm = Realm.BodyRefining;
    this.sub_level = 1;
    this.cultivation_exp = 0n;
    this.realm_exp = 0n;
    this.body = createDefaultBodyStats();
    this.masterwork_count = 0;
    this.pending_breakthrough = false;
    this.max_total_level = 1;
  }

  public total_level(): number {
    const layer = Math.min(15, this.sub_level);
    const currentCalc = (this.realm - 1) * 15 + layer;
    return Math.max(currentCalc, this.max_total_level);
  }

  public static exp_to_perfection(realmIdx: number): bigint {
    const idx = Math.min(12, Math.max(1, realmIdx));
    return 10_000n * (10n ** BigInt(idx - 1));
  }

  public static cumulative_exp_for_layer(realmIdx: number, layerIn: number): bigint {
    const layer = Math.max(1, layerIn);
    const t10 = this.exp_to_perfection(realmIdx);
    if (layer <= 10) {
      const l = BigInt(layer);
      return (t10 * l * l) / 100n;
    } else {
      const extra = Math.min(30, layer - 10);
      return t10 * (10n ** BigInt(extra));
    }
  }

  public exp_to_next_layer(): bigint {
    const next = this.sub_level + 1;
    const need = RealmState.cumulative_exp_for_layer(this.realm, next);
    if (need <= this.realm_exp) return 0n;
    return need - this.realm_exp;
  }

  public soft_remap_from_exp(): void {
    const realmIdx = this.realm;
    const exp = this.realm_exp;
    let layer = 1;

    for (let l = 1; l < 100; l++) {
      if (exp >= RealmState.cumulative_exp_for_layer(realmIdx, l)) {
        layer = l;
      } else {
        break;
      }
    }
    this.sub_level = layer;
    this.pending_breakthrough = layer >= 10;

    const layerCapped = Math.min(15, this.sub_level);
    const currentCalc = (this.realm - 1) * 15 + layerCapped;
    if (currentCalc > this.max_total_level) {
      this.max_total_level = currentCalc;
    }

    const tl = BigInt(this.total_level());
    if (realmIdx >= Realm.GoldenCore) {
      this.body.core_count = Math.max(1, Math.floor(Number(tl) / 20));
      this.body.core_size = tl * 3n;
      this.body.core_refine = Math.floor(Number(tl) / 10);
    }
    if (realmIdx >= Realm.NascentSoul) {
      this.body.infant_size = tl * 2n;
      this.body.infant_count = Math.max(1, Math.floor(Number(tl) / 30));
      this.body.infant_power = tl * 5n;
    }
    if (realmIdx >= Realm.GodTransformation) {
      this.body.qi_machine = tl * 4n;
      this.body.matrix = tl;
    }
    if (realmIdx >= Realm.BodyIntegration) {
      this.body.law_shards = Math.floor(Number(tl) / 15);
      this.body.anti_gravity = tl;
    }
    if (realmIdx >= Realm.Mahayana) {
      this.body.tribulation = tl * 2n;
      this.body.causality = tl;
    }
  }

  public manual_breakthrough(): boolean {
    if (this.sub_level >= 10 && this.realm < Realm.Supreme) {
      const oldIdx = this.realm;
      this.realm_exp = 0n;
      this.realm = (oldIdx + 1) as Realm;
      this.sub_level = 1;
      this.pending_breakthrough = false;

      const currentCalc = (this.realm - 1) * 15 + Math.min(15, this.sub_level);
      if (currentCalc > this.max_total_level) {
        this.max_total_level = currentCalc;
      }
      return true;
    }
    return false;
  }

  public add_cultivation(amountIn: bigint | number): void {
    const amount = typeof amountIn === 'bigint' ? amountIn : BigInt(Math.floor(amountIn));
    if (amount <= 0n) return;
    this.cultivation_exp += amount;
    this.realm_exp += amount;
    this.soft_remap_from_exp();
  }

  public title(): string {
    return TitleSystem.getTitleByLevel(Math.max(1, this.total_level()));
  }

  public realmName(): string {
    return REALM_NAMES[this.realm] || '凡人';
  }
}
