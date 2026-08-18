// server/game_state.ts

import {
  AutoListTier,
  AUTO_LIST_CONFIG,
  AutoMeltTier,
  AUTO_MELT_CONFIG,
  getCategoryGlyph,
  ItemView,
  LogFilter,
  LotView,
  MarketListing,
  Quality,
  Realm,
  Sword,
  UiSnapshot,
} from './types';
import { RealmState } from './realm';
import { DaoOrigin } from './dao_origin';
import { MarketSwarm } from './market_swarm';
import { QuestBoard } from './quests';
import { SwordGenerator } from './sword_gen';
import { Fingerprint64 } from './fingerprint';
import { formatCompactNumber } from './numbers';
import { randomMissedLore, randomSuccessPrefix } from './encounters_lore';

export class GameState {
  public level: number = 1;
  public exp: number = 0;
  public max_exp: number = 100;
  public strikes: number = 0;
  public max_strikes: number = 5;
  public sub_strikes: number = 0;
  public hammer_power: number = 1;
  public hammer_name: string = '凡铁锻造锤';
  public hammer_level: number = 1;

  public coins: bigint = 1000n;
  public copper: bigint = 0n;
  public jade: bigint = 10n;

  public backpack: Sword[] = [];
  public max_backpack: number = 12;

  public lots: MarketListing[] = [];
  public max_pavilion: number = 4;

  public auto_melt_tier: AutoMeltTier = AutoMeltTier.Trash;
  public auto_list_tier: AutoListTier = AutoListTier.All;
  public log_filter: LogFilter = LogFilter.All;

  public realm: RealmState = new RealmState();
  public dao_origin: DaoOrigin = new DaoOrigin();
  public market_swarm: MarketSwarm = new MarketSwarm();
  public quests: QuestBoard = new QuestBoard();

  public forge_workers: number = 1;
  public auction_workers: number = 0;
  public auctioneer_threads: number = 1;
  public sharpen_workers: number = 0;
  public enchant_workers: number = 0;
  public repair_workers: number = 0;

  public apprentices: number = 0;
  public max_apprentices: number = 3;

  public forge_qte_hits: number = 0;
  public bonus_god_rate: number = 0.0;
  public carbon_ratio: number = 0.8;
  public interval_secs: number = 1.0;
  public iron_slag: number = 0;

  public logs: string[] = [];
  public toast: string = '';
  public last_log: string = '天道锻造炉运转正常，请挥锤开炉！';
  public flash: boolean = false;
  public market_news: string = '天道拍卖阁今日盛大开业，四方修士云集！';

  public player_x: number = 400;
  public player_y: number = 300;

  constructor() {
    this.add_log('天道锻造大师已启动。天地同炉，造化为工！');
    this.quests.ensure(this.level, this.apprentices, this.bonus_god_rate, this.max_strikes);
  }

  public set_toast(msg: string): void {
    this.toast = msg;
  }

  public add_log(msg: string): void {
    this.last_log = msg;
    this.logs.unshift(msg);
    if (this.logs.length > 50) {
      this.logs.pop();
    }
  }

  // Currency conversion helpers
  public cost_hammer(): bigint {
    return BigInt(Math.floor(50 * Math.pow(1.35, this.hammer_level - 1)));
  }

  public cost_bellows(): bigint {
    return BigInt(Math.floor(80 * Math.pow(1.4, this.level - 1)));
  }

  public cost_hire(): bigint {
    return BigInt(Math.floor(200 * Math.pow(1.8, this.apprentices)));
  }

  public cost_house(): bigint {
    return BigInt(Math.floor(500 * Math.pow(2.2, this.max_apprentices - 3)));
  }

  public cost_backpack(): bigint {
    return BigInt(Math.floor(100 * Math.pow(1.5, (this.max_backpack - 12) / 4)));
  }

  public cost_pavilion(): bigint {
    return BigInt(Math.floor(300 * Math.pow(1.8, this.max_pavilion - 4)));
  }

