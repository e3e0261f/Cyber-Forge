// server/types.ts

export type ElementType = 'Gold' | 'Wood' | 'Water' | 'Fire' | 'Earth';

export const ELEMENT_NAMES: Record<ElementType, string> = {
  Gold: '庚金',
  Wood: '乙木',
  Water: '癸水',
  Fire: '丙火',
  Earth: '戊土',
};

export const BADGES: string[] = [
  '[无]', '[劣]', '[粗]', '[凡]', '[普]', '[稳]', '[整]', '[良]', '[佳]', '[优]', '[精]',
  '[锐]', '[利]', '[亮]', '[淬]', '[炼]', '[锻]', '[锤]', '[锋]', '[稀]', '[名]', '[巧]',
  '[奇]', '[绝]', '[珍]', '[宝]', '[灵]', '[法]', '[宝器]', '[史]', '[宗]', '[师]',
  '[圣胚]', '[玄]', '[妙]', '[通]', '[达]', '[彻]', '[神工]', '[神]', '[传说]', '[古]',
  '[遗]', '[封]', '[御]', '[皇]', '[帝]', '[尊]', '[王]', '[道]', '[天]', '[劫]', '[律]',
  '[界]', '[宇]', '[宙]', '[源]', '[空]', '[无]', '[熵]',
];

export class Quality {
  public static readonly MAX: number = 59;
  public rank: number;

  constructor(rank: number) {
    this.rank = Math.max(0, Math.min(Quality.MAX, Math.floor(rank)));
  }

  public isTrash(): boolean {
    return this.rank <= 5;
  }

  public isMasterworkTier(): boolean {
    return this.rank >= 12;
  }

  public badge(): string {
    return BADGES[this.rank] || '[无]';
  }

  public bonusExp(): number {
    return 2 + Math.floor((this.rank * this.rank) / 2);
  }

  public slagValue(): number {
    return 5 + this.rank * 10;
  }

  public noticeChance(): number {
    return 0.06 + this.rank * 0.007;
  }

  public takeChance(): number {
    const val = 0.38 - this.rank * 0.004;
    return Math.max(0.08, Math.min(0.40, val));
  }

  public colorRgb(): [number, number, number] {
    if (this.rank === 0) return [100, 100, 100];
    if (this.rank <= 5) return [140, 140, 140];
    if (this.rank <= 11) return [0, 180, 90];
    if (this.rank <= 17) return [0, 170, 200];
    if (this.rank <= 23) return [80, 140, 255];
    if (this.rank <= 29) return [140, 80, 255];
    if (this.rank <= 35) return [200, 120, 255];
    if (this.rank <= 41) return [255, 180, 40];
    if (this.rank <= 47) return [255, 120, 40];
    if (this.rank <= 53) return [255, 60, 100];
    return [255, 40, 180];
  }

