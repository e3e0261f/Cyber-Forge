/**
 * 跑商系统 - 商票驿站 (Merchant Ticket System)
 * 
 * 核心机制:
 * 1. 领取商票: 缴纳 30,000 铜押金，获得 30,000 初始额度商票。持有期间禁用快速传送/飞行，必须步行。
 * 2. 贸易定价: 基于城际拓扑距离、本地保护(跌30%)、特产溢价、敌对城市惩罚(跌10%)、相隔一城暴利(+100%~+500%)、特设暴利路线(云南->北京)、江湖风闻动态加成(+200%~+350%)。
 * 3. 记账无忧: 背包格与商票货单清晰标注当初买入价 (如: 买入价: 480铜 进货地: 河北)，并在 Tooltip 详细展示批次总成本。
 * 4. 贴墙式传送门: 墙体豁口嵌入式判定，沿墙走不误触，深入豁口撞墙才过门。
 * 5. 江湖风闻情报页: 新增【跑商情报】主标签页，来往行商留下的真实见闻(如山洪冲断桥梁导致河北急缺上海/北京/浙江货物)，动态决定物价暴涨！
 * 6. 无滞销保证: 背包内货物任何城市驿站无条件包销回收。
 * 7. 交割商票: 累计回款达到 100,000 铜即可交割，退回 30,000 押金并核发丰厚奖励金。
 */

import { uiState } from './state.js';
import { gameState } from './state.js';
import { gameStore } from './store/game-store.js';
import { getModalBounds } from './input.js';
import { drawHoloModalFrame } from './modal-frame.js';

// 🌟 商票规则常量 (与服务端 GameConfig 一致)
export const TICKET_DEPOSIT = 30000;         // 押金 3 万铜
export const TICKET_INITIAL_LIMIT = 30000;   // 初始信用额度 3 万铜
export const TICKET_SETTLE_TARGET = 100000;  // 交割目标: 累计回款 10 万铜
export const TICKET_SELL_RATIO = 0.95;       // 驿站收购基准折现比率
export const TRADE_REFRESH_CYCLE_MS = 30 * 60 * 1000; // 30 分钟刷新一轮

// 🌟 主标签页定义
export const TRADE_MAIN_TABS = [
    { id: 'market', label: '🏪 特产货架', desc: '赊购本城风土特产' },
    { id: 'cargo', label: '🎒 随身货单', desc: '查看买入价与回收利润' },
    { id: 'intel', label: '📜 跑商情报', desc: '江湖风闻与供需异动' },
];

// 🌟 商品分类定义
export const TRADE_CATEGORIES = [
    { id: 'all', label: '全部货物' },
    { id: 'life', label: '生活杂物' },
    { id: 'food', label: '生鲜美馔' },
    { id: 'luxury', label: '名贵珍品' },
    { id: 'jade', label: '仙品灵宝' },
];