  public upgrade_hammer(): void {
    const cost = this.cost_hammer();
    if (this.coins >= cost) {
      this.coins -= cost;
      this.hammer_level += 1;
      this.hammer_power += 1;
      const names = ['凡铁锻造锤', '精钢破甲锤', '寒铁百炼锤', '玄铁重力锤', '紫金天工锤', '极阳神工锤', '天道造物锤'];
      const idx = Math.min(names.length - 1, Math.floor((this.hammer_level - 1) / 3));
      this.hammer_name = names[idx];
      this.set_toast(`锻造锤升级至 Lv.${this.hammer_level}（威力 +1）`);
      this.add_log(`升级锻造锤：威力提升至 ${this.hammer_power}`);
    } else {
      this.set_toast(`金币不足，需要 ${cost} 金币`);
    }
  }

  public upgrade_bellows(): void {
    const cost = this.cost_bellows();
    if (this.coins >= cost) {
      this.coins -= cost;
      this.level += 1;
      this.max_strikes = Math.max(3, 5 + Math.floor(this.level / 4));
      this.interval_secs = Math.max(0.3, 1.0 - this.level * 0.02);
      this.set_toast(`风箱升级成功，锻造速率提升！`);
      this.add_log(`升级风箱：工坊等级提升至 Lv.${this.level}`);
    } else {
      this.set_toast(`金币不足，需要 ${cost} 金币`);
    }
  }

  public upgrade_hire(): void {
    if (this.apprentices >= this.max_apprentices) {
      this.set_toast(`厢房已满，请先扩建弟子居所`);
      return;
    }
    const cost = this.cost_hire();
    if (this.coins >= cost) {
      this.coins -= cost;
      this.apprentices += 1;
      this.forge_workers += 1;
      this.set_toast(`招募学徒成功！当前学徒：${this.apprentices}/${this.max_apprentices}`);
      this.add_log(`招募新学徒入宗，协同锻造`);
    } else {
      this.set_toast(`金币不足，需要 ${cost} 金币`);
    }
  }

  public upgrade_house(): void {
    const cost = this.cost_house();
    if (this.coins >= cost) {
      this.coins -= cost;
      this.max_apprentices += 2;
      this.set_toast(`厢房扩建成功！最大容纳学徒：${this.max_apprentices}`);
      this.add_log(`扩建弟子居所至 ${this.max_apprentices} 人`);
    } else {
      this.set_toast(`金币不足，需要 ${cost} 金币`);
    }
  }

  public upgrade_backpack(): void {
    const cost = this.cost_backpack();
    if (this.coins >= cost) {
      this.coins -= cost;
      this.max_backpack += 4;
      this.set_toast(`储物袋扩容成功！容量：${this.max_backpack}`);
      this.add_log(`扩容储物袋至 ${this.max_backpack} 格`);
    } else {
      this.set_toast(`金币不足，需要 ${cost} 金币`);
    }
  }

  public upgrade_pavilion(): void {
    const cost = this.cost_pavilion();
    if (this.coins >= cost) {
      this.coins -= cost;
      this.max_pavilion += 2;
      this.set_toast(`拍卖展位扩建成功！展位：${this.max_pavilion}`);
      this.add_log(`扩建拍卖展位至 ${this.max_pavilion} 席`);
    } else {
      this.set_toast(`金币不足，需要 ${cost} 金币`);
    }
  }

  public player_strike(): void {
    const inCrit = this.dao_origin.in_crit_window(this.interval_secs);
    const pulse = this.dao_origin.on_strike_with_crit(inCrit, this.hammer_power);

    if (pulse.is_perfect) {
      this.forge_qte_hits += 1;
      this.flash = true;
    } else {
      this.flash = false;
    }

    const power = this.hammer_power * (pulse.is_perfect ? 2 : 1);
    this.strikes += power;

    // Body refinement
    this.realm.body.physique += BigInt(power);
    this.realm.add_cultivation(BigInt(power * 2));

    if (this.strikes >= this.max_strikes) {
      this.finish_forge();
    }
  }

