/**
 * Cyber-Forge 通用滑动开关
 *
 * HTML:
 *   <span class="cf-toggle-wrap">
 *     <button type="button" class="cf-toggle" id="autoStrikeBtn"></button>
 *     <span class="cf-toggle-label">挂机锤</span>
 *   </span>
 *
 * JS:
 *   import { createToggle, bindToggle } from './toggle.js';
 *
 *   // 方式 A：已有按钮
 *   const t = bindToggle('#autoStrikeBtn', {
 *     onChange: (on) => { ... },
 *     hotkey: 'KeyK',
 *   });
 *   t.set(true); t.toggle(); t.get();
 *
 *   // 方式 B：动态创建
 *   const t2 = createToggle(containerEl, { label: '调试', onChange: ... });
 */

function resolveEl(elOrSelector) {
  if (!elOrSelector) return null;
  if (typeof elOrSelector === 'string') return document.querySelector(elOrSelector);
  return elOrSelector;
}

function applyVisual(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/**
 * @param {HTMLElement|string} elOrSelector  按钮 .cf-toggle
 * @param {object} [opts]
 * @param {boolean} [opts.initial=false]
 * @param {(on:boolean)=>void} [opts.onChange]
 * @param {string} [opts.hotkey]  如 'KeyK'
 * @param {string} [opts.titleOff]
 * @param {string} [opts.titleOn]
 */
export function bindToggle(elOrSelector, opts = {}) {
  const btn = resolveEl(elOrSelector);
  if (!btn) {
    console.warn('[cf-toggle] element not found', elOrSelector);
    return {
      get: () => false,
      set: () => {},
      toggle: () => {},
      destroy: () => {},
    };
  }

  let on = !!opts.initial;
  const titleOff = opts.titleOff || btn.title || '关闭';
  const titleOn = opts.titleOn || '开启';

  const sync = () => {
    applyVisual(btn, on);
    btn.title = on ? titleOn : titleOff;
  };
  sync();

  const set = (v) => {
    const next = !!v;
    if (next === on) return;
    on = next;
    sync();
    if (typeof opts.onChange === 'function') opts.onChange(on);
  };
  const toggle = () => set(!on);

  const onClick = (e) => {
    e.preventDefault();
    toggle();
  };
  btn.addEventListener('click', onClick);

  let onKey = null;
  if (opts.hotkey) {
    onKey = (e) => {
      if (e.code !== opts.hotkey) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
  }

  // 无障碍：role=switch
  btn.setAttribute('role', 'switch');
  btn.setAttribute('type', 'button');

  return {
    get: () => on,
    set,
    toggle,
    el: btn,
    destroy() {
      btn.removeEventListener('click', onClick);
      if (onKey) window.removeEventListener('keydown', onKey);
    },
  };
}

/**
 * 在容器内创建开关 + 可选标签
 * @param {HTMLElement|string} parent
 * @param {object} [opts]  同 bindToggle，另加 label?: string, id?: string, className?: string
 */
export function createToggle(parent, opts = {}) {
  const host = resolveEl(parent);
  if (!host) throw new Error('[cf-toggle] parent not found');

  const wrap = document.createElement('span');
  wrap.className = 'cf-toggle-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cf-toggle' + (opts.className ? ' ' + opts.className : '');
  if (opts.id) btn.id = opts.id;

  wrap.appendChild(btn);
  if (opts.label) {
    const lab = document.createElement('span');
    lab.className = 'cf-toggle-label';
    lab.textContent = opts.label;
    wrap.appendChild(lab);
  }
  host.appendChild(wrap);

  return bindToggle(btn, opts);
}
