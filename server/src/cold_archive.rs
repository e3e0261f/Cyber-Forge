//! 🌟 冷数据归档压缩
//!
//! 每日自动将过期存档压缩为 .zst 格式：
//! - 7天内的存档保持 JSON 格式 (热数据)
//! - 7-30天的存档压缩为 .zst (温数据)
//! - 30天以上的存档深度压缩 (冷数据)
//! - 自动清理超过 90 天的冷数据

// 🌟 冷归档工具函数部分为定时任务/运维预留, 接入前压制 dead_code 警告
#![allow(dead_code)]

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, Duration};
use tracing::{error, info, warn};

/// 冷数据归档器
pub struct ColdArchive {
    /// 存档目录
    archive_dir: PathBuf,
    /// 热数据保留天数
    hot_days: u64,
    /// 温数据压缩天数
    warm_days: u64,
    /// 最大保留天数
    max_days: u64,
}

impl ColdArchive {
    pub fn new(archive_dir: PathBuf) -> Self {
        Self {
            archive_dir,
            hot_days: 7,
            warm_days: 30,
            max_days: 90,
        }
    }

    /// 执行一次归档清理循环
    pub fn run_cycle(&self) -> Result<ArchiveStats> {
        let mut stats = ArchiveStats::default();

        if !self.archive_dir.exists() {
            std::fs::create_dir_all(&self.archive_dir)?;
            return Ok(stats);
        }

        let now = SystemTime::now();

        // 遍历存档目录
        for entry in std::fs::read_dir(&self.archive_dir)? {
            let entry = entry?;
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            let file_name = path.file_name().unwrap_or_default().to_string_lossy();

            // 只处理 world_state 相关的存档文件
            if !file_name.starts_with("world_state") {
                continue;
            }

            // 获取文件修改时间
            let modified = match entry.metadata()?.modified() {
                Ok(t) => t,
                Err(_) => continue,
            };

            let age = match now.duration_since(modified) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let age_days = age.as_secs() / 86400;

            // 1. 超过最大天数 → 删除
            if age_days > self.max_days {
                info!("🗑️ 删除过期冷数据: {} ({} 天前)", file_name, age_days);
                std::fs::remove_file(&path)?;
                stats.deleted += 1;
                continue;
            }

            // 2. 超过温数据天数 且 是 .json 或 .json.bak → 深度压缩
            if age_days > self.warm_days {
                if path.extension().map_or(false, |e| e == "json")
                    || path.extension().map_or(false, |e| e == "bak")
                {
                    match self.compress_file(&path) {
                        Ok(compressed_path) => {
                            info!("📦 深度压缩冷数据: {} → {}", file_name, compressed_path.display());
                            stats.compressed += 1;
                        }
                        Err(e) => {
                            warn!("⚠️ 压缩失败 {}: {}", file_name, e);
                        }
                    }
                }
                continue;
            }

            // 3. 超过热数据天数 且 是 .json 或 .json.bak → 压缩
            if age_days > self.hot_days {
                if path.extension().map_or(false, |e| e == "json")
                    || path.extension().map_or(false, |e| e == "bak")
                {
                    match self.compress_file(&path) {
                        Ok(compressed_path) => {
                            info!("📦 压缩温数据: {} → {}", file_name, compressed_path.display());
                            stats.compressed += 1;
                        }
                        Err(e) => {
                            warn!("⚠️ 压缩失败 {}: {}", file_name, e);
                        }
                    }
                }
            }
        }

        if stats.compressed > 0 || stats.deleted > 0 {
            info!("📊 归档统计: 压缩 {} 个, 删除 {} 个", stats.compressed, stats.deleted);
        }

        Ok(stats)
    }

    /// 压缩单个文件为 .zst 格式
    fn compress_file(&self, source: &Path) -> Result<PathBuf> {
        let dest = source.with_extension("json.zst");

        let input = std::fs::read(source)
            .context("读取源文件失败")?;

        let compressed = zstd::encode_all(input.as_slice(), 9)
            .context("zstd 压缩失败")?;

        std::fs::write(&dest, &compressed)
            .context("写入压缩文件失败")?;

        // 压缩成功后删除原文件
        std::fs::remove_file(source)?;

        let ratio = if !input.is_empty() {
            (compressed.len() as f64 / input.len() as f64) * 100.0
        } else {
            0.0
        };

        info!(
            "🗜️ 压缩完成: {} → {} ({:.1}% 原始大小)",
            source.display(),
            dest.display(),
            ratio
        );

        Ok(dest)
    }

    /// 解压 .zst 文件
    pub fn decompress_file(source: &Path) -> Result<Vec<u8>> {
        let compressed = std::fs::read(source)
            .context("读取压缩文件失败")?;

        let decompressed = zstd::decode_all(compressed.as_slice())
            .context("zstd 解压失败")?;

        Ok(decompressed)
    }

    /// 手动归档当前存档 (创建带时间戳的备份)
    pub fn snapshot_current(save_path: &Path, archive_dir: &Path) -> Result<PathBuf> {
        if !save_path.exists() {
            anyhow::bail!("存档文件不存在: {}", save_path.display());
        }

        std::fs::create_dir_all(archive_dir)?;

        let timestamp = chrono_now();
        let dest_name = format!("world_state_{}.json", timestamp);
        let dest = archive_dir.join(&dest_name);

        std::fs::copy(save_path, &dest)?;

        info!("📸 存档快照: {} → {}", save_path.display(), dest.display());

        Ok(dest)
    }
}

/// 归档统计
#[derive(Default, Debug)]
pub struct ArchiveStats {
    pub compressed: u32,
    pub deleted: u32,
}

/// 启动定期归档后台任务
pub fn spawn_archive_task(archive_dir: PathBuf) {
    info!("📦 冷数据归档任务已启动 (目录: {})", archive_dir.display());

    tokio::spawn(async move {
        // 每 6 小时执行一次归档
        let mut interval = tokio::time::interval(Duration::from_secs(6 * 3600));

        loop {
            interval.tick().await;

            let archiver = ColdArchive::new(archive_dir.clone());
            match archiver.run_cycle() {
                Ok(stats) => {
                    if stats.compressed > 0 || stats.deleted > 0 {
                        info!("📦 归档任务完成: {:?}", stats);
                    }
                }
                Err(e) => {
                    error!("❌ 归档任务失败: {}", e);
                }
            }
        }
    });
}

/// 简单时间戳生成 (不依赖 chrono crate)
fn chrono_now() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();

    // 简单转换为 YYYYMMDD_HHMMSS 格式
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // 从 Unix 纪元 (1970-01-01) 计算年月日
    let (year, month, day) = days_to_ymd(days as i64);

    format!(
        "{:04}{:02}{:02}_{:02}{:02}{:02}",
        year, month, day, hours, minutes, seconds
    )
}

/// 将 Unix 天数转换为 (year, month, day)
fn days_to_ymd(mut days: i64) -> (i64, i64, i64) {
    // 简化算法 (足够精确)
    let mut year = 1970;

    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }

    let leap = is_leap_year(year);
    let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    let mut month = 1;
    for &md in &month_days {
        if days < md {
            break;
        }
        days -= md;
        month += 1;
    }

    (year, month, days + 1)
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}
