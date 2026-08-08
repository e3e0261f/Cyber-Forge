pub struct TitleSystem;

impl TitleSystem {
    pub fn get_title_by_level(level: u32) -> &'static str {
        match level {
            1..=5    => "凡铁打刀客",
            6..=10   => "赛博小学徒",
            11..=20  => "低空炼器师",
            21..=30  => "五行锻造客",
            31..=45  => "赛博宗大师",
            46..=60  => "虚空淬火尊",
            61..=80  => "天道炉火仙",
            81..=99  => "熵增造物神",
            _        => "极客大道祖",
        }
    }
}
