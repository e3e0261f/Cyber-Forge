# 挂机锤（自动空格）

## 1. ui/index.html

在 `bar-meta` 里加按钮，找到：

```html
            <div class="bar-meta">
              <span id="barLabel">下一锤 —</span>
              <span id="strikes">0/63</span>
              <span id="qteHits">完美 0</span>
              <span id="forgeLayoutTag" class="concurrent-tag"></span>
            </div>
```

改成：

```html
            <div class="bar-meta">
              <span id="barLabel">下一锤 —</span>
              <span id="strikes">0/63</span>
              <span id="qteHits">完美 0</span>
              <span id="forgeLayoutTag" class="concurrent-tag"></span>
              <button type="button" id="autoStrikeBtn" class="auto-strike-btn" title="模拟长按空格">▶ 挂机锤</button>
            </div>
```

## 2. ui/styles-append.css（末尾追加）

```css
.auto-strike-btn {
  margin-left: 8px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.4;
  border: 1px solid #6a5;
  border-radius: 4px;
  background: #1a2a1a;
  color: #9c9;
  cursor: pointer;
  vertical-align: middle;
}
.auto-strike-btn:hover {
  border-color: #8c7;
  color: #cfc;
}
.auto-strike-btn.on {
  background: #2a4a20;
  border-color: #af5;
  color: #df8;
  box-shadow: 0 0 8px rgba(120, 255, 80, 0.35);
  animation: auto-pulse 1.2s ease-in-out infinite;
}
@keyframes auto-pulse {
  50% { box-shadow: 0 0 12px rgba(120, 255, 80, 0.55); }
}
```

## 3. 新建 ui/js/auto_strike.js

（见包内文件）

## 4. ui/js/app.js

在现有 import 后增加：

```js
import { setupAutoStrike } from './auto_strike.js';
```

在 `setupInput();` 后面加：

```js
setupAutoStrike();
```

## 使用

- 点击锻造台旁 **▶ 挂机锤** 开启，再点或按 **K** 关闭
- 开启后约每 120ms 自动 `player_strike`（等同长按空格，可进暴击窗）
- 后端原有的「满条挂机锤」仍在，不冲突