// 🌟 全大城风土人情特产货物数据库 (60+ 种商品)
export const CITY_TRADE_GOODS_DB = {
    hebei: [
        // 河北·百炼铁城 (塞北工匠/石炭精铁)
        { id: 'hb_iron_pot', name: '百炼精铁锅', origin: 'hebei', cat: 'life', basePrice: 120, currency: 'copper', icon: '🍳', desc: '冀州名匠以地火重锤千次锻造，经久耐用。' },
        { id: 'hb_boots', name: '冀州牛皮靴', origin: 'hebei', cat: 'life', basePrice: 260, currency: 'copper', icon: '👢', desc: '塞北厚实牛皮缝制，防风御寒耐磨。' },
        { id: 'hb_wool_blanket', name: '塞北羊毛毡', origin: 'hebei', cat: 'life', basePrice: 340, currency: 'copper', icon: '🧶', desc: '北地精细羊毛紧实压制，塞外行商必备铺盖。' },
        { id: 'hb_iron_stove', name: '铸铁火炉', origin: 'hebei', cat: 'life', basePrice: 480, currency: 'copper', icon: '🔥', desc: '坚固厚重铸铁暖炉，冬日烧炭无烟。' },
        { id: 'hb_work_clothes', name: '粗麻工装', origin: 'hebei', cat: 'life', basePrice: 90, currency: 'copper', icon: '🥋', desc: '结实耐磨的麻布工服，矿工脚夫最爱。' },
        { id: 'hb_plane_tool', name: '精工木刨', origin: 'hebei', cat: 'life', basePrice: 160, currency: 'copper', icon: '🪚', desc: '鲁班后人改良木工推刨，平整如镜。' },
        { id: 'hb_pottery_vat', name: '黑陶水缸', origin: 'hebei', cat: 'life', basePrice: 220, currency: 'copper', icon: '🏺', desc: '燕赵黑陶大瓮，储水甘洌不生苔。' },
        { id: 'hb_scissors', name: '火炼双刃剪', origin: 'hebei', cat: 'life', basePrice: 140, currency: 'copper', icon: '✂️', desc: '淬火锋利裁缝剪，裁剪厚布如削泥。' },
        { id: 'hb_copper_lamp', name: '熟铜提灯', origin: 'hebei', cat: 'life', basePrice: 380, currency: 'copper', icon: '🏮', desc: '黄铜精打防风马灯，行夜路明亮安全。' },
        
        { id: 'hb_pear', name: '赵州雪梨', origin: 'hebei', cat: 'food', basePrice: 50, currency: 'copper', icon: '🍐', desc: '皮薄肉细，汁多香甜，清心润肺之佳品。' },
        { id: 'hb_donkey_burger', name: '保定驴肉火烧', origin: 'hebei', cat: 'food', basePrice: 85, currency: 'copper', icon: '🥙', desc: '天上龙肉地下驴肉，外酥里嫩回味无穷。' },
        { id: 'hb_dry_mutton', name: '塞北风干羊肉', origin: 'hebei', cat: 'food', basePrice: 280, currency: 'copper', icon: '🍖', desc: '塞外秋风自然风干，肉质紧实嚼劲十足。' },
        { id: 'hb_mushroom', name: '张家口口蘑', origin: 'hebei', cat: 'food', basePrice: 320, currency: 'copper', icon: '🍄', desc: '坝上草原野生产出，鲜香扑鼻入汤极美。' },
        { id: 'hb_white_wine', name: '衡水老白干', origin: 'hebei', cat: 'food', basePrice: 240, currency: 'copper', icon: '🍶', desc: '六十七度烈酒，一口入喉烈火烧心。' },
        { id: 'hb_red_dates', name: '沧州金丝小枣', origin: 'hebei', cat: 'food', basePrice: 110, currency: 'copper', icon: '🫐', desc: '拉丝如金，甘甜醇厚，乃补气养血佳品。' },
        { id: 'hb_hazelnut', name: '燕山野榛子', origin: 'hebei', cat: 'food', basePrice: 150, currency: 'copper', icon: '🌰', desc: '燕山深处野生榛果，炒熟后香脆满口。' },
        
        { id: 'hb_bing_iron', name: '九幽丙火玄铁', origin: 'hebei', cat: 'luxury', basePrice: 1800, currency: 'copper', icon: '⚒️', desc: '深埋地底三千丈的地脉火铁，神兵必备主材。' },
        { id: 'hb_coal_essence', name: '万年火精石', origin: 'hebei', cat: 'luxury', basePrice: 2400, currency: 'copper', icon: '🪨', desc: '永不熄灭的纯阳晶石，可作高级丹炉火种。' },
        { id: 'hb_armor_frame', name: '玄冥重铠原胚', origin: 'hebei', cat: 'luxury', basePrice: 4200, currency: 'copper', icon: '🛡️', desc: '塞北重骑兵军工原胚，坚不可摧。' },
        { id: 'hb_divine_hammer', name: '天工神锤图谱', origin: 'hebei', cat: 'jade', basePrice: 25, currency: 'jade', icon: '📜', desc: '记载上古九天锻造秘法的绝版孤本图谱。' },
    ],

    beijing: [
        // 北京·帝京皇城 (紫禁御用/龙脉帝都)
        { id: 'bj_dragon_silk', name: '紫禁御制龙缎', origin: 'beijing', cat: 'life', basePrice: 580, currency: 'copper', icon: '🧵', desc: '皇室御用织金锦缎，流光溢彩华美至极。' },
        { id: 'bj_cloisonne_pot', name: '景泰蓝香炉', origin: 'beijing', cat: 'life', basePrice: 750, currency: 'copper', icon: '🫕', desc: '燕京八绝之一，铜胎掐丝珐琅，皇家宗庙贡器。' },
        { id: 'bj_rosewood_bed', name: '檀木雕花拔步床', origin: 'beijing', cat: 'life', basePrice: 1200, currency: 'copper', icon: '🛏️', desc: '整料老红木精雕细刻，深宅大院豪门标配。' },
        { id: 'bj_phoenix_robe', name: '京绣凤袍', origin: 'beijing', cat: 'life', basePrice: 980, currency: 'copper', icon: '👘', desc: '宫廷绣娘历时三年绣制，针脚细密尊贵非凡。' },
        { id: 'bj_gold_scissors', name: '宫廷御用金剪', origin: 'beijing', cat: 'life', basePrice: 450, currency: 'copper', icon: '✂️', desc: '鎏金雕龙纹裁衣剪，皇家内务府制造。' },
        { id: 'bj_palace_lantern', name: '六角琉璃宫灯', origin: 'beijing', cat: 'life', basePrice: 620, currency: 'copper', icon: '🏮', desc: '流光四溢的琉璃宫灯，通体晶莹剔透。' },
        { id: 'bj_nanmu_closet', name: '金丝楠木柜', origin: 'beijing', cat: 'life', basePrice: 1500, currency: 'copper', icon: '🚪', desc: '千年金丝楠木打造，不腐不蛀自带幽香。' },
        { id: 'bj_ivory_fan', name: '象牙雕骨折扇', origin: 'beijing', cat: 'life', basePrice: 820, currency: 'copper', icon: '🪭', desc: '名士折扇，镂空雕花字画并茂。' },

        { id: 'bj_royal_tea', name: '紫禁御茶', origin: 'beijing', cat: 'food', basePrice: 320, currency: 'copper', icon: '🍵', desc: '采摘自御花园千年茶树，龙涎泉水烹煮。' },
        { id: 'bj_candied_fruit', name: '北京果脯蜜饯', origin: 'beijing', cat: 'food', basePrice: 95, currency: 'copper', icon: '🍬', desc: '蜜制九道工艺，酸甜适口宫廷零嘴。' },
        { id: 'bj_pickle', name: '六必居御贡酱菜', origin: 'beijing', cat: 'food', basePrice: 80, currency: 'copper', icon: '🥫', desc: '老字号古法腌酱，脆嫩鲜香百食不厌。' },
        { id: 'bj_fuling_cake', name: '宫廷茯苓夹饼', origin: 'beijing', cat: 'food', basePrice: 110, currency: 'copper', icon: '🥞', desc: '薄如纸白如雪，健脾宁心药食同源。' },
        { id: 'bj_osmanthus_wine', name: '桂花陈酿御酒', origin: 'beijing', cat: 'food', basePrice: 360, currency: 'copper', icon: '🍶', desc: '宫廷秘酿三十年，桂香浓郁醇和怡人。' },
        { id: 'bj_fotiaoqiang', name: '御膳房佛跳墙', origin: 'beijing', cat: 'food', basePrice: 650, currency: 'copper', icon: '🍲', desc: '鲍参翅肚文火慢煨，坛启荤香飘十里。' },
        { id: 'bj_aiwowo', name: '京味艾窝窝', origin: 'beijing', cat: 'food', basePrice: 70, currency: 'copper', icon: '🥟', desc: '外皮糯软内馅香甜，老北京传统清真美馔。' },

        { id: 'bj_nine_dragons_jade', name: '燕京九龙至尊玉雕', origin: 'beijing', cat: 'luxury', basePrice: 3800, currency: 'copper', icon: '🪨', desc: '和田整块羊脂白玉精雕九龙腾云，镇宅至宝。' },
        { id: 'bj_imperial_seal', name: '龙纹传国天玺', origin: 'beijing', cat: 'luxury', basePrice: 8800, currency: 'copper', icon: '👑', desc: '受命于天既寿永昌，象征至高无上皇权。' },
        { id: 'bj_glazed_tile', name: '太和殿琉璃天瓦', origin: 'beijing', cat: 'luxury', basePrice: 2200, currency: 'copper', icon: '🏛️', desc: '金黄璀璨的官窑琉璃瓦，蕴含帝都龙气。' },
        { id: 'bj_nine_robes', name: '金丝九章冕服', origin: 'beijing', cat: 'jade', basePrice: 30, currency: 'jade', icon: '✨', desc: '以九天仙蚕金丝织成，百邪不侵帝王道袍。' },
    ],

    shanghai: [
        // 上海·东海金城 (通商口岸/西洋番邦)
        { id: 'sh_pocket_watch', name: '西洋机械怀表', origin: 'shanghai', cat: 'life', basePrice: 680, currency: 'copper', icon: '⏱️', desc: '番邦精密齿轮咬合，走时精准做工精巧。' },
        { id: 'sh_velvet', name: '番邦天鹅绒', origin: 'shanghai', cat: 'life', basePrice: 520, currency: 'copper', icon: '🧣', desc: '欧陆舶来厚重丝绒，触感丝滑垂坠感极佳。' },
        { id: 'sh_silver_mirror', name: '东海纯银梳妆镜', origin: 'shanghai', cat: 'life', basePrice: 360, currency: 'copper', icon: '🪞', desc: '西洋镀银水银镜面，纤毫毕现清晰明亮。' },
        { id: 'sh_enamel_clock', name: '西洋珐琅座钟', origin: 'shanghai', cat: 'life', basePrice: 1100, currency: 'copper', icon: '🕰️', desc: '整点自鸣铜钟，名媛贵妇客厅显贵之物。' },
        { id: 'sh_persian_carpet', name: '波斯提花地毯', origin: 'shanghai', cat: 'life', basePrice: 1400, currency: 'copper', icon: '🧶', desc: '纯手工打结波斯羊毛毯，纹样繁复奢华。' },
        { id: 'sh_gramophone_disc', name: '留声机音盘', origin: 'shanghai', cat: 'life', basePrice: 420, currency: 'copper', icon: '💿', desc: '十里洋场夜总会流行黑胶唱片。' },
        { id: 'sh_crystal_lamp', name: '西洋水晶吊灯', origin: 'shanghai', cat: 'life', basePrice: 1600, currency: 'copper', icon: '💡', desc: '数百颗切割水晶缀连，折射七彩光华。' },

        { id: 'sh_salt', name: '东海特级精海盐', origin: 'shanghai', cat: 'food', basePrice: 120, currency: 'copper', icon: '🧂', desc: '古法滩晒提纯雪白精盐，调味百味之王。' },
        { id: 'sh_pearl_powder', name: '申江极品黑珍珠粉', origin: 'shanghai', cat: 'food', basePrice: 450, currency: 'copper', icon: '✨', desc: '深海黑珍珠研磨成极细微粉，美容养颜神品。' },
        { id: 'sh_clove_spice', name: '南洋丁香豆蔻', origin: 'shanghai', cat: 'food', basePrice: 310, currency: 'copper', icon: '🌶️', desc: '南洋香料船队直达，香气浓烈芳香四溢。' },
        { id: 'sh_french_crepe', name: '法式奶油薄饼', origin: 'shanghai', cat: 'food', basePrice: 90, currency: 'copper', icon: '🥞', desc: '法租界西饼屋新鲜烘焙，奶香浓郁。' },
        { id: 'sh_yellow_croaker', name: '东海大黄鱼干', origin: 'shanghai', cat: 'food', basePrice: 260, currency: 'copper', icon: '🐟', desc: '舟山野生大黄鱼腌晒，咸香浓郁蒸肉极佳。' },
        { id: 'sh_bund_wine', name: '外滩老窖干红', origin: 'shanghai', cat: 'food', basePrice: 380, currency: 'copper', icon: '🍷', desc: '西洋橡木桶陈酿三年，果香四溢单宁优雅。' },
        { id: 'sh_drunken_crab', name: '东海醉蟹膏', origin: 'shanghai', cat: 'food', basePrice: 220, currency: 'copper', icon: '🦀', desc: '花雕老酒生醉红膏蟹，鲜甜咸美让人欲罢不能。' },

        { id: 'sh_pearl', name: '申江夜光大明珠', origin: 'shanghai', cat: 'luxury', basePrice: 2800, currency: 'copper', icon: '💎', desc: '东海蚌精万年孕育，夜间自行散发柔和明光。' },
        { id: 'sh_gold_compass', name: '西洋皇家纯金罗盘', origin: 'shanghai', cat: 'luxury', basePrice: 3500, currency: 'copper', icon: '🧭', desc: '大航海时代纯金航海罗盘，指引失落宝藏。' },
        { id: 'sh_bond_ticket', name: '申江金鼎信托券', origin: 'shanghai', cat: 'luxury', basePrice: 5200, currency: 'copper', icon: '🎫', desc: '申城十三洋行联名背书，价值千金通行万国。' },
        { id: 'sh_sea_soul_bead', name: '东海万年海魂鲛珠', origin: 'shanghai', cat: 'jade', basePrice: 28, currency: 'jade', icon: '🔮', desc: '深海鲛人垂泪成珠，佩戴可驭天下万水。' },
    ],

    yunnan: [
        // 云南·西南灵山 (古茶药都/密林翡翠)
        { id: 'yn_bamboo_chair', name: '滇南纯竹编摇椅', origin: 'yunnan', cat: 'life', basePrice: 180, currency: 'copper', icon: '🪑', desc: '老斑竹柔韧编制，清凉透气夏日安眠。' },
        { id: 'yn_dai_brocade', name: '傣族织锦披肩', origin: 'yunnan', cat: 'life', basePrice: 310, currency: 'copper', icon: '🧣', desc: '孔雀花纹图案，热带雨林浓郁民族风情。' },
        { id: 'yn_copper_tea_set', name: '乌铜走银茶具', origin: 'yunnan', cat: 'life', basePrice: 720, currency: 'copper', icon: '🫖', desc: '非遗绝技乌铜雕银，黑白辉映典雅古朴。' },
        { id: 'yn_aloe_bed', name: '沉香木卧榻', origin: 'yunnan', cat: 'life', basePrice: 1350, currency: 'copper', icon: '🛋️', desc: '深山老沉香整木拼接，通体散发安神幽香。' },
        { id: 'yn_purple_pot', name: '建水紫陶茶壶', origin: 'yunnan', cat: 'life', basePrice: 420, currency: 'copper', icon: '🏺', desc: '阴刻阳填无釉磨光，泡茶数日不馊。' },
        { id: 'yn_peacock_feather', name: '七彩孔雀羽衣', origin: 'yunnan', cat: 'life', basePrice: 890, currency: 'copper', icon: '🦚', desc: '纯天然孔雀翎羽织就，光华夺目如神仙中人。' },

        { id: 'yn_pu_er_cake', name: '百年古树普洱茶饼', origin: 'yunnan', cat: 'food', basePrice: 380, currency: 'copper', icon: '🍵', desc: '易武正山百年乔木大叶种，陈香扑鼻汤红透亮。' },
        { id: 'yn_polygonum', name: '滇南百年何首乌', origin: 'yunnan', cat: 'food', basePrice: 460, currency: 'copper', icon: '🌿', desc: '深山野岭采掘，形如人形补益精血。' },
        { id: 'yn_cordyceps', name: '玉龙雪山冬虫夏草', origin: 'yunnan', cat: 'food', basePrice: 680, currency: 'copper', icon: '🐛', desc: '雪线之上天然滋补圣品，补肾益肺养气血。' },
        { id: 'yn_jizong_mushroom', name: '野山珍极品鸡枞菌', origin: 'yunnan', cat: 'food', basePrice: 280, currency: 'copper', icon: '🍄', desc: '白蚁巢穴共生鲜菌，油炸入味鲜绝天下。' },
        { id: 'yn_xuanwei_ham', name: '滇式宣威火腿', origin: 'yunnan', cat: 'food', basePrice: 320, currency: 'copper', icon: '🍖', desc: '形似琵琶皮薄肉嫩，香气浓郁肥而不腻。' },
        { id: 'yn_rose_cake', name: '鲜花玫瑰饼', origin: 'yunnan', cat: 'food', basePrice: 75, currency: 'copper', icon: '🥮', desc: '清晨带露食用玫瑰入馅，花香四溢酥软甜美。' },
        { id: 'yn_wild_honey', name: '哀牢山野生蜂蜜', origin: 'yunnan', cat: 'food', basePrice: 190, currency: 'copper', icon: '🍯', desc: '悬崖野蜂采百花灵蜜，结晶如凝脂甘甜清冽。' },

        { id: 'yn_emerald_raw', name: '缅甸极品帝王绿翡翠', origin: 'yunnan', cat: 'luxury', basePrice: 4600, currency: 'copper', icon: '💠', desc: '老坑玻璃种帝王绿原石，翠色欲滴价值连城。' },
        { id: 'yn_dragon_wood', name: '千年沉香龙涎香木', origin: 'yunnan', cat: 'luxury', basePrice: 3200, currency: 'copper', icon: '🪵', desc: '集天地灵秀之香木，燃一寸可使满室异香。' },
        { id: 'yn_shaman_stone', name: '南诏神巫灵石', origin: 'yunnan', cat: 'luxury', basePrice: 2900, currency: 'copper', icon: '🔮', desc: '南诏古国大祭司通灵宝石，可沟通自然万物。' },
        { id: 'yn_nine_leaf_herb', name: '九叶还魂仙草', origin: 'yunnan', cat: 'jade', basePrice: 35, currency: 'jade', icon: '🌱', desc: '传说长于十万大山悬崖之巅，具起死回生神效。' },
    ],

    zhejiang: [
        // 浙江·江南水乡 (苏绣名丝/龙泉古剑)
        { id: 'zj_sword_embryo', name: '龙泉水淬名剑胚', origin: 'zhejiang', cat: 'life', basePrice: 420, currency: 'copper', icon: '🗡️', desc: '欧冶子古法水淬，七星寒光未开刃已带杀气。' },
        { id: 'zj_silk_dress', name: '西湖织锦罗裙', origin: 'zhejiang', cat: 'life', basePrice: 560, currency: 'copper', icon: '👗', desc: '江南水乡极品桑蚕丝织造，轻薄如羽薄如蝉翼。' },
        { id: 'zj_brush_pen', name: '湖州极品狼毫笔', origin: 'zhejiang', cat: 'life', basePrice: 220, currency: 'copper', icon: '🖌️', desc: '文房四宝之冠，健劲圆齐书画挥洒自如。' },
        { id: 'zj_celadon_cup', name: '青瓷双耳冰裂盏', origin: 'zhejiang', cat: 'life', basePrice: 350, currency: 'copper', icon: '🍵', desc: '雨过天晴云破处，这般颜色做将来。' },
        { id: 'zj_oil_umbrella', name: '西塘古法油纸伞', origin: 'zhejiang', cat: 'life', basePrice: 130, currency: 'copper', icon: '☂️', desc: '江南烟雨情愫，桐油刷透百雨不漏。' },
        { id: 'zj_silk_fan', name: '绍兴丝绢折扇', origin: 'zhejiang', cat: 'life', basePrice: 190, currency: 'copper', icon: '🪭', desc: '乌木扇骨丝绢题诗，江南才子风雅随身。' },

        { id: 'zj_longjing_tea', name: '西湖龙井明前茶', origin: 'zhejiang', cat: 'food', basePrice: 340, currency: 'copper', icon: '🍃', desc: '清明前采摘狮峰嫩芽，色翠香郁味甘形美。' },
        { id: 'zj_daughter_red', name: '绍兴二十年女儿红', origin: 'zhejiang', cat: 'food', basePrice: 290, currency: 'copper', icon: '🏺', desc: '糯米红曲深埋地窖二十载，开坛酒香扑鼻。' },
        { id: 'zj_jinhua_ham', name: '金华特级金字火腿', origin: 'zhejiang', cat: 'food', basePrice: 330, currency: 'copper', icon: '🥩', desc: '两头乌猪后腿腌制，色泽鲜红香气经久不散。' },
        { id: 'zj_meat_zongzi', name: '嘉兴鲜肉蛋黄粽', origin: 'zhejiang', cat: 'food', basePrice: 65, currency: 'copper', icon: '🍙', desc: '箬叶飘香糯米滑软，肥瘦相间蛋黄流油。' },
        { id: 'zj_loquat_paste', name: '塘栖极品枇杷膏', origin: 'zhejiang', cat: 'food', basePrice: 160, currency: 'copper', icon: '🍯', desc: '古法柴火慢熬数日，清喉利咽止咳神品。' },
        { id: 'zj_lotus_powder', name: '西湖藕粉凝露', origin: 'zhejiang', cat: 'food', basePrice: 90, currency: 'copper', icon: '🥣', desc: '采西湖野生红莲根茎磨粉，冲调晶莹如胶。' },

        { id: 'zj_pure_sword', name: '龙泉纯钧开天神剑', origin: 'zhejiang', cat: 'luxury', basePrice: 4900, currency: 'copper', icon: '⚔️', desc: '尊贵无双之神剑，剑身若芙蓉出水如列星宿。' },
        { id: 'zj_ru_porcelain', name: '天青釉汝窑无瑕瓶', origin: 'zhejiang', cat: 'luxury', basePrice: 5800, currency: 'copper', icon: '🏺', desc: '举世无双的瓷器神品，温润如玉不可多得。' },
        { id: 'zj_heavenly_silk', name: '西子浣纱天蚕丝', origin: 'zhejiang', cat: 'luxury', basePrice: 3600, currency: 'copper', icon: '🧵', desc: '万年雪蚕所吐神丝，刀枪不入水火不侵。' },
        { id: 'zj_lake_marrow', name: '太湖万年灵髓', origin: 'zhejiang', cat: 'jade', basePrice: 32, currency: 'jade', icon: '💧', desc: '太湖灵脉凝聚万载的水行圣髓，洗髓伐毛。' },
    ],

    qinghai: [
        // 青海·极西圣境 (昆仑圣山/塞外荒原)
        { id: 'qh_fox_fur', name: '昆仑雪域白狐裘', origin: 'qinghai', cat: 'life', basePrice: 480, currency: 'copper', icon: '🦊', desc: '雪山灵狐纯白冬毛，轻如云朵御极寒风雪。' },
        { id: 'qh_silver_saddle', name: '藏银雕花马鞍', origin: 'qinghai', cat: 'life', basePrice: 680, currency: 'copper', icon: '🏇', desc: '纯银镶嵌绿松石，塞外骑士威风显赫。' },
        { id: 'qh_bone_knife', name: '牦牛骨柄藏刀', origin: 'qinghai', cat: 'life', basePrice: 320, currency: 'copper', icon: '🗡️', desc: '牦牛腿骨雕花刀柄，锋利实用防身利器。' },
        { id: 'qh_cashmere_cloak', name: '极寒羊绒大氅', origin: 'qinghai', cat: 'life', basePrice: 590, currency: 'copper', icon: '🧥', desc: '高原野山羊绒密织，防寒保暖堪称一绝。' },

        { id: 'qh_cordyceps', name: '昆仑极品冬虫夏草', origin: 'qinghai', cat: 'food', basePrice: 720, currency: 'copper', icon: '🐛', desc: '海拔四千米以上野生极品，药效卓绝。' },
        { id: 'qh_black_goji', name: '高原野生黑枸杞', origin: 'qinghai', cat: 'food', basePrice: 240, currency: 'copper', icon: '🫐', desc: '花青素之王，入水幻化紫蓝梦幻色泽。' },
        { id: 'qh_snow_lotus', name: '藏地极品雪莲花', origin: 'qinghai', cat: 'food', basePrice: 510, currency: 'copper', icon: '🪷', desc: '生长于万年冰碛岩缝，通经活血散寒神药。' },
        { id: 'qh_yak_meat', name: '高原牦牛肉干', origin: 'qinghai', cat: 'food', basePrice: 270, currency: 'copper', icon: '🥩', desc: '高蛋白低脂肪，长途跋涉补充气血神物。' },
        { id: 'qh_musk', name: '麝香极品灵脂', origin: 'qinghai', cat: 'food', basePrice: 650, currency: 'copper', icon: '🧪', desc: '野生原麝天然香囊，开窍通神名贵之冠。' },

        { id: 'qh_crystal', name: '昆仑天晶万年寒冰髓', origin: 'qinghai', cat: 'luxury', basePrice: 3400, currency: 'copper', icon: '❄️', desc: '万年不化之玄冰晶体，炼制冰系法宝至尊主材。' },
        { id: 'qh_earth_mother', name: '极西坤灵大地母石', origin: 'qinghai', cat: 'luxury', basePrice: 4200, currency: 'copper', icon: '🪨', desc: '蕴含极西浑厚土系本源神力，重逾万钧。' },
        { id: 'qh_nine_eye_bead', name: '九眼天珠灵舍利', origin: 'jade', cat: 'jade', basePrice: 40, currency: 'jade', icon: '📿', desc: '佛法加持万年九眼天珠，护佑心神破除一切业障。' },
    ],
};

