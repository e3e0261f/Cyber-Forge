// server/titles.ts

export class TitleSystem {
  public static getTitleByLevel(level: number): string {
    if (level <= 15) return '凡铁打刀客';
    if (level <= 30) return '赛博引气匠';
    if (level <= 45) return '纳米识海者';
    if (level <= 60) return '高能内核体';
    if (level <= 75) return '赛博数字婴';
    if (level <= 90) return '量子态化神';
    if (level <= 105) return '矩阵合体尊';
    if (level <= 120) return '虚空淬火尊';
    if (level <= 135) return '反重力真仙';
    if (level <= 150) return '因果律圣者';
    if (level <= 165) return '天道炉火仙';
    return '熵增造物神';
  }
}
