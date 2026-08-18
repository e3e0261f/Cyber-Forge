/**
 * 《天道锻造大师》 程序化音频引擎 (AudioEngine)
 * =============================================
 * 纯 WebAudio API 合成音效，零外部资源依赖。
 * 支持：打击/暴击/升级/渡劫/金币/熔炼/上架/UI/任务/背景音乐。
 * 
 * 设计要点:
 * - AudioContext 在首次用户交互时延迟初始化 (浏览器自动播放策略)
 * - 所有合成音效使用 Oscillator + Noise + Gain 包络组合
 * - 连续打击音自动节流 (throttle)，防止高速挥锤爆音
 * - 标签页隐藏时自动暂停 BGM
 * 
 * 修改时间: 2026-08-18
 */

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.unlocked = false;
        this.bgmTimer = null;
        this.bgmStep = 0;
        this.throttleMap = new Map(); // 音效节流: name -> lastPlayTime
        this.volume = 0.7;            // 全局音量 0~1
    }

    /** 初始化/解锁 AudioContext (必须在用户手势中调用) */
    init() {
        if (this.unlocked) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.ctx.destination);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.0;
            this.musicGain.connect(this.masterGain);

            this.unlocked = true;

            // 恢复时重新连接 (iOS Safari 修复)
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        } catch (e) {
            console.warn('【音频】AudioContext 初始化失败:', e);
        }
    }

    /** 全局音量 (0~1) */
    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this.masterGain) this.masterGain.gain.value = this.volume;
    }

    /** 节流检查: 指定毫秒内只允许播放一次 */
    _throttle(name, ms) {
        const now = performance.now();
        const last = this.throttleMap.get(name) || 0;
        if (now - last < ms) return true;
        this.throttleMap.set(name, now);
        return false;
    }

    // ========== 基础合成工具 ==========

    /** 生成白噪声 Buffer (可重复使用) */
    _noiseBuffer(duration) {
        const rate = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, Math.ceil(rate * duration), rate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buf;
    }

    /** 创建带包络的声音源 */
    _tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.1, vol = 0.3, when = 0, attack = 0.005, release = null }) {
        const ctx = this.ctx;
        const t0 = ctx.currentTime + when;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);

        const rel = release ?? dur * 0.7;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.01, rel));

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }

    /** 创建噪声声源 (白噪声 + 滤波器) */
    _noise({ dur = 0.1, vol = 0.2, filterType = 'lowpass', freq = 2000, freqEnd = null, when = 0 }) {
        const ctx = this.ctx;
        const t0 = ctx.currentTime + when;
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer(dur + 0.05);

        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(freq, t0);
        if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(t0);
        src.stop(t0 + dur + 0.05);
    }

    // ========== 音效合成 ==========

    /** 挥锤打击 (普通) - 金属碰撞 */
    playHit() {
        if (!this.unlocked || this._throttle('hit', 30)) return;
        // 低频金属撞击 (方波下滑)
        this._tone({ type: 'square', freq: 180, freqEnd: 55, dur: 0.12, vol: 0.28, attack: 0.002 });
        // 金属泛音 (三角波)
        this._tone({ type: 'triangle', freq: 540, freqEnd: 160, dur: 0.08, vol: 0.16, attack: 0.002 });
        // 打击噪声
        this._noise({ dur: 0.05, vol: 0.22, filterType: 'highpass', freq: 1500, when: 0 });
    }

    /** 暴击挥锤 - 更高音高 + 泛音亮闪 */
    playCrit() {
        if (!this.unlocked || this._throttle('crit', 30)) return;
        this.playHit();
        // 高音泛音亮闪
        this._tone({ type: 'sine', freq: 1200, freqEnd: 300, dur: 0.18, vol: 0.16, attack: 0.002 });
        this._tone({ type: 'triangle', freq: 900, freqEnd: 240, dur: 0.15, vol: 0.12, attack: 0.002 });
        // 能量爆发噪声
        this._noise({ dur: 0.08, vol: 0.18, filterType: 'bandpass', freq: 2500, when: 0.01 });
    }

    /** 神兵诞生 - 金光爆发音效 */
    playSwordBorn() {
        if (!this.unlocked || this._throttle('sword', 200)) return;
        // 上扬琶音 C5-E5-G5-C6
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => {
            this._tone({ type: 'sine', freq: f, dur: 0.25, vol: 0.14, when: i * 0.06 });
            this._tone({ type: 'triangle', freq: f * 2, dur: 0.15, vol: 0.06, when: i * 0.06 });
        });
        // 金色光芒扩散噪声
        this._noise({ dur: 0.4, vol: 0.08, filterType: 'highpass', freq: 3000, when: 0.1 });
    }

    /** 升级 - 上扬三连琶音 */
    playUpgrade() {
        if (!this.unlocked || this._throttle('upgrade', 120)) return;
        [523.25, 659.25, 783.99].forEach((f, i) => {
            this._tone({ type: 'triangle', freq: f, dur: 0.09, vol: 0.16, when: i * 0.07 });
        });
    }

    /** 大境界突破/渡劫 - 低音锣 + 深沉雷声 */
    playBreakthrough() {
        if (!this.unlocked || this._throttle('breakthrough', 300)) return;
        // 低沉锣声
        this._tone({ type: 'sine', freq: 82.5, dur: 1.2, vol: 0.35, attack: 0.01 });
        this._tone({ type: 'sine', freq: 110, freqEnd: 55, dur: 1.0, vol: 0.22, attack: 0.01 });
        // 天劫雷声
        this._noise({ dur: 1.2, vol: 0.25, filterType: 'lowpass', freq: 900, freqEnd: 60, when: 0.02 });
        this._noise({ dur: 0.5, vol: 0.15, filterType: 'lowpass', freq: 400, freqEnd: 40, when: 0.6 });
        // 高处震荡
        this._tone({ type: 'sawtooth', freq: 220, freqEnd: 55, dur: 0.8, vol: 0.08, when: 0.05 });
    }

    /** 转折失败 - 低沉失望音 */
    playBreakdown() {
        if (!this.unlocked || this._throttle('breaker', 300)) return;
        [392, 311.13, 246.94].forEach((f, i) => {
            this._tone({ type: 'sawtooth', freq: f, dur: 0.35, vol: 0.12, when: i * 0.15 });
        });
        this._noise({ dur: 0.4, vol: 0.1, filterType: 'lowpass', freq: 300, freqEnd: 60 });
    }

    /** 金币入账 - 高频叮当 */
    playCoin() {
        if (!this.unlocked || this._throttle('coin', 80)) return;
        this._tone({ type: 'sine', freq: 1318.5, dur: 0.08, vol: 0.12 });
        this._tone({ type: 'sine', freq: 1760, dur: 0.1, vol: 0.09, when: 0.04 });
    }

    /** 铜钱入账 - 低些的碰响 */
    playCopper() {
        if (!this.unlocked || this._throttle('copper', 80)) return;
        this._tone({ type: 'triangle', freq: 880, dur: 0.06, vol: 0.08 });
    }

    /** 仙玉 - 清脆水晶音 */
    playJade() {
        if (!this.unlocked || this._throttle('jade', 80)) return;
        this._tone({ type: 'sine', freq: 2093, dur: 0.12, vol: 0.12 });
        this._tone({ type: 'sine', freq: 2637, dur: 0.15, vol: 0.09, when: 0.05 });
        this._tone({ type: 'sine', freq: 3135.9, dur: 0.1, vol: 0.06, when: 0.1 });
    }

    /** 熔炼 - 火焰嘶嘶声 */
    playMelt() {
        if (!this.unlocked || this._throttle('melt', 150)) return;
        this._noise({ dur: 0.6, vol: 0.15, filterType: 'lowpass', freq: 1800, freqEnd: 300 });
        this._tone({ type: 'sine', freq: 90, freqEnd: 45, dur: 0.5, vol: 0.1 });
    }

    /** 上架拍卖 - 木槌敲击 */
    playList() {
        if (!this.unlocked || this._throttle('list', 100)) return;
        this._tone({ type: 'square', freq: 260, freqEnd: 120, dur: 0.09, vol: 0.16 });
        this._tone({ type: 'triangle', freq: 520, dur: 0.05, vol: 0.1, when: 0.02 });
    }

    /** UI 弹窗开合 - 短促滴声 */
    playUI() {
        if (!this.unlocked || this._throttle('ui', 50)) return;
        this._tone({ type: 'sine', freq: 880, freqEnd: 660, dur: 0.06, vol: 0.07 });
    }

    /** 拍卖成功 - 双音上扬 */
    playAuctionSold() {
        if (!this.unlocked || this._throttle('auction', 200)) return;
        [659.25, 987.77].forEach((f, i) => {
            this._tone({ type: 'sine', freq: f, dur: 0.12, vol: 0.13, when: i * 0.08 });
        });
        this.playCoin();
    }

    /** 接取任务 - 纸张翻动 */
    playQuestAccept() {
        if (!this.unlocked || this._throttle('quest', 150)) return;
        this._noise({ dur: 0.15, vol: 0.12, filterType: 'bandpass', freq: 1800, freqEnd: 800 });
        this._tone({ type: 'triangle', freq: 660, dur: 0.06, vol: 0.1, when: 0.02 });
    }

    /** 任务完成 - 胜利琶音 */
    playQuestComplete() {
        if (!this.unlocked || this._throttle('complete', 200)) return;
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        notes.forEach((f, i) => {
            this._tone({ type: 'sine', freq: f, dur: 0.18, vol: 0.13, when: i * 0.05 });
        });
        this.playCoin();
    }

    /** 战斗命中 */
    playCombatHit() {
        if (!this.unlocked || this._throttle('chit', 50)) return;
        this._tone({ type: 'square', freq: 300, freqEnd: 80, dur: 0.07, vol: 0.18 });
        this._noise({ dur: 0.04, vol: 0.15, filterType: 'highpass', freq: 1200 });
    }

    /** 怪物死亡 */
    playMonsterDie() {
        if (!this.unlocked || this._throttle('die', 150)) return;
        this._tone({ type: 'sawtooth', freq: 400, freqEnd: 40, dur: 0.3, vol: 0.12 });
        this._tone({ type: 'sine', freq: 200, freqEnd: 30, dur: 0.4, vol: 0.1, when: 0.02 });
    }

    // ========== 背景音乐 ==========

    /** 工坊氛围 BGM - 低频 drone + 缓慢五声音阶琶音 */
    startBGM() {
        if (!this.unlocked || this.bgmTimer) return;
        // 渐进淡入音乐音量
        this.musicGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        this.musicGain.gain.exponentialRampToValueAtTime(0.35, this.ctx.currentTime + 3);

        // 低音 drone (持续振荡)
        const droneFreqs = [55, 82.41]; // A1 + E2 (五度)
        this._bgmDrone = droneFreqs.map(f => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = f;
            const gain = this.ctx.createGain();
            gain.gain.value = 0.06;
            osc.connect(gain);
            gain.connect(this.musicGain);
            osc.start();
            return { osc, gain };
        });

        // 五声音阶琶音循环 (东方工坊氛围)
        this.bgmStep = 0;
        const playStep = () => {
            if (!this.unlocked || !this.bgmTimer) return;
            const scale = [220, 261.63, 293.66, 329.63, 392, 440]; // A 五声/大调
            const idx = this.bgmStep % scale.length;
            const f = scale[idx];
            this._bgmNote({ freq: f, vol: 0.05, dur: 1.2 });
            // 间隔 400ms~800ms 慢速琶音
            const nextDelay = 400 + Math.floor(Math.random() * 400);
            this.bgmTimer = setTimeout(playStep, nextDelay);
        };
        this.bgmTimer = setTimeout(playStep, 800);
    }

    /** BGM 琶音单音符 (连接到音乐总线) */
    _bgmNote({ freq, vol, dur }) {
        const ctx = this.ctx;
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.1);
    }

    /** 停止 BGM */
    stopBGM() {
        if (this.bgmTimer) {
            clearTimeout(this.bgmTimer);
            this.bgmTimer = null;
        }
        if (this._bgmDrone) {
            this._bgmDrone.forEach(d => {
                try { d.osc.stop(); } catch (_) {}
                d.gain.disconnect();
            });
            this._bgmDrone = null;
        }
        if (this.musicGain) {
            this.musicGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        }
    }

    /** 页面隐藏时暂停 BGM，恢复时继续 */
    handleVisibility(hidden) {
        if (hidden) {
            this.stopBGM();
        } else {
            if (this.unlocked) this.startBGM();
        }
    }

    /** 销毁清理 */
    dispose() {
        this.stopBGM();
        if (this.ctx) {
            this.ctx.close().catch(() => {});
            this.ctx = null;
        }
        this.unlocked = false;
    }
}

/** 全局单例 */
export const audio = new AudioEngine();

/** 便捷包装: 一次性绑定解锁 (在 app.js boot 时调用) */
export function bindAudioUnlock() {
    const unlock = () => {
        audio.init();
        audio.startBGM();
        // 只解锁一次
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
}