// 🌟 构建全量商品检索索引表 (goodId -> GoodDefinition)
export const ALL_TRADE_GOODS = {};
for (const goods of Object.values(CITY_TRADE_GOODS_DB)) {
    for (const g of goods) {
        ALL_TRADE_GOODS[g.id] = g;
    }
}

// 🌟 商票货物身份前缀与商票物品 ID
export const TRADE_ITEM_PREFIX = 'trade_';
export const TICKET_ITEM_ID = 'merchant_ticket';

/**
 * 🌟 江湖风闻与跑商情报数据库 (动态事件与供需暴涨模型)
 */
export const TRADE_INTEL_EVENTS_DB = [
    {
        id: 'flood_hebei',
        tag: '🌊 天灾暴涨',
        title: '太行山洪断道 · 冀州极度缺货',
        narrator: '申江北上行商 · 顾老汉',
        avatar: '👴',
        story: '“老汉我前日从上海押货北上，途经太行山东麓突遇暴雨山洪，将官道主桥彻底冲垮！上海、北京和浙江的大队货车全阻滞在半路。如今河北城里物资匮乏至极，各大商铺掌柜正在驿馆高价悬赏抢购南方与京畿货物！”',
        targetCity: 'hebei',
        originCities: ['shanghai', 'beijing', 'zhejiang'],
        multiplierBonus: 2.8, // 价格暴涨 +280%
        impactText: '河北驿馆高价回收【上海/北京/浙江】全系货物 (+280%)',
        advice: '从上海或浙江赊购精盐、丝绸、龙井茶运往河北，一趟暴赚数万铜！',
    },
    {
        id: 'taihu_storm_zhejiang',
        tag: '🌪️ 工坊重建',
        title: '太湖风暴水龙卷 · 临安重金求铁',
        narrator: '姑苏绸庄大掌柜 · 苏先生',
        avatar: '🧮',
        story: '“昨日太湖遭遇数十年不遇的水龙卷，江南临湖数十家织造工坊与茶庄库房尽数受损。苏杭十三商号联名开出重金悬赏，急需大量河北的百炼精铁锅、铸铁火炉与塞北羊毛毡用于修缮避寒！”',
        targetCity: 'zhejiang',
        originCities: ['hebei'],
        multiplierBonus: 3.0, // 价格暴涨 +300%
        impactText: '浙江驿馆高价收购【河北】重工与生活特产 (+300%)',
        advice: '在河北大量购入百炼精铁锅与铸铁火炉，步行南下浙江出售！',
    },
    {
        id: 'beijing_royal_jubilee',
        tag: '👑 皇家御贡',
        title: '帝京万寿圣节 · 内务府急征御茶翡翠',
        narrator: '紫禁城御膳房采办使 · 冯公公',
        avatar: '👲',
        story: '“帝京紫禁城即将举行万寿圣节大典，礼部与内务府向天下征收奇珍贡礼。云南特产的百年古树普洱茶饼、雪山冬虫夏草及极品帝王绿翡翠被定为头等御贡，朝廷特使在京城驿馆加价四倍包销收购！”',
        targetCity: 'beijing',
        originCities: ['yunnan'],
        multiplierBonus: 3.5, // 价格暴涨 +350%
        impactText: '北京驿馆极高价包销【云南】古茶、药材与翡翠 (+350%)',
        advice: '从西南云南启程，长途跋涉运茶入京，是跑商收益最高的黄金路线！',
    },
    {
        id: 'qinghai_snow_blizzard',
        tag: '❄️ 封山救荒',
        title: '昆仑万载大暴雪 · 塞外部族急购美馔海盐',
        narrator: '塞北驼队首领 · 铁木尔',
        avatar: '🏇',
        story: '“极西昆仑突降九天暴雪封山，高原草料受阻、粮盐紧缺。青海各大部族酋长与商会以昆仑玄冰与九眼天珠作质，急求浙江金华火腿、嘉兴鲜肉粽与东海特级精海盐用于过冬救荒！”',
        targetCity: 'qinghai',
        originCities: ['zhejiang', 'shanghai'],
        multiplierBonus: 2.6, // 价格暴涨 +260%
        impactText: '青海驿馆高价收购【浙江/上海】生鲜食品与海盐 (+260%)',
        advice: '从上海贩运精海盐、从浙江贩运金华火腿直奔青海，利润极丰！',
    },
    {
        id: 'shanghai_world_expo',
        tag: '🛳️ 洋场博览',
        title: '外滩万国博览会 · 洋行疯抢极西皮草灵珠',
        narrator: '申江十三洋行买办 · 查理沈',
        avatar: '🎩',
        story: '“十里洋场正值万国商贸盛会，西洋大班与名媛贵胄对极西高原的昆仑白狐裘、牦牛骨柄藏刀及野生黑枸杞狂热追捧！各大洋行联合在上海驿馆挂牌开秤，高价整批回收！”',
        targetCity: 'shanghai',
        originCities: ['qinghai'],
        multiplierBonus: 2.7, // 价格暴涨 +270%
        impactText: '上海驿馆高价回收【青海】白狐裘、藏刀与高原特产 (+270%)',
        advice: '自青海昆仑采购皮草与藏刀，沿丝路运往上海十里洋场！',
    },
    {
        id: 'yunnan_torch_festival',
        tag: '🏮 南诏盛会',
        title: '十万大山火把盛典 · 土司重金采办烈酒龙缎',
        narrator: '滇南白族女掌柜 · 阿朵',
        avatar: '🧕',
        story: '“滇南即将迎来十年一度的火把狂欢与药神盛典！各大土司急购河北衡水老白干六十七度烈酒用于祭祀火神，并重金求购紫禁御制龙缎与景泰蓝作为神像披风，全城商号开出重金收购！”',
        targetCity: 'yunnan',
        originCities: ['hebei', 'beijing'],
        multiplierBonus: 2.9, // 价格暴涨 +290%
        impactText: '云南驿馆高价回收【河北烈酒 / 北京龙缎景泰蓝】 (+290%)',
        advice: '在北方备齐老白干与紫禁锦缎，翻山越岭运至云南卖出！',
    },
];

