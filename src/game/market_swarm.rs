//! 轻量 Swarm-ABM 同构核心：来往修仙者 Agent
//! 将来 Rust≥1.87 可替换为真正的 swarm-abm crate

use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentPhase {
    Outside,
    Browsing,
    Bidding,
    Leaving,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CultivatorAgent {
    pub id: u64,
    pub title: String,
    pub realm_hint: u8, // 0散修 1执事 2富商 3老怪
    pub wealth: f64,
    pub element_pref: u8, // 0金1木2水3火4土
    pub patience: f64,
    pub aggression: f64,
    pub impulse: f64,
    pub phase: AgentPhase,
    pub focus_lot: Option<usize>,
    pub ticks_in_phase: u32,
}

impl CultivatorAgent {
    pub fn spawn(rng: &mut impl Rng, id: u64) -> Self {
        let roll: f64 = rng.r#gen();
        let (title, realm_hint, wealth, aggression, impulse) = if roll < 0.45 {
            (
                "过路散修",
                0,
                rng.gen_range(0.3..0.8),
                rng.gen_range(0.2..0.5),
                rng.gen_range(0.05..0.15),
            )
        } else if roll < 0.75 {
            (
                "宗门执事",
                1,
                rng.gen_range(0.8..1.4),
                rng.gen_range(0.4..0.7),
                rng.gen_range(0.08..0.2),
            )
        } else if roll < 0.92 {
            (
                "富商修士",
                2,
                rng.gen_range(1.4..2.2),
                rng.gen_range(0.5..0.85),
                rng.gen_range(0.1..0.3),
            )
        } else {
            (
                "合体老怪",
                3,
                rng.gen_range(2.5..5.0),
                rng.gen_range(0.7..1.2),
                rng.gen_range(0.2..0.5),
            )
        };
        Self {
            id,
            title: title.into(),
            realm_hint,
            wealth,
            element_pref: rng.gen_range(0..5),
            patience: rng.gen_range(20.0..80.0),
            aggression,
            impulse,
            phase: AgentPhase::Outside,
            focus_lot: None,
            ticks_in_phase: 0,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MarketSwarm {
    pub agents: Vec<CultivatorAgent>,
    pub next_id: u64,
    pub present: u32, // 在场人数
    pub browsing: u32,
    pub bidding: u32,
}

impl MarketSwarm {
    pub fn ensure_population(&mut self, rng: &mut impl Rng, target: usize) {
        while self.agents.len() < target {
            let id = self.next_id;
            self.next_id = self.next_id.wrapping_add(1);
            self.agents.push(CultivatorAgent::spawn(rng, id));
        }
    }

    /// 一步：进出与状态机；返回本帧产生的抬价意图 (lot_idx, title, element_pref, impulse_roll)
    pub fn step(
        &mut self,
        rng: &mut impl Rng,
        active_lots: usize,
        hype: f64,
        traffic: f64,
    ) -> Vec<(usize, String, u8, bool)> {
        self.ensure_population(rng, 24);
        let mut bids = Vec::new();
        self.present = 0;
        self.browsing = 0;
        self.bidding = 0;

        for a in &mut self.agents {
            a.ticks_in_phase = a.ticks_in_phase.saturating_add(1);
            match a.phase {
                AgentPhase::Outside => {
                    let enter_p = (0.02 + traffic * 0.04 + hype * 0.03).clamp(0.01, 0.25);
                    if active_lots > 0 && rng.gen_bool(enter_p) {
                        a.phase = AgentPhase::Browsing;
                        a.ticks_in_phase = 0;
                        a.focus_lot = Some(rng.gen_range(0..active_lots));
                    }
                }
                AgentPhase::Browsing => {
                    self.present += 1;
                    self.browsing += 1;
                    if a.ticks_in_phase > a.patience as u32 {
                        a.phase = AgentPhase::Leaving;
                        a.ticks_in_phase = 0;
                        continue;
                    }
                    let bid_p = (a.aggression * 0.15 * (1.0 + hype)).clamp(0.02, 0.45);
                    if a.focus_lot.is_some() && rng.gen_bool(bid_p) {
                        a.phase = AgentPhase::Bidding;
                        a.ticks_in_phase = 0;
                    }
                }
                AgentPhase::Bidding => {
                    self.present += 1;
                    self.bidding += 1;
                    if let Some(idx) = a.focus_lot {
                        if idx < active_lots {
                            let impulsive = rng.gen_bool(a.impulse.clamp(0.01, 0.5));
                            bids.push((idx, a.title.clone(), a.element_pref, impulsive));
                        }
                    }
                    a.phase = if rng.gen_bool(0.35) {
                        AgentPhase::Leaving
                    } else {
                        AgentPhase::Browsing
                    };
                    a.ticks_in_phase = 0;
                }
                AgentPhase::Leaving => {
                    if a.ticks_in_phase > 3 {
                        a.phase = AgentPhase::Outside;
                        a.focus_lot = None;
                        a.ticks_in_phase = 0;
                    }
                }
            }
        }
        bids
    }
}
