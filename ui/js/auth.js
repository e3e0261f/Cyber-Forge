// 简易的国风助记词生成与管理模块

const PART1 = [
    "甲子时", "乙丑时", "丙寅时", "丁卯时", "戊辰时", "己巳时", "庚午时", "辛未时", "壬申时", "癸酉时", "甲戌时", "乙亥时",
    "甲辰时", "丙辰时", "戊辰时", "庚辰时", "壬辰时"
];

const PART2 = [
    "离火之极", "坎水之渊", "震雷之怒", "巽风之灵", "乾天之高", "坤地之厚", "艮山之稳", "兑泽之静",
    "紫气东来", "玄阴宿海", "太极混元", "两仪四象"
];

const PART3 = [
    "剑宗逍遥", "气宗缥缈", "体修霸道", "丹谷悬壶", "阵枢千机", "符塔万象", "器阁百炼", "御兽通灵",
    "魔门桀骜", "妖宫诡秘", "佛堂普度", "道门清静"
];

const PART4 = [
    "道法自然", "万剑归宗", "天地无极", "乾坤借法", "大道无情", "因果轮回", "涅槃重生", "羽化登仙",
    "万法归一", "天人合一", "上善若水", "大音希声"
];

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMnemonic() {
    return `${randomChoice(PART1)} · ${randomChoice(PART2)} · ${randomChoice(PART3)} · ${randomChoice(PART4)}`;
}

// 简单的字符串 Hash 函数（不使用异步的 SubtleCrypto 以保持同步）
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    // 转为无符号 hex 字符串
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export class AuthManager {
    constructor() {
        this.mnemonic = localStorage.getItem('cyber_forge_mnemonic');
        if (!this.mnemonic) {
            this.mnemonic = generateMnemonic();
            localStorage.setItem('cyber_forge_mnemonic', this.mnemonic);
        }
        this.accountId = this._deriveAccountId(this.mnemonic);
    }

    _deriveAccountId(mnemonic) {
        // 由于是玩具级系统，直接用简单的 Hash 配合部分原文构造一个 ID
        // 实际应用应使用 SHA-256
        return `account_${simpleHash(mnemonic)}_${simpleHash(mnemonic.split('').reverse().join(''))}`;
    }

    getMnemonic() {
        return this.mnemonic;
    }

    getAccountId() {
        return this.accountId;
    }

    importMnemonic(newMnemonic) {
        if (!newMnemonic || typeof newMnemonic !== 'string') return false;
        // 简单验证格式
        const parts = newMnemonic.split(' · ');
        if (parts.length !== 4) return false;
        
        this.mnemonic = newMnemonic;
        this.accountId = this._deriveAccountId(this.mnemonic);
        localStorage.setItem('cyber_forge_mnemonic', this.mnemonic);
        return true;
    }
}

export const auth = new AuthManager();
