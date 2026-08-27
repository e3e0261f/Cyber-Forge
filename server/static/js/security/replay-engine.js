/**
 * Cyber Forge — Player Ledger Replay Engine
 *
 * 第二阶段第一版：
 * - 不修改正在运行的 GameStore / 游戏状态。
 * - 把 Ledger 当作“录像带”，在独立的审计状态上逐块重放。
 * - 目标是先证明：Ledger 可以被稳定读取、定位、逐步播放、审计。
 *
 * 后续阶段再把具体游戏规则 Reducer 接进来，形成完整的服务器 Replay。
 */

function safePayload(block) {
    try {
        return JSON.parse(block?.payload_json || '{}') || {};
    } catch (_) {
        return {};
    }
}

export function createReplayState() {
    return {
        block_height: 0,
        timestamp: 0,
        player_x: null,
        player_y: null,
        zone_id: null,
        level: null,
        strikes: 0,
        inventory: {},
        resources: {},
        last_action: null,
        action_count: 0,
    };
}

function itemKey(payload) {
    return String(payload.item_id || payload.itemId || payload.name || 'unknown_item');
}

export function applyLedgerBlock(state, block) {
    const next = {
        ...state,
        block_height: Number(block.height) || state.block_height,
        timestamp: Number(block.timestamp) || state.timestamp,
        last_action: String(block.action_type || 'unknown_action'),
        action_count: state.action_count + 1,
    };

    const payload = safePayload(block);

    switch (block.action_type) {
        case 'movement_interval':
            if (Number.isFinite(payload.end_x)) next.player_x = payload.end_x;
            if (Number.isFinite(payload.end_y)) next.player_y = payload.end_y;
            if (payload.zone_id) next.zone_id = String(payload.zone_id);
            break;

        case 'gain': {
            const key = itemKey(payload);
            next.inventory = { ...state.inventory, [key]: (state.inventory[key] || 0) + (Number(payload.count) || 1) };
            break;
        }

        case 'drop': {
            const key = itemKey(payload);
            next.inventory = { ...state.inventory, [key]: Math.max(0, (state.inventory[key] || 0) - (Number(payload.count) || 1)) };
            break;
        }

        case 'strike_forge':
            next.strikes = state.strikes + 1;
            break;

        case 'level_up':
            if (Number.isFinite(payload.level)) next.level = Number(payload.level);
            break;

        default:
            // 未注册事件先保留在时间线上，不擅自猜测游戏规则。
            break;
    }

    return next;
}

export class LedgerReplay {
    constructor(blocks = []) {
        this.blocks = Array.isArray(blocks) ? blocks.slice().sort((a, b) => a.height - b.height) : [];
        this.cursor = 0;
        this.state = createReplayState();
    }

    reset(blocks = this.blocks) {
        this.blocks = Array.isArray(blocks) ? blocks.slice().sort((a, b) => a.height - b.height) : [];
        this.cursor = 0;
        this.state = createReplayState();
        return this.state;
    }

    step(count = 1) {
        const n = Math.max(0, Math.floor(count));
        for (let i = 0; i < n && this.cursor < this.blocks.length; i++) {
            this.state = applyLedgerBlock(this.state, this.blocks[this.cursor]);
            this.cursor += 1;
        }
        return this.state;
    }

    seek(targetHeight) {
        const target = Number(targetHeight);
        this.cursor = 0;
        this.state = createReplayState();
        while (this.cursor < this.blocks.length && this.blocks[this.cursor].height <= target) {
            this.state = applyLedgerBlock(this.state, this.blocks[this.cursor]);
            this.cursor += 1;
        }
        return this.state;
    }

    playAll() {
        return this.seek(Infinity);
    }

    currentBlock() {
        return this.cursor > 0 ? this.blocks[this.cursor - 1] : null;
    }

    get progress() {
        return this.blocks.length ? this.cursor / this.blocks.length : 0;
    }
}

export const replayEngine = new LedgerReplay();