  public finish_forge(): void {
    const verdict = this.dao_origin.verdict_for_forge(this.max_strikes, this.bonus_god_rate);
    const qiSenseBonus = Number(this.realm.body.qi_sense % 10n);

    const result = SwordGenerator.generate(
      this.level,
      this.carbon_ratio,
      BigInt(Date.now()),
      this.apprentices,
      this.bonus_god_rate + verdict.drop_bonus,
      verdict.perfect_hits,
      this.max_strikes,
      qiSenseBonus,
      verdict.fail_rate,
      verdict.rank_boost
    );

    this.strikes = 0;
    this.forge_qte_hits = 0;
    this.dao_origin.reset_sword();

    if (result.type === 'Shattered') {
      this.iron_slag += result.slag_gained;
      this.set_toast(`淬火失败！兵刃崩碎，获得铁渣 +${result.slag_gained}`);
      this.add_log(`锻造碎裂：化为 ${result.slag_gained} 碎铁残渣`);
      return;
    }

    const sword = result.sword;
    const rank = sword.quality.rank;

    // Auto-melt check
    const meltCfg = AUTO_MELT_CONFIG[this.auto_melt_tier];
    if (this.auto_melt_tier !== AutoMeltTier.Off && rank <= meltCfg.maxRank) {
      const slagGain = sword.quality.slagValue();
      this.iron_slag += slagGain;
      this.set_toast(`自动熔炼：${sword.quality.badge()} ${sword.name} -> 铁渣 +${slagGain}`);
      this.add_log(`自动熔解 ${sword.name}，回收 ${slagGain} 铁渣`);
      this.gain_forge_exp(sword);
      return;
    }

    // Auto-list check
    const listCfg = AUTO_LIST_CONFIG[this.auto_list_tier];
    if (
      this.auto_list_tier !== AutoListTier.Off &&
      rank >= listCfg.minRank &&
      this.lots.length < this.max_pavilion
    ) {
      this.list_to_market(sword);
      this.gain_forge_exp(sword);
      return;
    }

    // Backpack check
    if (this.backpack.length < this.max_backpack) {
      this.backpack.push(sword);
      this.set_toast(`锻造成功：${sword.quality.badge()} ${sword.name} 入储物袋`);
      this.add_log(`锻得神兵：${sword.quality.badge()} ${sword.name}（价值 ${formatCompactNumber(sword.price).trim()} 金币）`);
      this.gain_forge_exp(sword);
    } else {
      const slagGain = sword.quality.slagValue();
      this.iron_slag += slagGain;
      this.set_toast(`储物袋已满！${sword.name} 自动分解为铁渣 +${slagGain}`);
      this.add_log(`背包满溢：${sword.name} 自动分解为 ${slagGain} 铁渣`);
      this.gain_forge_exp(sword);
    }
  }

  public gain_forge_exp(sword: Sword): void {
    const expGain = sword.quality.bonusExp() + this.level * 2;
    this.exp += expGain;
    if (this.exp >= this.max_exp) {
      this.exp -= this.max_exp;
      this.level += 1;
      this.max_exp = Math.floor(this.max_exp * 1.35);
      this.set_toast(`锻造造诣精进！工坊升至 Lv.${this.level}`);
      this.add_log(`工坊进阶：提升至 Lv.${this.level}`);
    }
    this.realm.add_cultivation(BigInt(expGain * 3));
  }

  public list_to_market(sword: Sword): void {
    if (this.lots.length >= this.max_pavilion) {
      this.set_toast('拍卖展位已满');
      return;
    }
    const fair = sword.price;
    const listing: MarketListing = {
      sword,
      listed_price: fair,
      listing_time: Date.now(),
      fair_value: fair,
      bid_count: 0,
      is_sold: false,
      sold_timer: 0,
      hype_factor: 1.0,
      momentum: 0,
      chant_timer: 0,
      last_buyer_title: '拍卖司仪正在唱价...',
    };
    this.lots.push(listing);
    this.set_toast(`上架拍卖：${sword.quality.badge()} ${sword.name}`);
    this.add_log(`神兵上架：${sword.name} 起拍价 ${formatCompactNumber(fair).trim()} 金币`);
  }

