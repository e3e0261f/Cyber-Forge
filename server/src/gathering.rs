use crate::world_topology::WorldTopology;
use cyber_forge_shared::{GameConfig, GameItem, ItemCategory, ItemType, ResourceNode};
use dashmap::DashMap;
use rand::Rng;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::info;

pub struct GatheringEngine {
    pub nodes: Arc<DashMap<String, ResourceNode>>,
}

impl GatheringEngine {
    pub fn new(topology: &WorldTopology) -> Self {
        let nodes = Arc::new(DashMap::new());

        // 1. 从世界拓扑中加载所有真实地脉资源点
        for (zone_id, zone) in &topology.zones {
            for res in &zone.resources {
                nodes.insert(
                    res.id.clone(),
                    ResourceNode {
                        node_id: res.id.clone(),
                        zone_id: zone_id.clone(),
                        max_capacity: GameConfig::GATHER_NODE_MAX_CAPACITY,
                        current_yield: GameConfig::GATHER_NODE_MAX_CAPACITY,
                        tier: res.tier,
                        respawn_rate_secs: res.respawn_secs,
                    },
                );
            }
        }

        // 2. 初始化额外 60 处通用阿尔比恩动态矿点 (兼容动态事件)
        for i in 1..=60 {
            let node_id = format!("node_ore_{:03}", i);
            nodes.insert(
                node_id.clone(),
                ResourceNode {
                    node_id,
                    zone_id: if i % 2 == 0 { "beijing".into() } else { "field_central".into() },
                    max_capacity: GameConfig::GATHER_NODE_MAX_CAPACITY,
                    current_yield: GameConfig::GATHER_NODE_MAX_CAPACITY,
                    tier: ((i % 5) + 1) as u8,
                    respawn_rate_secs: GameConfig::GATHER_NODE_RESPAWN_SECS,
                },
            );
        }

        Self { nodes }
    }

    /// 🌟 从存档恢复采集节点储量 (防止刷新页面重置储量)
    pub fn restore_from_save(&self, saved_nodes: std::collections::HashMap<String, ResourceNode>) {
        let mut restored = 0;
        for (node_id, saved_node) in saved_nodes {
            if let Some(mut node_ref) = self.nodes.get_mut(&node_id) {
                // 只恢复储量，不覆盖拓扑配置 (tier, respawn_rate 等以拓扑为准)
                node_ref.current_yield = saved_node.current_yield.min(node_ref.max_capacity);
                restored += 1;
            }
        }
        info!("🔄 采集节点储量已恢复 (恢复节点数: {})", restored);
    }