/** 获取当前 30 分钟周期内的活跃江湖风闻事件 (3~4 条轮换) */
export function getActiveTradeIntel(now = Date.now()) {
    const cycle = Math.floor(now / TRADE_REFRESH_CYCLE_MS);
    const count = TRADE_INTEL_EVENTS_DB.length;
    // 每轮选出 4 条活跃风闻
    const active = [];
    for (let i = 0; i < 4; i++) {
        const idx = (_hashString(`trade_intel_${cycle}_${i}`) % count);
        if (!active.some(a => a.id === TRADE_INTEL_EVENTS_DB[idx].id)) {
            active.push(TRADE_INTEL_EVENTS_DB[idx]);
        }
    }
    // 确保至少有 3 条
    while (active.length < 3) {
        const next = TRADE_INTEL_EVENTS_DB[active.length % count];
        if (!active.includes(next)) active.push(next);
    }
    return active;
}

/** 城市拓扑跳数/距离矩阵 (用于动态算价) */
export function getCityDistance(fromCity, toCity) {
    if (fromCity === toCity) return 0;
    const distanceGraph = {
        beijing:  { hebei: 1, zhejiang: 2, shanghai: 2, qinghai: 3, yunnan: 4 },
        hebei:    { beijing: 1, zhejiang: 2, shanghai: 2, qinghai: 2, yunnan: 3 },
        zhejiang: { hebei: 2, shanghai: 1, beijing: 2, yunnan: 3, qinghai: 4 },
        shanghai: { zhejiang: 1, beijing: 2, hebei: 2, yunnan: 3, qinghai: 4 },
        yunnan:   { qinghai: 2, hebei: 3, zhejiang: 3, shanghai: 3, beijing: 4 },
        qinghai:  { hebei: 2, yunnan: 2, beijing: 3, shanghai: 4, zhejiang: 4 },
    };
    return (distanceGraph[fromCity] && distanceGraph[fromCity][toCity]) || 2;
}

