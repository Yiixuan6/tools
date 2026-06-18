/**
 * 数字工具模块 — 中文大写转换 & 计算器
 * 适配 web-app-pdf 架构，通过 NumberTool.init() 启动
 */

const NumberTool = {
  // ── 中文数字常量 ──
  DIGITS_LOWER: ['零','一','二','三','四','五','六','七','八','九'],
  DIGITS_UPPER: ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'],
  PLACES:       ['','十','百','千'],
  PLACES_UPPER: ['','拾','佰','仟'],
  BIG_UNITS:    ['','万','亿','兆','京'],
  BIG_UPPER:    ['','萬','億','兆','京'],

  DIGIT_MAP: {
    '零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,
    '壹':1,'贰':2,'叁':3,'肆':4,'伍':5,'陆':6,'柒':7,'捌':8,'玖':9,
    '两':2,'倆':2,'俩':2,'〇':0,
    '０':0,'１':1,'２':2,'３':3,'４':4,'５':5,'６':6,'７':7,'８':8,'９':9
  },

  PLACE_MAP: {
    '十':10,  '拾':10,
    '百':100, '佰':100,
    '千':1000,'仟':1000,
    '万':10000,'萬':10000,
    '亿':1e8,  '億':1e8,
    '兆':1e12, '京':1e16
  },

  FINANCIAL_DEC_MAP: { '角':0.1, '分':0.01, '厘':0.001, '毫':0.0001 },

  // ── 计算器状态 ──
  calcState: {
    expr: '',
    evalExpr: '',
    lastResult: null,
    justEvaluated: false
  },

  _els: {},

  // ====================================================================
  //  初始化
  // ====================================================================

  init() {
    this._els = {
      workspace:    document.getElementById('number-workspace'),
      // 子标签
      subtabs:      document.querySelectorAll('#number-workspace .num-tab-btn'),
      subpanels:    document.querySelectorAll('#number-workspace .num-tab-content'),
      // 计算器
      calcExpr:     document.getElementById('num-calc-expr'),
      calcVal:      document.getElementById('num-calc-val'),
      calcPad:      document.getElementById('num-calc-pad'),
      calcResults:  document.getElementById('num-calc-results'),
      // 数字→中文
      numInput:     document.getElementById('num-num-input'),
      numConvert:   document.getElementById('num-convert-btn'),
      financialCb:  document.getElementById('num-financial-cb'),
      toChineseResults: document.getElementById('num-to-chinese-results'),
      // 中文→数字
      chineseInput:     document.getElementById('num-chinese-input'),
      chineseConvert:   document.getElementById('num-chinese-convert-btn'),
      fromChineseResults: document.getElementById('num-from-chinese-results'),
    };

    this._bindEvents();
    this._updateCalcDisplay();
  },

  // ====================================================================
  //  数字 → 中文
  // ====================================================================

  numberToChinese(num, opts = {}) {
    const { uppercase = false, financial = false } = opts;
    const digits  = uppercase ? this.DIGITS_UPPER : this.DIGITS_LOWER;
    const places  = uppercase ? this.PLACES_UPPER : this.PLACES;
    const bigs    = uppercase ? this.BIG_UPPER : this.BIG_UNITS;
    const negWord = '负';

    if (typeof num !== 'number' || !isFinite(num)) return '—';
    if (num === 0) {
      if (financial) return digits[0] + '元整';
      return digits[0];
    }

    const negative = num < 0;
    num = Math.abs(num);
    const parts = num.toString().split('.');
    const intStr = parts[0];
    const decStr = parts[1] || '';

    // 纯小数金融格式
    if (financial && intStr === '0') {
      return (negative ? negWord : '') + this._buildFinancialDecimal(decStr, digits);
    }

    let intChinese = '';
    if (intStr !== '0') {
      intChinese = this._convertInteger(intStr, digits, places, bigs);
    } else {
      intChinese = digits[0];
    }

    let result = (negative ? negWord : '') + intChinese;

    if (financial) {
      if (intStr !== '0') result += '元';
      result += this._buildFinancialDecimal(decStr, digits);
    } else if (decStr) {
      result += '点';
      for (const ch of decStr) result += digits[parseInt(ch, 10)];
    }

    return result;
  },

  _convertInteger(intStr, digits, places, bigs) {
    const padLen = Math.ceil(intStr.length / 4) * 4;
    const padded = intStr.padStart(padLen, '0');
    const numGroups = padLen / 4;

    let result = '';
    let globalFirstNonZero = true;
    let skippedZeroGroup = false;

    for (let g = 0; g < numGroups; g++) {
      const start = g * 4;
      const group = padded.substring(start, start + 4);
      const groupNum = parseInt(group, 10);
      const bigIndex = numGroups - g - 1;

      if (groupNum === 0) {
        if (result.length > 0) skippedZeroGroup = true;
        continue;
      }

      if (result.length > 0 && (group[0] === '0' || skippedZeroGroup)) {
        result += digits[0];
      }
      skippedZeroGroup = false;

      let groupStr = '';
      let groupNeedZero = false;

      for (let i = 0; i < 4; i++) {
        const digit = parseInt(group[i], 10);
        const pos = 3 - i;

        if (digit === 0) {
          if (groupStr.length > 0) groupNeedZero = true;
        } else {
          if (groupNeedZero) {
            groupStr += digits[0];
            groupNeedZero = false;
          }
          if (pos === 1 && digit === 1 && globalFirstNonZero && groupStr === '') {
            groupStr += places[pos];
          } else {
            groupStr += digits[digit] + places[pos];
          }
          globalFirstNonZero = false;
        }
      }

      result += groupStr;
      if (bigIndex > 0) result += bigs[bigIndex];
    }

    return result || digits[0];
  },

  _buildFinancialDecimal(decStr, digits) {
    if (!decStr || decStr === '0' || parseInt(decStr, 10) === 0) return '整';
    const positions = [
      { idx: 0, unit: '角' }, { idx: 1, unit: '分' }, { idx: 2, unit: '厘' }
    ];
    let firstNonZero = -1, lastNonZero = -1;
    for (const p of positions) {
      if (decStr[p.idx] && parseInt(decStr[p.idx], 10) !== 0) {
        if (firstNonZero === -1) firstNonZero = p.idx;
        lastNonZero = p.idx;
      }
    }
    if (firstNonZero === -1) return '整';

    let result = '';
    for (let i = firstNonZero; i <= lastNonZero; i++) {
      if (decStr[i]) result += digits[parseInt(decStr[i], 10)] + positions[i].unit;
    }
    return result;
  },

  // ====================================================================
  //  中文 → 数字
  // ====================================================================

  chineseToNumber(text) {
    if (!text || !text.trim()) return NaN;
    let s = text.trim();

    let negative = false;
    if (s.startsWith('负') || s.startsWith('負')) {
      negative = true;
      s = s.substring(1);
    }

    s = s.replace(/整$/, '');

    let intPart = s;
    let decPart = '';
    let isFinancial = false;

    const hasYuan = s.includes('元');
    const hasFinDec = /[角分厘毫]/.test(s);
    const hasDian = s.includes('点');

    if (hasYuan) {
      const yuanIdx = s.indexOf('元');
      intPart = s.substring(0, yuanIdx);
      decPart = s.substring(yuanIdx + 1);
      isFinancial = true;
    } else if (hasFinDec && !hasDian) {
      intPart = '零';
      decPart = s;
      isFinancial = true;
    } else if (hasDian) {
      const dianIdx = s.indexOf('点');
      intPart = s.substring(0, dianIdx);
      decPart = s.substring(dianIdx + 1);
    }

    let intValue = this._parseChineseInteger(intPart);
    let decValue = 0;
    if (decPart) {
      decValue = isFinancial ? this._parseFinancialDecimal(decPart) : this._parseGeneralDecimal(decPart);
    }

    let result = intValue + decValue;
    return negative ? -result : result;
  },

  _parseChineseInteger(s) {
    if (!s || s === '零' || s === '〇') return 0;

    let result = 0, section = 0, current = 0;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch in this.DIGIT_MAP) {
        current = this.DIGIT_MAP[ch];
      } else if (ch === '零' || ch === '〇') {
        section += current;
        current = 0;
      } else if (ch in this.PLACE_MAP) {
        const place = this.PLACE_MAP[ch];
        if (current === 0 && (ch === '十' || ch === '拾')) current = 1;
        if (place >= 10000) {
          section = (section + current) * place;
          result += section;
          section = 0; current = 0;
        } else {
          current *= place;
          section += current;
          current = 0;
        }
      }
    }
    result += section + current;
    return result;
  },

  _parseGeneralDecimal(s) {
    let value = 0, divisor = 10;
    for (const ch of s) {
      if (ch in this.DIGIT_MAP) { value += this.DIGIT_MAP[ch] / divisor; divisor *= 10; }
    }
    return value;
  },

  _parseFinancialDecimal(s) {
    let value = 0, current = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch in this.DIGIT_MAP) {
        current = this.DIGIT_MAP[ch];
      } else if (ch in this.FINANCIAL_DEC_MAP) {
        if (current === 0) current = 1;
        value += current * this.FINANCIAL_DEC_MAP[ch];
        current = 0;
      }
    }
    return Math.round(value * 10000) / 10000;
  },

  // ====================================================================
  //  计算器
  // ====================================================================

  OP_DISPLAY: { '*': '×', '/': '÷', '-': '−', '+': '+' },

  _updateCalcDisplay() {
    const s = this.calcState;
    this._els.calcExpr.textContent = s.expr || ' ';
    this._els.calcVal.textContent = (s.lastResult !== null && s.justEvaluated)
      ? this._formatNumber(s.lastResult) : (s.expr || '0');
  },

  _formatNumber(num) {
    if (!isFinite(num)) return '—';
    if (Math.abs(num) >= 1e15 || (Math.abs(num) < 1e-6 && num !== 0)) return num.toString();
    const parts = num.toString().split('.');
    parts[0] = Number(parts[0]).toLocaleString('en-US');
    return parts.join('.');
  },

  _sanitizeExpr(expr) {
    if (/[^0-9+\-*/().%\s]/.test(expr)) return false;
    if (!/\d/.test(expr)) return false;
    return true;
  },

  _inputDigit(val) {
    const s = this.calcState;
    if (s.justEvaluated) {
      s.expr = val; s.evalExpr = val; s.lastResult = null; s.justEvaluated = false;
    } else {
      s.expr += val; s.evalExpr += val;
    }
    this._updateCalcDisplay();
  },

  _inputOp(val) {
    const s = this.calcState;
    const disp = this.OP_DISPLAY[val] || val;
    if (s.justEvaluated && s.lastResult !== null) {
      s.expr = s.lastResult.toString() + disp;
      s.evalExpr = s.lastResult.toString() + val;
      s.lastResult = null; s.justEvaluated = false;
    } else {
      s.expr += disp; s.evalExpr += val;
    }
    this._updateCalcDisplay();
  },

  _doClear() {
    this.calcState = { expr: '', evalExpr: '', lastResult: null, justEvaluated: false };
    this._els.calcResults.innerHTML = '<div class="num-result-empty">点击数字和运算符进行计算，结果显示在下方</div>';
    this._updateCalcDisplay();
  },

  _doBackspace() {
    const s = this.calcState;
    if (s.justEvaluated) {
      s.expr = ''; s.evalExpr = ''; s.lastResult = null; s.justEvaluated = false;
    } else {
      s.expr = s.expr.slice(0, -1); s.evalExpr = s.evalExpr.slice(0, -1);
    }
    this._updateCalcDisplay();
  },

  _evaluate() {
    const s = this.calcState;
    if (!s.evalExpr) return;
    if (!this._sanitizeExpr(s.evalExpr)) { this._showCalcResults(NaN); return; }
    try {
      const result = new Function('return (' + s.evalExpr + ')')();
      if (typeof result === 'number' && isFinite(result)) {
        s.lastResult = result; s.justEvaluated = true;
        this._updateCalcDisplay();
        this._showCalcResults(result);
      } else {
        this._showCalcResults(NaN);
      }
    } catch { this._showCalcResults(NaN); }
  },

  _showCalcResults(num) {
    const container = this._els.calcResults;
    if (!isFinite(num)) { container.innerHTML = '<div class="num-result-empty">表达式无效</div>'; return; }
    if (num === undefined || num === null) {
      container.innerHTML = '<div class="num-result-empty">点击数字和运算符进行计算，结果显示在下方</div>';
      return;
    }

    const lower = this.numberToChinese(num, { uppercase: false });
    const upper = this.numberToChinese(num, { uppercase: true });
    const finLower = this.numberToChinese(num, { uppercase: false, financial: true });
    const finUpper = this.numberToChinese(num, { uppercase: true, financial: true });

    container.innerHTML = `
      <div class="num-result-card">
        <div class="num-rc-label">🔢 数字</div>
        <div class="num-rc-value">${this._formatNumber(num)}<button class="num-copy-btn" data-val="${num}">复制</button></div>
      </div>
      <div class="num-result-card">
        <div class="num-rc-label">📝 小写</div>
        <div class="num-rc-value">${lower}<button class="num-copy-btn" data-val="${this._escape(lower)}">复制</button></div>
      </div>
      <div class="num-result-card num-gold">
        <div class="num-rc-label">🏦 大写</div>
        <div class="num-rc-value">${upper}<button class="num-copy-btn" data-val="${this._escape(upper)}">复制</button></div>
      </div>
      <div class="num-result-card">
        <div class="num-rc-label">💰 小写（金融）</div>
        <div class="num-rc-value">${finLower}<button class="num-copy-btn" data-val="${this._escape(finLower)}">复制</button></div>
      </div>
      <div class="num-result-card num-gold">
        <div class="num-rc-label">💳 大写（金融）</div>
        <div class="num-rc-value">${finUpper}<button class="num-copy-btn" data-val="${this._escape(finUpper)}">复制</button></div>
      </div>`;

    this._attachCopyHandlers(container);
  },

  _escape(s) { return s.replace(/"/g, '&quot;'); },

  _safeEvaluate(expr) {
    let normalized = expr
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/。/g, '.').replace(/,/g, '');
    if (/[^0-9+\-*/().%\s]/.test(normalized)) return NaN;
    if (!/\d/.test(normalized)) return NaN;
    try {
      const result = new Function('return (' + normalized + ')')();
      if (typeof result === 'number' && isFinite(result)) return result;
    } catch {}
    return NaN;
  },

  // ====================================================================
  //  子标签切换
  // ====================================================================

  _switchSubtab(name) {
    this._els.subtabs.forEach(b => b.classList.toggle('active', b.dataset.numTab === name));
    this._els.subpanels.forEach(c => c.classList.toggle('active', c.id === 'num-tab-' + name));
  },

  // ====================================================================
  //  复制
  // ====================================================================

  async _copyText(val) {
    try {
      await navigator.clipboard.writeText(val);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = val; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
  },

  _attachCopyHandlers(container) {
    container.querySelectorAll('.num-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = btn.getAttribute('data-val');
        await this._copyText(val);
        btn.textContent = '✓ 已复制';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1500);
      });
    });
  },

  // ====================================================================
  //  事件绑定
  // ====================================================================

  _bindEvents() {
    const els = this._els;
    const self = this;

    // ── 子标签切换 ──
    els.subtabs.forEach(btn => {
      btn.addEventListener('click', () => self._switchSubtab(btn.dataset.numTab));
    });

    // ── 计算器按钮 ──
    els.calcPad.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      const val = btn.dataset.val;
      switch (action) {
        case 'digit': self._inputDigit(val); break;
        case 'op':    self._inputOp(val);    break;
        case 'eq':    self._evaluate();      break;
        case 'clear': self._doClear();       break;
        case 'backspace': self._doBackspace(); break;
      }
    });

    // ── 数字→中文 ──
    els.numConvert.addEventListener('click', () => self._handleNumToChinese());
    els.numInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') self._handleNumToChinese();
    });
    els.financialCb.addEventListener('change', () => {
      if (els.numInput.value.trim()) self._handleNumToChinese();
    });
    // 示例芯片
    els.workspace.querySelectorAll('.num-example-chip[data-num]').forEach(chip => {
      chip.addEventListener('click', () => {
        els.numInput.value = chip.dataset.num;
        self._handleNumToChinese();
      });
    });

    // ── 中文→数字 ──
    els.chineseConvert.addEventListener('click', () => self._handleChineseToNumber());
    els.chineseInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') self._handleChineseToNumber();
    });
    // 示例芯片
    els.workspace.querySelectorAll('.num-example-chip[data-cn]').forEach(chip => {
      chip.addEventListener('click', () => {
        els.chineseInput.value = chip.dataset.cn;
        self._handleChineseToNumber();
      });
    });

    // ── 计算器键盘支持 ──
    document.addEventListener('keydown', (e) => {
      // 仅在 number-tool workspace 可见时响应
      if (!els.workspace || els.workspace.style.display === 'none') return;
      // 仅当计算器子标签激活
      if (!document.getElementById('num-tab-calc').classList.contains('active')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key;
      if (key >= '0' && key <= '9') { self._inputDigit(key); }
      else if (key === '+' || key === '-' || key === '*' || key === '/' || key === '%' || key === '(' || key === ')') { self._inputOp(key); }
      else if (key === '.') { self._inputDigit(key); }
      else if (key === 'Enter' || key === '=') { e.preventDefault(); self._evaluate(); }
      else if (key === 'Backspace') { e.preventDefault(); self._doBackspace(); }
      else if (key === 'Escape') { self._doClear(); }
    });
  },

  _handleNumToChinese() {
    const input = this._els.numInput.value.trim();
    const financial = this._els.financialCb.checked;
    if (!input) { this._els.toChineseResults.innerHTML = '<div class="num-result-empty">请输入数字或表达式</div>'; return; }

    const num = this._safeEvaluate(input);
    if (isNaN(num)) { this._els.toChineseResults.innerHTML = '<div class="num-result-empty">无法识别为有效数字或表达式，请重新输入</div>'; return; }

    const lower = this.numberToChinese(num, { uppercase: false, financial });
    const upper = this.numberToChinese(num, { uppercase: true, financial });

    let html = `<div class="num-result-card"><div class="num-rc-label">🔢 数字</div><div class="num-rc-value">${this._formatNumber(num)}<button class="num-copy-btn" data-val="${num}">复制</button></div></div>`;
    if (financial) {
      html += `<div class="num-result-card"><div class="num-rc-label">💰 小写（金融）</div><div class="num-rc-value">${lower}<button class="num-copy-btn" data-val="${this._escape(lower)}">复制</button></div></div>`;
      html += `<div class="num-result-card num-gold"><div class="num-rc-label">💳 大写（金融）</div><div class="num-rc-value">${upper}<button class="num-copy-btn" data-val="${this._escape(upper)}">复制</button></div></div>`;
    } else {
      html += `<div class="num-result-card"><div class="num-rc-label">📝 小写</div><div class="num-rc-value">${lower}<button class="num-copy-btn" data-val="${this._escape(lower)}">复制</button></div></div>`;
      html += `<div class="num-result-card num-gold"><div class="num-rc-label">🏦 大写</div><div class="num-rc-value">${upper}<button class="num-copy-btn" data-val="${this._escape(upper)}">复制</button></div></div>`;
    }

    this._els.toChineseResults.innerHTML = html;
    this._attachCopyHandlers(this._els.toChineseResults);
  },

  _handleChineseToNumber() {
    const input = this._els.chineseInput.value.trim();
    if (!input) { this._els.fromChineseResults.innerHTML = '<div class="num-result-empty">请输入中文数字</div>'; return; }

    const num = this.chineseToNumber(input);
    if (isNaN(num)) {
      this._els.fromChineseResults.innerHTML = '<div class="num-result-empty">无法解析，请检查中文数字格式<br><span style="font-size:11px">支持：一二三… / 壹贰叁… / 元角分 / 点 / 负</span></div>';
      return;
    }

    const lower = this.numberToChinese(num, { uppercase: false });
    const upper = this.numberToChinese(num, { uppercase: true });

    this._els.fromChineseResults.innerHTML = `
      <div class="num-result-card"><div class="num-rc-label">🔢 数字</div><div class="num-rc-value">${this._formatNumber(num)}<button class="num-copy-btn" data-val="${num}">复制</button></div></div>
      <div class="num-result-card"><div class="num-rc-label">📝 小写（验证）</div><div class="num-rc-value">${lower}<button class="num-copy-btn" data-val="${this._escape(lower)}">复制</button></div></div>
      <div class="num-result-card num-gold"><div class="num-rc-label">🏦 大写（验证）</div><div class="num-rc-value">${upper}<button class="num-copy-btn" data-val="${this._escape(upper)}">复制</button></div></div>`;
    this._attachCopyHandlers(this._els.fromChineseResults);
  }
};