  public colorHex(): string {
    const [r, g, b] = this.colorRgb();
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  public atkBase(): bigint {
    return BigInt(8 + this.rank * 8);
  }
}

export interface Sword {
  id: string; // 64-bit int stored as string or bigint
  name: string;
  element: ElementType;
  quality: Quality;
  price: bigint;
  carbon_ratio: number;
  forged_timestamp: number;
  sharpness: number;
  enchantment: ElementType | null;
  is_reforged: boolean;
  is_tool: boolean;
  fingerprint: string; // 64-bit uint as string
}

export function getCategoryGlyph(sword: Sword): string {
  if (sword.is_tool) {
    return '[锤]';
  }
  const name = sword.name;
  if (name.includes('剑') || name.includes('巨阙')) {
    return '[剑]';
  } else if (name.includes('刀') || name.includes('匕') || name.includes('刺')) {
    return '[刀]';
  } else if (
    name.includes('锤') ||
    name.includes('凿') ||
    name.includes('扳') ||
    name.includes('剪') ||
    name.includes('锯') ||
    name.includes('斧') ||
    name.includes('锄') ||
    name.includes('镰')
  ) {
    return '[具]';
  } else if (
    name.includes('轮') ||
    name.includes('轴') ||
    name.includes('钉') ||
    name.includes('盘') ||
    name.includes('锁') ||
    name.includes('闩') ||
    name.includes('片')
  ) {
    return '[件]';
  } else {
    return '[物]';
  }
}

export interface MarketListing {
  sword: Sword;
  listed_price: bigint;
  listing_time: number;
  fair_value: bigint;
  bid_count: number;
  is_sold: boolean;
  sold_timer: number;
  hype_factor: number;
  momentum: number;
  chant_timer: number;
  last_buyer_title: string;
}

export enum AutoMeltTier {
  Off = 'Off',
  Trash = 'Trash',
  Fine = 'Fine',
  Rare = 'Rare',
  Epic = 'Epic',
  All = 'All',
}

export const AUTO_MELT_CONFIG: Record<
  AutoMeltTier,
  { name: string; maxRank: number; colorHex: string; next: AutoMeltTier }
> = {
  [AutoMeltTier.Off]: { name: '关', maxRank: 0, colorHex: '#787878', next: AutoMeltTier.Trash },
  [AutoMeltTier.Trash]: { name: '凡品', maxRank: 5, colorHex: '#a0a0a0', next: AutoMeltTier.Fine },
  [AutoMeltTier.Fine]: { name: '上品及以下', maxRank: 15, colorHex: '#00ff7f', next: AutoMeltTier.Rare },
  [AutoMeltTier.Rare]: { name: '稀有及以下', maxRank: 25, colorHex: '#00e5ff', next: AutoMeltTier.Epic },
  [AutoMeltTier.Epic]: { name: '史诗及以下', maxRank: 35, colorHex: '#8a2be2', next: AutoMeltTier.All },
  [AutoMeltTier.All]: { name: '全品质', maxRank: 59, colorHex: '#ff0055', next: AutoMeltTier.Off },
};

export enum AutoListTier {
  Off = 'Off',
  All = 'All',
  Fine = 'Fine',
  Rare = 'Rare',
  Epic = 'Epic',
  Legendary = 'Legendary',
}

export const AUTO_LIST_CONFIG: Record<
  AutoListTier,
  { name: string; minRank: number; colorHex: string; next: AutoListTier }
> = {
  [AutoListTier.Off]: { name: '关', minRank: 255, colorHex: '#787878', next: AutoListTier.All },
  [AutoListTier.All]: { name: '全品质', minRank: 0, colorHex: '#dcdcdc', next: AutoListTier.Fine },
  [AutoListTier.Fine]: { name: '上品及以上', minRank: 6, colorHex: '#00ff7f', next: AutoListTier.Rare },
  [AutoListTier.Rare]: { name: '稀有及以上', minRank: 16, colorHex: '#00e5ff', next: AutoListTier.Epic },
  [AutoListTier.Epic]: { name: '史诗及以上', minRank: 26, colorHex: '#8a2be2', next: AutoListTier.Legendary },
  [AutoListTier.Legendary]: { name: '传说及以上', minRank: 36, colorHex: '#ffd700', next: AutoListTier.Off },
};

export enum LogFilter {
  All = 'All',
  Important = 'Important',
  Masterwork = 'Masterwork',
}

export const LOG_FILTER_NAMES: Record<LogFilter, string> = {
  [LogFilter.All]: '全量',
  [LogFilter.Important]: '重要',
  [LogFilter.Masterwork]: '代表作',
};

export interface BodyStats {
  physique: bigint;
  qi_sense: bigint;
  spirit: bigint;
  core_count: number;
  core_size: bigint;
  core_refine: number;
  infant_size: bigint;
  infant_count: number;
  infant_power: bigint;
  qi_machine: bigint;
  matrix: bigint;
  law_shards: number;
  anti_gravity: bigint;
  tribulation: bigint;
  causality: bigint;
  law_control: bigint;
  causal_mastery: bigint;
  thermo: bigint;
  entropy_switch: bigint;
}

export enum Realm {
  BodyRefining = 1,
  QiCondensation = 2,
  SpiritFocus = 3,
  GoldenCore = 4,
  NascentSoul = 5,
  GodTransformation = 6,
  BodyIntegration = 7,
  Mahayana = 8,
  Immortal = 9,
  Saint = 10,
  HeavenlyDao = 11,
  Supreme = 12,
}

export const REALM_NAMES: Record<Realm, string> = {
  [Realm.BodyRefining]: '炼体',
  [Realm.QiCondensation]: '炼气',
  [Realm.SpiritFocus]: '练神',
  [Realm.GoldenCore]: '金丹',
  [Realm.NascentSoul]: '元婴',
  [Realm.GodTransformation]: '化神',
  [Realm.BodyIntegration]: '合体',
  [Realm.Mahayana]: '大乘',
  [Realm.Immortal]: '仙人',
  [Realm.Saint]: '圣人',
  [Realm.HeavenlyDao]: '天道境',
  [Realm.Supreme]: '至尊境',
};

export interface ItemView {
  id: string;
  name: string;
  glyph: string;
  price: string;
  quality: string;
  color: string;
  is_tool: boolean;
  detail: string;
  cert_code: string;
  cert_time: string;
  cert_location: string;
  cert_stamp: string;
  cert_creator: string;
}

export interface LotView {
  name: string;
  bid: string;
  fair: string;
  time: number;
  bids: number;
  sold: boolean;
  waiting: boolean;
  color: string;
  status: string;
}

export interface QuestReward {
  coins: string;
  jade: string;
  item: Sword | null;
}

export type QuestKind = 'Escort' | 'Trade' | 'Hunt' | 'SubmitItem';
export type QuestCurrency = 'Coins' | 'Jade';

export interface QuestOffer {
  id: string;
  kind: QuestKind;
  title: string;
  description: string;
  advanced: boolean;
  duration_secs: number;
  deposit: string;
  currency: QuestCurrency;
  reward: {
    coins: string;
    jade: string;
    item: any | null;
  };
  required_rank: number;
}

export interface ActiveQuest {
  offer: QuestOffer;
  accepted_at: number;
  complete_at: number;
  completed: boolean;
  claimed: boolean;
  submitted_item_id: string | null;
}

export interface UiSnapshot {
  connected: boolean;
  hammer_name: string;
  hammer_level: number;
  hammer_power: string;
  level: number;
  exp: number;
  max_exp: number;
  strikes: number;
  max_strikes: number;
  sub_strikes: number;
  coins: string;
  copper: string;
  jade: string;
  progress: number;
  in_crit: boolean;
  interval_secs: number;
  toast: string;
  log: string;
  logs: string[];
  backpack: ItemView[];
  max_backpack: number;
  lots: LotView[];
  max_pavilion: number;
  melt_tier: string;
  list_tier: string;
  melt_color: string;
  list_color: string;
  realm_name: string;
  title: string;
  sub_level: number;
  realm_exp: string;
  exp_to_next: string;
  cultivation: string;
  god_rate: string;
  iron_slag: number;
  apprentices: number;
  max_apprentices: number;
  forge_qte_hits: number;
  flash: boolean;
  market_news: string;
  auction_workers: number;
  auctioneer_threads: number;
  swarm_present: number;
  swarm_bidding: number;
  concurrent_hammers: number;
  matrix_slots: number;
  pending_breakthrough: boolean;
  debug_mode: boolean;
  sharpen_workers: number;
  enchant_workers: number;
  repair_workers: number;
  forge_workers: number;
  physique: string;
  qi_sense: string;
  spirit: string;
  core_count: number;
  core_size: string;
  core_refine: number;
  infant_size: string;
  infant_count: number;
  infant_power: string;
  qi_machine: string;
  matrix: string;
  law_shards: number;
  anti_gravity: string;
  tribulation: string;
  causality: string;
  law_control: string;
  causal_mastery: string;
  thermo: string;
  entropy_switch: string;
  cost_hammer: string;
  cost_bellows: string;
  cost_hire: string;
  cost_house: string;
  cost_backpack: string;
  cost_pavilion: string;
  matrix_progresses: number[];
  currency_protocol: string;
  currency_protocol_color: string;
  quests: QuestOffer[];
  active_quests: ActiveQuest[];
  quest_next_refresh_secs: number;
  player_x: number;
  player_y: number;
}