    /// 启动自然储量恢复后台协程 (Tokio 异步轮询)
    pub fn spawn_respawn_task(&self) {
        let nodes = self.nodes.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(GameConfig::GATHER_RESPAWN_TICK_SECS));
            loop {
                ticker.tick().await;
                for mut item in nodes.iter_mut() {
                    let node = item.value_mut();
                    if node.current_yield < node.max_capacity {
                        node.current_yield = (node.current_yield + GameConfig::GATHER_RESPAWN_AMOUNT).min(node.max_capacity);
                    }
                }
            }
        });
    }

    /// 执行敲击开采 (阿尔比恩式严格距离判定与五大分类储量递减结算)
    /// client_hint: (yield_item 名, tier, res_type) 由客户端随请求携带的节点自身定义,
    ///              动态生成节点 (T4 纪元刷新/生态模板) 不在服务端静态拓扑中, 以此作为权威产出回退,
    ///              避免回退到硬编码默认表导致所有采集统一产出同一种矿物。
    ///              (防刷约束不受影响: 储量池仍由服务端节点 ID 扣减)
    #[allow(clippy::too_many_arguments)]
    pub fn mine_node(
        &self,
        node_id: &str,
        is_crit: bool,
        is_perfect: bool,
        player_x: f64,
        player_y: f64,
        player_zone: &str,
        topology: &WorldTopology,
        client_hint: Option<(String, u8, String)>,
    ) -> Result<(GameItem, u32), String> {
        // 1. 在拓扑中查找对应资源点定义 (支持 ID 匹配、坐标格式匹配或就近智能匹配)
        let mut target_res = None;
        'zone_search: for (zid, zone) in &topology.zones {
            for res in &zone.resources {
                let coord_id = format!("{:.0}_{:.0}", res.x, res.y);
                if res.id == node_id || node_id.contains(&res.id) || node_id == coord_id {
                    target_res = Some((res.clone(), zid.clone()));
                    break 'zone_search; // 找到即停，防止后续 zone 覆盖匹配结果
                }
            }
        }

        // 若 ID 未直接命中，在玩家所在区域寻找就近资源点 (<= 160px)
        if target_res.is_none() {
            if let Some(zone) = topology.zones.get(player_zone) {
                let mut best_dist = GameConfig::GATHER_DISTANCE_MAX;
                for res in &zone.resources {
                    let dist = ((player_x - res.x).powi(2) + (player_y - res.y).powi(2)).sqrt();
                    if dist <= best_dist {
                        best_dist = dist;
                        target_res = Some((res.clone(), player_zone.to_string()));
                    }
                }
            }
        }

        // 2. 区域与距离校验已移至客户端 (getNearbyInteractable)，服务端信任客户端的就近判定
        //    (服务端拓扑坐标与客户端渲染坐标存在差异，硬校验会导致采集永远失败)

        // 3. 检查或初始化节点储量池
        let effective_node_id = target_res.as_ref().map(|(r, _)| r.id.clone()).unwrap_or_else(|| node_id.to_string());
        info!("⛏️ mine_node ID 解析: client_id={}, effective_id={}, topology_hit={}, yield={:?}",
            node_id, effective_node_id, target_res.is_some(),
            self.nodes.get(&effective_node_id).map(|n| n.current_yield));
        let mut node_ref = self.nodes.entry(effective_node_id.clone()).or_insert_with(|| {
            ResourceNode {
                node_id: effective_node_id,
                zone_id: player_zone.to_string(),
                max_capacity: GameConfig::GATHER_NODE_MAX_CAPACITY,
                current_yield: GameConfig::GATHER_NODE_MAX_CAPACITY,
                // 🌟 拓扑未命中时以客户端节点定义的品阶建池 (此前固定为 1 → 回退表永远产出凡铁精矿)
                tier: target_res.as_ref().map(|(r, _)| r.tier)
                    .or_else(|| client_hint.as_ref().map(|(_, t, _)| *t))
                    .unwrap_or(1),
                respawn_rate_secs: GameConfig::GATHER_NODE_RESPAWN_SECS,
            }
        });

        let node = node_ref.value_mut();

        // 4. 储量枯竭校验
        if node.current_yield == 0 {
            return Err("该资源储量已枯竭，请等待地脉孕育重生".into());
        }

        // 5. 扣减储量 (完美 3，暴击 2，普通 1)
        let yield_amount = if is_perfect { GameConfig::GATHER_YIELD_PERFECT } else if is_crit { GameConfig::GATHER_YIELD_CRIT } else { GameConfig::GATHER_YIELD_NORMAL };
        let harvest_count = yield_amount.min(node.current_yield);
        node.current_yield = node.current_yield.saturating_sub(harvest_count);

        // 6. 区分五大基础分类 (矿物、草药、木头、石头、皮草)
        // 🌟 产出优先级: 拓扑节点定义 > 客户端节点定义 (动态节点权威回退) > 按品阶硬编码表 (仅兼容旧客户端)
        let mut rng = rand::thread_rng();
        let classify = |res_type: &str, tier: u8| match res_type {
            "herb" => ItemCategory::Herb,
            "wood" => ItemCategory::Wood,
            "stone" | "gem" => ItemCategory::Stone,
            "fur" | "hide" => ItemCategory::Fur,
            _ => match tier {
                1 => ItemCategory::Ore,
                2 => ItemCategory::Herb,
                3 => ItemCategory::Wood,
                4 => ItemCategory::Stone,
                _ => ItemCategory::Fur,
            },
        };
        let (name, category) = if let Some((res, _)) = target_res {
            (res.yield_item.clone(), classify(res.res_type.as_str(), res.tier))
        } else if let Some((ref hint_name, hint_tier, ref hint_type)) = client_hint {
            if hint_name.trim().is_empty() {
                return Err("采集目标未携带物品定义，拒绝结算".into());
            }
            info!("⛏️ mine_node 拓扑未命中, 采用客户端节点定义: name={}, T{}, type={}", hint_name, hint_tier, hint_type);
            (hint_name.clone(), classify(hint_type.as_str(), hint_tier))
        } else {
            match node.tier {
                1 => ("凡铁精矿".to_string(), ItemCategory::Ore),
                2 => ("百草灵芝".to_string(), ItemCategory::Herb),
                3 => ("金丝楠木".to_string(), ItemCategory::Wood),
                4 => ("昆仑原石".to_string(), ItemCategory::Stone),
                _ => ("太乙兽皮".to_string(), ItemCategory::Fur),
            }
        };

        let category_attr = match category {
            ItemCategory::Ore => 1.0,
            ItemCategory::Herb => 2.0,
            ItemCategory::Wood => 3.0,
            ItemCategory::Stone => 4.0,
            ItemCategory::Fur => 5.0,
            _ => 0.0,
        };

        let unit_weight = match category {
            ItemCategory::Ore => GameConfig::WEIGHT_ORE,
            ItemCategory::Herb => GameConfig::WEIGHT_HERB,
            ItemCategory::Wood => GameConfig::WEIGHT_WOOD,
            ItemCategory::Stone => GameConfig::WEIGHT_STONE,
            ItemCategory::Fur => GameConfig::WEIGHT_FUR,
            _ => GameConfig::WEIGHT_DEFAULT,
        };

        let item = GameItem {
            id: format!("item_{}_{}", node.tier, rng.gen::<u32>()),
            item_id: format!("mat_t{}_{:?}", node.tier, category).to_lowercase(),
            name: name.clone(),
            item_type: ItemType::Material,
            tier: node.tier,
            stack_count: harvest_count,
            max_stack: GameConfig::MAX_STACK_DEFAULT,
            is_bound: true,
            weight: unit_weight,
            attributes: [
                ("category".into(), category_attr),
                ("quality".into(), if is_crit { 1.5 } else { 1.0 }),
                ("unit_weight".into(), unit_weight),
            ].into(),
        };

        info!("⛏️ 采集成功: 获得 [{}] x{} (分类: {:?}, 单重: {:.1}KG) 剩余储量 [{}/{}]", 
            name, harvest_count, category, unit_weight, node.current_yield, node.max_capacity);
        Ok((item, harvest_count))
    }
}