/** 城市中文名称映射 */
export function getCityName(cityId) {
    const names = {
        beijing: '北京',
        hebei: '河北',
        shanghai: '上海',
        yunnan: '云南',
        qinghai: '青海',
        zhejiang: '浙江',
        sky_city: '天空之城',
    };
    return names[cityId] || cityId;
}

/** 确定性 Hash 工具函数 */
function _hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * 🌟 核心贸易定价与物价波动算法
 * 规则:
 * 1. 本地保护: 在原产地销售，价格大幅下跌 30% (跌30%)
 * 2. 敌对惩罚: 河北 ↔ 上海 为敌对城市，互相贩运亏损 10% (跌10%)
 * 3. 专属亏损: 北京 ➔ 上海 暴跌 60% (500铜跌至200铜)
 * 4. 专属暴利: 云南 ➔ 北京 暴利 +150% ~ +300%
 * 5. 隔城暴利: 河北 ➔ 浙江(相隔一城且非敌对) 动态暴利 +100% ~ +500%
 * 6. 江湖风闻: 动态时事事件加成 +200% ~ +350% 暴利
 * 7. 通用距离: 相邻(跳数1) ±50%, 较远(跳数3) ±100%, 最远(跳数4+) ±200%
 */
export function calculateTradePrice(good, currentCity, now = Date.now()) {
    if (!good) return { price: 100, multiplier: 1.0, hint: '', isRumorBoost: false };
    const origin = good.origin;
    const dest = currentCity;
    const cycle = Math.floor(now / TRADE_REFRESH_CYCLE_MS);
    const noiseSeed = _hashString(`${good.id}_${origin}_${dest}_${cycle}`);
    const wave = Math.sin((now / (5 * 60 * 1000)) * Math.PI * 2 + (noiseSeed % 100));
    const randomRatio = (noiseSeed % 1000) / 1000.0; // 0.0 ~ 1.0

    let mult = 1.0;
    let routeHint = '';
    let isRumorBoost = false;

    // 🌟 检查是否命中当前活跃江湖风闻事件
    const activeRumors = getActiveTradeIntel(now);
    for (const r of activeRumors) {
        if (r.targetCity === dest && r.originCities.includes(origin)) {
            mult = r.multiplierBonus + 0.3 * wave + 0.2 * randomRatio;
            routeHint = `🔥【风闻暴涨】${r.title.slice(0, 8)} (+${Math.round((mult - 1) * 100)}%)`;
            isRumorBoost = true;
            break;
        }
    }

    if (!isRumorBoost) {
        if (origin === dest) {
            // 1. 本地买卖: 本地保护，跌 30%
            mult = 0.70;
            routeHint = '本地甩卖(跌30%)';
        } else if ((origin === 'hebei' && dest === 'shanghai') || (origin === 'shanghai' && dest === 'hebei')) {
            // 2. 敌对城市: 河北 ↔ 上海 运送敌对货物，亏损 10%
            mult = 0.90;
            routeHint = '敌对城市(亏损-10%)';
        } else if (origin === 'beijing' && dest === 'shanghai') {
            // 3. 特殊亏损路线: 北京 ➔ 上海 暴跌 60%
            mult = 0.40;
            routeHint = '滞销重灾(暴跌-60%)';
        } else if (origin === 'yunnan' && dest === 'beijing') {
            // 4. 特殊高收益路线: 云南 ➔ 北京 (+150% ~ +300% 暴利)
            mult = 2.5 + 0.5 * wave + 0.5 * randomRatio;
            routeHint = '帝京御贡(暴赚+250%)';
        } else if ((origin === 'hebei' && dest === 'zhejiang') || (origin === 'zhejiang' && dest === 'hebei')) {
            // 5. 相隔一城暴利路线: 河北 ➔ 浙江 (+100% ~ +500% 动态暴利)
            mult = 2.0 + 4.0 * randomRatio + 0.5 * wave;
            routeHint = '隔城通商(暴利+300%)';
        } else {
            // 6. 通用距离模型
            const dist = getCityDistance(origin, dest);
            if (dist === 1) {
                // 相邻城池 (±50%)
                mult = 1.2 + 0.3 * wave + 0.2 * randomRatio;
                routeHint = '邻城微利(+35%)';
            } else if (dist === 2) {
                // 相隔一城 (通用 +80% ~ +150%)
                mult = 1.8 + 0.4 * wave + 0.4 * randomRatio;
                routeHint = '跨城利好(+90%)';
            } else if (dist === 3) {
                // 较远城池 (±100%)
                mult = 2.0 + 0.5 * wave + 0.5 * randomRatio;
                routeHint = '长途跋涉(+120%)';
            } else {
                // 最远城池 (±200%)
                mult = 2.8 + 0.6 * wave + 0.6 * randomRatio;
                routeHint = '万里商途(+200%)';
            }
        }
    }

    const finalPrice = Math.max(1, Math.round(good.basePrice * mult));
    return {
        price: finalPrice,
        multiplier: mult,
        hint: routeHint,
        isRumorBoost,
    };
}

/** 某商品在某城的在售/采购价 (赊购价) */
export function getTradeGoodPrice(good, cityId, now = Date.now()) {
    const res = calculateTradePrice(good, cityId, now);
    return res.price;
}

/** 驿站收购价 (全城无条件回收，按行情 × 95% 回收) */
export function getTradeSellPrice(good, cityId, now = Date.now()) {
    const res = calculateTradePrice(good, cityId, now);
    return Math.max(1, Math.round(res.price * TICKET_SELL_RATIO));
}

/** 货物图标与渲染字形 */
export function getTradeGlyph(item) {
    if (!item) return null;
    const iid = item.item_id || item.itemId || item.id || '';
    if (iid === TICKET_ITEM_ID) return '📜';
    if (typeof iid === 'string' && iid.startsWith(TRADE_ITEM_PREFIX)) {
        const g = ALL_TRADE_GOODS[iid.slice(TRADE_ITEM_PREFIX.length)];
        return g ? g.icon : '📦';
    }
    return null;
}

/** 收集背包中所有的商票特产货物 (精准读取当初买入价与进货地) */
export function collectBackpackCargo() {
    const list = [];
    for (const it of (gameState.backpack || [])) {
        if (!it) continue;
        const iid = it.item_id || it.itemId || it.id || '';
        if (typeof iid !== 'string' || !iid.startsWith(TRADE_ITEM_PREFIX)) continue;
        const goodId = iid.slice(TRADE_ITEM_PREFIX.length);
        const good = ALL_TRADE_GOODS[goodId];
        const buyPrice = it.attributes && typeof it.attributes.buy_price === 'number' 
            ? it.attributes.buy_price 
            : (good ? good.basePrice : 100);
        const originCity = it.attributes && it.attributes.origin_city 
            ? it.attributes.origin_city 
            : (good ? good.origin : 'beijing');
        const count = Number(it.stack_count || it.stackCount || 1);

        list.push({
            id: it.id,
            goodId,
            name: good ? good.name : it.name,
            icon: good ? good.icon : '📦',
            count,
            buyPrice,
            originCity,
            good: good || { id: goodId, name: it.name, origin: originCity, basePrice: buyPrice, icon: '📦', desc: '九州商贸特产' },
        });
    }
    return list;
}

// 内部 UI 状态 (主标签页、分类筛选、翻页)
let activeMainTab = 'market'; // 'market' | 'cargo' | 'intel'
let activeCategory = 'all';
let buyPageIndex = 0;
let sellPageIndex = 0;
let intelScrollY = 0;
const ITEMS_PER_PAGE = 5;

