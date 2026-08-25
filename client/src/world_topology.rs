use macroquad::prelude::*;
use std::collections::HashMap;
use cyber_forge_shared::GameConfig;

pub const MAP_SIZE: f64 = GameConfig::MAP_SIZE;
pub const PORTAL_RADIUS: f64 = GameConfig::PORTAL_INTERACT_RADIUS;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PortalDef {
    pub dir: String,
    pub x: f64,
    pub y: f64,
    pub target_zone_id: String,
    pub target_dir: String,
    pub name: String,
    pub color: Color,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ObstacleDef {
    pub id: String,
    pub name: String,
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ResourceDef {
    pub id: String,
    pub name: String,
    pub tier: u8,
    pub res_type: String,
    pub x: f64,
    pub y: f64,
    pub yield_item: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ZoneDef {
    pub id: String,
    pub name: String,
    pub alias: String,
    pub is_city: bool,
    pub biome: String,
    pub weather: String,
    pub weather_buff: String,
    pub color: Color,
    pub bg_color: Color,
    pub spawn_x: f64,
    pub spawn_y: f64,
    pub gates: Vec<PortalDef>,
    pub resources: Vec<ResourceDef>,
    pub obstacles: Vec<ObstacleDef>,
}

pub struct ClientTopology {
    pub zones: HashMap<String, ZoneDef>,
}

impl ClientTopology {
    pub fn new() -> Self {
        let mut zones = HashMap::new();

        // 1. 北京 · 红皇城
        zones.insert(
            "beijing".into(),
            ZoneDef {
                id: "beijing".into(),
                name: "北京 · 红皇城".into(),
                alias: "天道帝都".into(),
                is_city: true,
                biome: "capital".into(),
                weather: "风沙".into(),
                weather_buff: "天道罡风淬火：锻造暴击率 +10%".into(),
                color: Color::new(0.93, 0.27, 0.27, 1.0),
                bg_color: Color::new(0.08, 0.03, 0.03, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "north".into(), x: 8100.0, y: 500.0, target_zone_id: "wild_bj_hb_1".into(), target_dir: "south".into(), name: "北直门 ➔ 太行官道·幽燕关隘".into(), color: Color::new(0.97, 0.45, 0.09, 1.0) },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 17550.0, target_zone_id: "wild_bj_sh_1".into(), target_dir: "west".into(), name: "东华门 ➔ 京沪漕运·通州泊口".into(), color: Color::new(0.96, 0.62, 0.04, 1.0) },
                    PortalDef { dir: "south".into(), x: 18900.0, y: 26500.0, target_zone_id: "wild_bj_yn_1".into(), target_dir: "north".into(), name: "南薰门 ➔ 蜀道滇南·秦岭古栈".into(), color: Color::new(0.06, 0.72, 0.51, 1.0) },
                    PortalDef { dir: "west".into(), x: 500.0, y: 10800.0, target_zone_id: "wild_bj_qh_1".into(), target_dir: "east".into(), name: "西便门 ➔ 丝路陇右·居庸天堑".into(), color: Color::new(0.66, 0.33, 0.97, 1.0) },
                ],
                resources: vec![
                    ResourceDef { id: "bj_res_1".into(), name: "皇极龙脉石".into(), tier: 6, res_type: "ore".into(), x: 19500.0, y: 8000.0, yield_item: "皇极玄铁".into() },
                    ResourceDef { id: "bj_res_2".into(), name: "紫禁灵桐木".into(), tier: 6, res_type: "wood".into(), x: 7500.0, y: 19500.0, yield_item: "帝令灵枝".into() },
                ],
                obstacles: vec![
                    ObstacleDef { id: "bj_palace_l".into(), name: "皇城左天工阁".into(), min_x: 4500.0, max_x: 7500.0, min_y: 4500.0, max_y: 15500.0 },
                    ObstacleDef { id: "bj_palace_r".into(), name: "皇城右太清殿".into(), min_x: 19500.0, max_x: 22500.0, min_y: 4500.0, max_y: 15500.0 },
                ],
            },
        );

        // 2. 河北 · 丙火城
        zones.insert(
            "hebei".into(),
            ZoneDef {
                id: "hebei".into(),
                name: "河北 · 丙火城".into(),
                alias: "百炼铁都".into(),
                is_city: true,
                biome: "forge".into(),
                weather: "烈阳".into(),
                weather_buff: "地脉真火：熔炼铁渣产出 +10%".into(),
                color: Color::new(0.97, 0.45, 0.09, 1.0),
                bg_color: Color::new(0.1, 0.05, 0.02, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "south".into(), x: 9450.0, y: 26500.0, target_zone_id: "wild_bj_hb_6".into(), target_dir: "north".into(), name: "南烽门 ➔ 太行官道·邢襄平野".into(), color: Color::new(0.93, 0.27, 0.27, 1.0) },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 14850.0, target_zone_id: "wild_hb_sh_1".into(), target_dir: "west".into(), name: "东冶门 ➔ 渤海通途·山海雄关".into(), color: Color::new(0.96, 0.62, 0.04, 1.0) },
                    PortalDef { dir: "west".into(), x: 500.0, y: 12150.0, target_zone_id: "wild_qh_hb_6".into(), target_dir: "east".into(), name: "西陉门 ➔ 黄土陇东·五台圣境".into(), color: Color::new(0.92, 0.70, 0.03, 1.0) },
                ],
                resources: vec![
                    ResourceDef { id: "hb_res_1".into(), name: "九幽地火矿".into(), tier: 5, res_type: "ore".into(), x: 8000.0, y: 8000.0, yield_item: "赤火精金".into() },
                    ResourceDef { id: "hb_res_2".into(), name: "太行玄钢矿".into(), tier: 5, res_type: "ore".into(), x: 19000.0, y: 19000.0, yield_item: "太行玄钢".into() },
                ],
                obstacles: vec![
                    ObstacleDef { id: "hb_lava_1".into(), name: "九幽地火熔岩池".into(), min_x: 4500.0, max_x: 8500.0, min_y: 4500.0, max_y: 11000.0 },
                    ObstacleDef { id: "hb_lava_2".into(), name: "丙火淬炼重鼎".into(), min_x: 18500.0, max_x: 22500.0, min_y: 16000.0, max_y: 22500.0 },
                ],
            },
        );

        // 3. 上海 · 庚金城
        zones.insert(
            "shanghai".into(),
            ZoneDef {
                id: "shanghai".into(),
                name: "上海 · 庚金城".into(),
                alias: "万国商埠".into(),
                is_city: true,
                biome: "gold".into(),
                weather: "商晴".into(),
                weather_buff: "万商云集：交易手续费 -5%".into(),
                color: Color::new(0.96, 0.62, 0.04, 1.0),
                bg_color: Color::new(0.08, 0.07, 0.03, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "west".into(), x: 500.0, y: 18900.0, target_zone_id: "wild_bj_sh_6".into(), target_dir: "east".into(), name: "申西门 ➔ 京沪漕运·吴淞商港".into(), color: Color::new(0.93, 0.27, 0.27, 1.0) },
                    PortalDef { dir: "north".into(), x: 12150.0, y: 500.0, target_zone_id: "wild_hb_sh_6".into(), target_dir: "south".into(), name: "长江门 ➔ 渤海通途·崇明外泽".into(), color: Color::new(0.97, 0.45, 0.09, 1.0) },
                    PortalDef { dir: "south".into(), x: 17550.0, y: 26500.0, target_zone_id: "wild_sh_zj_1".into(), target_dir: "north".into(), name: "沪杭门 ➔ 钱塘水陆·松江古渡".into(), color: Color::new(0.02, 0.71, 0.83, 1.0) },
                ],
                resources: vec![
                    ResourceDef { id: "sh_res_1".into(), name: "庚金灵石矿".into(), tier: 5, res_type: "ore".into(), x: 7500.0, y: 7500.0, yield_item: "庚金灵铁".into() },
                    ResourceDef { id: "sh_res_2".into(), name: "东海秘银蚌".into(), tier: 5, res_type: "gem".into(), x: 19500.0, y: 18500.0, yield_item: "深海秘银".into() },
                ],
                obstacles: vec![
                    ObstacleDef { id: "sh_dock".into(), name: "万国商港泊位".into(), min_x: 4500.0, max_x: 7500.0, min_y: 6000.0, max_y: 21000.0 },
                    ObstacleDef { id: "sh_vault".into(), name: "万宝仙石金库".into(), min_x: 19500.0, max_x: 22500.0, min_y: 6000.0, max_y: 21000.0 },
                ],
            },
        );

        // 4. 浙江 · 癸水城
        zones.insert(
            "zhejiang".into(),
            ZoneDef {
                id: "zhejiang".into(),
                name: "浙江 · 癸水城".into(),
                alias: "灵秀工坊".into(),
                is_city: true,
                biome: "water".into(),
                weather: "微澜".into(),
                weather_buff: "水法灵韵：学徒打铁效率 +15%".into(),
                color: Color::new(0.02, 0.71, 0.83, 1.0),
                bg_color: Color::new(0.03, 0.07, 0.1, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "north".into(), x: 10800.0, y: 500.0, target_zone_id: "wild_sh_zj_6".into(), target_dir: "south".into(), name: "武林门 ➔ 钱塘水陆·诸暨剑潭".into(), color: Color::new(0.96, 0.62, 0.04, 1.0) },
                    PortalDef { dir: "west".into(), x: 500.0, y: 16200.0, target_zone_id: "wild_zj_yn_1".into(), target_dir: "east".into(), name: "钱清门 ➔ 百越灵岭·仙霞古道".into(), color: Color::new(0.06, 0.72, 0.51, 1.0) },
                    PortalDef { dir: "northwest".into(), x: 8100.0, y: 500.0, target_zone_id: "wild_bj_zj_6".into(), target_dir: "south".into(), name: "运河门 ➔ 大运河津·拱宸古桥".into(), color: Color::new(0.93, 0.27, 0.27, 1.0) },
                ],
                resources: vec![
                    ResourceDef { id: "zj_res_1".into(), name: "西子玄水灵脉".into(), tier: 5, res_type: "essence".into(), x: 8000.0, y: 18000.0, yield_item: "西子玄水".into() },
                    ResourceDef { id: "zj_res_2".into(), name: "龙泉青石矿".into(), tier: 5, res_type: "ore".into(), x: 19000.0, y: 8000.0, yield_item: "龙泉古胚".into() },
                ],
                obstacles: vec![
                    ObstacleDef { id: "zj_canal_1".into(), name: "西子灵水千波池".into(), min_x: 4500.0, max_x: 8500.0, min_y: 4500.0, max_y: 12000.0 },
                    ObstacleDef { id: "zj_canal_2".into(), name: "龙泉千锤水碓工坊".into(), min_x: 18500.0, max_x: 22500.0, min_y: 15000.0, max_y: 22500.0 },
                ],
            },
        );

        // 5. 云南 · 乙木城
        zones.insert(
            "yunnan".into(),
            ZoneDef {
                id: "yunnan".into(),
                name: "云南 · 乙木城".into(),
                alias: "灵蕈林都".into(),
                is_city: true,
                biome: "forest".into(),
                weather: "多雨".into(),
                weather_buff: "青木灵气：全境采集效率 +15%".into(),
                color: Color::new(0.06, 0.72, 0.51, 1.0),
                bg_color: Color::new(0.03, 0.08, 0.05, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "north".into(), x: 16200.0, y: 500.0, target_zone_id: "wild_bj_yn_6".into(), target_dir: "south".into(), name: "金马门 ➔ 蜀道滇南·苍山古林".into(), color: Color::new(0.93, 0.27, 0.27, 1.0) },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 12150.0, target_zone_id: "wild_zj_yn_6".into(), target_dir: "west".into(), name: "碧鸡门 ➔ 百越灵岭·罗霄绝顶".into(), color: Color::new(0.02, 0.71, 0.83, 1.0) },
                    PortalDef { dir: "northwest".into(), x: 500.0, y: 9450.0, target_zone_id: "wild_yn_qh_1".into(), target_dir: "southeast".into(), name: "苍山门 ➔ 茶马雪山·玉龙雪峰".into(), color: Color::new(0.92, 0.70, 0.03, 1.0) },
                ],
                resources: vec![
                    ResourceDef { id: "yn_res_1".into(), name: "千年青皇古木".into(), tier: 5, res_type: "wood".into(), x: 8500.0, y: 19000.0, yield_item: "千年青皇木".into() },
                    ResourceDef { id: "yn_res_2".into(), name: "七彩迷幻仙芝".into(), tier: 5, res_type: "herb".into(), x: 18500.0, y: 8500.0, yield_item: "七彩迷幻菇".into() },
                ],
                obstacles: vec![
                    ObstacleDef { id: "yn_swamp_1".into(), name: "十万大山神木根系".into(), min_x: 4500.0, max_x: 8500.0, min_y: 16000.0, max_y: 22500.0 },
                    ObstacleDef { id: "yn_swamp_2".into(), name: "迷幻万毒灵沼".into(), min_x: 18500.0, max_x: 22500.0, min_y: 4500.0, max_y: 11000.0 },
                ],
            },
        );

        // 6. 青海 · 坤土城
        zones.insert(
            "qinghai".into(),
            ZoneDef {
                id: "qinghai".into(),
                name: "青海 · 坤土城".into(),
                alias: "西域坤灵".into(),
                is_city: true,
                biome: "earth".into(),
                weather: "晴雪".into(),
                weather_buff: "极西厚土：神兵坚韧度 +15%".into(),
                color: Color::new(0.92, 0.70, 0.03, 1.0),
                bg_color: Color::new(0.08, 0.07, 0.04, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "east".into(), x: 26500.0, y: 16200.0, target_zone_id: "wild_bj_qh_6".into(), target_dir: "west".into(), name: "湟水门 ➔ 丝路陇右·倒淌河畔".into(), color: Color::new(0.93, 0.27, 0.27, 1.0) },
                    PortalDef { dir: "south".into(), x: 13500.0, y: 26500.0, target_zone_id: "wild_yn_qh_6".into(), target_dir: "north".into(), name: "唐蕃门 ➔ 茶马雪山·巴颜喀拉".into(), color: Color::new(0.06, 0.72, 0.51, 1.0) },
                    PortalDef { dir: "north".into(), x: 8100.0, y: 500.0, target_zone_id: "wild_qh_hb_1".into(), target_dir: "south".into(), name: "祁连门 ➔ 黄土陇东·祁连雪积".into(), color: Color::new(0.97, 0.45, 0.09, 1.0) },
                ],
                resources: vec![
                    ResourceDef { id: "qh_res_1".into(), name: "极西坤灵母石".into(), tier: 5, res_type: "ore".into(), x: 8000.0, y: 8000.0, yield_item: "坤灵母石".into() },
                    ResourceDef { id: "qh_res_2".into(), name: "青海天晶石矿".into(), tier: 5, res_type: "gem".into(), x: 19000.0, y: 19000.0, yield_item: "青海天晶".into() },
                ],
                obstacles: vec![
                    ObstacleDef { id: "qh_salt_1".into(), name: "万丈察尔汗青盐幻海".into(), min_x: 4500.0, max_x: 8500.0, min_y: 15000.0, max_y: 22500.0 },
                    ObstacleDef { id: "qh_salt_2".into(), name: "极西昆仑天晶矿障".into(), min_x: 18500.0, max_x: 22500.0, min_y: 4500.0, max_y: 12000.0 },
                ],
            },
        );

        // 7. 天空之城
        zones.insert(
            "sky_city".into(),
            ZoneDef {
                id: "sky_city".into(),
                name: "天空之城 · 太虚迷境".into(),
                alias: "Albion 迷雾秘境".into(),
                is_city: true,
                biome: "mist".into(),
                weather: "极光".into(),
                weather_buff: "太虚神韵：造物神兵高阶概率 +35%".into(),
                color: Color::new(0.66, 0.33, 0.97, 1.0),
                bg_color: Color::new(0.07, 0.03, 0.11, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![
                    PortalDef { dir: "south".into(), x: 13500.0, y: 26500.0, target_zone_id: "beijing".into(), target_dir: "north".into(), name: "太虚星门 ➔ 返回北京".into(), color: Color::new(0.93, 0.27, 0.27, 1.0) },
                    PortalDef { dir: "east".into(), x: 26500.0, y: 13500.0, target_zone_id: "shanghai".into(), target_dir: "west".into(), name: "星穹通途 ➔ 降落上海".into(), color: Color::new(0.96, 0.62, 0.04, 1.0) },
                    PortalDef { dir: "west".into(), x: 500.0, y: 13500.0, target_zone_id: "qinghai".into(), target_dir: "east".into(), name: "太古玄界 ➔ 降落青海".into(), color: Color::new(0.92, 0.70, 0.03, 1.0) },
                ],
                resources: vec![
                    ResourceDef { id: "sky_res_1".into(), name: "太虚玄晶矿".into(), tier: 8, res_type: "gem".into(), x: 13500.0, y: 8000.0, yield_item: "太虚玄晶".into() },
                    ResourceDef { id: "sky_res_2".into(), name: "九天星辰铁".into(), tier: 8, res_type: "ore".into(), x: 13500.0, y: 19000.0, yield_item: "星辰神铁".into() },
                ],
                obstacles: vec![
                    ObstacleDef { id: "sky_void_1".into(), name: "太虚空间裂隙".into(), min_x: 4500.0, max_x: 7500.0, min_y: 4500.0, max_y: 22500.0 },
                    ObstacleDef { id: "sky_void_2".into(), name: "混沌星核残骸".into(), min_x: 19500.0, max_x: 22500.0, min_y: 4500.0, max_y: 22500.0 },
                ],
            },
        );

        // 8. GM 开发者空间
        zones.insert(
            "zone_gm_test".into(),
            ZoneDef {
                id: "zone_gm_test".into(),
                name: "GM 开发者空间 · 虚空试验场".into(),
                alias: "DIMENSION_OUT_OF_BOUNDS".into(),
                is_city: false,
                biome: "mist".into(),
                weather: "混沌".into(),
                weather_buff: "天道试验场：全系统最高权限调试中".into(),
                color: Color::new(0.92, 0.28, 0.6, 1.0),
                bg_color: Color::new(0.08, 0.02, 0.08, 1.0),
                spawn_x: 13500.0,
                spawn_y: 13500.0,
                gates: vec![],
                resources: vec![],
                obstacles: vec![],
            },
        );

        // 生成荒野链
        Self::populate_wild_chain(&mut zones, "wild_bj_hb", "太行官道", &["幽燕关隘", "飞狐绝径", "井陉天险", "娘子雄关", "滏口古陉", "邢襄平野"], "beijing", "hebei", "north", "south", "mountain", "烈阳", "炉温暴涨：熔炼速度 +10%", Color::new(0.97, 0.45, 0.09, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_bj_sh", "京沪漕运", &["通州泊口", "沧浪清波", "德州古渡", "淮安重津", "扬子古津", "吴淞商港"], "beijing", "shanghai", "east", "west", "water", "商晴", "通商顺畅：金币产出 +8%", Color::new(0.96, 0.62, 0.04, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_bj_zj", "大运河津", &["张家湾津", "临清古埠", "微山浩渺", "宿迁水驿", "姑苏水巷", "拱宸古桥"], "beijing", "zhejiang", "south", "north", "water", "微澜", "学徒顿悟率 +10%", Color::new(0.02, 0.71, 0.83, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_bj_yn", "蜀道滇南", &["秦岭古栈", "剑门绝壁", "锦官林海", "乌蒙巨壑", "洱海灵沼", "苍山古林"], "beijing", "yunnan", "south", "north", "forest", "多雨", "古木催生：采集产出 +12%", Color::new(0.06, 0.72, 0.51, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_bj_qh", "丝路陇右", &["居庸天堑", "塞北荒丘", "贺兰古道", "陇西黄土", "日月山口", "倒淌河畔"], "beijing", "qinghai", "west", "east", "desert", "晴雪", "西域风蚀：矿脉纯度 +10%", Color::new(0.92, 0.70, 0.03, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_hb_sh", "渤海通途", &["山海雄关", "秦皇浴日", "渤海烟波", "黄骅斥卤", "胶东灵脉", "崇明外泽"], "hebei", "shanghai", "east", "north", "water", "惊涛", "熔炼暴击 +8%", Color::new(0.22, 0.74, 0.97, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_sh_zj", "钱塘水陆", &["松江古渡", "嘉兴烟雨", "西塘幽巷", "钱塘怒潮", "富春叠翠", "诸暨剑潭"], "shanghai", "zhejiang", "south", "north", "water", "微澜", "水法提纯 +10%", Color::new(0.02, 0.71, 0.83, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_zj_yn", "百越灵岭", &["仙霞古道", "武夷茶烟", "南岭千叠", "桂林奇峰", "十万深山", "罗霄绝顶"], "zhejiang", "yunnan", "west", "east", "forest", "雾障", "稀有草药产出 +15%", Color::new(0.06, 0.72, 0.51, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_yn_qh", "茶马雪山", &["玉龙雪峰", "金沙飞渡", "香格里拉", "澜沧天堑", "念青唐古", "巴颜喀拉"], "yunnan", "qinghai", "north", "south", "snow", "严寒", "冰魄淬火 +12%", Color::new(0.92, 0.70, 0.03, 1.0));
        Self::populate_wild_chain(&mut zones, "wild_qh_hb", "黄土陇东", &["祁连雪积", "乌鞘雄岭", "宁夏平野", "鄂尔多斯", "雁门古塞", "五台圣境"], "qinghai", "hebei", "north", "west", "mountain", "风沙", "厚土加持：坚韧 +15%", Color::new(0.97, 0.45, 0.09, 1.0));

        Self { zones }
    }

    fn populate_wild_chain(
        zones: &mut HashMap<String, ZoneDef>,
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
        base_color: Color,
    ) {
        let count = station_names.len();
        let offsets = [8100.0, 16200.0, 10800.0, 18900.0, 9450.0, 17550.0, 13500.0];

        for i in 1..=count {
            let zone_id = format!("{}_{}", prefix, i);
            let s_name = station_names[i - 1];
            let name = format!("{} · {}", base_name, s_name);

            let mut gates = Vec::new();
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
                    color: Color::new(0.93, 0.27, 0.27, 1.0),
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
                    color: base_color,
                });
            }

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
                    color: Color::new(0.0, 1.0, 0.78, 1.0),
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
                    color: base_color,
                });
            }

            zones.insert(
                zone_id.clone(),
                ZoneDef {
                    id: zone_id.clone(),
                    name,
                    alias: format!("{}-{}", base_name, s_name),
                    is_city: false,
                    biome: biome.into(),
                    weather: weather.into(),
                    weather_buff: buff.into(),
                    color: base_color,
                    bg_color: Color::new(0.04, 0.04, 0.04, 1.0),
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
                        },
                    ],
                    obstacles: vec![],
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

        if let Some(gate) = return_gate {
            // 根据门的朝向，进行 450px 的安全内推，绝对不落在大街中央
            match gate.dir.as_str() {
                "north" => return (gate.x, 1100.0 + 450.0), // 从北门进，向南偏移
                "south" => return (gate.x, 25900.0 - 450.0), // 从南门进，向北偏移
                "east"  => return (25900.0 - 450.0, gate.y), // 从东门进，向西偏移
                "west"  => return (1100.0 + 450.0, gate.y),  // 从西门进，向东偏移
                _       => return (gate.x, gate.y),
            }
        }

        // 如果找不到对向门，强制取目标区域的第一个门边缘，绝不回退到中央！
        let fallback_gate = target_zone.gates.first()
            .expect("致命拓扑错误：目标区域没有任何传送门定义！");
        
        match fallback_gate.dir.as_str() {
            "north" => (fallback_gate.x, 1550.0),
            "south" => (fallback_gate.x, 25450.0),
            "east"  => (25450.0, fallback_gate.y),
            _       => (1550.0, fallback_gate.y),
        }
    }
}
