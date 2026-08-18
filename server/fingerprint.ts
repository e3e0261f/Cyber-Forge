// server/fingerprint.ts

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const DAO_DE_JING_STAMPS: string[] = [
  '玄之又玄·众妙之门',
  '道法自然·生生不息',
  '致虚极守·静笃归根',
  '大巧若拙·大音希声',
  '上善若水·利物不争',
  '重为轻根·静为躁君',
  '知白守黑·天下式常',
  '玄牝之门·天地之根',
  '抱朴见素·少私寡欲',
  '功成身退·天之道也',
  '天长地久·以其不自生',
  '虚而不屈·动而愈出',
  '金玉满堂·莫之能守',
  '清静为天下正',
  '视之不见名曰夷',
  '听之不闻名曰希',
  '抟之不得名曰微',
  '复归于无物',
  '是谓无状之状',
  '无物之象·是谓惚恍',
  '道生一·一生二',
  '二生三·三生万物',
  '万物负阴而抱阳',
  '冲气以为和',
  '天下皆知美之为美',
  '天地不仁·以万物为刍狗',
  '圣人不仁·以百姓为刍狗',
  '海纳百川·有容乃大',
  '反者道之动',
  '弱者道之用',
  '天下万物生于有',
  '有生于无·大成若缺',
  '大盈若冲·其用不穷',
  '大直若屈·大辩若讷',
  '大勇若怯·大智若愚',
  '大道甚夷·而人好径',
  '深根固柢·长生久视',
  '祸兮福之所倚',
  '福兮祸之所伏',
  '知人者智·自知者明',
  '胜人者有力·自胜者强',
  '知足者富·强行者有志',
  '不失其所者久',
  '死而不亡者寿',
  '道常无为而无不为',
  '以正治国·以奇用兵',
  '以无事取天下',
  '天下多忌讳而民弥贫',
  '人多利器国家滋昏',
  '人多伎巧奇物滋起',
  '法令滋彰盗贼多有',
  '我无为而民自化',
  '我好静而民自正',
  '我无事而民自富',
  '我无欲而民自朴',
  '治大国若烹小鲜',
  '以道莅天下·其鬼不神',
  '物壮则老·是谓不道',
  '知者不言·言者不知',
  '塞其兑·闭其门',
  '挫其锐·解其纷',
  '和其光·同其尘',
  '是谓玄同',
  '天道无亲·常与善人',
];

const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const BA_GUA = ['乾天', '坤地', '震雷', '巽风', '坎水', '离火', '艮山', '兑泽'];
const YAO_POS = ['初爻', '二爻', '三爻', '四爻', '五爻·阳极', '上爻·太极之巅'];

export interface BirthCertificate {
  code: string;
  timestamp_str: string;
  location_str: string;
  dao_stamp: string;
  creator: string;
}

export class Fingerprint64 {
  public static pack(ts: number | bigint, creator_hash: number | bigint, entropy: bigint): bigint {
    const tsBig = BigInt(ts);
    const sec = tsBig % 31536000n;
    const time_part = sec & 0xffffffn;

    const bagua_idx = entropy % 8n;
    const yao_idx = (entropy / 8n) % 6n;
    const loc_part = (bagua_idx << 3n) | yao_idx;

    const stamp_idx = (entropy / 64n) % BigInt(DAO_DE_JING_STAMPS.length);
    const creator_part = BigInt(creator_hash) & 0x7ffffn;

    return (
      (time_part << 40n) |
      (loc_part << 34n) |
      (stamp_idx << 28n) |
      (creator_part << 9n) |
      (entropy & 0x1ffn)
    );
  }

  public static toBase62(numIn: bigint): string {
    let num = numIn;
    if (num === 0n) return '#0';
    let buf = '';
    while (num > 0n) {
      const rem = Number(num % 62n);
      buf = BASE62_CHARS[rem] + buf;
      num = num / 62n;
    }
    return `#${buf || 'Z7kQ9m'}`;
  }

  public static decode(fpIn: bigint | string, creatorName: string = '纯阳真仙'): BirthCertificate {
    const fp = typeof fpIn === 'bigint' ? fpIn : BigInt(fpIn || '0');
    const time_part = Number((fp >> 40n) & 0xffffffn);
    const loc_part = Number((fp >> 34n) & 0x3fn);
    const stamp_idx = Number((fp >> 28n) & 0x3fn);

    const gan_idx = Math.floor(time_part / 86400) % 10;
    const zhi_idx = Math.floor(time_part / 86400) % 12;
    const hour_zhi = Math.floor(time_part / 7200) % 12;
    const ke_idx = (Math.floor(time_part / 900) % 4) + 1;

    const timestamp_str = `${TIAN_GAN[gan_idx]}${DI_ZHI[zhi_idx]}年·${TIAN_GAN[(gan_idx + 2) % 10]}${DI_ZHI[(zhi_idx + 2) % 12]}月·${DI_ZHI[hour_zhi]}时${ke_idx}刻`;

    const bagua_idx = (loc_part >> 3) % 8;
    const yao_idx = loc_part % 6;
    const location_str = `${BA_GUA[bagua_idx]} · ${YAO_POS[yao_idx]}`;

    const stamp = DAO_DE_JING_STAMPS[Math.min(DAO_DE_JING_STAMPS.length - 1, stamp_idx)] || DAO_DE_JING_STAMPS[0];

    return {
      code: this.toBase62(fp),
      timestamp_str,
      location_str,
      dao_stamp: stamp,
      creator: creatorName || '纯阳真仙',
    };
  }
}
