//! 动作协议分类层。
//!
//! 这里故意只负责回答一个问题：客户端发来的 action key 属于哪一类动作。
//! 具体的游戏规则仍然由 action handler / 各领域引擎负责。
//!
//! 这样可以避免 api_action_handler 同时承担“协议解析”和“业务规则”的职责，
//! 也为后续区分“客户端本地动作 / 审计动作 / 服务端权威动作”留下稳定边界。

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionKind<'a> {
    /// 过图请求：客户端负责触发体验，服务端负责最终状态确认。
    Teleport(&'a str),
    /// 坐标同步：弱权威状态同步，不应被当作普通业务动作处理。
    SyncPosition,
    /// 采集：涉及资源与背包，属于服务端需要确认的业务动作。
    Gather,
    /// 丢弃物品：涉及资产状态。
    DropItem(&'a str),
    /// 客户端移动审计：仅用于抽查，不是移动实时控制通道。
    MovementAudit,
    /// 物品行为审计。
    AuditItemDrop,
    AuditItemGain,
    /// 本地区块链同步：基础设施动作，不属于游戏业务动作。
    HashChainSync,
    CloudStateSnapshot,
    /// 贸易与银行：涉及玩家资产，必须由服务端确认。
    BuyTradeGood,
    SellTradeGood,
    SettleMerchantTicket,
    IssueMerchantTicket,
    BankDeposit,
    BankWithdraw,
    /// 未知动作保持原有兼容行为：由上层忽略。
    Unknown,
}

pub fn classify(action_key: &str) -> ActionKind<'_> {
    match action_key {
        key if key.starts_with("teleport_zone:") => ActionKind::Teleport(key),
        "sync_pos" => ActionKind::SyncPosition,
        "strike_mine" | "gather_zone_resource" => ActionKind::Gather,
        key if key.starts_with("drop_item") => ActionKind::DropItem(key),
        "audit_movement_report" => ActionKind::MovementAudit,
        "audit_item_drop" => ActionKind::AuditItemDrop,
        "audit_item_gain" => ActionKind::AuditItemGain,
        "sync_hash_chain" => ActionKind::HashChainSync,
        "cloud_state_snapshot" => ActionKind::CloudStateSnapshot,
        "buy_trade_good" => ActionKind::BuyTradeGood,
        "sell_trade_good" => ActionKind::SellTradeGood,
        "settle_merchant_ticket" => ActionKind::SettleMerchantTicket,
        "issue_merchant_ticket" => ActionKind::IssueMerchantTicket,
        "bank_deposit" => ActionKind::BankDeposit,
        "bank_withdraw" => ActionKind::BankWithdraw,
        _ => ActionKind::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::{classify, ActionKind};

    #[test]
    fn classifies_client_position_sync_separately() {
        assert_eq!(classify("sync_pos"), ActionKind::SyncPosition);
    }

    #[test]
    fn classifies_asset_actions_as_server_side_business_actions() {
        assert_eq!(classify("buy_trade_good"), ActionKind::BuyTradeGood);
        assert_eq!(classify("bank_deposit"), ActionKind::BankDeposit);
        assert_eq!(classify("drop_item:ore"), ActionKind::DropItem("drop_item:ore"));
    }

    #[test]
    fn keeps_unknown_actions_non_fatal() {
        assert_eq!(classify("future_action"), ActionKind::Unknown);
    }
}