  public tick(): void {
    // 1. Worker auto strikes
    if (this.forge_workers > 0) {
      this.sub_strikes += this.forge_workers;
      if (this.sub_strikes >= 5) {
        const hits = Math.floor(this.sub_strikes / 5);
        this.sub_strikes %= 5;
        this.strikes += hits * this.hammer_power;
        this.realm.body.physique += BigInt(hits);
        if (this.strikes >= this.max_strikes) {
          this.finish_forge();
        }
      }
    }

    // 2. Market Swarm step
    const bids = this.market_swarm.step(this.lots.length, 0.2, 0.5);
    for (const bid of bids) {
      if (bid.lot_idx < this.lots.length) {
        const lot = this.lots[bid.lot_idx];
        if (!lot.is_sold) {
          lot.bid_count += 1;
          const raise = (lot.listed_price * BigInt(bid.impulsive ? 25 : 12)) / 100n;
          lot.listed_price += raise < 1n ? 1n : raise;
          lot.last_buyer_title = `${bid.title} 竞价至 ${formatCompactNumber(lot.listed_price).trim()}`;
          if (lot.bid_count >= 3 + Math.floor(Math.random() * 4)) {
            lot.is_sold = true;
            lot.sold_timer = 3;
          }
        }
      }
    }

    // 3. Process sold lots
    for (let i = this.lots.length - 1; i >= 0; i--) {
      const lot = this.lots[i];
      if (lot.is_sold) {
        lot.sold_timer -= 1;
        if (lot.sold_timer <= 0) {
          this.coins += lot.listed_price;
          this.realm.add_cultivation(lot.listed_price / 50n + 5n);
          this.set_toast(`拍卖成交：${lot.sword.name} 获得 ${formatCompactNumber(lot.listed_price).trim()} 金币`);
          this.add_log(`神兵落槌：${lot.sword.name} 售予【${lot.last_buyer_title.split(' ')[0]}】，获得 ${formatCompactNumber(lot.listed_price).trim()} 金币`);
          this.lots.splice(i, 1);
        }
      }
    }

    // 4. Auto-list from backpack if auction worker active
    if (this.auction_workers > 0 && this.lots.length < this.max_pavilion && this.backpack.length > 0) {
      const sword = this.backpack.shift()!;
      this.list_to_market(sword);
    }

    // 5. Random encounters
    if (Math.random() < 0.03) {
      if (Math.random() < 0.35 && this.backpack.length < this.max_backpack) {
        const prefix = randomSuccessPrefix();
        const res = SwordGenerator.generate(
          this.level + 5,
          0.85,
          BigInt(Date.now()),
          this.apprentices,
          0.3,
          5,
          this.max_strikes,
          5,
          0.0,
          10
        );
        if (res.type === 'Success') {
          this.backpack.push(res.sword);
          this.set_toast(`奇遇：${prefix} ${res.sword.quality.badge()} ${res.sword.name}`);
          this.add_log(`天地机缘：${prefix} ${res.sword.name}`);
        }
      } else {
        const expGain = BigInt(20 + this.level * 15);
        this.realm.add_cultivation(expGain);
        const lore = randomMissedLore(expGain);
        this.set_toast(lore);
        this.add_log(lore);
      }
    }

    // 6. Quests tick
    this.quests.tick(
      this.level,
      this.apprentices,
      this.bonus_god_rate,
      this.max_strikes,
      (msg) => this.set_toast(msg)
    );
  }

