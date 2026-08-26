/**
 * Cyber Forge 客户端动作责任分类。
 *
 * 目的不是复制服务端业务规则，而是在客户端明确“这个动作是否应该
 * 经过服务器”。移动、镜头、碰撞等实时本地行为不应通过 /api/action。
 * 本模块只负责责任边界，不执行具体游戏规则。
 */

const SERVER_ACTIONS = new Set([
    'gather_zone_resource',
    'strike_mine',
    'buy_trade_good',
    'sell_trade_good',
    'settle_merchant_ticket',
    'issue_merchant_ticket',
    'bank_deposit',
    'bank_withdraw',
]);

const AUDIT_ACTIONS = new Set([
    'audit_movement_report',
    'audit_item_drop',
    'audit_item_gain',
    'sync_hash_chain',
    'cloud_state_snapshot',
]);

const LOCAL_ACTIONS = new Set([
    // 当前高频移动本身不通过 dispatchAction；保留显式分类，避免未来误接网络。
    'move',
    'camera_move',
    'input_move',
    'local_collision',
]);

export function classifyClientAction(actionKey) {
    const key = String(actionKey || '');

    if (key.startsWith('teleport_zone:')) {
        // 过图是“本地即时体验 + 服务端状态确认”，不能归入普通高频移动。
        return 'server_confirmed';
    }
    if (SERVER_ACTIONS.has(key) || key.startsWith('drop_item')) {
        return 'server_authoritative';
    }
    if (AUDIT_ACTIONS.has(key)) {
        return 'audit_async';
    }
    if (LOCAL_ACTIONS.has(key)) {
        return 'client_local';
    }
    return 'server_confirmed';
}

export function shouldSendToServer(actionKey) {
    return classifyClientAction(actionKey) !== 'client_local';
}

export function shouldRecordLocalChain(actionKey) {
    return classifyClientAction(actionKey) !== 'client_local';
}
