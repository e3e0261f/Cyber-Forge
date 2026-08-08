use std::io;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};
use std::collections::VecDeque;
use crossterm::{
    event::{self, Event, KeyCode, MouseButton, MouseEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Paragraph},
    Terminal,
};
use serde::{Serialize, Deserialize};

const VERSION_DECL: &str = "铸剑大师 v1.9 | 精准1点经验、背包自动换行与扩容系统";
const SAVE_FILE_PATH: &str = "forge_master_save_v1.9.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
enum SwordQuality {
    CommonSword,
    FineBlade,
    Masterwork,
    LegendaryGod,
}

impl SwordQuality {
    fn small_icon(&self) -> &str {
        match self {
            SwordQuality::CommonSword => "🗡️ 铁剑",
            SwordQuality::FineBlade => "⚔️ 破甲",
            SwordQuality::Masterwork => "🔱 龙泉",
            SwordQuality::LegendaryGod => "✨ 轩辕",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum ElementType {
    Gold, Wood, Water, Fire, Earth,
}

impl ElementType {
    fn name(&self) -> &str {
        match self {
            ElementType::Gold => "金",
            ElementType::Wood => "木",
            ElementType::Water => "水",
            ElementType::Fire => "火",
            ElementType::Earth => "土",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CraftedSword {
    name: String,
    quality: SwordQuality,
    element: ElementType,
    market_value: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct PlayerSaveData {
    level: u32,
    current_exp: u64,
    required_exp: u64,
    current_hammer: u64,
    target_hammer: u64,
    scrap_iron: u64,
    master_crit_rate: f32,
    wallet_gold: u64,
    apprentice_count: u32,
    inventory_max_slots: usize, // v1.9 可购买背包装载上限
    fingerprint_hash: u64,
}

struct MasterForgingGame {
    level: u32,
    current_exp: u64,
    required_exp: u64,
    
    current_hammer: u64,
    target_hammer: u64,
    
    carbon: f32,
    forge_progress: f32,
    base_hammer_interval: f32,
    auto_progress_speed: f32,
    scrap_iron: u64,
    master_crit_rate: f32,
    entropy_pool: u64,
    hammer_anim_frame: usize,
    
    apprentice_count: u32,
    apprentice_hire_cost: u64,

    // v1.9 背包扩展
    inventory_max_slots: usize,
    expand_bag_cost: u64,

    memory_entropy_seed: usize,
    inventory: VecDeque<CraftedSword>,
    wallet_gold: u64,
    market_auction_msg: String,
    
    hover_tooltip: String,
}

impl MasterForgingGame {
    fn new() -> Self {
        let initial_level = 1;
        let mut game = Self {
            level: initial_level,
            current_exp: 0,
            required_exp: Self::calculate_required_exp(initial_level), // 1级 = 100 EXP
            current_hammer: 0,
            target_hammer: 10,
            carbon: 0.0,
            forge_progress: 0.0,
            base_hammer_interval: 10.0,
            auto_progress_speed: 0.1,
            scrap_iron: 0,
            master_crit_rate: 0.001,
            entropy_pool: 0,
            hammer_anim_frame: 0,
            apprentice_count: 0,
            apprentice_hire_cost: 100,
            inventory_max_slots: 12, // 初始 12 格背包
            expand_bag_cost: 200,    // 扩容成本
            memory_entropy_seed: 0x191919,
            inventory: VecDeque::new(),
            wallet_gold: 300,
            market_auction_msg: "天道炉火长明，v1.9 背包自动换行与可购买扩容系统上线！".to_string(),
            hover_tooltip: "提示: 悬停鼠标于下方背包小图标上查看详情".to_string(),
        };
        game.load_game();
        game
    }

    fn calculate_required_exp(level: u32) -> u64 {
        let base_exp = 100.0;
        let growth_rate = 1.14_f64;
        (base_exp * growth_rate.powi((level as i32) - 1)) as u64
    }

    fn calculate_target_hammer_for_level(level: u32) -> u64 {
        let tier = level / 10;
        let mut target = 10.0_f64;
        for _ in 0..tier {
            target = (target + 1.0) * 1.1;
        }
        target as u64
    }

    fn compute_fingerprint_static(level: u32, wallet_gold: u64, apprentice_count: u32) -> u64 {
        let mut hash = 0x19980727_usize;
        hash = hash.wrapping_add(level as usize).rotate_left(3);
        hash = hash.wrapping_add(wallet_gold as usize).rotate_left(7);
        hash = hash.wrapping_add(apprentice_count as usize).rotate_left(13);
        hash as u64
    }

    fn calculate_fingerprint(&self) -> u64 {
        Self::compute_fingerprint_static(self.level, self.wallet_gold, self.apprentice_count)
    }

    fn save_game(&self) {
        let fingerprint = self.calculate_fingerprint();
        let data = PlayerSaveData {
            level: self.level,
            current_exp: self.current_exp,
            required_exp: self.required_exp,
            current_hammer: self.current_hammer,
            target_hammer: self.target_hammer,
            scrap_iron: self.scrap_iron,
            master_crit_rate: self.master_crit_rate,
            wallet_gold: self.wallet_gold,
            apprentice_count: self.apprentice_count,
            inventory_max_slots: self.inventory_max_slots,
            fingerprint_hash: fingerprint,
        };

        if let Ok(json_str) = serde_json::to_string_pretty(&data) {
            let _ = fs::write(SAVE_FILE_PATH, json_str);
        }
    }

    fn load_game(&mut self) {
        if Path::new(SAVE_FILE_PATH).exists() {
            if let Ok(json_str) = fs::read_to_string(SAVE_FILE_PATH) {
                if let Ok(data) = serde_json::from_str::<PlayerSaveData>(&json_str) {
                    let expected_hash = Self::compute_fingerprint_static(data.level, data.wallet_gold, data.apprentice_count);
                    
                    if expected_hash == data.fingerprint_hash {
                        self.level = data.level;
                        self.current_exp = data.current_exp;
                        self.required_exp = Self::calculate_required_exp(self.level);
                        self.current_hammer = data.current_hammer;
                        self.target_hammer = Self::calculate_target_hammer_for_level(self.level);

                        self.scrap_iron = data.scrap_iron;
                        self.master_crit_rate = data.master_crit_rate;
                        self.wallet_gold = data.wallet_gold;
                        self.apprentice_count = data.apprentice_count;
                        self.inventory_max_slots = data.inventory_max_slots.max(12);
                        self.expand_bag_cost = 200 * (1 + (self.inventory_max_slots - 12) as u64 / 4);

                        self.apprentice_hire_cost = 100 * (1 + self.apprentice_count as u64);
                        self.base_hammer_interval = (10.0 * (0.99f32.powi(self.level as i32 - 1))).max(1.0);
                        self.auto_progress_speed = 1.0 / self.base_hammer_interval;
                        self.market_auction_msg = "【读档成功】v1.9 背包与数值系统校验通过！".to_string();
                    } else {
                        self.market_auction_msg = "【天道雷劫】存档指纹失效，修为重置！".to_string();
                    }
                }
            }
        }
    }

    fn get_realm_title(&self) -> &str {
        match self.level {
            1..=9 => "废铁学徒",
            10..=19 => "铁匠掌柜",
            20..=29 => "神兵利器师",
            30..=49 => "一代宗师",
            _ => "宗门祖师",
        }
    }

    // 购买背包容量扩展 (v1.9 新功能)
    fn expand_inventory(&mut self) {
        if self.wallet_gold >= self.expand_bag_cost {
            self.wallet_gold -= self.expand_bag_cost;
            self.inventory_max_slots += 4; // 每次购买扩展 4 格
            self.expand_bag_cost = 200 * (1 + (self.inventory_max_slots - 12) as u64 / 4);
            self.market_auction_msg = format!("【背包扩容】成功扩展 4 格！当前背包上限: {} 格", self.inventory_max_slots);
            self.save_game();
        } else {
            self.market_auction_msg = format!("【提示】铜板不足！扩展背包需要 {} 铜板", self.expand_bag_cost);
        }
    }

    fn add_exp(&mut self, exp_gain: u64) {
        self.current_exp += exp_gain;
        while self.current_exp >= self.required_exp {
            self.current_exp -= self.required_exp;
            self.level_up();
        }
    }

    fn level_up(&mut self) {
        let old_tier = self.level / 10;
        self.level += 1;
        let new_tier = self.level / 10;

        self.required_exp = Self::calculate_required_exp(self.level);

        if new_tier > old_tier {
            self.target_hammer = Self::calculate_target_hammer_for_level(self.level);
            self.market_auction_msg = format!("【突破10级大关】到达 Lv.{}！在此区间打造武器固定需要 {} 锤！", self.level, self.target_hammer);
        } else {
            self.market_auction_msg = format!("【等级提升】升级至 Lv.{}！", self.level);
        }

        self.base_hammer_interval = (self.base_hammer_interval * 0.99).max(1.0);
        self.auto_progress_speed = 1.0 / self.base_hammer_interval;
        self.save_game();
    }

    // 敲击一锤：精确固定 +1 点经验
    fn trigger_hammer_strike(&mut self) {
        self.current_hammer += 1;
        self.carbon += 0.01;
        self.forge_progress = 0.0;
        self.hammer_anim_frame = (self.hammer_anim_frame + 1) % 4;

        // 需求 1：锤击一下精准固定 +1 点经验
        self.add_exp(1);

        if self.current_hammer >= self.target_hammer {
            self.current_hammer = 0;
            self.forge_complete();
        }
    }

    // 武器完成出炉：根据质量与估价获取正经大额经验，且新手包含极低欧皇掉落率
    fn forge_complete(&mut self) {
        let seed = self.memory_entropy_seed.wrapping_add(self.entropy_pool as usize);
        let quality_roll = ((seed % 10000) as f32) / 100.0; // 提升精准度到 0.01%
        
        let luck_bonus = if self.level >= 10 { (self.level as f32) * 0.3 } else { 0.0 };

        // 需求 2：新手欧皇极低概率直接出高阶神兵（0.05% 欧皇爆款）
        let (quality, mut value) = if quality_roll > 99.95 || (quality_roll > (99.80 - luck_bonus * 0.1)) {
            (SwordQuality::LegendaryGod, 80000 + (self.level as u64 * 25000))
        } else if quality_roll > 98.00 - luck_bonus * 0.2 {
            (SwordQuality::Masterwork, 4500 + (self.level as u64 * 1500))
        } else if quality_roll > 90.00 - luck_bonus {
            (SwordQuality::FineBlade, 450 + (self.level as u64 * 100))
        } else {
            self.scrap_iron += 1;
            (SwordQuality::CommonSword, 40 + (self.level as u64 * 10))
        };

        let element = match seed % 5 {
            0 => { value = (value as f32 * 1.2) as u64; ElementType::Gold },
            1 => ElementType::Wood,
            2 => ElementType::Water,
            3 => { value = (value as f32 * 1.35) as u64; ElementType::Fire },
            _ => { self.scrap_iron += 2; ElementType::Earth },
        };

        let sword_name = match quality {
            SwordQuality::CommonSword => format!("Lv.{} 普通铁剑", self.level),
            SwordQuality::FineBlade => format!("Lv.{} 精钢破甲", self.level),
            SwordQuality::Masterwork => format!("Lv.{} 传世龙泉", self.level),
            SwordQuality::LegendaryGod => format!("🔥 Lv.{} 轩辕太阿", self.level),
        };

        let sword = CraftedSword {
            name: sword_name.clone(),
            quality,
            element,
            market_value: value,
        };

        // 爆装正经经验：根据武器估价结算，1级打造2把普通铁剑（估价40*2=80正经经验+20锤击经验=100经验）正好升级！
        let forge_exp = (value as f32 * 0.9).max(40.0) as u64;
        self.market_auction_msg = format!("【神兵出炉】打造出 [{}]！收益: {} 铜 | 正经经验: +{} EXP！", sword_name, value, forge_exp);
        
        self.inventory.push_front(sword);
        // 背包满了溢出截断
        if self.inventory.len() > self.inventory_max_slots {
            self.inventory.pop_back();
        }

        self.add_exp(forge_exp);

        self.carbon = 0.0;
        self.save_game();
    }

    fn inject_hardware_entropy(&mut self, is_mouse: bool) {
        let jitter = Instant::now().elapsed().subsec_nanos() as usize;
        self.memory_entropy_seed = self.memory_entropy_seed.wrapping_add(jitter).rotate_left(5);
        self.entropy_pool = self.entropy_pool.wrapping_add(if is_mouse { 7 } else { 2 });

        let boost = if is_mouse { 0.05 } else { 0.02 };
        self.forge_progress += boost;

        if self.forge_progress >= 1.0 {
            self.trigger_hammer_strike();
        }
    }

    fn hire_apprentice(&mut self) {
        if self.wallet_gold >= self.apprentice_hire_cost {
            self.wallet_gold -= self.apprentice_hire_cost;
            self.apprentice_count += 1;
            self.apprentice_hire_cost = 100 * (1 + self.apprentice_count as u64);
            self.market_auction_msg = format!("【招募成功】第 {} 位学徒归位！挂机加速。", self.apprentice_count);
            self.save_game();
        } else {
            self.market_auction_msg = "【提示】铜板不足，无法招募新学徒！".to_string();
        }
    }

    fn sell_top_sword(&mut self) {
        if let Some(sword) = self.inventory.pop_front() {
            self.wallet_gold += sword.market_value;
            self.market_auction_msg = format!("【背包出售】拍出 [{}]，获得 +{} 铜板！", sword.name, sword.market_value);
            self.save_game();
        } else {
            self.market_auction_msg = "【提示】背包空空如也，暂无可售武器。".to_string();
        }
    }

    fn update(&mut self, dt: f32) {
        let apprentice_boost = self.apprentice_count as f32 * 0.05 * dt;
        self.forge_progress += (self.auto_progress_speed * dt) + apprentice_boost;
        
        if self.forge_progress >= 1.0 {
            self.trigger_hammer_strike();
        }
    }

    // 需求 3：彻底修复鼠标悬停识别错位（多行折行坐标精准计算）
    fn handle_mouse_hover(&mut self, mouse_x: u16, mouse_y: u16, bag_rect: Rect) {
        if mouse_y >= bag_rect.y + 1 && mouse_y < (bag_rect.y + bag_rect.height.saturating_sub(1)) {
            let row_index = (mouse_y - (bag_rect.y + 1)) as usize;
            let col_index = (mouse_x.saturating_sub(bag_rect.x + 2) / 14) as usize; // 每项图标宽 14 列
            
            let max_items_per_row = ((bag_rect.width.saturating_sub(4)) / 14) as usize;
            if max_items_per_row > 0 {
                let actual_index = row_index * max_items_per_row + col_index;
                if let Some(sword) = self.inventory.get(actual_index) {
                    self.hover_tooltip = format!(
                        "🔍 背包视角: [{}] | 属性:【{}】| 估价: {} 铜板",
                        sword.name, sword.element.name(), sword.market_value
                    );
                    return;
                }
            }
        }
        self.hover_tooltip = "提示: 悬停鼠标于背包小图标上查看详尽参数".to_string();
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, crossterm::event::EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut game = MasterForgingGame::new();
    let mut last_tick = Instant::now();
    let tick_rate = Duration::from_millis(30);

    'main_loop: loop {
        let now = Instant::now();
        let dt = now.duration_since(last_tick).as_secs_f32();
        last_tick = now;

        game.update(dt);

        let mut bag_rect = Rect::default();

        terminal.draw(|f| {
            let size = f.size();
            
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(3), // 第一行：锤击进度条 (Logo招牌)
                    Constraint::Length(3), // 第二行：等级与经验进度条
                    Constraint::Length(3), // 第三行：参数状态与控制台
                    Constraint::Length(6), // 第四行：【背包】(自动多行换行折行)
                    Constraint::Min(0),
                ])
                .split(size);

            bag_rect = chunks[3];

            // 第一行：特色 Logo 锤击开锋进度条
            let hammer_chars = [" ⛏  ", " 🔨 ", " ⚒  ", " ✨ "];
            let icon = hammer_chars[game.hammer_anim_frame];
            let bar_w = (chunks[0].width.saturating_sub(12)) as usize;
            let filled = ((game.forge_progress.clamp(0.0, 1.0) * bar_w as f32) as usize).min(bar_w);
            let empty = bar_w.saturating_sub(filled);
            
            let progress_str = format!(
                "|{}{}{}| {:>3.1}%",
                "█".repeat(filled), icon, "-".repeat(empty), game.forge_progress * 100.0
            );
            let progress_widget = Paragraph::new(progress_str)
                .style(Style::default().fg(Color::Green).add_modifier(Modifier::BOLD))
                .block(Block::default().borders(Borders::ALL).title(" 第一行：特色 Logo 锤击开锋进度条 "));
            f.render_widget(progress_widget, chunks[0]);

            // 第二行：等级与等级经验进度条
            let exp_ratio = (game.current_exp as f32 / game.required_exp as f32).clamp(0.0, 1.0);
            let exp_filled = ((exp_ratio * bar_w as f32) as usize).min(bar_w);
            let exp_empty = bar_w.saturating_sub(exp_filled);
            
            let exp_str = format!(
                "【Lv.{} {}】 |{}⭐{}| {:>3.1}% ({}/{})",
                game.level,
                game.get_realm_title(),
                "▓".repeat(exp_filled),
                "░".repeat(exp_empty),
                exp_ratio * 100.0,
                game.current_exp,
                game.required_exp
            );
            let exp_widget = Paragraph::new(exp_str)
                .style(Style::default().fg(Color::LightBlue).add_modifier(Modifier::BOLD))
                .block(Block::default().borders(Borders::ALL).title(" 第二行：等级与经验进度条 (锤击+1EXP/成品爆装EXP) "));
            f.render_widget(exp_widget, chunks[1]);

            // 第三行：参数状态与控制台
            let status_text = format!(
                " 铜板: {} | 打造: {}/{}锤 | 格子: {}/{}格 | [S]:出售 | [H]:招募 | [B]:扩容背包 ({}铜) | [Q]:退出",
                game.wallet_gold,
                game.current_hammer,
                game.target_hammer,
                game.inventory.len(),
                game.inventory_max_slots,
                game.expand_bag_cost
            );
            let status_widget = Paragraph::new(status_text)
                .style(Style::default().fg(Color::Yellow))
                .block(Block::default().borders(Borders::ALL).title(" 第三行：宗门参数与控制台 "));
            f.render_widget(status_widget, chunks[2]);

            // 第四行：需求 4：【背包】(自动多行换行)
            let max_items_per_line = ((chunks[3].width.saturating_sub(4)) / 14) as usize;
            let mut backpack_content = String::new();
            
            if game.inventory.is_empty() {
                backpack_content.push_str(" 背包尚无武器，请锤打打造新武器...\n");
            } else {
                for (i, sword) in game.inventory.iter().enumerate() {
                    backpack_content.push_str(&format!("[{}·{}]  ", sword.quality.small_icon(), sword.element.name()));
                    if max_items_per_line > 0 && (i + 1) % max_items_per_line == 0 {
                        backpack_content.push('\n'); // 自动换行
                    }
                }
                backpack_content.push('\n');
            }
            
            backpack_content.push_str(&format!("\n {}", game.hover_tooltip));

            let backpack_widget = Paragraph::new(backpack_content)
                .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
                .block(Block::default().borders(Borders::ALL).title(format!(
                    " 第四行：【背包】({}/{}格 · 自动折行换行展示)", game.inventory.len(), game.inventory_max_slots
                )));
            f.render_widget(backpack_widget, chunks[3]);
        })?;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or_else(|| Duration::from_secs(0));
            
        if event::poll(timeout)? {
            match event::read()? {
                Event::Key(key) => {
                    match key.code {
                        KeyCode::Char('q') => {
                            game.save_game();
                            break 'main_loop;
                        }
                        KeyCode::Char('s') | KeyCode::Char('S') => {
                            game.sell_top_sword();
                        }
                        KeyCode::Char('h') | KeyCode::Char('H') => {
                            game.hire_apprentice();
                        }
                        KeyCode::Char('b') | KeyCode::Char('B') => {
                            game.expand_inventory(); // 按 B 购买扩展背包容量
                        }
                        _ => {
                            game.inject_hardware_entropy(false);
                        }
                    }
                }
                Event::Mouse(mouse) => {
                    game.handle_mouse_hover(mouse.column, mouse.row, bag_rect);
                    if let MouseEventKind::Down(MouseButton::Left) = mouse.kind {
                        game.inject_hardware_entropy(true);
                    }
                }
                _ => {}
            }
        }
    }

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        crossterm::event::DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    Ok(())
}
