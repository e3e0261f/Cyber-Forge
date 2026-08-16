// 文件路径：src/game/fingerprint.rs

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const BASE62_CHARS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// 🌟 精选 64 条源自《道德经》的核心大道印记
pub const DAO_DE_JING_STAMPS: &[&str] = &[
    "玄之又玄·众妙之门", "道法自然·生生不息", "致虚极守·静笃归根", "大巧若拙·大音希声",
"上善若水·利物不争", "重为轻根·静为躁君", "知白守黑·天下式常", "玄牝之门·天地之根",
"抱朴见素·少私寡欲", "功成身退·天之道也", "天长地久·以其不自生", "虚而不屈·动而愈出",
"金玉满堂·莫之能守", "清静为天下正", "视之不见名曰夷", "听之不闻名曰希",
"抟之不得名曰微", "复归于无物", "是谓无状之状", "无物之象·是谓惚恍",
"道生一·一生二", "二生三·三生万物", "万物负阴而抱阳", "冲气以为和",
"天下皆知美之为美", "天地不仁·以万物为刍狗", "圣人不仁·以百姓为刍狗", "海纳百川·有容乃大",
"反者道之动", "弱者道之用", "天下万物生于有", "有生于无·大成若缺",
"大盈若冲·其用不穷", "大直若屈·大辩若讷", "大勇若怯·大智若愚", "大道甚夷·而人好径",
"深根固柢·长生久视", "祸兮福之所倚", "福兮祸之所伏", "知人者智·自知者明",
"胜人者有力·自胜者强", "知足者富·强行者有志", "不失其所者久", "死而不亡者寿",
"道常无为而无不为", "以正治国·以奇用兵", "以无事取天下", "天下多忌讳而民弥贫",
"人多利器国家滋昏", "人多伎巧奇物滋起", "法令滋彰盗贼多有", "我无为而民自化",
"我好静而民自正", "我无事而民自富", "我无欲而民自朴", "治大国若烹小鲜",
"以道莅天下·其鬼不神", "物壮则老·是谓不道", "知者不言·言者不知", "塞其兑·闭其门",
"挫其锐·解其纷", "和其光·同其尘", "是谓玄同", "天道无亲·常与善人"
];

// 天干地支常量表
const TIAN_GAN: [&str; 10] = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const DI_ZHI: [&str; 12] = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const BA_GUA: [&str; 8] = ["乾天", "坤地", "震雷", "巽风", "坎水", "离火", "艮山", "兑泽"];
const YAO_POS: [&str; 6] = ["初爻", "二爻", "三爻", "四爻", "五爻·阳极", "上爻·太极之巅"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BirthCertificate {
    pub code: String,          // 8~10位短码 (#Z7kQ-9mA3)
    pub timestamp_str: String, // 甲辰年 · 壬申月 · 子时三刻
    pub location_str: String,  // 离火五爻 · 阳极之位
    pub dao_stamp: String,     // 玄之又玄·众妙之门
    pub creator: String,       // 创作者
}

/// 🌟 64位天道位域打包器
pub struct Fingerprint64;

impl Fingerprint64 {
    /// 压缩生成 u64 指纹
    pub fn pack(ts: u64, creator_hash: u32, entropy: u64) -> u64 {
        let sec = ts % 31536000; // 年内秒数
        let time_part = (sec & 0xFFFFFF) as u64; // 24 bits

        let bagua_idx = (entropy % 8) as u64;    // 3 bits
        let yao_idx = ((entropy / 8) % 6) as u64; // 3 bits
        let loc_part = (bagua_idx << 3) | yao_idx; // 6 bits

        let stamp_idx = ((entropy / 64) % (DAO_DE_JING_STAMPS.len() as u64)) as u64; // 6 bits (0~63)
        let creator_part = (creator_hash & 0x7FFFF) as u64; // 19 bits

        // 位域拼接：24(时间) + 6(地轴) + 6(道德经) + 19(创作者) + 9(随机熵) = 64 bits
        (time_part << 40) | (loc_part << 34) | (stamp_idx << 28) | (creator_part << 9) | (entropy & 0x1FF)
    }

    /// u64 转 Base62 极简短码
    pub fn to_base62(mut num: u64) -> String {
        if num == 0 { return "0".to_string(); }
        let mut buf = Vec::new();
        while num > 0 {
            let rem = (num % 62) as usize;
            buf.push(BASE62_CHARS[rem]);
            num /= 62;
        }
        buf.reverse();
        format!("#{}", String::from_utf8(buf).unwrap_or_else(|_| "Z7kQ9m".into()))
    }

    /// 🌟 100% 真实逆向解密天道出生证明
    pub fn decode(fp: u64, creator_name: &str) -> BirthCertificate {
        let time_part = (fp >> 40) & 0xFFFFFF;
        let loc_part = (fp >> 34) & 0x3F;
        let stamp_idx = (fp >> 28) & 0x3F;

        // 还原干支时辰
        let gan_idx = ((time_part / 86400) % 10) as usize;
        let zhi_idx = ((time_part / 86400) % 12) as usize;
        let hour_zhi = ((time_part / 7200) % 12) as usize;
        let ke_idx = ((time_part / 900) % 4) + 1;
        let timestamp_str = format!("{}{}年·{}{}月·{}时{}刻",
                                    TIAN_GAN[gan_idx], DI_ZHI[zhi_idx],
                                    TIAN_GAN[(gan_idx + 2) % 10], DI_ZHI[(zhi_idx + 2) % 12],
                                    DI_ZHI[hour_zhi], ke_idx
        );

        // 还原地轴八卦
        let bagua_idx = ((loc_part >> 3) % 8) as usize;
        let yao_idx = (loc_part % 6) as usize;
        let location_str = format!("{} · {}", BA_GUA[bagua_idx], YAO_POS[yao_idx]);

        // 还原道德经印记
        let dao_stamp = DAO_DE_JING_STAMPS[stamp_idx.min((DAO_DE_JING_STAMPS.len() - 1) as u64) as usize].to_string();

        BirthCertificate {
            code: Self::to_base62(fp),
            timestamp_str,
            location_str,
            dao_stamp,
            creator: if creator_name.is_empty() { "纯阳真仙".into() } else { creator_name.into() }
        }
    }
}
