use cyber_forge_shared::{GameConfig, GameItem, ItemType, MerchantTicket, PlayerState};
use anyhow::{bail, Result};
use std::collections::HashMap;
use tracing::info;

/// 🌟 贸易商品身份前缀: 背包/银行中 item_id 以该前缀开头即商票货物
pub const TRADE_ITEM_PREFIX: &str = "trade_";
/// 🌟 商票物品身份 (领取的商票本身作为背包物品, 悬停查看额度详情)
pub const TICKET_ITEM_ID: &str = "merchant_ticket";

/// 各大城特产基准价 (与客户端 CITY_TRADE_GOODS 对应, 用于服务端价格防作弊校验)
fn trade_good_base_price(good_id: &str) -> Option<u64> {
    let base = match good_id {
        "bj_silk" => 280, "bj_tea" => 150, "bj_jade" => 420,
        "hb_iron" => 180, "hb_coal" => 80, "hb_grain" => 45,
        "sh_salt" => 120, "sh_pearl" => 680, "sh_spice" => 320,
        "yn_herb" => 200, "yn_gem" => 550, "yn_pu_er" => 160,
        "qh_fur" => 380, "qh_musk" => 480, "qh_crystal" => 620,
        _ => return None,
    };
    Some(base)
}

/// 价格防作弊校验: 考虑到相隔一城暴利(+500%)与暴跌(40%)，在基准价 0.3~7.0 倍区间内均视为合法
fn price_in_bounds(good_id: &str, unit_price: u64) -> bool {
    match trade_good_base_price(good_id) {
        Some(base) => unit_price >= (base * 3 / 10).max(1) && unit_price <= base * 7,
        None => true, // 允许扩展与自定义特产
    }
}

pub struct CommerceEngine;

impl CommerceEngine {
    /// 🌟 在主城驿馆缴纳押金领取商票: 缴纳 3 万铜押金, 获得 3 万铜初始额度, 商票作为物品放入背包
    pub fn issue_merchant_ticket(player: &mut PlayerState, issue_city: &str) -> Result<()> {
        if player.merchant_ticket.as_ref().map(|t| t.is_active).unwrap_or(false) {
            bail!("您身上已有未交割的商票，严禁重复办理！");
        }

        if player.copper < GameConfig::TICKET_INITIAL_LIMIT {
            bail!("铜钱不足 30,000，无法缴纳商票押金！");
        }

        player.copper -= GameConfig::TICKET_INITIAL_LIMIT;

        player.merchant_ticket = Some(MerchantTicket {
            ticket_id: format!("ticket_{}_{}", issue_city, player.account_id),
            credit_limit: GameConfig::TICKET_INITIAL_LIMIT,
            current_deposit: GameConfig::TICKET_INITIAL_LIMIT,
            issue_city: issue_city.to_string(),
            is_active: true,
            cargo: Vec::new(),
            used_credit: 0,
            earned_total: 0,
        });

        // 🌟 商票领取入包: 作为背包物品存在
        if !player.backpack.iter().any(|i| i.item_id == TICKET_ITEM_ID) {
            player.backpack.push(GameItem {
                id: TICKET_ITEM_ID.to_string(),
                item_id: TICKET_ITEM_ID.to_string(),
                name: "商票".to_string(),
                item_type: ItemType::Consumable,
                tier: 1,
                stack_count: 1,
                max_stack: 1,
                is_bound: true,
                weight: 0.0,
                attributes: HashMap::new(),
            });
        }
        player.recalculate_weight();

        info!("📜 主城 [{}] 为玩家 [{}] 签发商票 (扣除押金 3万铜，额度 3万铜)", issue_city, player.account_id);
        Ok(())
    }

    /// 🌟 采购特产: 消费商票信用额度 (不扣铜钱), 货物直接入背包并占取负重;
    ///    可堆叠同名已有堆, 满堆开新格 (服务端允许超容量入包)
    pub fn buy_trade_good(player: &mut PlayerState, current_city: &str, good_id: &str, name: &str, unit_price: u64, count: u32) -> Result<()> {
        if good_id.is_empty() || count == 0 { bail!("采购参数无效！"); }
        if !price_in_bounds(good_id, unit_price) {
            bail!("报价偏离行情基准过大，交易被驿馆驳回！");
        }
        let ticket = player.merchant_ticket.as_mut().ok_or_else(|| anyhow::anyhow!("未持有有效商票，无法参与大宗跨城贸易！"))?;

        let total_cost = unit_price * (count as u64);
        if ticket.used_credit + total_cost > ticket.credit_limit {
            bail!("超出商票剩余额度！已用: {}, 本次需: {}, 总额度: {}", ticket.used_credit, total_cost, ticket.credit_limit);
        }
        ticket.used_credit += total_cost;

        // 🌟 货物入背包: 优先堆叠已有同货堆 (记录采购成本到 attributes 供卖出释放额度)
        let trade_item_id = format!("{}{}", TRADE_ITEM_PREFIX, good_id);
        let mut attrs: HashMap<String, f64> = HashMap::new();
        attrs.insert("buy_price".to_string(), unit_price as f64);

        if let Some(slot) = player.backpack.iter_mut().find(|i| i.item_id == trade_item_id && i.stack_count < i.max_stack) {
            let old_cnt = slot.stack_count as u64;
            let old_buy = slot.attributes.get("buy_price").copied().unwrap_or(unit_price as f64) as u64;
            let new_avg = (old_buy * old_cnt + unit_price * (count as u64)) / (old_cnt + count as u64);
            slot.stack_count += count;
            slot.attributes.insert("buy_price".to_string(), new_avg as f64);
        } else {
            player.backpack.push(GameItem {
                id: format!("{}_{}", trade_item_id, player.backpack.len()),
                item_id: trade_item_id,
                name: name.to_string(),
                item_type: ItemType::TradeGood,
                tier: 1,
                stack_count: count,
                max_stack: 999,
                is_bound: false,
                weight: GameConfig::TRADE_GOOD_UNIT_WEIGHT,
                attributes: attrs,
            });
        }
        player.recalculate_weight();

        info!("📦 玩家 [{}] 在 [{}] 赊购特产 [{} x{}] 入背包 (单价 {}, 占用额度 {})", player.account_id, current_city, name, count, unit_price, total_cost);
        Ok(())
    }

