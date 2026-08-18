// server/quests.ts

import { ActiveQuest, QuestCurrency, QuestKind, QuestOffer, QuestReward, Sword } from './types';
import { SwordGenerator } from './sword_gen';
import { formatCompactNumber } from './numbers';

export const MAX_ACTIVE_QUESTS = 5;
const OFFER_REFRESH_SECS = 300;
const ADVANCED_REFRESH_SECS = 900;

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

export class QuestBoard {
  public offers: QuestOffer[] = [];
  public active: ActiveQuest[] = [];
  public next_refresh_at: number = 0;
  public next_advanced_refresh_at: number = 0;

  public ensure(playerLevel: number, apprentices: number, bonusGodRate: number, maxStrikes: number): void {
    if (this.offers.length === 0) {
      this.refresh(playerLevel, apprentices, bonusGodRate, maxStrikes);
    }
  }

  public refresh(playerLevel: number, apprentices: number, bonusGodRate: number, maxStrikes: number): void {
    const count = 3 + Math.floor(Math.random() * 6);
    this.offers = [];
    for (let i = 0; i < count; i++) {
      this.offers.push(this.makeOffer(playerLevel, apprentices, bonusGodRate, maxStrikes));
    }
    const t = nowSecs();
    this.next_refresh_at = t + OFFER_REFRESH_SECS;
    this.next_advanced_refresh_at = t + ADVANCED_REFRESH_SECS;
  }

  private makeOffer(
    playerLevel: number,
    apprentices: number,
    bonusGodRate: number,
    maxStrikes: number
  ): QuestOffer {
    const advanced = Math.random() < 0.25;
    const kinds: QuestKind[] = ['Escort', 'Trade', 'Hunt', 'SubmitItem'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const duration_secs = advanced ? 180 + Math.floor(Math.random() * 420) : 60 + Math.floor(Math.random() * 180);

    const base = BigInt(Math.floor((playerLevel * 80 + 300) * (advanced ? 4 : 1)));
    const currency: QuestCurrency = Math.random() < 0.2 ? 'Jade' : 'Coins';
    const deposit = currency === 'Jade' ? (base / 10_000n < 1n ? 1n : base / 10_000n) : base;

    let itemReward: Sword | null = null;
    if (Math.random() < 0.25) {
      const res = SwordGenerator.generate(
        playerLevel,
        0.14,
        BigInt(Math.floor(Math.random() * 0xffffffff)),
        apprentices,
        bonusGodRate,
        0,
        maxStrikes,
        0,
        0.0,
        0
      );
      if (res.type === 'Success') {
        itemReward = res.sword;
      }
    }

    const reward: QuestReward = {
      coins: currency === 'Coins' ? (base * 3n).toString() : '0',
      jade: currency === 'Jade' ? (((base / 10_000n < 1n ? 1n : base / 10_000n) * 3n)).toString() : '0',
      item: itemReward,
    };

    const kindNames: Record<QuestKind, string> = {
      Escort: '押镖',
      Trade: '跑商',
      Hunt: '击杀目标',
      SubmitItem: '物品提交',
    };

    const required_rank = Math.floor(Math.random() * (Math.min(40, playerLevel) + 1));
    const descriptions: Record<QuestKind, string> = {
      Escort: '护送货队穿过乱流区',
      Trade: '将宗门货物送达商路终点',
      Hunt: '追踪并击破指定目标',
      SubmitItem: `提交一件品质不低于 ${required_rank} 的神兵`,
    };

    const id = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

    return {
      id,
      kind,
      title: `${advanced ? '高级' : '普通'}·${kindNames[kind]}`,
      description: descriptions[kind],
      advanced,
      duration_secs,
      deposit: deposit.toString(),
      currency,
      reward,
      required_rank,
    };
  }

  public tick(
    playerLevel: number,
    apprentices: number,
    bonusGodRate: number,
    maxStrikes: number,
    onToast: (msg: string) => void
  ): void {
    const t = nowSecs();
    if (this.offers.length === 0 || t >= this.next_refresh_at) {
      this.refresh(playerLevel, apprentices, bonusGodRate, maxStrikes);
    }
    for (const q of this.active) {
      if (!q.completed && t >= q.complete_at && q.offer.kind !== 'SubmitItem') {
        q.completed = true;
        onToast(`任务完成：${q.offer.title}，请领取奖励`);
      }
    }
  }
}