  public handle_action(action: { key: string; x?: number; y?: number }): void {
    const k = action.key;
    if (k === 'hammer_up') {
      this.upgrade_hammer();
    } else if (k === 'bellows_up') {
      this.upgrade_bellows();
    } else if (k === 'hire_apprentice') {
      this.upgrade_hire();
    } else if (k === 'upgrade_house') {
      this.upgrade_house();
    } else if (k === 'upgrade_backpack') {
      this.upgrade_backpack();
    } else if (k === 'upgrade_pavilion') {
      this.upgrade_pavilion();
    } else if (k === 'breakthrough') {
      if (this.realm.manual_breakthrough()) {
        this.set_toast(`突破大成功！进阶至【${this.realm.realmName()}期】`);
        this.add_log(`破境飞升：突破至【${this.realm.realmName()}期】！`);
      } else {
        this.set_toast('修为尚未圆满（需达到第10层以上）');
      }
    } else if (k === 'melt_cycle') {
      this.auto_melt_tier = AUTO_MELT_CONFIG[this.auto_melt_tier].next;
      this.set_toast(`自动熔炼档位：${AUTO_MELT_CONFIG[this.auto_melt_tier].name}`);
    } else if (k === 'list_cycle') {
      this.auto_list_tier = AUTO_LIST_CONFIG[this.auto_list_tier].next;
      this.set_toast(`自动上架档位：${AUTO_LIST_CONFIG[this.auto_list_tier].name}`);
    } else if (k === 'log_filter_cycle') {
      if (this.log_filter === LogFilter.All) this.log_filter = LogFilter.Important;
      else if (this.log_filter === LogFilter.Important) this.log_filter = LogFilter.Masterwork;
      else this.log_filter = LogFilter.All;
      this.set_toast(`日志过滤：${this.log_filter}`);
    } else if (k.startsWith('sell_item:')) {
      const idxStr = k.replace('sell_item:', '');
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx) && idx >= 0 && idx < this.backpack.length) {
        const sword = this.backpack.splice(idx, 1)[0];
        const gain = sword.price;
        this.coins += gain;
        this.set_toast(`出售 ${sword.name} 获得 ${formatCompactNumber(gain).trim()} 金币`);
        this.add_log(`直接售出：${sword.name} 换得 ${formatCompactNumber(gain).trim()} 金币`);
      }
    } else if (k.startsWith('melt_item:')) {
      const idxStr = k.replace('melt_item:', '');
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx) && idx >= 0 && idx < this.backpack.length) {
        const sword = this.backpack.splice(idx, 1)[0];
        const slag = sword.quality.slagValue();
        this.iron_slag += slag;
        this.set_toast(`熔炼 ${sword.name} 获得铁渣 +${slag}`);
        this.add_log(`熔炼神兵：${sword.name} 获得 ${slag} 碎铁`);
      }
    } else if (k.startsWith('list_item:')) {
      const idxStr = k.replace('list_item:', '');
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx) && idx >= 0 && idx < this.backpack.length) {
        if (this.lots.length < this.max_pavilion) {
          const sword = this.backpack.splice(idx, 1)[0];
          this.list_to_market(sword);
        } else {
          this.set_toast('拍卖展位已满');
        }
      }
    } else if (k.startsWith('worker:')) {
      const type = k.replace('worker:', '');
      const totalWorkers = this.apprentices + 1;
      const assigned = this.forge_workers + this.auction_workers + this.sharpen_workers + this.enchant_workers + this.repair_workers;
      if (type === 'forge') {
        if (assigned < totalWorkers) this.forge_workers++;
        else if (this.forge_workers > 0) this.forge_workers--;
      } else if (type === 'auction') {
        if (assigned < totalWorkers) this.auction_workers++;
        else if (this.auction_workers > 0) this.auction_workers--;
      }
    } else if (k.startsWith('quest_accept:')) {
      const qId = k.replace('quest_accept:', '');
      const offer = this.quests.offers.find((o) => o.id === qId);
      if (offer) {
        const dep = BigInt(offer.deposit);
        if (offer.currency === 'Coins' && this.coins < dep) {
          this.set_toast('金币不足，无法缴纳押金');
          return;
        }
        if (offer.currency === 'Jade' && this.jade < dep) {
          this.set_toast('仙玉不足，无法缴纳押金');
          return;
        }
        if (offer.currency === 'Coins') this.coins -= dep;
        if (offer.currency === 'Jade') this.jade -= dep;

        this.quests.offers = this.quests.offers.filter((o) => o.id !== qId);
        const t = Math.floor(Date.now() / 1000);
        this.quests.active.push({
          offer,
          accepted_at: t,
          complete_at: t + offer.duration_secs,
          completed: false,
          claimed: false,
          submitted_item_id: null,
        });
        this.set_toast(`接取任务：${offer.title}`);
        this.add_log(`接取宗门悬赏：${offer.title}`);
      }
    } else if (k.startsWith('quest_claim:')) {
      const qId = k.replace('quest_claim:', '');
      const activeIdx = this.quests.active.findIndex((q) => q.offer.id === qId && q.completed && !q.claimed);
      if (activeIdx !== -1) {
        const quest = this.quests.active[activeIdx];
        const r = quest.offer.reward;
        const dep = BigInt(quest.offer.deposit);
        if (quest.offer.currency === 'Coins') this.coins += dep;
        if (quest.offer.currency === 'Jade') this.jade += dep;

        this.coins += BigInt(r.coins);
        this.jade += BigInt(r.jade);
        if (r.item && this.backpack.length < this.max_backpack) {
          this.backpack.push(r.item);
        }
        quest.claimed = true;
        this.quests.active.splice(activeIdx, 1);
        this.set_toast(`任务结算完成：${quest.offer.title}`);
        this.add_log(`完成悬赏任务：${quest.offer.title}`);
      }
    } else if (k.startsWith('quest_abandon:')) {
      const qId = k.replace('quest_abandon:', '');
      this.quests.active = this.quests.active.filter((q) => q.offer.id !== qId);
      this.set_toast('已放弃任务，押金不予退还');
    } else if ((k === 'move' || k === 'sync_pos') && action.x !== undefined && action.y !== undefined) {
      this.player_x = Number(action.x);
      this.player_y = Number(action.y);
    }
  }

  public snapshot(): UiSnapshot {
    const backpackItems: ItemView[] = this.backpack.map((s) => {
      const cert = Fingerprint64.decode(s.fingerprint, '纯阳真仙');
      return {
        id: s.id,
        name: s.name,
        glyph: getCategoryGlyph(s),
        price: formatCompactNumber(s.price),
        quality: s.quality.badge(),
        color: s.quality.colorHex(),
        is_tool: s.is_tool,
        detail: `五行:${s.element} 纯度:${(s.carbon_ratio * 100).toFixed(0)}% 锋芒:${s.sharpness}`,
        cert_code: cert.code,
        cert_time: cert.timestamp_str,
        cert_location: cert.location_str,
        cert_stamp: cert.dao_stamp,
        cert_creator: cert.creator,
      };
    });

    const lotViews: LotView[] = this.lots.map((l) => ({
      name: l.sword.name,
      bid: formatCompactNumber(l.listed_price),
      fair: formatCompactNumber(l.fair_value),
      time: Math.floor((Date.now() - l.listing_time) / 1000),
      bids: l.bid_count,
      sold: l.is_sold,
      waiting: !l.is_sold,
      color: l.sword.quality.colorHex(),
      status: l.last_buyer_title,
    }));

    const meltCfg = AUTO_MELT_CONFIG[this.auto_melt_tier];
    const listCfg = AUTO_LIST_CONFIG[this.auto_list_tier];

    const currentProgress = this.dao_origin.progress(this.interval_secs);
    const inCrit = this.dao_origin.in_crit_window(this.interval_secs);

    const totalLevel = this.realm.total_level();
    const expToNext = this.realm.exp_to_next_layer();

    return {
      connected: true,
      hammer_name: this.hammer_name,
      hammer_level: this.hammer_level,
      hammer_power: formatCompactNumber(this.hammer_power),
      level: this.level,
      exp: this.exp,
      max_exp: this.max_exp,
      strikes: this.strikes,
      max_strikes: this.max_strikes,
      sub_strikes: this.sub_strikes,
      coins: formatCompactNumber(this.coins),
      copper: formatCompactNumber(this.copper),
      jade: formatCompactNumber(this.jade),
      progress: currentProgress,
      in_crit: inCrit,
      interval_secs: this.interval_secs,
      toast: this.toast,
      log: this.last_log,
      logs: this.logs,
      backpack: backpackItems,
      max_backpack: this.max_backpack,
      lots: lotViews,
      max_pavilion: this.max_pavilion,
      melt_tier: meltCfg.name,
      list_tier: listCfg.name,
      melt_color: meltCfg.colorHex,
      list_color: listCfg.colorHex,
      realm_name: this.realm.realmName(),
      title: this.realm.title(),
      sub_level: this.realm.sub_level,
      realm_exp: formatCompactNumber(this.realm.realm_exp),
      exp_to_next: formatCompactNumber(expToNext),
      cultivation: formatCompactNumber(this.realm.cultivation_exp),
      god_rate: `${(this.bonus_god_rate * 100).toFixed(1)}%`,
      iron_slag: this.iron_slag,
      apprentices: this.apprentices,
      max_apprentices: this.max_apprentices,
      forge_qte_hits: this.forge_qte_hits,
      flash: this.flash,
      market_news: this.market_news,
      auction_workers: this.auction_workers,
      auctioneer_threads: this.auctioneer_threads,
      swarm_present: this.market_swarm.present,
      swarm_bidding: this.market_swarm.bidding,
      concurrent_hammers: Math.max(1, this.forge_workers),
      matrix_slots: 4,
      pending_breakthrough: this.realm.pending_breakthrough,
      debug_mode: false,
      sharpen_workers: this.sharpen_workers,
      enchant_workers: this.enchant_workers,
      repair_workers: this.repair_workers,
      forge_workers: this.forge_workers,
      physique: formatCompactNumber(this.realm.body.physique),
      qi_sense: formatCompactNumber(this.realm.body.qi_sense),
      spirit: formatCompactNumber(this.realm.body.spirit),
      core_count: this.realm.body.core_count,
      core_size: formatCompactNumber(this.realm.body.core_size),
      core_refine: this.realm.body.core_refine,
      infant_size: formatCompactNumber(this.realm.body.infant_size),
      infant_count: this.realm.body.infant_count,
      infant_power: formatCompactNumber(this.realm.body.infant_power),
      qi_machine: formatCompactNumber(this.realm.body.qi_machine),
      matrix: formatCompactNumber(this.realm.body.matrix),
      law_shards: this.realm.body.law_shards,
      anti_gravity: formatCompactNumber(this.realm.body.anti_gravity),
      tribulation: formatCompactNumber(this.realm.body.tribulation),
      causality: formatCompactNumber(this.realm.body.causality),
      law_control: formatCompactNumber(this.realm.body.law_control),
      causal_mastery: formatCompactNumber(this.realm.body.causal_mastery),
      thermo: formatCompactNumber(this.realm.body.thermo),
      entropy_switch: formatCompactNumber(this.realm.body.entropy_switch),
      cost_hammer: formatCompactNumber(this.cost_hammer()),
      cost_bellows: formatCompactNumber(this.cost_bellows()),
      cost_hire: formatCompactNumber(this.cost_hire()),
      cost_house: formatCompactNumber(this.cost_house()),
      cost_backpack: formatCompactNumber(this.cost_backpack()),
      cost_pavilion: formatCompactNumber(this.cost_pavilion()),
      matrix_progresses: [currentProgress, (currentProgress + 0.25) % 1.0, (currentProgress + 0.5) % 1.0, (currentProgress + 0.75) % 1.0],
      currency_protocol: 'AUTO (O(1))',
      currency_protocol_color: '#00ff7f',
      quests: this.quests.offers,
      active_quests: this.quests.active,
      quest_next_refresh_secs: Math.max(0, this.quests.next_refresh_at - Math.floor(Date.now() / 1000)),
      player_x: this.player_x,
      player_y: this.player_y,
    };
  }
}
