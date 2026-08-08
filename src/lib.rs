pub mod types;
pub mod numbers;
pub mod titles;
pub mod sword_gen;
pub mod ui;
pub mod state;

// 导出常用的核心类型供外部直接使用
pub use types::{Element, GameError, Quality, Sword};
pub use state::{GameState, SharedGameState};
pub use numbers::format_compact_number;
pub use titles::TitleSystem;