/** 30 分钟轮换上架算法: 从当前城市的货物池中随机挑选并标注售罄状态 */
export function getCityStationStock(cityId, now = Date.now()) {
    const allGoods = CITY_TRADE_GOODS_DB[cityId] || CITY_TRADE_GOODS_DB.beijing;
    const cycle = Math.floor(now / TRADE_REFRESH_CYCLE_MS);
    
    return allGoods.map((good, idx) => {
        const itemHash = _hashString(`${good.id}_${cityId}_${cycle}_${idx}`);
        // 20% 概率热门货物售罄 (名贵珍品/仙品更高概率售罄)
        const soldOutChance = good.cat === 'luxury' || good.cat === 'jade' ? 30 : 15;
        const isSoldOut = (itemHash % 100) < soldOutChance;
        const remainingStock = isSoldOut ? 0 : 5 + (itemHash % 35);
        return {
            ...good,
            isSoldOut,
            remainingStock,
        };
    });
}

/** 绘制商票驿站全屏模态框 */
export function drawTradeModal(ctx, w, h, time) {
    if (!uiState.isOpen('trade')) return;

    const bounds = getModalBounds('trade', w, h);
    const { mx, my, mw, mh } = bounds;

    drawHoloModalFrame(ctx, mx, my, mw, mh, '#f59e0b', '📜 九州商票驿站 (跑商总汇)', time);

    const now = Date.now();
    const currentCity = gameState.current_city_id || gameState.current_zone_id || 'beijing';
    const ticket = gameState.merchant_ticket;

    // 倒计时计算
    const elapsedInCycle = now % TRADE_REFRESH_CYCLE_MS;
    const remainingMs = TRADE_REFRESH_CYCLE_MS - elapsedInCycle;
    const remMins = Math.floor(remainingMs / 60000);
    const remSecs = Math.floor((remainingMs % 60000) / 1000);
    const timerStr = `${String(remMins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // 1. 顶部状态栏: 驻留驿馆 & 30分钟刷新倒计时
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx + 16, my + 44, mw - 32, 28, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText(`📍 驻留驿站: 【${getCityName(currentCity)}驿馆】 ｜ ⏰ 行情与江湖风闻倒计时: `, mx + 26, my + 51);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(timerStr, mx + 365, my + 50);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('（每30分钟轮换一次，全城无条件回收无滞销）', mx + 420, my + 51);

    // 2. 未持有商票视图
    if (!ticket || !ticket.is_active) {
        const heroY = my + 80;
        ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
        ctx.strokeStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(mx + 16, heroY, mw - 32, mh - 98, 6);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('🏛️ 申领大宗通商商票 (开启九州跑商之旅)', mx + 36, heroY + 24);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '13px sans-serif';
        const lines = [
            `• 押金要求: 需缴纳 ${TICKET_DEPOSIT.toLocaleString()} 铜押金（交割商票时全额退还）。`,
            `• 初始额度: 获得 ${TICKET_INITIAL_LIMIT.toLocaleString()} 铜初始采购额度，凭额度赊购本城特产，无需垫付铜钱。`,
            `• 记账无忧: 背包物品及货单上会用小字自动记录【当初买入价】，绝不遗忘成本！`,
            `• 移动限制: 领取商票后禁用飞行与快速传送（神行符/地图传送），必须脚踏实地步行跨图运货！`,
            `• 终点目标: 将商票资产累计回款达到 ${TICKET_SETTLE_TARGET.toLocaleString()} 铜，即可在任意大城驿站交割完成任务。`,
            `• 收益回报: 退还 ${TICKET_DEPOSIT.toLocaleString()} 铜押金 + 发放额外丰厚跑商奖励金（铜钱+金币+仙玉）。`,
            `• 江湖情报: 随时查看【跑商情报】页，山洪断路、天灾救荒、御贡急征等动态事件让利润飙升 +300%！`,
        ];
        lines.forEach((line, i) => {
            ctx.fillText(line, mx + 36, heroY + 58 + i * 26);
        });

        // 领取商票按钮
        const playerCopper = Number(gameState.copper) || 0;
        const canAfford = playerCopper >= TICKET_DEPOSIT;
        const btnW = 280, btnH = 42;
        const btnX = mx + mw / 2 - btnW / 2, btnY = heroY + 260;

        ctx.fillStyle = canAfford ? 'rgba(245, 158, 11, 0.25)' : 'rgba(51, 65, 85, 0.3)';
        ctx.strokeStyle = canAfford ? '#f59e0b' : '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 6);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = canAfford ? '#fbbf24' : '#64748b';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(canAfford ? `缴纳押金 3万铜 领取商票` : `铜钱不足 3万 (当前: ${playerCopper.toLocaleString()})`, btnX + btnW / 2, btnY + 14);
        ctx.restore();
        return;
    }

    // 3. 已持有商票状态栏 (额度、押金、交割进度)
    const infoY = my + 78;
    const creditTotal = Number(ticket.credit_limit || TICKET_INITIAL_LIMIT);
    const usedCredit = Number(ticket.used_credit || 0);
    const freeCredit = Math.max(0, creditTotal - usedCredit);
    const earnedTotal = Number(ticket.earned_total || 0);
    const depositAmount = Number(ticket.current_deposit || TICKET_DEPOSIT);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(mx + 16, infoY, mw - 32, 54, 6);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`📜 商票签发: 【${getCityName(ticket.issue_city)}】 ｜ 押金: ${depositAmount.toLocaleString()} 铜 ｜ 总额度: ${creditTotal.toLocaleString()} 铜`, mx + 28, infoY + 8);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`可用额度: ${freeCredit.toLocaleString()} 铜 ｜ 已用额度: ${usedCredit.toLocaleString()} 铜 ｜ 🚫 跑商限制中: 禁用飞行传送`, mx + 28, infoY + 24);

    // 交割进度条
    const prog = Math.min(1.0, earnedTotal / TICKET_SETTLE_TARGET);
    const barX = mx + 28, barY = infoY + 40, barW = mw - 190, barH = 6;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
    ctx.fillStyle = prog >= 1.0 ? '#10b981' : '#f59e0b';
    if (prog > 0) {
        ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(6, barW * prog), barH, 3); ctx.fill();
    }
    ctx.fillStyle = prog >= 1.0 ? '#34d399' : '#cbd5e1';
    ctx.font = '10px monospace';
    ctx.fillText(`回款进度: ${earnedTotal.toLocaleString()} / ${TICKET_SETTLE_TARGET.toLocaleString()} (${Math.round(prog * 100)}%)`, barX + barW + 12, barY - 2);

    // 4. 三大主导航标签栏 (【特产货架】 / 【随身货单】 / 【跑商情报】)
    const mainTabY = infoY + 60;
    const mainTabW = 110, mainTabH = 26;
    TRADE_MAIN_TABS.forEach((mt, i) => {
        const tx = mx + 16 + i * (mainTabW + 8);
        const isCur = activeMainTab === mt.id;
        ctx.fillStyle = isCur ? 'rgba(245, 158, 11, 0.3)' : 'rgba(30, 41, 59, 0.6)';
        ctx.strokeStyle = isCur ? '#f59e0b' : '#475569';
        ctx.lineWidth = isCur ? 1.5 : 1;
        ctx.beginPath(); ctx.roundRect(tx, mainTabY, mainTabW, mainTabH, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = isCur ? '#fbbf24' : '#94a3b8';
        ctx.font = isCur ? 'bold 12px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mt.label, tx + mainTabW / 2, mainTabY + 6);
        ctx.textAlign = 'left';
    });

    // 5. 根据当前主标签页渲染不同子面板
    if (activeMainTab === 'intel') {
        // 🌟【跑商情报】(江湖风闻情报墙)
        drawIntelPanel(ctx, mx, my, mw, mh, mainTabY + mainTabH + 8, now, timerStr);
    } else if (activeMainTab === 'cargo') {
        // 🌟【随身货单】(买入价与回收利润详情)
        drawCargoDetailPanel(ctx, mx, my, mw, mh, mainTabY + mainTabH + 8, now, currentCity);
    } else {
        // 🌟【特产货架】(双列布局: 本城在售 + 右侧快速出售)
        drawMarketPanel(ctx, mx, my, mw, mh, mainTabY + mainTabH + 8, now, currentCity, freeCredit);
    }

    // 6. 底部商票交割栏
    const settleReady = earnedTotal >= TICKET_SETTLE_TARGET;
    const sw = 320, sh = 34;
    const sx = mx + mw / 2 - sw / 2, syBtn = my + mh - 44;

    ctx.fillStyle = settleReady ? 'rgba(52, 211, 153, 0.25)' : 'rgba(51, 65, 85, 0.4)';
    ctx.strokeStyle = settleReady ? '#34d399' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(sx, syBtn, sw, sh, 5); ctx.fill(); ctx.stroke();

    ctx.fillStyle = settleReady ? '#34d399' : '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
        settleReady 
            ? '💰 交割商票 (退还押金3万 + 核发丰厚奖励金)' 
            : `交割商票 (累计回款需达 10万铜: ${earnedTotal.toLocaleString()}/100,000)`, 
        sx + sw / 2, 
        syBtn + 10
    );

    ctx.restore();
}

/** 🌟 绘制【特产货架】常规交易面板 */
function drawMarketPanel(ctx, mx, my, mw, mh, startY, now, currentCity, freeCredit) {
    // 分类筛选标签
    const catTabW = 74, catTabH = 22;
    TRADE_CATEGORIES.forEach((cat, i) => {
        const tx = mx + 16 + i * (catTabW + 6);
        const isCur = activeCategory === cat.id;
        ctx.fillStyle = isCur ? 'rgba(245, 158, 11, 0.25)' : 'rgba(30, 41, 59, 0.6)';
        ctx.strokeStyle = isCur ? '#f59e0b' : '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(tx, startY, catTabW, catTabH, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = isCur ? '#fbbf24' : '#94a3b8';
        ctx.font = isCur ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cat.label, tx + catTabW / 2, startY + 5);
        ctx.textAlign = 'left';
    });

    const colW = mw / 2 - 24;
    const listY = startY + 28;

    // 左列: 本城特产货架
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`🏪 ${getCityName(currentCity)}特产货架 (本期轮换库存)`, mx + 16, listY);

    const stationGoods = getCityStationStock(currentCity, now);
    const filteredGoods = activeCategory === 'all' ? stationGoods : stationGoods.filter(g => g.cat === activeCategory);
    const totalBuyPages = Math.max(1, Math.ceil(filteredGoods.length / ITEMS_PER_PAGE));
    const curBuyGoods = filteredGoods.slice(buyPageIndex * ITEMS_PER_PAGE, (buyPageIndex + 1) * ITEMS_PER_PAGE);

    let gy = listY + 20;
    curBuyGoods.forEach((g) => {
        const priceInfo = calculateTradePrice(g, currentCity, now);
        const price = priceInfo.price;
        const isSoldOut = g.isSoldOut || g.remainingStock <= 0;

        ctx.fillStyle = isSoldOut ? 'rgba(20, 24, 33, 0.6)' : 'rgba(255, 255, 255, 0.03)';
        ctx.strokeStyle = isSoldOut ? '#334155' : priceInfo.isRumorBoost ? '#f59e0b' : '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx + 16, gy, colW, 44, 4);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = isSoldOut ? '#64748b' : '#f8fafc';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${g.icon} ${g.name}`, mx + 24, gy + 6);

        ctx.fillStyle = isSoldOut ? '#ef4444' : '#fbbf24';
        ctx.font = '11px sans-serif';
        ctx.fillText(isSoldOut ? `【已售罄】` : `${price.toLocaleString()} 铜/件 (余:${g.remainingStock})`, mx + 24, gy + 24);

        // 原产地与行情小字
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${priceInfo.hint || g.desc.slice(0, 12)}`, mx + 160, gy + 24);

        if (!isSoldOut) {
            const btnW = 38, btnH = 22;
            const b1X = mx + 16 + colW - 88;
            const b5X = mx + 16 + colW - 44;
            const bY = gy + 11;

            const canBuy1 = freeCredit >= price;
            const canBuy5 = freeCredit >= price * 5 && g.remainingStock >= 5;

            ctx.fillStyle = canBuy1 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(51, 65, 85, 0.3)';
            ctx.strokeStyle = canBuy1 ? '#10b981' : '#475569';
            ctx.beginPath(); ctx.roundRect(b1X, bY, btnW, btnH, 3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = canBuy1 ? '#10b981' : '#64748b';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('购1', b1X + btnW / 2, bY + 5);

            ctx.fillStyle = canBuy5 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(51, 65, 85, 0.3)';
            ctx.strokeStyle = canBuy5 ? '#10b981' : '#475569';
            ctx.beginPath(); ctx.roundRect(b5X, bY, btnW, btnH, 3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = canBuy5 ? '#10b981' : '#64748b';
            ctx.fillText('购5', b5X + btnW / 2, bY + 5);
            ctx.textAlign = 'left';
        } else {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText('🚫 本期已售罄', mx + 16 + colW - 82, gy + 16);
        }

        gy += 48;
    });

    if (totalBuyPages > 1) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`页码: ${buyPageIndex + 1}/${totalBuyPages} (点击切换)`, mx + colW - 90, listY + 3);
    }

    // 右列: 背包随身货物 (标注买入价与利润)
    const rx = mx + mw / 2 + 8;
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`🎒 随身商运货物 (全城无条件回收 ｜ 自动记账)`, rx, listY);

    const cargo = collectBackpackCargo();
    if (cargo.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '11px sans-serif';
        ctx.fillText('暂无随身货物。可在左侧赊购特产，运往他城出售！', rx + 6, listY + 30);
    }

    const totalSellPages = Math.max(1, Math.ceil(cargo.length / ITEMS_PER_PAGE));
    const curCargo = cargo.slice(sellPageIndex * ITEMS_PER_PAGE, (sellPageIndex + 1) * ITEMS_PER_PAGE);

    let sy = listY + 20;
    curCargo.forEach((c) => {
        const sellPrice = getTradeSellPrice(c.good, currentCity, now);
        const buyPrice = c.buyPrice || c.good.basePrice;
        const profitRate = Math.round(((sellPrice - buyPrice) / buyPrice) * 100);
        const isProfit = profitRate >= 0;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.strokeStyle = isProfit ? '#10b981' : '#ef4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(rx, sy, colW, 44, 4);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${c.icon} ${c.name} x${c.count}`, rx + 8, sy + 5);

        // 🌟 核心：用小字清晰标出买入价与回收价
        ctx.fillStyle = '#fde047';
        ctx.font = '10px monospace';
        ctx.fillText(`买入价:${buyPrice.toLocaleString()}铜`, rx + 8, sy + 25);

        ctx.fillStyle = isProfit ? '#34d399' : '#f87171';
        ctx.font = '11px sans-serif';
        ctx.fillText(`回收:${sellPrice.toLocaleString()} (${isProfit ? '+' : ''}${profitRate}%)`, rx + 105, sy + 24);

        // 售1 / 全售 按钮
        const btnW = 38, btnH = 22;
        const s1X = rx + colW - 88;
        const saX = rx + colW - 44;
        const sY = sy + 11;

        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath(); ctx.roundRect(s1X, sY, btnW, btnH, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('售1', s1X + btnW / 2, sY + 5);

        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath(); ctx.roundRect(saX, sY, btnW, btnH, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('全售', saX + btnW / 2, sY + 5);
        ctx.textAlign = 'left';

        sy += 48;
    });

    if (totalSellPages > 1) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`页码: ${sellPageIndex + 1}/${totalSellPages} (点击切换)`, rx + colW - 90, listY + 3);
    }
}

