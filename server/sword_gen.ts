// server/sword_gen.ts

import { ElementType, ELEMENT_NAMES, Quality, Sword } from './types';
import { Fingerprint64 } from './fingerprint';

export type ForgeResult =
  | { type: 'Success'; sword: Sword }
  | { type: 'Shattered'; slag_gained: number };

export class SwordGenerator {
  public static readonly ELEMENTS: ElementType[] = ['Gold', 'Wood', 'Water', 'Fire', 'Earth'];

  public static readonly PREFIXES: string[] = [
    '锈蚀的',
    '半成品',
    '热锻',
    '冷淬',
    '油淬',
    '水淬',
    '真空熔',
    '天工',
    '赛博',
    '纳米',
    '超导',
    '量子',
    '低频',
    '高频',
    '残次',
    '返修',
    '宗门订制',
    '流民捡来的',
    '武馆淘汰',
    '供奉用',
    '私藏',
    '仿制',
    '陈浩南同款',
    '山鸡同款',
    '港风',
    '东洋传入',
    '苗疆',
    '塞外',
  ];

  public static readonly BASE_TYPES: string[] = [
    '飞剑',
    '短飞剑',
    '重飞剑',
    '汉剑',
    '软剑',
    '苗刀',
    '窄刃苗刀',
    '宽刃苗刀',
    '绣春刀',
    '腰刀',
    '朴刀',
    '斩马刀',
    '大砍刀',
    '手刀',
    '打刀',
    '太刀',
    '胁差',
    '短刀',
    '薙刀',
    '长卷',
    '武士刀',
    '居合刀',
    '匕首',
    '刺剑',
    '柳叶匕',
    '靴刀',
    '菜刀',
    '斩骨刀',
    '切片刀',
    '西瓜刀',
    '长西瓜刀',
    '短西瓜刀',
    '陈浩南的西瓜刀',
    '山鸡的西瓜刀',
    '阔剑',
    '刺剑',
    '军刀',
    '马刀',
    '钩镰',
    '戈头',
    '矛尖',
    '枪头',
    '铁锤',
    '羊角锤',
    '钳工锤',
    '凿子',
    '锉刀',
    '扳手',
    '活动扳手',
    '铁剪',
    '铁锯',
    '钻头',
    '镐头',
    '锄头',
    '镰刀',
    '斧头',
    '开山斧',
    '马蹄铁',
    '马掌钉',
    '门闩',
    '门锁芯',
    '合页',
    '门环',
    '窗钩',
    '钟楼齿轮',
    '大钟摆锤',
    '发条盒',
    '擒纵轮',
    '指针轴',
    '钟乳配重',
    '塔钟轴承',
    '报刻拨杆',
    '铆钉组',
    '工字铁片',
    '角铁',
    '法兰盘',
    '铁色子',
    '铁马',
    '铁牛',
    '铁鸡',
    '铁犬',
    '铁狮门环',
    '铁算盘珠',
    '压纸铁兽',
    '镇宅铁锚',
    '小铁锚',
    '秤砣',
    '砝码',
    '铁尺',
    '单分子刃胚',
    '链锯齿条',
    '等离子电极',
    '伺服关节',
    '散热肋片',
    '反应堆铆钉',
    '磁轨导片',
    '动能锤头',
  ];

  public static readonly SUFFIXES: string[] = [
    '',
    '· 试作品',
    '· 量产型',
    '· 加固型',
    '· 破晓',
    '· 归墟',
    '· 绝响',
    '· 裂空',
    '· 溯源',
    '· 夜走',
    '· 雨打',
    '· 坊间',
    '· 武馆订货',
    '· 钟楼备件',
    '· 马厩急件',
    '· 港风传奇',
  ];

  public static randomBaseType(): string {
    return this.BASE_TYPES[Math.floor(Math.random() * this.BASE_TYPES.length)];
  }

  public static generate(
    playerLevel: number,
    carbonRatio: number,
    entropyFactor: bigint | number,
    apprentices: number,
    bonusGodRate: number,
    qteHits: number,
    _maxStrikes: number,
    qiSenseBonus: number,
    failRate: number,
    rankBoost: number
  ): ForgeResult {
    const fr = Math.max(0, Math.min(0.95, failRate));
    if (fr > 0 && Math.random() < fr) {
      const slag = 40 + Math.floor(Math.random() * 80);
      return { type: 'Shattered', slag_gained: slag };
    }

    const element = this.ELEMENTS[Math.floor(Math.random() * this.ELEMENTS.length)];
    const prefix = this.PREFIXES[Math.floor(Math.random() * this.PREFIXES.length)];
    const base = this.BASE_TYPES[Math.floor(Math.random() * this.BASE_TYPES.length)];
    const suffix = this.SUFFIXES[Math.floor(Math.random() * this.SUFFIXES.length)];

    const elemName = ELEMENT_NAMES[element];
    const name = suffix.length === 0 ? `${prefix}${elemName}${base}` : `${prefix}${elemName}${base}${suffix}`;

    const carbonQuality = carbonRatio >= 0.7 && carbonRatio <= 0.9 ? 1.5 : 0.85;
    const apprenticeMarkup = 1.0 + apprentices * 0.08;
    const basePrice = BigInt(Math.floor(playerLevel * 40.0 * carbonQuality * apprenticeMarkup));
    const entropyBig = BigInt(entropyFactor);
    let finalPrice = basePrice + (entropyBig % 200n);

    let roll = Math.random();
    roll -= bonusGodRate * 0.5;
    let rank: number;
    if (roll < bonusGodRate * 0.15) {
      rank = 50 + Math.floor(Math.random() * 10);
    } else {
      const fromPrice = Math.floor(Math.sqrt(Number(finalPrice)) / 3.0);
      const fromLevel = Math.floor(playerLevel / 3);
      const baseR = Math.min(45, Math.max(fromPrice, fromLevel));
      const jitter = Math.floor(Math.random() * 8);
      rank = Math.min(59, baseR + jitter);
    }

    const qteBoost = Math.min(30, qteHits);
    rank = Math.min(59, rank + qteBoost + qiSenseBonus + (qteHits > 0 ? 2 : 0));
    const rankBoosted = Math.min(59, rank + rankBoost);
    const quality = new Quality(rankBoosted);

    finalPrice = finalPrice * BigInt(1 + Math.floor(rank / 8));
    if (qteHits > 0) {
      finalPrice = finalPrice + BigInt(qteHits * 15);
    }
    if (finalPrice < 1n) finalPrice = 1n;

    const ts = Math.floor(Date.now() / 1000);
    const randEntropy = BigInt(Math.floor(Math.random() * 0xffffffff)) ^ entropyBig;
    const fingerprint = Fingerprint64.pack(ts, 0x7a8b9c, randEntropy);

    return {
      type: 'Success',
      sword: {
        id: randEntropy.toString(),
        name,
        element,
        quality,
        price: finalPrice,
        carbon_ratio: carbonRatio,
        forged_timestamp: ts,
        sharpness: 0,
        enchantment: null,
        is_reforged: false,
        is_tool: false,
        fingerprint: fingerprint.toString(),
      },
    };
  }
}
