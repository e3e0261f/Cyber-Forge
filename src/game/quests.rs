use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::state::GameState;
use super::sword_gen::SwordGenerator;
use super::types::{ForgeResult, Sword};

pub const MAX_ACTIVE_QUESTS: usize = 5;
const OFFER_REFRESH_SECS: u64 = 300;
const ADVANCED_REFRESH_SECS: u64 = 900;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum QuestKind {
    Escort,
    Trade,
    Hunt,
    SubmitItem,
}

impl QuestKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Escort => "押镖",
            Self::Trade => "跑商",
            Self::Hunt => "击杀目标",
            Self::SubmitItem => "物品提交",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum QuestCurrency {
    Coins,
    Jade,
}

impl QuestCurrency {
    pub fn name(self) -> &'static str {
        match self {
            Self::Coins => "金币",
            Self::Jade => "仙玉",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestReward {
    pub coins: u128,
    pub jade: u128,
    pub item: Option<Sword>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestOffer {
    pub id: u64,
    pub kind: QuestKind,
    pub title: String,
    pub description: String,
    pub advanced: bool,
    pub duration_secs: u64,
    pub deposit: u128,
    pub currency: QuestCurrency,
    pub reward: QuestReward,
    pub required_rank: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveQuest {
    pub offer: QuestOffer,
    pub accepted_at: u64,
    pub complete_at: u64,
    pub completed: bool,
    pub claimed: bool,
    pub submitted_item_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestBoard {
    pub offers: Vec<QuestOffer>,
    pub active: Vec<ActiveQuest>,
    pub next_refresh_at: u64,
    pub next_advanced_refresh_at: u64,
}

impl Default for QuestBoard {
    fn default() -> Self {
        Self {
            offers: Vec::new(),
            active: Vec::new(),
            next_refresh_at: 0,
            next_advanced_refresh_at: 0,
        }
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

impl QuestBoard {
    pub fn ensure(&mut self, state: &GameState) {
        if self.offers.is_empty() {
            self.refresh(state);
        }
    }

    pub fn refresh(&mut self, state: &GameState) {
        let mut rng = rand::thread_rng();
        let count = rng.gen_range(3..=8);
        self.offers = (0..count)
            .map(|_| Self::make_offer(state, &mut rng))
            .collect();
        self.next_refresh_at = now() + OFFER_REFRESH_SECS;
        self.next_advanced_refresh_at = now() + ADVANCED_REFRESH_SECS;
    }

    fn make_offer(state: &GameState, rng: &mut impl Rng) -> QuestOffer {
        let advanced = rng.gen_bool(0.25);
        let kind = match rng.gen_range(0..4) {
            0 => QuestKind::Escort,
            1 => QuestKind::Trade,
            2 => QuestKind::Hunt,
            _ => QuestKind::SubmitItem,
        };
        let duration_secs = if advanced {
            rng.gen_range(180..=600)
        } else {
            rng.gen_range(60..=240)
        };
        let base = (state.level as u128 * 80 + 300) * if advanced { 4 } else { 1 };
        let currency = if rng.gen_bool(0.2) {
            QuestCurrency::Jade
        } else {
            QuestCurrency::Coins
        };
        let deposit = if matches!(currency, QuestCurrency::Jade) {
            (base / 10_000).max(1)
        } else {
            base
        };
        let reward = QuestReward {
            coins: if matches!(currency, QuestCurrency::Coins) {
                base * 3
            } else {
                0
            },
            jade: if matches!(currency, QuestCurrency::Jade) {
                (base / 10_000).max(1) * 3
            } else {
                0
            },
            item: if rng.gen_bool(0.25) {
                generate_reward(state)
            } else {
                None
            },
        };
        let required_rank = rng.gen_range(0..=state.level.min(40) as u8);
        QuestOffer {
            id: rng.r#gen(),
            kind,
            title: format!("{}·{}", if advanced { "高级" } else { "普通" }, kind.name()),
            description: match kind {
                QuestKind::Escort => "护送货队穿过乱流区".into(),
                QuestKind::Trade => "将宗门货物送达商路终点".into(),
                QuestKind::Hunt => "追踪并击破指定目标".into(),
                QuestKind::SubmitItem => format!("提交一件品质不低于 {} 的神兵", required_rank),
            },
            advanced,
            duration_secs,
            deposit,
            currency,
            reward,
            required_rank,
        }
    }

    pub fn tick(&mut self, state: &mut GameState) {
        let t = now();
        if self.offers.is_empty() || t >= self.next_refresh_at {
            self.refresh(state);
        }
        for q in &mut self.active {
            if !q.completed && t >= q.complete_at && !matches!(q.offer.kind, QuestKind::SubmitItem)
            {
                q.completed = true;
                state.set_toast(format!("任务完成：{}，请领取奖励", q.offer.title));
            }
        }
    }

    fn can_pay(state: &GameState, currency: QuestCurrency, amount: u128) -> bool {
        match currency {
            QuestCurrency::Coins => state.coins >= amount,
            QuestCurrency::Jade => state.jade >= amount,
        }
    }
    fn pay(state: &mut GameState, currency: QuestCurrency, amount: u128) {
        match currency {
            QuestCurrency::Coins => state.coins -= amount,
            QuestCurrency::Jade => state.jade -= amount,
        }
    }

    pub fn accept(&mut self, state: &mut GameState, id: u64) {
        self.tick(state);
        if self.active.len() >= MAX_ACTIVE_QUESTS {
            state.set_toast("任务栏已满（最多5个）");
            return;
        }
        if let Some(pos) = self.offers.iter().position(|q| q.id == id) {
            let offer = self.offers[pos].clone();
            if !Self::can_pay(state, offer.currency, offer.deposit) {
                state.set_toast(format!(
                    "保证金不足：需要{} {}",
                    offer.deposit,
                    offer.currency.name()
                ));
                return;
            }
            self.offers.remove(pos);
            Self::pay(state, offer.currency, offer.deposit);
            let t = now();
            self.active.push(ActiveQuest {
                complete_at: t + offer.duration_secs,
                accepted_at: t,
                offer,
                completed: false,
                claimed: false,
                submitted_item_id: None,
            });
            state.set_toast("任务已接取，保证金已扣除");
        }
    }

    pub fn abandon(&mut self, state: &mut GameState, id: u64) {
        if let Some(pos) = self
            .active
            .iter()
            .position(|q| q.offer.id == id && !q.claimed)
        {
            self.active.remove(pos);
            state.set_toast("任务已放弃，保证金不予退还");
        }
    }

    pub fn submit(&mut self, state: &mut GameState, quest_id: u64, item_id: u64) {
        if let Some(q) = self.active.iter_mut().find(|q| {
            q.offer.id == quest_id && matches!(q.offer.kind, QuestKind::SubmitItem) && !q.completed
        }) {
            if let Some(pos) = state.backpack.iter().position(|s| {
                s.id == item_id && !s.is_tool && s.quality.rank() >= q.offer.required_rank
            }) {
                state.backpack.remove(pos);
                q.submitted_item_id = Some(item_id);
                q.completed = true;
                state.set_toast("物品提交成功，任务已完成");
            } else {
                state.set_toast("所选物品不符合任务要求");
            }
        }
    }

    pub fn claim(&mut self, state: &mut GameState, id: u64) {
        if let Some(q) = self
            .active
            .iter_mut()
            .find(|q| q.offer.id == id && q.completed && !q.claimed)
        {
            let r = &q.offer.reward;
            if r.item.is_some() && state.backpack.len() >= state.max_backpack {
                state.set_toast("背包已满：任务奖励暂存，请扩容后再领取");
                return;
            }
            match q.offer.currency {
                QuestCurrency::Coins => state.coins = state.coins.saturating_add(q.offer.deposit),
                QuestCurrency::Jade => state.jade = state.jade.saturating_add(q.offer.deposit),
            };
            state.coins = state.coins.saturating_add(r.coins);
            state.jade = state.jade.saturating_add(r.jade);
            if let Some(item) = r.item.clone() {
                state.backpack.push(item);
            }
            q.claimed = true;
            state.set_toast("任务奖励已领取，保证金已返还");
        }
        self.active.retain(|q| !q.claimed);
    }
}

fn generate_reward(state: &GameState) -> Option<Sword> {
    for _ in 0..5 {
        if let ForgeResult::Success(s) = SwordGenerator::generate(
            state.level,
            state.carbon_ratio,
            now(),
            state.apprentices,
            state.bonus_god_rate,
            0,
            state.max_strikes,
            0,
            0.0,
            0,
        ) {
            return Some(s);
        }
    }
    None
}

impl GameState {
    pub fn ensure_quests(&mut self) {
        let mut board = std::mem::take(&mut self.quests);
        board.ensure(self);
        self.quests = board;
    }

    pub fn tick_quests(&mut self) {
        let mut board = std::mem::take(&mut self.quests);
        board.tick(self);
        self.quests = board;
    }
    pub fn quest_accept(&mut self, id: u64) {
        let mut b = std::mem::take(&mut self.quests);
        b.accept(self, id);
        self.quests = b;
    }
    pub fn quest_abandon(&mut self, id: u64) {
        let mut b = std::mem::take(&mut self.quests);
        b.abandon(self, id);
        self.quests = b;
    }
    pub fn quest_submit(&mut self, q: u64, item: u64) {
        let mut b = std::mem::take(&mut self.quests);
        b.submit(self, q, item);
        self.quests = b;
    }
    pub fn quest_claim(&mut self, id: u64) {
        let mut b = std::mem::take(&mut self.quests);
        b.claim(self, id);
        self.quests = b;
    }
}