/** 🌟 绘制【随身货单】详单面板 (记账无忧 · 盈亏全览) */
function drawCargoDetailPanel(ctx, mx, my, mw, mh, startY, now, currentCity) {
    const cargo = collectBackpackCargo();
    const panelW = mw - 32;

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('🎒 随身货物明细账单（记账无忧 · 进价/售价/利润全览）', mx + 16, startY);

    if (cargo.length === 0) {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
        ctx.strokeStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(mx + 16, startY + 24, panelW, mh - startY + my - 80, 6);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📭 背包中暂无商贸货物。请切换至【特产货架】赊购特产！', mx + mw / 2, startY + 120);
        ctx.textAlign = 'left';
        return;
    }

    let cy = startY + 24;
    cargo.forEach((c) => {
        const sellPrice = getTradeSellPrice(c.good, currentCity, now);
        const buyPrice = c.buyPrice || c.good.basePrice;
        const profitPerUnit = sellPrice - buyPrice;
        const totalCost = buyPrice * c.count;
        const totalRevenue = sellPrice * c.count;
        const totalProfit = profitPerUnit * c.count;
        const isProfit = profitPerUnit >= 0;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = isProfit ? '#10b981' : '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(mx + 16, cy, panelW, 56, 5);
        ctx.fill(); ctx.stroke();

        // 图标与名称
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${c.icon} ${c.name} (随身 x${c.count} 件)`, mx + 26, cy + 10);

        // 买入价 (小字突出，记账无忧)
        ctx.fillStyle = '#fde047';
        ctx.font = '11px sans-serif';
        ctx.fillText(`• 当初买入价: ${buyPrice.toLocaleString()} 铜 (进货地: ${getCityName(c.originCity)}) ｜ 批次总成本: ${totalCost.toLocaleString()} 铜`, mx + 26, cy + 32);

        // 回收价与利润
        ctx.fillStyle = isProfit ? '#34d399' : '#f87171';
        ctx.font = '11px sans-serif';
        const rate = Math.round((profitPerUnit / buyPrice) * 100);
        ctx.fillText(`• 当前本城回收: ${sellPrice.toLocaleString()} 铜 (${isProfit ? '+' : ''}${rate}%) ｜ 单件盈亏: ${isProfit ? '+' : ''}${profitPerUnit.toLocaleString()} 铜 ｜ 批次总盈亏: ${isProfit ? '+' : ''}${totalProfit.toLocaleString()} 铜`, mx + panelW - 460, cy + 10);

        // 出售按钮
        const btnW = 54, btnH = 26;
        const s1X = mx + panelW - 126;
        const saX = mx + panelW - 64;
        const btnY = cy + 15;

        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath(); ctx.roundRect(s1X, btnY, btnW, btnH, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('售出1件', s1X + btnW / 2, btnY + 7);

        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.strokeStyle = '#10b981';
        ctx.beginPath(); ctx.roundRect(saX, btnY, btnW, btnH, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#34d399';
        ctx.fillText('整批全售', saX + btnW / 2, btnY + 7);
        ctx.textAlign = 'left';

        cy += 64;
    });
}

/** 🌟 绘制【跑商情报】江湖风闻情报墙面板 */
function drawIntelPanel(ctx, mx, my, mw, mh, startY, now, timerStr) {
    const activeRumors = getActiveTradeIntel(now);
    const panelW = mw - 32;

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`📜 江湖风闻录 · 四海行商见闻（每30分钟根据天象灾变与供需异动更新 ｜ 剩余时效: ${timerStr}）`, mx + 16, startY);

    let cy = startY + 24;
    activeRumors.forEach((r, idx) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(mx + 16, cy, panelW, 78, 6);
        ctx.fill(); ctx.stroke();

        // 标签与标题
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(r.tag, mx + 26, cy + 8);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(r.title, mx + 100, cy + 8);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '11px sans-serif';
        ctx.fillText(`【述事者: ${r.avatar} ${r.narrator}】`, mx + panelW - 200, cy + 8);

        // 见闻故事 (叙事闲话)
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px sans-serif';
        // 截取或换行
        const story1 = r.story.slice(0, 52);
        const story2 = r.story.slice(52, 106);
        ctx.fillText(story1, mx + 26, cy + 28);
        if (story2) ctx.fillText(story2, mx + 26, cy + 44);

        // 贸易指引与暴利提示
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`📈 行情异动: ${r.impactText}`, mx + 26, cy + 60);

        ctx.fillStyle = '#34d399';
        ctx.font = '10px sans-serif';
        ctx.fillText(`💡 商路建议: ${r.advice}`, mx + panelW - 380, cy + 60);

        cy += 86;
    });
}

/** 处理商票驿站点击事件 */
export function handleTradeClick(clickX, clickY, bounds) {
    const { mx, my, mw, mh } = bounds;
    const now = Date.now();
    const currentCity = gameState.current_city_id || gameState.current_zone_id || 'beijing';
    const ticket = gameState.merchant_ticket;

    // 1. 未持有商票时的领取点击
    if (!ticket || !ticket.is_active) {
        const heroY = my + 80;
        const btnW = 280, btnH = 42;
        const btnX = mx + mw / 2 - btnW / 2, btnY = heroY + 260;
        if (clickX >= btnX && clickX <= btnX + btnW && clickY >= btnY && clickY <= btnY + btnH) {
            const playerCopper = Number(gameState.copper) || 0;
            if (playerCopper < TICKET_DEPOSIT) {
                gameStore.setToast(`⚠️ 铜钱不足 ${TICKET_DEPOSIT.toLocaleString()}，无法缴纳商票押金！`, '#ef4444');
                return true;
            }
            gameStore.dispatchAction('issue_merchant_ticket', {});
            return true;
        }
        return false;
    }

    const freeCredit = Math.max(0, Number(ticket.credit_limit || TICKET_INITIAL_LIMIT) - Number(ticket.used_credit || 0));
    const infoY = my + 78;
    const mainTabY = infoY + 60;
    const mainTabW = 110, mainTabH = 26;

    // 2. 主标签页点击 (【特产货架】 / 【随身货单】 / 【跑商情报】)
    for (let i = 0; i < TRADE_MAIN_TABS.length; i++) {
        const tx = mx + 16 + i * (mainTabW + 8);
        if (clickX >= tx && clickX <= tx + mainTabW && clickY >= mainTabY && clickY <= mainTabY + mainTabH) {
            activeMainTab = TRADE_MAIN_TABS[i].id;
            return true;
        }
    }

    // 3. 底部交割点击
    const earnedTotal = Number(ticket.earned_total || 0);
    const sw = 320, sh = 34;
    const sx = mx + mw / 2 - sw / 2, syBtn = my + mh - 44;
    if (clickX >= sx && clickX <= sx + sw && clickY >= syBtn && clickY <= syBtn + sh) {
        if (earnedTotal >= TICKET_SETTLE_TARGET) {
            gameStore.dispatchAction('settle_merchant_ticket', {});
        } else {
            gameStore.setToast(`⚠️ 交割尚未达标: 累计回款 ${earnedTotal.toLocaleString()} / 100,000 铜`, '#f59e0b');
        }
        return true;
    }

    // 4. 主面板内部交互
    const startY = mainTabY + mainTabH + 8;

    if (activeMainTab === 'cargo') {
        // 随身货单中的出售按钮
        const cargo = collectBackpackCargo();
        const panelW = mw - 32;
        let cy = startY + 24;

        for (const c of cargo) {
            const sellPrice = getTradeSellPrice(c.good, currentCity, now);
            const btnW = 54, btnH = 26;
            const s1X = mx + panelW - 126;
            const saX = mx + panelW - 64;
            const btnY = cy + 15;

            if (clickX >= s1X && clickX <= s1X + btnW && clickY >= btnY && clickY <= btnY + btnH) {
                gameStore.dispatchAction('sell_trade_good', { good_id: c.goodId, count: 1, unit_price: sellPrice });
                return true;
            }

            if (clickX >= saX && clickX <= saX + btnW && clickY >= btnY && clickY <= btnY + btnH) {
                gameStore.dispatchAction('sell_trade_good', { good_id: c.goodId, count: c.count, unit_price: sellPrice });
                return true;
            }

            cy += 64;
        }
        return false;
    }

    if (activeMainTab === 'market') {
        // 分类筛选标签点击
        const catTabW = 74, catTabH = 22;
        for (let i = 0; i < TRADE_CATEGORIES.length; i++) {
            const tx = mx + 16 + i * (catTabW + 6);
            if (clickX >= tx && clickX <= tx + catTabW && clickY >= startY && clickY <= startY + catTabH) {
                activeCategory = TRADE_CATEGORIES[i].id;
                buyPageIndex = 0;
                return true;
            }
        }

        const colW = mw / 2 - 24;
        const listY = startY + 28;

        // 左半部特产采购点击
        const stationGoods = getCityStationStock(currentCity, now);
        const filteredGoods = activeCategory === 'all' ? stationGoods : stationGoods.filter(g => g.cat === activeCategory);
        const curBuyGoods = filteredGoods.slice(buyPageIndex * ITEMS_PER_PAGE, (buyPageIndex + 1) * ITEMS_PER_PAGE);

        let gy = listY + 20;
        for (const g of curBuyGoods) {
            const price = calculateTradePrice(g, currentCity, now).price;
            const isSoldOut = g.isSoldOut || g.remainingStock <= 0;

            if (!isSoldOut) {
                const btnW = 38, btnH = 22;
                const b1X = mx + 16 + colW - 88;
                const b5X = mx + 16 + colW - 44;
                const bY = gy + 11;

                if (clickX >= b1X && clickX <= b1X + btnW && clickY >= bY && clickY <= bY + btnH) {
                    if (freeCredit >= price) {
                        gameStore.dispatchAction('buy_trade_good', { good_id: g.id, name: g.name, count: 1, unit_price: price });
                    } else {
                        gameStore.setToast('⚠️ 商票可用额度不足，请先前往他城卖出货物回笼额度！', '#ef4444');
                    }
                    return true;
                }

                if (clickX >= b5X && clickX <= b5X + btnW && clickY >= bY && clickY <= bY + btnH) {
                    const buyCount = Math.min(5, g.remainingStock);
                    const totalCost = price * buyCount;
                    if (freeCredit >= totalCost) {
                        gameStore.dispatchAction('buy_trade_good', { good_id: g.id, name: g.name, count: buyCount, unit_price: price });
                    } else {
                        gameStore.setToast('⚠️ 商票可用额度不足以批量赊购！', '#ef4444');
                    }
                    return true;
                }
            }
            gy += 48;
        }

        // 右半部出售点击
        const rx = mx + mw / 2 + 8;
        const cargo = collectBackpackCargo();
        const curCargo = cargo.slice(sellPageIndex * ITEMS_PER_PAGE, (sellPageIndex + 1) * ITEMS_PER_PAGE);

        let sy = listY + 20;
        for (const c of curCargo) {
            const sellPrice = getTradeSellPrice(c.good, currentCity, now);
            const btnW = 38, btnH = 22;
            const s1X = rx + colW - 88;
            const saX = rx + colW - 44;
            const sY = sy + 11;

            if (clickX >= s1X && clickX <= s1X + btnW && clickY >= sY && clickY <= sY + btnH) {
                gameStore.dispatchAction('sell_trade_good', { good_id: c.goodId, count: 1, unit_price: sellPrice });
                return true;
            }

            if (clickX >= saX && clickX <= saX + btnW && clickY >= sY && clickY <= sY + btnH) {
                gameStore.dispatchAction('sell_trade_good', { good_id: c.goodId, count: c.count, unit_price: sellPrice });
                return true;
            }
            sy += 48;
        }
    }

    return false;
}