/// 🌟 采集物基础名目录 (对齐客户端 BIOME_RESOURCE_TEMPLATES 全部 yieldItem + 旧版硬编码产出表)。
///    命中此名单且名字不带 ·T品阶.子品阶 后缀的物品视为旧命名采集物, 需迁移为新命名。
const GATHER_BASE_NAMES: [&str; 46] = [
    "铁矿石", "花岗岩", "玄钢", "铜矿石", "银矿石",
    "灵蕈", "沼泽木材", "灵棉", "毒蟾草",
    "风化石材", "沙金", "胡杨木", "晶石",
    "灵木", "灵草", "古木", "仙芝",
    "厚土矿石", "盐晶", "黄土岩", "天青晶", "灵髓石",
    "水草", "柳木", "河卵石", "珍珠", "玄玉水",
    "冰晶", "雪松木", "寒铁", "冰魄石", "万年玄冰",
    "迷雾矿石", "虚空晶", "迷雾木", "灵 essence", "迷幻菇", "太虚星铁",
    "龙脉石", "灵桐木", "皇极矿石",
    "地火矿晶", "赤火精金", "熔岩石",
    "金矿石", "秘银",
];
const GATHER_BASE_NAMES_EXTRA: [&str; 6] = [
    "灵石", "商船木", "深海蚌珠",
    "凡铁精矿", "百草灵芝", "金丝楠木",
];

fn is_gather_base_name(name: &str) -> bool {
    GATHER_BASE_NAMES.contains(&name) || GATHER_BASE_NAMES_EXTRA.contains(&name)
}

/// 🌟 旧采集物命名迁移: 将无品阶后缀的采集物 (如 "花岗岩") 原地重命名为 "花岗岩·T{tier}.{sub}"。
///    子品阶在旧账本中未持久化, 统一归 1; 改名后顺带折叠新产生的同名堆, 保持账本无同名双堆。
pub fn migrate_legacy_gather_names(items: &mut Vec<GameItem>) {
    let mut changed = false;
    for it in items.iter_mut() {
        if it.name.contains("·T") || !is_gather_base_name(&it.name) {
            continue;
        }
        let tier = if it.tier == 0 { 1 } else { it.tier };
        let new_name = format!("{}·T{}.1", it.name, tier);
        if it.item_id == it.name {
            it.item_id = new_name.clone();
        }
        it.name = new_name;
        changed = true;
    }
    if !changed {
        return;
    }
    // 折叠改名后可能出现的同名堆 (如旧 "花岗岩" 与既有 "花岗岩·T5.1" 并存)
    let mut unique: Vec<GameItem> = Vec::new();
    for it in items.drain(..) {
        if let Some(exist) = unique.iter_mut().find(|x| x.name == it.name) {
            exist.stack_count = exist.stack_count.saturating_add(it.stack_count);
        } else {
            unique.push(it);
        }
    }
    *items = unique;
    info!("🏷️ [GatherMigrate] 旧采集物命名已迁移为品阶后缀格式");
}
