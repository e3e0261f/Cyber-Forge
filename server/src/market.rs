use cyber_forge_shared::{CityMarketGoods, GameConfig};
use rand::Rng;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

pub struct MarketEngine {
    // 城市 -> 特产商品列表
    pub city_markets: Arc<RwLock<HashMap<String, Vec<CityMarketGoods>>>>,
}

impl MarketEngine {
    pub fn new() -> Self {
        let mut initial = HashMap::new();
        let cities = vec!["beijing", "nanjing", "hangzhou", "chang'an", "luoyang", "chengdu", "guangzhou"];
        
        for city in cities {
            initial.insert(
                city.to_string(),
                vec![
                    CityMarketGoods {
                        good_id: format!("{}_silk", city),
                        name: "九重天丝".into(),
                        base_price: 100,
                        current_buy_price: 100,
                        current_sell_price: 90,
                        trend_ratio: 1.0,
                    },
                    CityMarketGoods {
                        good_id: format!("{}_tea", city),
                        name: "极品灵茶".into(),
                        base_price: 250,
                        current_buy_price: 250,
                        current_sell_price: 230,
                        trend_ratio: 1.0,
                    },
                ],
            );
        }

        Self {
            city_markets: Arc::new(RwLock::new(initial)),
        }
    }

    /// 启动 25 ~ 45 分钟随机周期波动的后台物价异步任务
    pub fn spawn_fluctuation_task(&self) {
        let markets = self.city_markets.clone();

        tokio::spawn(async move {
            loop {
                // 25 ~ 45 分钟之间的随机间隔
                let interval_secs = {
                    let mut rng = rand::thread_rng();
                    rng.gen_range(GameConfig::MARKET_FLUCTUATION_MIN_SECS..=GameConfig::MARKET_FLUCTUATION_MAX_SECS)
                };

                info!("⏳ 下一次全九州物价重组将在 {} 秒后触发...", interval_secs);
                tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;

                {
                    let mut lock = markets.write().await;
                    let mut rng = rand::thread_rng();

                    for (city, goods_list) in lock.iter_mut() {
                        for goods in goods_list.iter_mut() {
                            // 价格波动比率 0.60 ~ 2.20
                            let ratio: f64 = rng.gen_range(GameConfig::MARKET_RATIO_MIN..=GameConfig::MARKET_RATIO_MAX);
                            goods.trend_ratio = ratio;
                            goods.current_buy_price = ((goods.base_price as f64) * ratio).round() as u64;
                            goods.current_sell_price = ((goods.current_buy_price as f64) * GameConfig::MARKET_SELL_RATIO).round() as u64;
                        }
                        info!("📈 九州商路动态物价刷新完成: 城市 [{}] 行情已重构", city);
                    }
                }
            }
        });
    }
}