    /// 🌟 向驿馆售出货物: 只识别背包内商票货物 (存入银行的货物无法卖出);
    ///    回款直接入铜钱, 按采购成本释放信用额度, 累计回款计入交割进度
    pub fn sell_trade_good(player: &mut PlayerState, good_id: &str, unit_price: u64, count: u32) -> Result<u64> {
        if good_id.is_empty() || count == 0 { bail!("出售参数无效！"); }
        if !price_in_bounds(good_id, unit_price) {
            bail!("报价偏离行情基准过大，交易被驿馆驳回！");
        }
        let has_ticket = player.merchant_ticket.is_some();
        if !has_ticket { bail!("未持有商票，驿馆拒绝收购！"); }

        let trade_item_id = format!("{}{}", TRADE_ITEM_PREFIX, good_id);
        // 🌟 NPC 只识别背包内商品: 刻意不扫 bank_items, 存银行的货物无法在此卖出;
        //    先只读取出售数量与采购成本再释放借用, 避免与下方 ticket 可变借用冲突
        let Some(idx) = player.backpack.iter().position(|i| i.item_id == trade_item_id) else {
            bail!("背包中没有该货物 (存入银行的货物无法在驿馆出售)！");
        };
        let sell_count = count.min(player.backpack[idx].stack_count);
        let buy_price = player.backpack[idx].attributes.get("buy_price").copied().unwrap_or(unit_price as f64) as u64;
        let full_stack = sell_count >= player.backpack[idx].stack_count;
        let revenue = unit_price * (sell_count as u64);

        player.copper += revenue;
        let earned_now;
        {
            let ticket = player.merchant_ticket.as_mut().expect("已校验商票存在");
            // 按采购成本释放额度 (上限为已用额度, 防溢出)
            let released = (buy_price * (sell_count as u64)).min(ticket.used_credit);
            ticket.used_credit -= released;
            ticket.earned_total += revenue;
            earned_now = ticket.earned_total;
        }

        // 扣堆或整堆移除 (借用已释放, 安全可变操作背包)
        if full_stack {
            player.backpack.remove(idx);
        } else {
            player.backpack[idx].stack_count -= sell_count;
        }
        player.recalculate_weight();

        info!("💰 玩家 [{}] 售出货物 [{} x{}] 回款 {} 铜 (累计回款 {}/{})", player.account_id, good_id, sell_count, revenue, earned_now, GameConfig::TICKET_SETTLE_TARGET);
        Ok(revenue)
    }

    /// 🌟 交割商票: 累计回款达到交割目标 (3万赚到10万) 后方可交割;
    ///    退还 3 万押金并核发奖励金 (铜钱 + 金币 + 仙玉)
    pub fn settle_merchant_ticket(player: &mut PlayerState, current_city: &str) -> Result<u64> {
        let Some(ticket) = player.merchant_ticket.as_ref() else {
            bail!("未持有商票，无法交割！");
        };
        if !ticket.is_active {
            bail!("未持有有效激活的商票，无法交割！");
        }
        if ticket.earned_total < GameConfig::TICKET_SETTLE_TARGET {
            bail!("交割火候未到: 累计回款 {} / 目标 {} (把 3 万额度赚到 10 万方可交割)", ticket.earned_total, GameConfig::TICKET_SETTLE_TARGET);
        }

        let refund = ticket.current_deposit;
        let bonus = ticket.earned_total / GameConfig::TICKET_SETTLE_BONUS_DIV + 30000;
        player.copper += refund + bonus;
        player.coins += 10;
        player.jade += 1;
        player.merchant_ticket = None;

        // 回收背包中的商票凭证 (未售完的货物保留, 可作普通物品处置)
        player.backpack.retain(|i| i.item_id != TICKET_ITEM_ID);
        player.recalculate_weight();

        info!("🎉 玩家 [{}] 在 [{}] 交割商票成功！退还押金: {} 铜，核发奖励: {} 铜 + 10 金币 + 1 仙玉", player.account_id, current_city, refund, bonus);
        Ok(bonus)
    }
}
