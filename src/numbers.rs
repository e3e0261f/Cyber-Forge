pub fn format_compact_number(n: u128) -> String {
    match n {
        0..=99_999 => {
            // 小于 10 万，显示千位分隔符，如 99,999
            let s = n.to_string();
            let mut result = String::new();
            let len = s.len();
            for (i, ch) in s.chars().enumerate() {
                if i > 0 && (len - i) % 3 == 0 {
                    result.push(',');
                }
                result.push(ch);
            }
            format!("{:>8}", result) // 强行对齐 8 个字符宽度
        }
        100_000..=999_999_999 => {
            // K (Thousand) 和 M (Million)
            let val = n as f64;
            if n < 1_000_000 {
                format!("{:>7.2}K", val / 1_000.0)
            } else {
                format!("{:>7.2}M", val / 1_000_000.0)
            }
        }
        1_000_000_000..=999_999_999_999_999 => {
            // B (Billion) 和 T (Trillion)
            let val = n as f64;
            if n < 1_000_000_000_000 {
                format!("{:>7.2}B", val / 1_000_000_000.0)
            } else {
                format!("{:>7.2}T", val / 1_000_000_000_000.0)
            }
        }
        _ => {
            // 远古级 Qa (Quadrillion)
            let val = (n / 1_000_000_000_000_000) as f64;
            format!("{:>6.2}Qa", val)
        }
    }
}
