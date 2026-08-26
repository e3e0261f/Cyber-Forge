use serde::{Deserialize, Serialize};
use std::collections::{HashMap, BinaryHeap};
use std::cmp::Ordering;
use cyber_forge_shared::GameConfig;

#[allow(dead_code)]
pub const MAP_SIZE: f64 = GameConfig::MAP_SIZE;
#[allow(dead_code)]
pub const PORTAL_RADIUS: f64 = GameConfig::PORTAL_RADIUS;
#[allow(dead_code)]
pub const SAFE_RADIUS: f64 = 600.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ZoneType {
    City,       // 绝对安全主城 (禁止 PVP，拥有商行与商票发行所)
    Field,      // 野外初级资源区
    Wilderness, // 阿尔比恩式危险区域 (高收益、掉落与掠夺)
    SkyCity,    // 隐藏浮空城 (天道秘境)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortalDef {
    pub dir: String,
    pub x: f64,
    pub y: f64,
    pub target_zone_id: String,
    pub target_dir: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObstacleDef {
    pub id: String,
    pub name: String,
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceDef {
    pub id: String,
    pub name: String,
    pub tier: u8,
    pub res_type: String,
    pub x: f64,
    pub y: f64,
    pub yield_item: String,
    pub respawn_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoneNode {
    pub id: String,
    pub name: String,
    pub alias: String,
    pub zone_type: ZoneType,
    pub is_city: bool,
    pub city_id: Option<String>,
    pub biome: String,
    pub weather: String,
    pub weather_buff: String,
    pub color: String,
    pub bg_color: String,
    pub spawn_x: f64,
    pub spawn_y: f64,
    pub gates: Vec<PortalDef>,
    pub resources: Vec<ResourceDef>,
    pub obstacles: Vec<ObstacleDef>,
    pub neighbors: Vec<(String, u64)>, // (ZoneID, 权值)
}

pub struct WorldTopology {
    pub zones: HashMap<String, ZoneNode>,
}

#[derive(Copy, Clone, Eq, PartialEq)]
struct State {
    cost: u64,
    position: usize,
}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        other.cost.cmp(&self.cost)
    }
}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl WorldTopology {
    pub fn new() -> Self {
        let mut zones = HashMap::new();

        // 1. 北京 · 红皇城
        zones.insert(
            "beijing".into(),
            ZoneNode {
                id: "beijing".into(),
                name: "北京 · 红皇城".into(),
                alias: "天道帝都".into(),
                zone_type: ZoneType::City,
                is_city: true,
                city_id: Some("beijing".into()),
                biome: "capital".into(),
                weather: "风沙".into(),
                weather_buff: "天道罡风淬火：锻造暴击率 +10%".into(),
                color: "#ef4444".into(),
                bg_color: "#160808".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "north".into(), x: 8100.0, y: 500.0, target_zone_id: "wild_bj_hb_1".into(), target_dir: "south".into(), name: "北直门 ➔ 太行官道·幽燕关隘".into(), color: "#f97316".into() },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 17550.0, target_zone_id: "wild_bj_sh_1".into(), target_dir: "west".into(), name: "东华门 ➔ 京沪漕运·通州泊口".into(), color: "#f59e0b".into() },
                    PortalDef { dir: "south".into(), x: 18900.0, y: 26500.0, target_zone_id: "wild_bj_yn_1".into(), target_dir: "north".into(), name: "南薰门 ➔ 蜀道滇南·秦岭古栈".into(), color: "#10b981".into() },
                    PortalDef { dir: "west".into(), x: 500.0, y: 10800.0, target_zone_id: "wild_bj_qh_1".into(), target_dir: "east".into(), name: "西便门 ➔ 丝路陇右·居庸天堑".into(), color: "#a855f7".into() },
                ],
                resources: vec![
                    ResourceDef { id: "bj_res_1".into(), name: "皇极龙脉石".into(), tier: 6, res_type: "ore".into(), x: 19500.0, y: 8000.0, yield_item: "皇极玄铁".into(), respawn_secs: 30 },
                    ResourceDef { id: "bj_res_2".into(), name: "紫禁灵桐木".into(), tier: 6, res_type: "wood".into(), x: 7500.0, y: 19500.0, yield_item: "帝令灵枝".into(), respawn_secs: 30 },
                ],
                obstacles: vec![
                    ObstacleDef { id: "bj_palace_l".into(), name: "皇城左天工阁".into(), min_x: 4500.0, max_x: 7500.0, min_y: 4500.0, max_y: 15500.0 },
                    ObstacleDef { id: "bj_palace_r".into(), name: "皇城右太清殿".into(), min_x: 19500.0, max_x: 22500.0, min_y: 4500.0, max_y: 15500.0 },
                ],
                neighbors: vec![("hebei".into(), 90), ("shanghai".into(), 90), ("yunnan".into(), 90), ("qinghai".into(), 90)],
            },
        );

        // 2. 河北 · 丙火城
        zones.insert(
            "hebei".into(),
            ZoneNode {
                id: "hebei".into(),
                name: "河北 · 丙火城".into(),
                alias: "百炼铁都".into(),
                zone_type: ZoneType::City,
                is_city: true,
                city_id: Some("hebei".into()),
                biome: "forge".into(),
                weather: "烈阳".into(),
                weather_buff: "地脉真火：熔炼铁渣产出 +10%".into(),
                color: "#f97316".into(),
                bg_color: "#1a0c06".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "south".into(), x: 9450.0, y: 26500.0, target_zone_id: "wild_bj_hb_6".into(), target_dir: "north".into(), name: "南烽门 ➔ 太行官道·邢襄平野".into(), color: "#ef4444".into() },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 14850.0, target_zone_id: "wild_hb_sh_1".into(), target_dir: "west".into(), name: "东冶门 ➔ 渤海通途·山海雄关".into(), color: "#f59e0b".into() },
                    PortalDef { dir: "west".into(), x: 500.0, y: 12150.0, target_zone_id: "wild_qh_hb_6".into(), target_dir: "east".into(), name: "西陉门 ➔ 黄土陇东·五台圣境".into(), color: "#eab308".into() },
                ],
                resources: vec![
                    ResourceDef { id: "hb_res_1".into(), name: "九幽地火矿".into(), tier: 5, res_type: "ore".into(), x: 8000.0, y: 8000.0, yield_item: "赤火精金".into(), respawn_secs: 25 },
                    ResourceDef { id: "hb_res_2".into(), name: "太行玄钢矿".into(), tier: 5, res_type: "ore".into(), x: 19000.0, y: 19000.0, yield_item: "太行玄钢".into(), respawn_secs: 25 },
                ],
                obstacles: vec![
                    ObstacleDef { id: "hb_lava_1".into(), name: "九幽地火熔岩池".into(), min_x: 4500.0, max_x: 8500.0, min_y: 4500.0, max_y: 11000.0 },
                    ObstacleDef { id: "hb_lava_2".into(), name: "丙火淬炼重鼎".into(), min_x: 18500.0, max_x: 22500.0, min_y: 16000.0, max_y: 22500.0 },
                ],
                neighbors: vec![("beijing".into(), 90), ("shanghai".into(), 90), ("qinghai".into(), 90)],
            },
        );

        // 3. 上海 · 庚金城
        zones.insert(
            "shanghai".into(),
            ZoneNode {
                id: "shanghai".into(),
                name: "上海 · 庚金城".into(),
                alias: "万国商埠".into(),
                zone_type: ZoneType::City,
                is_city: true,
                city_id: Some("shanghai".into()),
                biome: "gold".into(),
                weather: "商晴".into(),
                weather_buff: "万商云集：交易手续费 -5%".into(),
                color: "#f59e0b".into(),
                bg_color: "#161208".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "west".into(), x: 500.0, y: 18900.0, target_zone_id: "wild_bj_sh_6".into(), target_dir: "east".into(), name: "申西门 ➔ 京沪漕运·吴淞商港".into(), color: "#ef4444".into() },
                    PortalDef { dir: "north".into(), x: 12150.0, y: 500.0, target_zone_id: "wild_hb_sh_6".into(), target_dir: "south".into(), name: "长江门 ➔ 渤海通途·崇明外泽".into(), color: "#f97316".into() },
                    PortalDef { dir: "south".into(), x: 17550.0, y: 26500.0, target_zone_id: "wild_sh_zj_1".into(), target_dir: "north".into(), name: "沪杭门 ➔ 钱塘水陆·松江古渡".into(), color: "#06b6d4".into() },
                ],
                resources: vec![
                    ResourceDef { id: "sh_res_1".into(), name: "庚金灵石矿".into(), tier: 5, res_type: "ore".into(), x: 7500.0, y: 7500.0, yield_item: "庚金灵铁".into(), respawn_secs: 25 },
                    ResourceDef { id: "sh_res_2".into(), name: "东海秘银蚌".into(), tier: 5, res_type: "gem".into(), x: 19500.0, y: 18500.0, yield_item: "深海秘银".into(), respawn_secs: 25 },
                ],
                obstacles: vec![
                    ObstacleDef { id: "sh_dock".into(), name: "万国商港泊位".into(), min_x: 4500.0, max_x: 7500.0, min_y: 6000.0, max_y: 21000.0 },
                    ObstacleDef { id: "sh_vault".into(), name: "万宝仙石金库".into(), min_x: 19500.0, max_x: 22500.0, min_y: 6000.0, max_y: 21000.0 },
                ],
                neighbors: vec![("beijing".into(), 90), ("hebei".into(), 90), ("zhejiang".into(), 90)],
            },
        );

        // 4. 浙江 · 癸水城
        zones.insert(
            "zhejiang".into(),
            ZoneNode {
                id: "zhejiang".into(),
                name: "浙江 · 癸水城".into(),
                alias: "灵秀工坊".into(),
                zone_type: ZoneType::City,
                is_city: true,
                city_id: Some("zhejiang".into()),
                biome: "water".into(),
                weather: "微澜".into(),
                weather_buff: "水法灵韵：学徒打铁效率 +15%".into(),
                color: "#06b6d4".into(),
                bg_color: "#08141a".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "north".into(), x: 10800.0, y: 500.0, target_zone_id: "wild_sh_zj_6".into(), target_dir: "south".into(), name: "武林门 ➔ 钱塘水陆·诸暨剑潭".into(), color: "#f59e0b".into() },
                    PortalDef { dir: "west".into(), x: 500.0, y: 16200.0, target_zone_id: "wild_zj_yn_1".into(), target_dir: "east".into(), name: "钱清门 ➔ 百越灵岭·仙霞古道".into(), color: "#10b981".into() },
                    PortalDef { dir: "northwest".into(), x: 8100.0, y: 500.0, target_zone_id: "wild_bj_zj_6".into(), target_dir: "south".into(), name: "运河门 ➔ 大运河津·拱宸古桥".into(), color: "#ef4444".into() },
                ],
                resources: vec![
                    ResourceDef { id: "zj_res_1".into(), name: "西子玄水灵脉".into(), tier: 5, res_type: "essence".into(), x: 8000.0, y: 18000.0, yield_item: "西子玄水".into(), respawn_secs: 25 },
                    ResourceDef { id: "zj_res_2".into(), name: "龙泉青石矿".into(), tier: 5, res_type: "ore".into(), x: 19000.0, y: 8000.0, yield_item: "龙泉古胚".into(), respawn_secs: 25 },
                ],
                obstacles: vec![
                    ObstacleDef { id: "zj_canal_1".into(), name: "西子灵水千波池".into(), min_x: 4500.0, max_x: 8500.0, min_y: 4500.0, max_y: 12000.0 },
                    ObstacleDef { id: "zj_canal_2".into(), name: "龙泉千锤水碓工坊".into(), min_x: 18500.0, max_x: 22500.0, min_y: 15000.0, max_y: 22500.0 },
                ],
                neighbors: vec![("shanghai".into(), 90), ("yunnan".into(), 90), ("beijing".into(), 90)],
            },
        );

        // 5. 云南 · 乙木城
        zones.insert(
            "yunnan".into(),
            ZoneNode {
                id: "yunnan".into(),
                name: "云南 · 乙木城".into(),
                alias: "灵蕈林都".into(),
                zone_type: ZoneType::City,
                is_city: true,
                city_id: Some("yunnan".into()),
                biome: "forest".into(),
                weather: "多雨".into(),
                weather_buff: "青木灵气：全境采集效率 +15%".into(),
                color: "#10b981".into(),
                bg_color: "#08160e".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "north".into(), x: 16200.0, y: 500.0, target_zone_id: "wild_bj_yn_6".into(), target_dir: "south".into(), name: "金马门 ➔ 蜀道滇南·苍山古林".into(), color: "#ef4444".into() },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 12150.0, target_zone_id: "wild_zj_yn_6".into(), target_dir: "west".into(), name: "碧鸡门 ➔ 百越灵岭·罗霄绝顶".into(), color: "#06b6d4".into() },
                    PortalDef { dir: "northwest".into(), x: 500.0, y: 9450.0, target_zone_id: "wild_yn_qh_1".into(), target_dir: "southeast".into(), name: "苍山门 ➔ 茶马雪山·玉龙雪峰".into(), color: "#eab308".into() },
                ],
                resources: vec![
                    ResourceDef { id: "yn_res_1".into(), name: "千年青皇古木".into(), tier: 5, res_type: "wood".into(), x: 8500.0, y: 19000.0, yield_item: "千年青皇木".into(), respawn_secs: 25 },
                    ResourceDef { id: "yn_res_2".into(), name: "七彩迷幻仙芝".into(), tier: 5, res_type: "herb".into(), x: 18500.0, y: 8500.0, yield_item: "七彩迷幻菇".into(), respawn_secs: 25 },
                ],
                obstacles: vec![
                    ObstacleDef { id: "yn_swamp_1".into(), name: "十万大山神木根系".into(), min_x: 4500.0, max_x: 8500.0, min_y: 16000.0, max_y: 22500.0 },
                    ObstacleDef { id: "yn_swamp_2".into(), name: "迷幻万毒灵沼".into(), min_x: 18500.0, max_x: 22500.0, min_y: 4500.0, max_y: 11000.0 },
                ],
                neighbors: vec![("beijing".into(), 90), ("zhejiang".into(), 90), ("qinghai".into(), 90)],
            },
        );

        // 6. 青海 · 坤土城
        zones.insert(
            "qinghai".into(),
            ZoneNode {
                id: "qinghai".into(),
                name: "青海 · 坤土城".into(),
                alias: "西域坤灵".into(),
                zone_type: ZoneType::City,
                is_city: true,
                city_id: Some("qinghai".into()),
                biome: "earth".into(),
                weather: "晴雪".into(),
                weather_buff: "极西厚土：神兵坚韧度 +15%".into(),
                color: "#eab308".into(),
                bg_color: "#161408".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "east".into(), x: 26500.0, y: 16200.0, target_zone_id: "wild_bj_qh_6".into(), target_dir: "west".into(), name: "湟水门 ➔ 丝路陇右·倒淌河畔".into(), color: "#ef4444".into() },
                    PortalDef { dir: "south".into(), x: 13500.0, y: 26500.0, target_zone_id: "wild_yn_qh_6".into(), target_dir: "north".into(), name: "唐蕃门 ➔ 茶马雪山·巴颜喀拉".into(), color: "#10b981".into() },
                    PortalDef { dir: "north".into(), x: 8100.0, y: 500.0, target_zone_id: "wild_qh_hb_1".into(), target_dir: "south".into(), name: "祁连门 ➔ 黄土陇东·祁连雪积".into(), color: "#f97316".into() },
                ],
                resources: vec![
                    ResourceDef { id: "qh_res_1".into(), name: "极西坤灵母石".into(), tier: 5, res_type: "ore".into(), x: 8000.0, y: 8000.0, yield_item: "坤灵母石".into(), respawn_secs: 25 },
                    ResourceDef { id: "qh_res_2".into(), name: "青海天晶石矿".into(), tier: 5, res_type: "gem".into(), x: 19000.0, y: 19000.0, yield_item: "青海天晶".into(), respawn_secs: 25 },
                ],
                obstacles: vec![
                    ObstacleDef { id: "qh_salt_1".into(), name: "万丈察尔汗青盐幻海".into(), min_x: 4500.0, max_x: 8500.0, min_y: 15000.0, max_y: 22500.0 },
                    ObstacleDef { id: "qh_salt_2".into(), name: "极西昆仑天晶矿障".into(), min_x: 18500.0, max_x: 22500.0, min_y: 4500.0, max_y: 12000.0 },
                ],
                neighbors: vec![("beijing".into(), 90), ("yunnan".into(), 90), ("hebei".into(), 90)],
            },
        );

        // 7. 天空之城
        zones.insert(
            "sky_city".into(),
            ZoneNode {
                id: "sky_city".into(),
                name: "天空之城 · 太虚迷境".into(),
                alias: "Albion 迷雾秘境".into(),
                zone_type: ZoneType::SkyCity,
                is_city: true,
                city_id: Some("sky_city".into()),
                biome: "mist".into(),
                weather: "极光".into(),
                weather_buff: "太虚神韵：造物神兵高阶概率 +35%".into(),
                color: "#a855f7".into(),
                bg_color: "#12081c".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "south".into(), x: 13500.0, y: 26500.0, target_zone_id: "beijing".into(), target_dir: "north".into(), name: "太虚星门 ➔ 返回北京".into(), color: "#ef4444".into() },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 13500.0, target_zone_id: "shanghai".into(), target_dir: "west".into(), name: "星穹通途 ➔ 降落上海".into(), color: "#f59e0b".into() },
                    PortalDef { dir: "west".into(), x: 500.0, y: 13500.0, target_zone_id: "qinghai".into(), target_dir: "east".into(), name: "太古玄界 ➔ 降落青海".into(), color: "#eab308".into() },
                ],
                resources: vec![
                    ResourceDef { id: "sky_res_1".into(), name: "太虚玄晶矿".into(), tier: 8, res_type: "gem".into(), x: 13500.0, y: 8000.0, yield_item: "太虚玄晶".into(), respawn_secs: 15 },
                    ResourceDef { id: "sky_res_2".into(), name: "九天星辰铁".into(), tier: 8, res_type: "ore".into(), x: 13500.0, y: 19000.0, yield_item: "星辰神铁".into(), respawn_secs: 15 },
                ],
                obstacles: vec![
                    ObstacleDef { id: "sky_void_1".into(), name: "太虚空间裂隙".into(), min_x: 4500.0, max_x: 7500.0, min_y: 4500.0, max_y: 22500.0 },
                    ObstacleDef { id: "sky_void_2".into(), name: "混沌星核残骸".into(), min_x: 19500.0, max_x: 22500.0, min_y: 4500.0, max_y: 22500.0 },
                ],
                neighbors: vec![("beijing".into(), 90), ("shanghai".into(), 90), ("qinghai".into(), 90)],
            },
        );

        // 8. GM 开发者空间 · 虚空试验场
        zones.insert(
            "zone_gm_test".into(),
            ZoneNode {
                id: "zone_gm_test".into(),
                name: "GM 开发者空间 · 虚空试验场".into(),
                alias: "DIMENSION_OUT_OF_BOUNDS".into(),
                zone_type: ZoneType::Wilderness,
                is_city: false,
                city_id: None,
                biome: "mist".into(),
                weather: "混沌".into(),
                weather_buff: "天道试验场：全系统最高权限调试中".into(),
                color: "#ec4899".into(),
                bg_color: "#140614".into(),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![],
                resources: vec![
                    ResourceDef { id: "gm_test_ore".into(), name: "无限天道法则水晶".into(), tier: 9, res_type: "gem".into(), x: 10000.0, y: 10000.0, yield_item: "天道法则碎屑".into(), respawn_secs: 5 },
                ],
                obstacles: vec![],
                neighbors: vec![],
            },
        );

        // 辅助宏生成 6 节点荒野链条
        Self::populate_wilderness_chain(&mut zones, "wild_bj_hb", "太行官道", &["幽燕关隘", "飞狐绝径", "井陉天险", "娘子雄关", "滏口古陉", "邢襄平野"], "beijing", "hebei", "north", "south", "mountain", "烈阳", "炉温暴涨：熔炼速度 +10%", "#f97316");
        Self::populate_wilderness_chain(&mut zones, "wild_bj_sh", "京沪漕运", &["通州泊口", "沧浪清波", "德州古渡", "淮安重津", "扬子古津", "吴淞商港"], "beijing", "shanghai", "east", "west", "water", "商晴", "通商顺畅：金币产出 +8%", "#f59e0b");
        Self::populate_wilderness_chain(&mut zones, "wild_bj_zj", "大运河津", &["张家湾津", "临清古埠", "微山浩渺", "宿迁水驿", "姑苏水巷", "拱宸古桥"], "beijing", "zhejiang", "south", "north", "water", "微澜", "学徒顿悟率 +10%", "#06b6d4");
        Self::populate_wilderness_chain(&mut zones, "wild_bj_yn", "蜀道滇南", &["秦岭古栈", "剑门绝壁", "锦官林海", "乌蒙巨壑", "洱海灵沼", "苍山古林"], "beijing", "yunnan", "south", "north", "forest", "多雨", "古木催生：采集产出 +12%", "#10b981");
        Self::populate_wilderness_chain(&mut zones, "wild_bj_qh", "丝路陇右", &["居庸天堑", "塞北荒丘", "贺兰古道", "陇西黄土", "日月山口", "倒淌河畔"], "beijing", "qinghai", "west", "east", "desert", "晴雪", "西域风蚀：矿脉纯度 +10%", "#eab308");
        Self::populate_wilderness_chain(&mut zones, "wild_hb_sh", "渤海通途", &["山海雄关", "秦皇浴日", "渤海烟波", "黄骅斥卤", "胶东灵脉", "崇明外泽"], "hebei", "shanghai", "east", "north", "water", "惊涛", "熔炼暴击 +8%", "#38bdf8");
        Self::populate_wilderness_chain(&mut zones, "wild_sh_zj", "钱塘水陆", &["松江古渡", "嘉兴烟雨", "西塘幽巷", "钱塘怒潮", "富春叠翠", "诸暨剑潭"], "shanghai", "zhejiang", "south", "north", "water", "微澜", "水法提纯 +10%", "#06b6d4");
        Self::populate_wilderness_chain(&mut zones, "wild_zj_yn", "百越灵岭", &["仙霞古道", "武夷茶烟", "南岭千叠", "桂林奇峰", "十万深山", "罗霄绝顶"], "zhejiang", "yunnan", "west", "east", "forest", "雾障", "稀有草药产出 +15%", "#10b981");
        Self::populate_wilderness_chain(&mut zones, "wild_yn_qh", "茶马雪山", &["玉龙雪峰", "金沙飞渡", "香格里拉", "澜沧天堑", "念青唐古", "巴颜喀拉"], "yunnan", "qinghai", "north", "south", "snow", "严寒", "冰魄淬火 +12%", "#eab308");
        Self::populate_wilderness_chain(&mut zones, "wild_qh_hb", "黄土陇东", &["祁连雪积", "乌鞘雄岭", "宁夏平野", "鄂尔多斯", "雁门古塞", "五台圣境"], "qinghai", "hebei", "north", "west", "mountain", "风沙", "厚土加持：坚韧 +15%", "#f97316");

        Self { zones }
    }

    fn populate_wilderness_chain(
        zones: &mut HashMap<String, ZoneNode>,
        prefix: &str,
        base_name: &str,
        station_names: &[&str],
        start_city: &str,
        end_city: &str,
        start_dir: &str,
        end_dir: &str,
        biome: &str,
        weather: &str,
        buff: &str,
        base_color: &str,
    ) {
        let count = station_names.len();
        let offsets = [8100.0, 16200.0, 10800.0, 18900.0, 9450.0, 17550.0, 13500.0];

        for i in 1..=count {
            let zone_id = format!("{}_{}", prefix, i);
            let s_name = station_names[i - 1];
            let name = format!("{} · {}", base_name, s_name);

            let mut gates = Vec::new();
            // 进向门
            if i == 1 {
                let (gx, gy) = match start_dir {
                    "north" => (8100.0, 26500.0),
                    "south" => (8100.0, 500.0),
                    "east" => (500.0, 17550.0),
                    "west" => (26500.0, 10800.0),
                    _ => (13500.0, 26500.0),
                };
                gates.push(PortalDef {
                    dir: match start_dir { "north" => "south", "south" => "north", "east" => "west", "west" => "east", _ => "south" }.into(),
                    x: gx,
                    y: gy,
                    target_zone_id: start_city.into(),
                    target_dir: start_dir.into(),
                    name: format!("回望 ➔ {}", start_city),
                    color: "#ef4444".into(),
                });
            } else {
                let prev_zone_id = format!("{}_{}", prefix, i - 1);
                let offset = offsets[(i - 1) % offsets.len()];
                let (gx, gy) = match start_dir {
                    "north" => (offset, 26500.0),
                    "south" => (offset, 500.0),
                    "east" => (500.0, offset),
                    "west" => (26500.0, offset),
                    _ => (13500.0, 26500.0),
                };
                gates.push(PortalDef {
                    dir: match start_dir { "north" => "south", "south" => "north", "east" => "west", "west" => "east", _ => "south" }.into(),
                    x: gx,
                    y: gy,
                    target_zone_id: prev_zone_id,
                    target_dir: start_dir.into(),
                    name: format!("退路 ➔ {}·{}", base_name, station_names[i - 2]),
                    color: base_color.into(),
                });
            }

            // 出向门
            if i == count {
                let (gx, gy) = match end_dir {
                    "north" => (9450.0, 500.0),
                    "south" => (9450.0, 26500.0),
                    "east" => (26500.0, 14850.0),
                    "west" => (500.0, 12150.0),
                    _ => (13500.0, 500.0),
                };
                gates.push(PortalDef {
                    dir: match end_dir { "north" => "north", "south" => "south", "east" => "east", "west" => "west", _ => "north" }.into(),
                    x: gx,
                    y: gy,
                    target_zone_id: end_city.into(),
                    target_dir: match end_dir { "north" => "south", "south" => "north", "east" => "west", "west" => "east", _ => "south" }.into(),
                    name: format!("抵关 ➔ {}", end_city),
                    color: "#00ffc8".into(),
                });
            } else {
                let next_zone_id = format!("{}_{}", prefix, i + 1);
                let offset = offsets[i % offsets.len()];
                let (gx, gy) = match start_dir {
                    "north" => (offset, 500.0),
                    "south" => (offset, 26500.0),
                    "east" => (26500.0, offset),
                    "west" => (500.0, offset),
                    _ => (13500.0, 500.0),
                };
                gates.push(PortalDef {
                    dir: match start_dir { "north" => "north", "south" => "south", "east" => "east", "west" => "west", _ => "north" }.into(),
                    x: gx,
                    y: gy,
                    target_zone_id: next_zone_id,
                    target_dir: match start_dir { "north" => "south", "south" => "north", "east" => "west", "west" => "east", _ => "south" }.into(),
                    name: format!("前路 ➔ {}·{}", base_name, station_names[i]),
                    color: base_color.into(),
                });
            }

            zones.insert(
                zone_id.clone(),
                ZoneNode {
                    id: zone_id.clone(),
                    name,
                    alias: format!("{}-{}", base_name, s_name),
                    zone_type: ZoneType::Wilderness,
                    is_city: false,
                    city_id: None,
                    biome: biome.into(),
                    weather: weather.into(),
                    weather_buff: buff.into(),
                    color: base_color.into(),
                    bg_color: "#0a0a0a".into(),
                    spawn_x: 13500.0,
                    spawn_y: 13500.0,
                    gates,
                    resources: vec![
                        ResourceDef {
                            id: format!("{}_r1", zone_id),
                            name: format!("{}灵脉矿", s_name),
                            tier: 4,
                            res_type: "ore".into(),
                            x: 8000.0 + ((i as f64 * 2500.0) % 11000.0),
                            y: 8000.0 + ((i as f64 * 3100.0) % 11000.0),
                            yield_item: "五行玄晶".into(),
                            respawn_secs: 20,
                        },
                    ],
                    obstacles: vec![],
                    neighbors: vec![],
                },
            );
        }
    }

    /// 严厉的边界对齐与点对点跨图重生 (绝对禁止回退到地图中央 13500, 13500)
    pub fn get_portal_rebirth_pos(&self, from_zone_id: &str, target_zone_id: &str) -> (f64, f64) {
        let target_zone = self.zones.get(target_zone_id)
            .expect("致命错误：尝试传送到一个不存在的拓扑域！");

        // 寻找目标区域中，能够通回“出发区域”的那个门
        let return_gate = target_zone.gates.iter().find(|g| g.target_zone_id == from_zone_id);

        let safe_inset = GameConfig::PORTAL_SAFE_INSET;

        if let Some(gate) = return_gate {
            match gate.dir.as_str() {
                "north" => return (gate.x, gate.y + safe_inset),
                "south" => return (gate.x, gate.y - safe_inset),
                "east"  => return (gate.x - safe_inset, gate.y),
                "west"  => return (gate.x + safe_inset, gate.y),
                _       => return (gate.x, gate.y + safe_inset),
            }
        }

        // 如果找不到对向门，强制取目标区域的第一个门边缘，绝不回退到中央！
        let fallback_gate = target_zone.gates.first()
            .expect("致命拓扑错误：目标区域没有任何传送门定义！");
        
        let fallback_inset = GameConfig::PORTAL_FALLBACK_INSET;
        match fallback_gate.dir.as_str() {
            "north" => (fallback_gate.x, fallback_gate.y + fallback_inset),
            "south" => (fallback_gate.x, fallback_gate.y - fallback_inset),
            "east"  => (fallback_gate.x - fallback_inset, fallback_gate.y),
            _       => (fallback_gate.x + fallback_inset, fallback_gate.y),
        }
    }

    /// 基于 Dijkstra 的最短路径规划
    pub fn find_shortest_trade_path(&self, start_zone: &str, target_zone: &str) -> Option<(Vec<String>, u64)> {
        if !self.zones.contains_key(start_zone) || !self.zones.contains_key(target_zone) {
            return None;
        }

        let zone_keys: Vec<&String> = self.zones.keys().collect();
        let mut key_to_idx = HashMap::new();
        for (i, &k) in zone_keys.iter().enumerate() {
            key_to_idx.insert(k.clone(), i);
        }

        let start_idx = key_to_idx[start_zone];
        let target_idx = key_to_idx[target_zone];

        let mut dist: Vec<u64> = (0..zone_keys.len()).map(|_| u64::MAX).collect();
        let mut prev: Vec<Option<usize>> = vec![None; zone_keys.len()];
        let mut heap = BinaryHeap::new();

        dist[start_idx] = 0;
        heap.push(State { cost: 0, position: start_idx });

        while let Some(State { cost, position }) = heap.pop() {
            if position == target_idx {
                let mut path = Vec::new();
                let mut curr = Some(position);
                while let Some(p) = curr {
                    path.push(zone_keys[p].clone());
                    curr = prev[p];
                }
                path.reverse();
                return Some((path, cost));
            }

            if cost > dist[position] {
                continue;
            }

            let curr_zone = &self.zones[zone_keys[position]];
            for gate in &curr_zone.gates {
                if let Some(&neighbor_idx) = key_to_idx.get(&gate.target_zone_id) {
                    let next_cost = cost + 90; // 90s per map
                    if next_cost < dist[neighbor_idx] {
                        dist[neighbor_idx] = next_cost;
                        prev[neighbor_idx] = Some(position);
                        heap.push(State { cost: next_cost, position: neighbor_idx });
                    }
                }
            }
        }

        None
    }

    /// 🌟 全局统一：传送门严格物理接触判定
    pub fn check_portal_trigger(&self, player_x: f64, player_y: f64, zone_id: &str) -> Option<(&PortalDef, &str, &str)> {
        let zone = self.zones.get(zone_id)?;
        let gate_half_width = 30.0;
        let touch_depth = 6.0;

        for gate in &zone.gates {
            let gx = gate.x;
            let gy = gate.y;
            let is_hit = match gate.dir.as_str() {
                "north" => player_y <= gy + touch_depth && player_y >= gy - 40.0 && (player_x - gx).abs() <= gate_half_width,
                "south" => player_y >= gy - touch_depth && player_y <= gy + 40.0 && (player_x - gx).abs() <= gate_half_width,
                "west"  => player_x <= gx + touch_depth && player_x >= gx - 40.0 && (player_y - gy).abs() <= gate_half_width,
                "east"  => player_x >= gx - touch_depth && player_x <= gx + 40.0 && (player_y - gy).abs() <= gate_half_width,
                _ => ((player_x - gx).powi(2) + (player_y - gy).powi(2)).sqrt() <= 24.0,
            };

            if is_hit {
                return Some((gate, gate.dir.as_str(), gate.target_zone_id.as_str()));
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_world_topology_creation() {
        let topology = WorldTopology::new();
        assert!(topology.zones.contains_key("beijing"), "应包含北京");
        assert!(topology.zones.contains_key("shanghai"), "应包含上海");
        assert!(topology.zones.contains_key("hebei"), "应包含河北");
        assert!(topology.zones.contains_key("yunnan"), "应包含云南");
        assert!(topology.zones.contains_key("qinghai"), "应包含青海");
        assert!(topology.zones.contains_key("zhejiang"), "应包含浙江");
        assert!(topology.zones.contains_key("sky_city"), "应包含天空之城");
    }

    #[test]
    fn test_city_has_gates() {
        let topology = WorldTopology::new();
        let beijing = &topology.zones["beijing"];
        assert!(!beijing.gates.is_empty(), "北京应有传送门");
        assert!(beijing.is_city, "北京应标记为主城");
    }

    #[test]
    fn test_dijkstra_shortest_path() {
        let topology = WorldTopology::new();
        let result = topology.find_shortest_trade_path("beijing", "shanghai");
        assert!(result.is_some(), "应能找到北京到上海的路径");
        let (path, cost) = result.unwrap();
        assert!(path.len() >= 2, "路径至少包含起点和终点");
        assert_eq!(path[0], "beijing");
        assert_eq!(*path.last().unwrap(), "shanghai");
        assert!(cost > 0, "路径成本应大于0");
    }

    #[test]
    fn test_dijkstra_no_path_to_nowhere() {
        let topology = WorldTopology::new();
        let result = topology.find_shortest_trade_path("beijing", "zone_gm_test");
        assert!(result.is_none(), "GM测试场没有连通路径");
    }

    #[test]
    fn test_portal_rebirth_pos() {
        let topology = WorldTopology::new();
        let (x, y) = topology.get_portal_rebirth_pos("beijing", "wild_bj_hb_1");
        assert!(x >= GameConfig::COORD_MIN && x <= GameConfig::COORD_MAX, "X坐标应在有效范围内");
        assert!(y >= GameConfig::COORD_MIN && y <= GameConfig::COORD_MAX, "Y坐标应在有效范围内");
    }

    #[test]
    fn test_wilderness_chain_connectivity() {
        let topology = WorldTopology::new();
        // 验证太行官道链条的连通性
        for i in 1..=6 {
            let zone_id = format!("wild_bj_hb_{}", i);
            assert!(topology.zones.contains_key(&zone_id), "应存在 {}", zone_id);
            let zone = &topology.zones[&zone_id];
            assert!(!zone.gates.is_empty(), "{} 应有传送门", zone_id);
        }
    }
}
