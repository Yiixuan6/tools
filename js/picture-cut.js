/**
 * 图片分割模块 — 将图片按比例左右/上下分割为两部分
 * 适配 web-app-pdf CSS 变量体系，自动跟随系统明暗主题
 */

const PictureCut = {
  // ── 状态 ──
  img: null,
  originalFileName: '',
  direction: 'vertical',  // 'vertical' = 左右分, 'horizontal' = 上下分
  splitRatio: 0.5,

  // 水印状态
  watermarkEnabled: false,
  watermarkText: '机密文件',
  watermarkFontSize: 36,
  watermarkColor: '#000000',
  watermarkOpacity: 0.3,
  watermarkRotation: 45,
  watermarkPosition: 'center',

  // ── DOM 引用（init 时填充） ──
  _els: {},

  init() {
    this._els = {
      workspace:   document.getElementById('cut-workspace'),
      dropZone:    document.getElementById('cut-drop-zone'),
      fileInput:   document.getElementById('cut-file-input'),
      canvas:      document.getElementById('cut-canvas'),
      infoBar:     document.getElementById('cut-info-bar'),
      dirGroup:    document.getElementById('cut-direction-group'),
      splitSlider: document.getElementById('cut-split-slider'),
      splitValue:  document.getElementById('cut-split-value'),
      btnDownload: document.getElementById('cut-btn-download'),
      btnReset:    document.getElementById('cut-btn-reset'),
      previewA:    document.getElementById('cut-preview-a'),
      previewB:    document.getElementById('cut-preview-b'),
      sizeA:       document.getElementById('cut-size-a'),
      sizeB:       document.getElementById('cut-size-b'),
      toast:       document.getElementById('cut-toast'),
      // 水印
      wmSection:  document.getElementById('cut-watermark-section'),
      wmToggle:   document.getElementById('cut-wm-toggle'),
      wmPanel:    document.getElementById('cut-watermark-panel'),
      wmText:     document.getElementById('cut-wm-text'),
      wmFontSize: document.getElementById('cut-wm-font-size'),
      wmFontSizeVal: document.getElementById('cut-wm-font-size-val'),
      wmColor:    document.getElementById('cut-wm-color'),
      wmOpacity:  document.getElementById('cut-wm-opacity'),
      wmOpacityVal: document.getElementById('cut-wm-opacity-val'),
      wmRotation: document.getElementById('cut-wm-rotation'),
      wmRotationVal: document.getElementById('cut-wm-rotation-val'),
    };

    this._bindEvents();
  },

  // ── 工具方法 ──
  _showToast(msg) {
    const t = this._els.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 2000);
  },

  _clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  },

  /** 根据水印状态更新下载按钮文字 */
  _updateDownloadBtn() {
    const btn = this._els.btnDownload;
    if (!btn) return;
    btn.textContent = this.watermarkEnabled ? '⬇ 下载两部分 (含水印)' : '⬇ 下载两部分';
  },

  /** 点击预览卡片放大查看 */
  _openZoom(src) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightbox.style.display = 'flex';
  },

  // ── 绘制画布 ──
  _draw() {
    const img = this.img;
    const canvas = this._els.canvas;
    if (!img || !canvas) return;

    const ctx = canvas.getContext('2d');
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // 适配容器宽度
    const maxW = Math.min(iw, 1100);
    const scale = maxW / iw;
    canvas.width  = Math.round(iw * scale);
    canvas.height = Math.round(ih * scale);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 分割线位置
    const splitX = this.direction === 'vertical'
      ? Math.round(canvas.width * this.splitRatio) : null;
    const splitY = this.direction === 'horizontal'
      ? Math.round(canvas.height * this.splitRatio) : null;

    ctx.save();
    ctx.strokeStyle = '#f9e2af';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = performance.now() / 60;
    ctx.beginPath();
    if (this.direction === 'vertical') {
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, canvas.height);
    } else {
      ctx.moveTo(0, splitY);
      ctx.lineTo(canvas.width, splitY);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 左侧/上方半透明着色
    ctx.fillStyle = 'rgba(137, 180, 250, 0.08)';
    if (this.direction === 'vertical') {
      ctx.fillRect(0, 0, splitX, canvas.height);
    } else {
      ctx.fillRect(0, 0, canvas.width, splitY);
    }
    ctx.restore();
  },

  // ── 预览卡片 ──
  _updatePreviews() {
    const img = this.img;
    if (!img) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    let aW, aH, bW, bH, sxA, syA, sxB, syB;

    if (this.direction === 'vertical') {
      aW = Math.round(iw * this.splitRatio); aH = ih;
      bW = iw - aW;                    bH = ih;
      sxA = 0;  syA = 0;
      sxB = aW; syB = 0;
    } else {
      aW = iw; aH = Math.round(ih * this.splitRatio);
      bW = iw; bH = ih - aH;
      sxA = 0; syA = 0;
      sxB = 0; syB = aH;
    }

    const makePreview = (sx, sy, sw, sh) => {
      let c = document.createElement('canvas');
      c.width  = sw;
      c.height = sh;
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      // 应用水印到分割片
      if (this.watermarkEnabled && this.watermarkText && this.watermarkText.trim()) {
        c = WatermarkEngine.applyTextWatermark(c, {
          text: this.watermarkText,
          fontSize: this.watermarkFontSize,
          fontFamily: 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif',
          color: this.watermarkColor,
          opacity: this.watermarkOpacity,
          rotation: this.watermarkRotation,
          position: this.watermarkPosition,
        });
      }
      return c.toDataURL('image/png');
    };

    // 第一部分
    if (aW > 0 && aH > 0) {
      this._els.previewA.src = makePreview(sxA, syA, aW, aH);
      this._els.sizeA.textContent = `${aW} × ${aH} px`;
      this._els.previewA.style.cursor = 'zoom-in';
      this._els.previewA.title = '点击放大';
    } else {
      this._els.previewA.src = '';
      this._els.sizeA.textContent = '—';
      this._els.previewA.style.cursor = '';
    }
    // 第二部分
    if (bW > 0 && bH > 0) {
      this._els.previewB.src = makePreview(sxB, syB, bW, bH);
      this._els.sizeB.textContent = `${bW} × ${bH} px`;
      this._els.previewB.style.cursor = 'zoom-in';
      this._els.previewB.title = '点击放大';
    } else {
      this._els.previewB.src = '';
      this._els.sizeB.textContent = '—';
      this._els.previewB.style.cursor = '';
    }
  },

  _fullRedraw() {
    this._draw();
    this._updatePreviews();
    const img = this.img;
    if (img && this._els.infoBar) {
      const dirLabel = this.direction === 'vertical' ? '左右' : '上下';
      this._els.infoBar.textContent =
        `原图: ${img.naturalWidth} × ${img.naturalHeight} px  |  ` +
        `分割模式: ${dirLabel}  |  ` +
        `分割比例: ${Math.round(this.splitRatio * 100)}% / ${Math.round((1 - this.splitRatio) * 100)}%`;
    }
  },

  // ── 加载图片 ──
  loadImage(file) {
    if (!file || !file.type.startsWith('image/')) {
      this._showToast('请选择一张图片文件');
      return;
    }

    this.originalFileName = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      const tmp = new Image();
      tmp.onload = () => {
        this.img = tmp;
        this._els.dropZone.style.display = 'none';
        this._els.workspace.classList.add('visible');
        document.getElementById('cut-controls').style.display = 'flex';
        document.getElementById('cut-previews').style.display = 'flex';
        this._els.wmSection.style.display = '';
        this.splitRatio = 0.5;
        this._els.splitSlider.value = 50;
        this._els.splitValue.textContent = '50%';
        this._fullRedraw();
      };
      tmp.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  // ── 重置 ──
  reset() {
    this.img = null;
    this.originalFileName = '';
    const canvas = this._els.canvas;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    if (this._els.previewA) this._els.previewA.src = '';
    if (this._els.previewB) this._els.previewB.src = '';
    if (this._els.sizeA) this._els.sizeA.textContent = '';
    if (this._els.sizeB) this._els.sizeB.textContent = '';
    if (this._els.infoBar) this._els.infoBar.textContent = '';
    if (this._els.workspace) this._els.workspace.classList.remove('visible');
    if (this._els.dropZone) this._els.dropZone.style.display = '';
    if (this._els.fileInput) this._els.fileInput.value = '';
    this.splitRatio = 0.5;
    if (this._els.splitSlider) this._els.splitSlider.value = 50;
    if (this._els.splitValue) this._els.splitValue.textContent = '50%';

    // 重置水印
    this.watermarkEnabled = false;
    if (this._els.wmToggle) this._els.wmToggle.checked = false;
    if (this._els.wmPanel) this._els.wmPanel.style.display = 'none';
    if (this._els.wmSection) this._els.wmSection.style.display = 'none';
    this._updateDownloadBtn();
  },

  // ── 下载 ──
  downloadParts() {
    const img = this.img;
    if (!img) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    let rects = [];
    if (this.direction === 'vertical') {
      const w = Math.round(iw * this.splitRatio);
      rects = [
        { sx: 0,  sy: 0, sw: w,      sh: ih, label: 'left'  },
        { sx: w, sy: 0, sw: iw - w, sh: ih, label: 'right' },
      ];
    } else {
      const h = Math.round(ih * this.splitRatio);
      rects = [
        { sx: 0, sy: 0,  sw: iw, sh: h,      label: 'top'    },
        { sx: 0, sy: h, sw: iw, sh: ih - h, label: 'bottom' },
      ];
    }

    const baseName = this.originalFileName.replace(/\.[^.]+$/, '') || 'split';
    const applyWm = this.watermarkEnabled;

    rects.forEach((r) => {
      let c = document.createElement('canvas');
      c.width  = r.sw;
      c.height = r.sh;
      c.getContext('2d').drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);

      // 应用水印
      if (applyWm) {
        c = WatermarkEngine.applyTextWatermark(c, {
          text: this.watermarkText,
          fontSize: this.watermarkFontSize,
          fontFamily: 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif',
          color: this.watermarkColor,
          opacity: this.watermarkOpacity,
          rotation: this.watermarkRotation,
          position: this.watermarkPosition,
        });
      }

      c.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}-${r.label}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    });

    this._showToast('已开始下载两个部分');
  },

  // ── 事件绑定 ──
  _bindEvents() {
    const els = this._els;

    // 拖拽上传区
    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', () => {
      if (els.fileInput.files.length) this.loadImage(els.fileInput.files[0]);
    });

    els.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.dropZone.classList.add('drag-over');
    });
    els.dropZone.addEventListener('dragleave', () => {
      els.dropZone.classList.remove('drag-over');
    });
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) this.loadImage(e.dataTransfer.files[0]);
    });

    // 方向切换
    els.dirGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      this.direction = btn.dataset.dir;
      els.dirGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._fullRedraw();
    });

    // 滑块
    els.splitSlider.addEventListener('input', () => {
      this.splitRatio = parseInt(els.splitSlider.value) / 100;
      els.splitValue.textContent = els.splitSlider.value + '%';
      this._draw();
      this._updatePreviews();
      if (this.img && els.infoBar) {
        const dirLabel = this.direction === 'vertical' ? '左右' : '上下';
        els.infoBar.textContent =
          `原图: ${this.img.naturalWidth} × ${this.img.naturalHeight} px  |  ` +
          `分割模式: ${dirLabel}  |  ` +
          `分割比例: ${els.splitSlider.value}% / ${100 - parseInt(els.splitSlider.value)}%`;
      }
    });

    // 画布: 拖拽分割线
    els.canvas.addEventListener('mousedown', (e) => {
      if (!this.img) return;
      e.preventDefault();
      els.canvas.classList.add('grabbing');

      const onMove = (ev) => {
        const rect = els.canvas.getBoundingClientRect();
        const scaleX = els.canvas.width  / rect.width;
        const scaleY = els.canvas.height / rect.height;

        if (this.direction === 'vertical') {
          const x = (ev.clientX - rect.left) * scaleX;
          this.splitRatio = this._clamp(x / els.canvas.width, 0.05, 0.95);
        } else {
          const y = (ev.clientY - rect.top) * scaleY;
          this.splitRatio = this._clamp(y / els.canvas.height, 0.05, 0.95);
        }
        els.splitSlider.value = Math.round(this.splitRatio * 100);
        els.splitValue.textContent = els.splitSlider.value + '%';
        this._draw();
      };

      const onUp = () => {
        els.canvas.classList.remove('grabbing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        this._updatePreviews();
        if (this.img && els.infoBar) {
          const dirLabel = this.direction === 'vertical' ? '左右' : '上下';
          els.infoBar.textContent =
            `原图: ${this.img.naturalWidth} × ${this.img.naturalHeight} px  |  ` +
            `分割模式: ${dirLabel}  |  ` +
            `分割比例: ${Math.round(this.splitRatio * 100)}% / ${Math.round((1 - this.splitRatio) * 100)}%`;
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // 预览卡片点击放大
    els.previewA.addEventListener('click', () => {
      if (els.previewA.src) this._openZoom(els.previewA.src);
    });
    els.previewB.addEventListener('click', () => {
      if (els.previewB.src) this._openZoom(els.previewB.src);
    });

    // 下载
    els.btnDownload.addEventListener('click', () => this.downloadParts());

    // 重置
    els.btnReset.addEventListener('click', () => this.reset());

    // ── 水印事件 ──
    els.wmToggle.addEventListener('change', () => {
      this.watermarkEnabled = els.wmToggle.checked;
      els.wmPanel.style.display = els.wmToggle.checked ? '' : 'none';
      this._updatePreviews();
      this._updateDownloadBtn();
    });
    els.wmText.addEventListener('input', () => {
      this.watermarkText = els.wmText.value || ' ';
      if (this.watermarkEnabled) this._updatePreviews();
    });
    els.wmFontSize.addEventListener('input', () => {
      this.watermarkFontSize = parseInt(els.wmFontSize.value);
      els.wmFontSizeVal.textContent = els.wmFontSize.value + 'px';
      if (this.watermarkEnabled) this._updatePreviews();
    });
    els.wmColor.addEventListener('input', () => {
      this.watermarkColor = els.wmColor.value;
      if (this.watermarkEnabled) this._updatePreviews();
    });
    els.wmOpacity.addEventListener('input', () => {
      this.watermarkOpacity = parseFloat(els.wmOpacity.value);
      els.wmOpacityVal.textContent = Math.round(els.wmOpacity.value * 100) + '%';
      if (this.watermarkEnabled) this._updatePreviews();
    });
    els.wmRotation.addEventListener('input', () => {
      this.watermarkRotation = parseInt(els.wmRotation.value);
      els.wmRotationVal.textContent = els.wmRotation.value + '°';
      if (this.watermarkEnabled) this._updatePreviews();
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      // 仅在 cut 模式且已加载图片时响应
      if (!this.img) return;
      const cutWorkspace = els.workspace;
      if (!cutWorkspace || !cutWorkspace.classList.contains('visible')) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.splitRatio = this._clamp(this.splitRatio - 0.01, 0.05, 0.95);
        els.splitSlider.value = Math.round(this.splitRatio * 100);
        els.splitValue.textContent = els.splitSlider.value + '%';
        this._fullRedraw();
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.splitRatio = this._clamp(this.splitRatio + 0.01, 0.05, 0.95);
        els.splitSlider.value = Math.round(this.splitRatio * 100);
        els.splitValue.textContent = els.splitSlider.value + '%';
        this._fullRedraw();
      }
    });
  },
};
