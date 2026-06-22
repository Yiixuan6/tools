/**
 * 主控制器 — 事件绑定、状态管理、实时预览联动、批量处理
 */

const App = {
  // ========== 分类→模式映射 ==========
  CATEGORY_MAP: {
    pdf:    { modes: ['pdf', 'pdfsplit'], default: 'pdf' },
    word:   { modes: ['word'],            default: 'word' },
    image:  { modes: ['photo', 'cut'],    default: 'photo' },
    tools:   { modes: ['number'],          default: 'number' },
    convert: { modes: ['convert'],         default: 'convert' },
  },

  /** 根据 mode 反查所属 category */
  _catOf(mode) {
    for (const [cat, cfg] of Object.entries(this.CATEGORY_MAP)) {
      if (cfg.modes.includes(mode)) return cat;
    }
    return 'pdf';
  },

  // ========== 状态管理 ==========
  state: {
    mode: 'pdf', // 'pdf' | 'pdfsplit' | 'word' | 'photo' | 'cut' | 'number'
    watermarkEnabled: true,
    watermarkType: 'text',
    watermark: {
      text: '机密文件',
      fontSize: 45,
      fontFamily: 'Arial, sans-serif',
      color: '#000000',
      opacity: 0.3,
      rotation: 45,
      position: 'center',
      offsetX: 0,
      offsetY: 0,
      imageScale: 0.3,
      tileGapX: 200,
      tileGapY: 200,
    },
    watermarkImage: null,
    outputFormat: 'png',
    outputQuality: 0.92,

    // 批量：多文件列表
    fileList: [],        // [{ name, baseName, pages[], thumbs[], selectedPages: Set, pageCount }]
    currentFileIndex: -1, // 当前预览的文件索引

    // 页边距裁剪
    crop: {
      enabled: false,
      mode: 'manual',
      top: 0, bottom: 0, left: 0, right: 0,
      autoTolerance: 10,
    },

    // 自定义尺寸
    resize: {
      enabled: false,
      width: 1920,
      height: 1080,
      keepAspect: true,
    },

    // 页码叠加
    pageNumber: {
      enabled: false,
      format: '{page} / {total}',
      fontSize: 30,
      color: '#333333',
      opacity: 0.8,
      position: 'bottom-center',
      offsetX: 0,
      offsetY: 0,
    },

  },

  // ========== 初始化 ==========
  init() {
    PDFRenderer.init();
    PictureCut.init();
    this._bindEvents();
    this._bindLightbox();
    this._bindCategoryTabs();
    this._bindModeTabs();
    this._updateUI();
    this._updateUploadArea();
  },

  _bindLightbox() {
    const lightbox = document.getElementById('lightbox');
    document.getElementById('lightbox-close').addEventListener('click', () => this._closeLightbox());
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) this._closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeLightbox();
    });
  },

  // ========== 分类 / 模式切换 ==========
  _bindCategoryTabs() {
    document.querySelectorAll('.category-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const cat = tab.dataset.cat;
        const cfg = this.CATEGORY_MAP[cat];
        if (!cfg) return;

        // 只有一个子模式的分类：直接切换
        if (cfg.modes.length === 1) {
          this._switchMode(cfg.modes[0]);
          return;
        }

        // 多个子模式：显示子标签，切换到默认（或当前已在的分类保持当前 mode）
        const currentCat = this._catOf(this.state.mode);
        const targetMode = (currentCat === cat) ? this.state.mode : cfg.default;
        this._switchMode(targetMode);
      });
    });
  },

  _bindModeTabs() {
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => this._switchMode(tab.dataset.mode));
    });
  },

  /** 动态生成二级子标签 */
  _buildSubModeTabs(modes) {
    const container = document.getElementById('mode-tabs');
    container.innerHTML = '';

    const labels = {
      pdf:       '📄 PDF → 图片 + 水印',
      pdfsplit:  '✂️ PDF分割',
      word:      '📝 Word → 图片 + 水印',
      photo:     '🖼️ 图片水印',
      cut:       '✂️ 图片分割',
      number:    '🔢 数字工具',
    };

    for (const mode of modes) {
      const btn = document.createElement('button');
      btn.className = 'mode-tab';
      btn.dataset.mode = mode;
      btn.textContent = labels[mode] || mode;
      if (mode === this.state.mode) btn.classList.add('active');
      btn.addEventListener('click', () => this._switchMode(mode));
      container.appendChild(btn);
    }
  },

  _switchMode(mode) {
    if (this.state.mode === mode && this._currentCat === this._catOf(mode)) return;
    this.state.mode = mode;

    // 更新分类标签样式
    const cat = this._catOf(mode);
    this._currentCat = cat;
    document.querySelectorAll('.category-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.cat === cat);
    });

    // 更新模式子标签：只显示当前分类的模式
    const modeTabsContainer = document.getElementById('mode-tabs');
    const cfg = this.CATEGORY_MAP[cat];
    if (cfg && cfg.modes.length > 1) {
      modeTabsContainer.style.display = 'flex';
      // 如果子标签数量变了才重建（简单比较 data-mode 列表）
      const currentModes = [...modeTabsContainer.querySelectorAll('.mode-tab')].map(t => t.dataset.mode).join(',');
      const targetModes = cfg.modes.join(',');
      if (currentModes !== targetModes) {
        this._buildSubModeTabs(cfg.modes);
      }
    } else {
      modeTabsContainer.style.display = 'none';
    }

    // 更新子标签激活状态
    document.querySelectorAll('.mode-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.mode === mode);
    });

    // 更新标题
    const titles = {
      pdf: '📄 PDF → 图片 + 水印',
      word: '📝 Word → 图片 + 水印',
      pdfsplit: '✂️ PDF 分割',
      photo: '🖼️ 图片 + 水印',
      cut: '✂️ 图片分割',
      number: '🔢 数字工具',
      convert: '📝 转MD — 文件/网页 → Markdown',
    };
    document.getElementById('app-title').textContent = titles[mode] || titles.pdf;

    // cut / number / convert 模式：显示专用工作区，隐藏常规布局
    const mainLayout = document.querySelector('.main-layout');
    const cutWorkspace = document.getElementById('cut-workspace');
    const numberWorkspace = document.getElementById('number-workspace');
    const convertWorkspace = document.getElementById('convert-workspace');

    // 先全部隐藏
    mainLayout.style.display = '';
    cutWorkspace.style.display = 'none';
    if (numberWorkspace) numberWorkspace.style.display = 'none';
    if (convertWorkspace) convertWorkspace.style.display = 'none';

    if (mode === 'cut') {
      mainLayout.style.display = 'none';
      cutWorkspace.style.display = 'flex';
      return;
    }
    if (mode === 'number') {
      mainLayout.style.display = 'none';
      if (numberWorkspace) {
        numberWorkspace.style.display = 'flex';
        if (!numberWorkspace.classList.contains('visible')) {
          numberWorkspace.classList.add('visible');
          NumberTool.init();
        }
      }
      return;
    }
    if (mode === 'convert') {
      mainLayout.style.display = 'none';
      if (convertWorkspace) {
        convertWorkspace.style.display = 'flex';
        if (!convertWorkspace.classList.contains('visible')) {
          convertWorkspace.classList.add('visible');
          MarkitdownConverter.init();
        }
      }
      return;
    }

    // 清空当前文件列表
    this.state.fileList = [];
    this.state.currentFileIndex = -1;
    this.state.watermarkImage = null;
    document.getElementById('wm-image-upload').value = '';

    this._clearAll();
    this._updateUI();
    this._updateUploadArea();
  },

  _updateUploadArea() {
    const mode = this.state.mode;
    // cut / number / convert 模式有自己的上传区
    if (mode === 'cut' || mode === 'number' || mode === 'convert') return;

    const fileInput = document.getElementById('file-input');
    const hint = document.getElementById('upload-hint');

    switch (mode) {
      case 'pdf':
      case 'pdfsplit':
        fileInput.accept = '.pdf';
        hint.textContent = '点击选择PDF文件 或 拖拽到此处';
        break;
      case 'word':
        fileInput.accept = '.docx,.doc';
        hint.textContent = '点击选择Word文件(.docx/.doc) 或 拖拽到此处';
        break;
      case 'photo':
        fileInput.accept = 'image/*';
        hint.textContent = '点击选择图片文件 或 拖拽到此处';
        break;
    }
  },

  // ========== 当前文件快捷方法 ==========
  _currentFile() {
    const idx = this.state.currentFileIndex;
    return (idx >= 0 && idx < this.state.fileList.length) ? this.state.fileList[idx] : null;
  },

  // ========== 事件绑定 ==========
  _bindEvents() {
    // 文件上传
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.getElementById('upload-area');
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this._handleFileSelect(e));

    // 拖拽上传（支持多文件）
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('drag-over'); });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        this._loadMultipleFiles(Array.from(e.dataTransfer.files));
      }
    });

    // 水印开关
    document.getElementById('watermark-toggle').addEventListener('change', (e) => {
      this.state.watermarkEnabled = e.target.checked;
      this._refreshPreview();
    });

    // 水印类型
    document.querySelectorAll('input[name="watermark-type"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.state.watermarkType = e.target.value;
        this._toggleWatermarkPanels();
        this._refreshPreview();
      });
    });

    // 文字水印控件
    document.getElementById('wm-text').addEventListener('input', (e) => {
      this.state.watermark.text = e.target.value || ' ';
      this._refreshPreview();
    });
    document.getElementById('wm-font-size').addEventListener('input', (e) => {
      this.state.watermark.fontSize = parseInt(e.target.value);
      document.getElementById('wm-font-size-val').textContent = e.target.value + 'px';
      this._refreshPreview();
    });
    document.getElementById('wm-color').addEventListener('input', (e) => {
      this.state.watermark.color = e.target.value;
      this._refreshPreview();
    });
    document.getElementById('wm-opacity').addEventListener('input', (e) => {
      this.state.watermark.opacity = parseFloat(e.target.value);
      document.getElementById('wm-opacity-val').textContent = Math.round(e.target.value * 100) + '%';
      this._refreshPreview();
    });
    document.getElementById('wm-rotation').addEventListener('input', (e) => {
      this.state.watermark.rotation = parseInt(e.target.value);
      document.getElementById('wm-rotation-val').textContent = e.target.value + '°';
      this._refreshPreview();
    });

    // 位置选择
    document.querySelectorAll('.position-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.position-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.watermark.position = btn.dataset.pos;
        this._refreshPreview();
      });
    });

    // 平铺间距
    document.getElementById('wm-tile-gap-x').addEventListener('input', (e) => {
      this.state.watermark.tileGapX = parseInt(e.target.value);
      document.getElementById('wm-tile-gap-x-val').textContent = e.target.value + 'px';
      this._refreshPreview();
    });
    document.getElementById('wm-tile-gap-y').addEventListener('input', (e) => {
      this.state.watermark.tileGapY = parseInt(e.target.value);
      document.getElementById('wm-tile-gap-y-val').textContent = e.target.value + 'px';
      this._refreshPreview();
    });

    // 图片水印上传
    document.getElementById('wm-image-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => { this.state.watermarkImage = img; this._refreshPreview(); };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
    document.getElementById('wm-image-scale').addEventListener('input', (e) => {
      this.state.watermark.imageScale = parseFloat(e.target.value);
      document.getElementById('wm-image-scale-val').textContent = Math.round(e.target.value * 100) + '%';
      this._refreshPreview();
    });

    // 输出格式
    document.querySelectorAll('input[name="output-format"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.state.outputFormat = e.target.value;
        document.getElementById('quality-group').style.display = e.target.value === 'jpeg' ? 'flex' : 'none';
      });
    });
    document.getElementById('output-quality').addEventListener('input', (e) => {
      this.state.outputQuality = parseFloat(e.target.value);
      document.getElementById('output-quality-val').textContent = Math.round(e.target.value * 100) + '%';
    });

    // 页面选择：范围输入
    document.getElementById('page-range-input').addEventListener('change', (e) => {
      this._applyRangeInput(e.target.value);
    });
    document.getElementById('page-range-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._applyRangeInput(e.target.value);
    });

    // 页面选择按钮
    document.getElementById('btn-select-all').addEventListener('click', () => this._selectAll());
    document.getElementById('btn-select-invert').addEventListener('click', () => this._selectInvert());
    document.getElementById('btn-select-none').addEventListener('click', () => this._selectNone());

    // 下载按钮
    document.getElementById('btn-download-current').addEventListener('click', () => this._downloadCurrent());
    document.getElementById('btn-download-pdf').addEventListener('click', () => this._downloadPdf());
    document.getElementById('btn-download-all').addEventListener('click', () => this._downloadAll());

    // ======= 页边距裁剪 =======
    document.getElementById('crop-toggle').addEventListener('change', (e) => {
      this.state.crop.enabled = e.target.checked;
      document.getElementById('panel-crop').style.display = e.target.checked ? '' : 'none';
      this._refreshPreview();
    });
    document.querySelectorAll('input[name="crop-mode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.state.crop.mode = e.target.value;
        document.getElementById('crop-manual').style.display = e.target.value === 'manual' ? '' : 'none';
        document.getElementById('crop-auto').style.display = e.target.value === 'auto' ? '' : 'none';
        document.getElementById('auto-crop-result').style.display = 'none';
        this._refreshPreview();
      });
    });
    ['top', 'bottom', 'left', 'right'].forEach((side) => {
      document.getElementById('crop-' + side).addEventListener('input', (e) => {
        this.state.crop[side] = parseInt(e.target.value) || 0;
        this._refreshPreview();
      });
    });
    document.getElementById('crop-tolerance').addEventListener('input', (e) => {
      this.state.crop.autoTolerance = parseInt(e.target.value);
      document.getElementById('crop-tolerance-val').textContent = e.target.value;
    });
    document.getElementById('btn-auto-detect').addEventListener('click', () => this._autoDetectCrop());

    // ======= 自定义尺寸 =======
    document.getElementById('resize-toggle').addEventListener('change', (e) => {
      this.state.resize.enabled = e.target.checked;
      document.getElementById('panel-resize').style.display = e.target.checked ? '' : 'none';
      this._refreshPreview();
    });
    document.getElementById('resize-width').addEventListener('input', (e) => {
      const w = parseInt(e.target.value) || 1;
      this.state.resize.width = w;
      this._refreshPreview();
    });
    document.getElementById('resize-height').addEventListener('input', (e) => {
      const h = parseInt(e.target.value) || 1;
      this.state.resize.height = h;
      this._refreshPreview();
    });
    document.getElementById('resize-keep-aspect').addEventListener('change', (e) => {
      this.state.resize.keepAspect = e.target.checked;
    });
    document.querySelectorAll('.preset-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.dataset.w);
        const h = parseInt(btn.dataset.h);
        this.state.resize.width = w;
        this.state.resize.height = h;
        document.getElementById('resize-width').value = w;
        document.getElementById('resize-height').value = h;
        this._refreshPreview();
      });
    });

    // ======= 页码叠加 =======
    document.getElementById('pagenum-toggle').addEventListener('change', (e) => {
      this.state.pageNumber.enabled = e.target.checked;
      document.getElementById('panel-pagenum').style.display = e.target.checked ? '' : 'none';
      this._refreshPreview();
    });
    document.getElementById('pagenum-format').addEventListener('input', (e) => {
      this.state.pageNumber.format = e.target.value || '{page}';
      this._refreshPreview();
    });
    document.getElementById('pagenum-font-size').addEventListener('input', (e) => {
      this.state.pageNumber.fontSize = parseInt(e.target.value);
      document.getElementById('pagenum-font-size-val').textContent = e.target.value + 'px';
      this._refreshPreview();
    });
    document.getElementById('pagenum-color').addEventListener('input', (e) => {
      this.state.pageNumber.color = e.target.value;
      this._refreshPreview();
    });
    document.getElementById('pagenum-opacity').addEventListener('input', (e) => {
      this.state.pageNumber.opacity = parseFloat(e.target.value);
      document.getElementById('pagenum-opacity-val').textContent = Math.round(e.target.value * 100) + '%';
      this._refreshPreview();
    });
    document.querySelectorAll('#pagenum-position-grid .position-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pagenum-position-grid .position-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.pageNumber.position = btn.dataset.pos;
        this._refreshPreview();
      });
    });

    // ======= 文档分割 =======
    document.querySelectorAll('input[name="split-output-format"]').forEach((radio) => {
      radio.addEventListener('change', () => this._updateSplitFormatNote());
    });
    document.getElementById('btn-split-document').addEventListener('click', () => this._handleSplit());

  },

  // ========== 文件处理 ==========
  async _handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      await this._loadMultipleFiles(files);
    }
  },

  // ========== 进度条工具 ==========
  _showProgress(label) {
    const el = document.getElementById('upload-progress');
    el.classList.add('visible');
    document.getElementById('upload-progress-label').textContent = label;
    this._setProgress(0);
  },
  _setProgress(pct) {
    document.getElementById('upload-progress-fill').style.width = pct + '%';
    document.getElementById('upload-progress-pct').textContent = Math.round(pct) + '%';
  },
  _setProgressIndeterminate(label) {
    const el = document.getElementById('upload-progress');
    el.classList.add('visible');
    document.getElementById('upload-progress-label').textContent = label;
    document.getElementById('upload-progress-fill').classList.add('indeterminate');
    document.getElementById('upload-progress-pct').textContent = '';
  },
  _hideProgress() {
    document.getElementById('upload-progress').classList.remove('visible');
    document.getElementById('upload-progress-fill').classList.remove('indeterminate');
    document.getElementById('upload-progress-fill').style.width = '0%';
  },

  async _loadMultipleFiles(files) {
    const mode = this.state.mode;

    if (mode === 'photo') {
      await this._loadImageFiles(files);
      return;
    }

    if (mode === 'word') {
      await this._loadWordFiles(files);
      return;
    }

    // PDF 模式
    const pdfFiles = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      document.getElementById('upload-hint').textContent = '未找到PDF文件';
      return;
    }

    document.getElementById('upload-area').classList.add('loading');
    document.getElementById('upload-hint').textContent = `正在加载 ${pdfFiles.length} 个文件...`;

    for (let i = 0; i < pdfFiles.length; i++) {
      document.getElementById('upload-hint').textContent = `正在加载 (${i + 1}/${pdfFiles.length}): ${pdfFiles[i].name}`;
      try {
        await this._loadOnePdf(pdfFiles[i]);
      } catch (err) {
        console.error(`加载 ${pdfFiles[i].name} 失败:`, err);
      }
    }

    document.getElementById('upload-area').classList.remove('loading');
    const totalFiles = this.state.fileList.length;
    const totalPages = this.state.fileList.reduce((sum, f) => sum + f.pageCount, 0);
    document.getElementById('upload-hint').textContent = `已加载 ${totalFiles} 个文件，共 ${totalPages} 页`;
    document.getElementById('file-name').textContent = '';

    this._updateUI();
  },

  /** 图片模式：将图片作为单页画布加载 */
  async _loadImageFiles(files) {
    const imgFiles = files.filter((f) => f.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f.name));
    if (imgFiles.length === 0) {
      document.getElementById('upload-hint').textContent = '未找到图片文件';
      return;
    }

    document.getElementById('upload-area').classList.add('loading');
    document.getElementById('upload-hint').textContent = `正在加载 ${imgFiles.length} 张图片...`;

    this._showProgress('正在加载图片');
    for (let i = 0; i < imgFiles.length; i++) {
      document.getElementById('upload-hint').textContent = `正在加载 (${i + 1}/${imgFiles.length}): ${imgFiles[i].name}`;
      try {
        await this._loadOneImage(imgFiles[i]);
        this._setProgress(((i + 1) / imgFiles.length) * 100);
      } catch (err) {
        console.error(`加载 ${imgFiles[i].name} 失败:`, err);
      }
    }
    this._hideProgress();

    document.getElementById('upload-area').classList.remove('loading');
    const totalFiles = this.state.fileList.length;
    document.getElementById('upload-hint').textContent = `已加载 ${totalFiles} 张图片`;
    document.getElementById('file-name').textContent = '';

    this._updateUI();
  },

  /** Word 模式：.doc / .docx → Canvas 页面 */
  async _loadWordFiles(files) {
    const wordFiles = files.filter((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith('.docx') || n.endsWith('.doc') ||
        f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        f.type === 'application/msword';
    });
    if (wordFiles.length === 0) {
      document.getElementById('upload-hint').textContent = '未找到 Word 文档（支持 .docx / .doc）';
      return;
    }

    document.getElementById('upload-area').classList.add('loading');

    for (let i = 0; i < wordFiles.length; i++) {
      const f = wordFiles[i];
      const sizeMB = (f.size / 1024 / 1024).toFixed(1);
      document.getElementById('upload-hint').textContent = `正在处理 (${i + 1}/${wordFiles.length}): ${f.name} (${sizeMB}MB)`;

      try {
        // All Word files → server-side conversion (fast, no browser freeze)
        let fileToLoad = f;

        if (f.name.toLowerCase().endsWith('.doc') && !f.name.toLowerCase().endsWith('.docx')) {
          this._setProgressIndeterminate(`正在转换 .doc → .docx: ${f.name}`);
          fileToLoad = await this._convertDocToDocx(f);
        }

        this._setProgressIndeterminate(`服务端转换中: ${fileToLoad.name}`);
        await this._loadWordFromServer(fileToLoad);
      } catch (err) {
        console.error(`处理 ${f.name} 失败:`, err);
        document.getElementById('upload-hint').textContent = `处理失败: ${f.name} - ${err.message}`;
      }
      this._hideProgress();
    }

    document.getElementById('upload-area').classList.remove('loading');
    const totalFiles = this.state.fileList.length;
    const totalPages = this.state.fileList.reduce((sum, f) => sum + f.pageCount, 0);
    document.getElementById('upload-hint').textContent = `已转换 ${totalFiles} 个文件，共 ${totalPages} 页`;
    document.getElementById('file-name').textContent = '';

    this._updateUI();
  },

  /** 服务端转换 Word → PDF → PDF.js 渲染（保留全部格式） */
  async _loadWordFromServer(file) {
    // Step 1: Upload to server, convert to PDF via LibreOffice
    this._showProgress(`正在转换: ${file.name}`);
    const formData = new FormData();
    formData.append('file', file, file.name);
    const resp = await fetch('/api/convert/docx-to-pdf', { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `转换失败 (${resp.status})`);
    }

    // Step 2: Get PDF, render with PDF.js
    this._setProgress(80, '正在渲染页面...');
    const pdfBlob = await resp.blob();
    const pdfFile = new File([pdfBlob], file.name.replace(/\.(docx?|doc)$/i, '.pdf'), { type: 'application/pdf' });

    // Step 3: Use PDFRenderer to load and render (same as PDF tab)
    const fileId = `wordpdf_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const info = await PDFRenderer.load(pdfFile, fileId);
    const baseName = file.name.replace(/\.(docx?|doc)$/i, '');
    const thumbs = [];

    this._setProgress(85, `正在生成缩略图 (${info.numPages} 页)...`);
    for (let i = 1; i <= info.numPages; i++) {
      thumbs.push(await PDFRenderer.createThumbnail(i, 160));
      this._setProgress(85 + ((i / info.numPages) * 10));
    }

    const arrayBuffer = info.arrayBuffer;

    const selectedPages = new Set();
    for (let pi = 1; pi <= info.numPages; pi++) selectedPages.add(pi);

    const fileEntry = {
      name: file.name,
      baseName: baseName,
      pages: new Array(info.numPages).fill(null),  // lazy render
      thumbs: thumbs,
      selectedPages: selectedPages,
      pageCount: info.numPages,
      fileId: fileId,
      _arrayBuffer: arrayBuffer,
    };

    this.state.fileList.push(fileEntry);
    this._hideProgress();

    if (this.state.fileList.length === 1) {
      this.state.currentFileIndex = 0;
      this._buildFileTabs();
      this._buildThumbnailList();
      await this._showPage(1);
      this._updateRangeInput();
    } else {
      this._buildFileTabs();
    }
  },

  /** 通过服务端 LibreOffice 将 .doc 转为 .docx */
  async _convertDocToDocx(docFile) {
    const formData = new FormData();
    formData.append('file', docFile, docFile.name);
    const resp = await fetch('/api/convert/doc-to-docx', { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `服务器转换失败 (${resp.status})`);
    }
    const blob = await resp.blob();
    const docxName = docFile.name.replace(/\.doc$/i, '.docx');
    return new File([blob], docxName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  },

  /** 加载单张图片 */
  async _loadOneImage(file) {
    const img = await this._readFileAsImage(file);
    const baseName = file.name.replace(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i, '');

    // 创建原始分辨率画布
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = img.width;
    pageCanvas.height = img.height;
    pageCanvas.getContext('2d').drawImage(img, 0, 0);

    // 缩略图
    const thumbHeight = 160;
    const thumbScale = thumbHeight / img.height;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = img.width * thumbScale;
    thumbCanvas.height = thumbHeight;
    thumbCanvas.getContext('2d').drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);

    const fileEntry = {
      name: file.name,
      baseName: baseName,
      pages: [pageCanvas],
      thumbs: [thumbCanvas],
      selectedPages: new Set([1]),
      pageCount: 1,
      fileId: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      _arrayBuffer: null,
    };

    this.state.fileList.push(fileEntry);

    if (this.state.fileList.length === 1) {
      this.state.currentFileIndex = 0;
      this._buildFileTabs();
      this._buildThumbnailList();
      await this._showPage(1);
    } else {
      this._buildFileTabs();
    }
  },

  /** File → Image */
  _readFileAsImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片解码失败'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('图片文件读取失败'));
      reader.readAsDataURL(file);
    });
  },

  async _loadOnePdf(file) {
    const fileId = `${file.name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const info = await PDFRenderer.load(file, fileId);
    const baseName = file.name.replace(/\.pdf$/i, '');
    const thumbs = [];

    // 只渲染缩略图（快速），全分辨率页面按需渲染
    this._showProgress(`正在生成缩略图: ${file.name}`);
    for (let i = 1; i <= info.numPages; i++) {
      thumbs.push(await PDFRenderer.createThumbnail(i, 160));
      this._setProgress((i / info.numPages) * 100);
    }
    this._hideProgress();

    // 保存 ArrayBuffer 以便后续切换时重新加载文档
    const arrayBuffer = info.arrayBuffer;

    const selectedPages = new Set();
    for (let i = 1; i <= info.numPages; i++) selectedPages.add(i);

    const fileEntry = {
      name: file.name,
      baseName: baseName,
      pages: new Array(info.numPages).fill(null), // 懒加载：null = 未渲染
      thumbs: thumbs,
      selectedPages: selectedPages,
      pageCount: info.numPages,
      fileId: fileId,
      _arrayBuffer: arrayBuffer,
    };

    this.state.fileList.push(fileEntry);

    if (this.state.fileList.length === 1) {
      this.state.currentFileIndex = 0;
      this._buildFileTabs();
      this._buildThumbnailList();
      await this._showPage(1);
    } else {
      this._buildFileTabs();
    }
  },

  /** 按需获取页面Canvas — 接受明确 file 参数，不依赖 _currentFile() */
  async _getPageCanvasForFile(file, pageNum) {
    if (pageNum < 1 || pageNum > file.pageCount) {
      throw new Error(`页码越界 ${pageNum}/${file.pageCount}`);
    }

    // 图片模式：Canvas 已预渲染，直接返回
    if (this.state.mode === 'photo') {
      const canvas = file.pages[pageNum - 1];
      if (!canvas) {
        throw new Error(`图片缓存丢失，请重新上传 ${file.name}`);
      }
      return canvas;
    }

    // Word/Pdf/PdfSplit 模式：懒加载，按需通过 PDF.js 渲染
    if (!file._arrayBuffer || file._arrayBuffer.byteLength === 0) {
      throw new Error(`文档数据丢失，请重新上传 ${file.name}`);
    }

    // 确保 PDFRenderer 加载了正确文档
    if (PDFRenderer._currentFileId !== file.fileId) {
      await PDFRenderer.loadFromArrayBuffer(file._arrayBuffer, file.fileId);
    }

    // 按需渲染
    if (!file.pages[pageNum - 1]) {
      file.pages[pageNum - 1] = await PDFRenderer.createPageCanvas(pageNum);
    }

    if (!file.pages[pageNum - 1]) {
      throw new Error(`页面渲染后仍为空 ${file.name}`);
    }

    return file.pages[pageNum - 1];
  },

  /** 便捷方法：获取当前文件页面 */
  async _getPageCanvas(pageNum) {
    const file = this._currentFile();
    if (!file) return null;
    return this._getPageCanvasForFile(file, pageNum).catch((err) => {
      console.error(`_getPageCanvas 失败 (${file.name}):`, err);
      return null;
    });
  },

  // ========== 文件标签栏 ==========
  _buildFileTabs() {
    const container = document.getElementById('file-tabs');
    container.innerHTML = '';

    if (this.state.fileList.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';

    this.state.fileList.forEach((file, index) => {
      const tab = document.createElement('div');
      tab.className = 'file-tab';
      if (index === this.state.currentFileIndex) tab.classList.add('active');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-tab-name';
      nameSpan.textContent = file.name;
      nameSpan.title = file.name;

      const countSpan = document.createElement('span');
      countSpan.className = 'file-tab-count';
      countSpan.textContent = `(${file.selectedPages.size}/${file.pageCount}页)`;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'file-tab-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = '移除文件';

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeFile(index);
      });

      tab.appendChild(nameSpan);
      tab.appendChild(countSpan);
      tab.appendChild(closeBtn);

      tab.addEventListener('click', () => this._switchFile(index));
      container.appendChild(tab);
    });
  },

  async _switchFile(index) {
    if (index === this.state.currentFileIndex) return;
    if (index < 0 || index >= this.state.fileList.length) return;

    // 防止并发切文件
    if (this._switchingFile) return;
    this._switchingFile = true;

    try {
      this.state.currentFileIndex = index;
      this._buildFileTabs();
      this._buildThumbnailList();
      await this._showPage(1);
      this._updateRangeInput();
    } finally {
      this._switchingFile = false;
    }
  },

  async _removeFile(index) {
    if (this.state.fileList.length <= 1) {
      // 删除最后一个文件 → 清空
      this.state.fileList = [];
      this.state.currentFileIndex = -1;
      this._clearAll();
      this._updateUI();
      return;
    }

    this.state.fileList.splice(index, 1);

    if (this.state.currentFileIndex >= this.state.fileList.length) {
      this.state.currentFileIndex = this.state.fileList.length - 1;
    }
    if (this.state.currentFileIndex > index) {
      this.state.currentFileIndex--;
    }

    this._buildFileTabs();
    this._buildThumbnailList();
    await this._showPage(1);
    this._updateRangeInput();
  },

  // ========== 缩略图列表（带选择） ==========
  _buildThumbnailList() {
    const file = this._currentFile();
    const container = document.getElementById('thumbnail-list');
    container.innerHTML = '';

    if (!file) return;

    file.thumbs.forEach((canvas, i) => {
      const pageNum = i + 1;
      const isSelected = file.selectedPages.has(pageNum);

      const item = document.createElement('div');
      item.className = 'thumbnail-item';
      if (isSelected) item.classList.add('selected');
      if (!isSelected) item.classList.add('deselected');

      const img = document.createElement('img');
      img.src = canvas.toDataURL();
      img.alt = `第${pageNum}页`;

      // 选中标记
      const check = document.createElement('span');
      check.className = 'thumbnail-check';
      check.textContent = '✓';

      // 页码标签
      const label = document.createElement('span');
      label.className = 'thumbnail-label';
      label.textContent = pageNum;

      item.appendChild(img);
      item.appendChild(check);
      item.appendChild(label);

      // 点击缩略图主体 → 仅预览（绑定在整块 div 上更可靠）
      item.addEventListener('click', (e) => {
        // 如果点了 ✓ 标记，不触发预览
        if (e.target === check || check.contains(e.target)) return;
        this._showPage(pageNum);
      });

      // 点击 ✓ 标记 → 切换选中状态
      check.addEventListener('click', (e) => {
        e.stopPropagation();
        this._togglePageSelection(pageNum);
      });

      container.appendChild(item);
    });
  },

  _togglePageSelection(pageNum) {
    const file = this._currentFile();
    if (!file) return;

    if (file.selectedPages.has(pageNum)) {
      file.selectedPages.delete(pageNum);
    } else {
      file.selectedPages.add(pageNum);
    }

    // 更新缩略图选中样式
    const thumbItems = document.querySelectorAll('.thumbnail-item');
    thumbItems.forEach((item, i) => {
      const pn = i + 1;
      if (file.selectedPages.has(pn)) {
        item.classList.add('selected');
        item.classList.remove('deselected');
      } else {
        item.classList.remove('selected');
        item.classList.add('deselected');
      }
    });

    this._updateRangeInput();
    this._buildFileTabs(); // 更新标签上的选中计数
  },

  // ========== 范围输入处理 ==========
  _applyRangeInput(rangeStr) {
    const file = this._currentFile();
    if (!file) return;

    const newSet = this._parseRange(rangeStr, file.pageCount);
    if (newSet === null) return; // 非法输入，忽略

    file.selectedPages = newSet;
    this._buildThumbnailList();
    this._buildFileTabs();
    this._updateRangeInput();
  },

  _parseRange(str, maxPage) {
    str = str.trim();
    if (!str) return null;

    const result = new Set();
    const parts = str.split(/[,，\s]+/);

    for (const part of parts) {
      if (!part) continue;
      if (part.includes('-')) {
        const [a, b] = part.split('-');
        const start = parseInt(a);
        const end = parseInt(b);
        if (isNaN(start) || isNaN(end) || start < 1 || end > maxPage || start > end) return null;
        for (let p = start; p <= end; p++) result.add(p);
      } else {
        const p = parseInt(part);
        if (isNaN(p) || p < 1 || p > maxPage) return null;
        result.add(p);
      }
    }

    return result.size > 0 ? result : null;
  },

  _updateRangeInput() {
    const file = this._currentFile();
    if (!file) return;

    const sorted = [...file.selectedPages].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0], end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    document.getElementById('page-range-input').value = ranges.join(',');
  },

  _selectAll() {
    const file = this._currentFile();
    if (!file) return;
    for (let i = 1; i <= file.pageCount; i++) file.selectedPages.add(i);
    this._buildThumbnailList();
    this._buildFileTabs();
    this._updateRangeInput();
  },

  _selectInvert() {
    const file = this._currentFile();
    if (!file) return;
    const newSet = new Set();
    for (let i = 1; i <= file.pageCount; i++) {
      if (!file.selectedPages.has(i)) newSet.add(i);
    }
    if (newSet.size === 0) return;
    file.selectedPages = newSet;
    this._buildThumbnailList();
    this._buildFileTabs();
    this._updateRangeInput();
  },

  _selectNone() {
    const file = this._currentFile();
    if (!file) return;
    file.selectedPages = new Set();
    this._buildThumbnailList();
    this._buildFileTabs();
    this._updateRangeInput();
  },

  // ========== 页面预览 ==========

  async _showPage(pageNum) {
    const file = this._currentFile();
    if (!file) { console.warn('_showPage: 没有当前文件'); return; }
    if (pageNum < 1 || pageNum > file.pageCount) {
      console.warn(`_showPage: 页码越界 ${pageNum}/${file.pageCount}`);
      return;
    }

    try {
      // 如果该页尚未渲染，先显示加载状态
      if (!file.pages[pageNum - 1]) {
        document.getElementById('preview-container').innerHTML =
          '<div class="preview-placeholder">⏳ 正在渲染...</div>';
      }

      const canvas = await this._getPageCanvasForFile(file, pageNum);
      if (!canvas) {
        document.getElementById('preview-container').innerHTML =
          `<div class="preview-placeholder">⚠️ ${file.name} 第${pageNum}页获取失败（模式:${this.state.mode}）</div>`;
        return;
      }

      this._refreshPreviewWithCanvas(canvas, pageNum);

      document.querySelectorAll('.thumbnail-item').forEach((item, i) => {
        item.classList.toggle('active', i + 1 === pageNum);
      });

      document.getElementById('page-indicator').textContent = `${pageNum} / ${file.pageCount}`;
    } catch (err) {
      console.error('显示页面失败:', file.name, err);
      document.getElementById('preview-container').innerHTML =
        `<div class="preview-placeholder">⚠️ ${file.name} 渲染失败：${err.message}</div>`;
    }
  },

  /** 刷新预览 — 直接用缓存的源画布重加水印；缓存丢失时回退到 _getPageCanvas */
  _refreshPreview() {
    const file = this._currentFile();
    if (!file) return;

    const indicator = document.getElementById('page-indicator').textContent;
    const match = indicator.match(/(\d+)\s*\/\s*\d+/);
    const pageNum = match ? parseInt(match[1]) : 1;

    const srcCanvas = file.pages[pageNum - 1];
    if (srcCanvas) {
      this._refreshPreviewWithCanvas(srcCanvas, pageNum);
    } else {
      // 缓存丢失（如初始渲染失败），尝试重新获取
      this._getPageCanvas(pageNum).then((canvas) => {
        if (canvas) this._refreshPreviewWithCanvas(canvas, pageNum);
      });
    }
  },

  _refreshPreviewWithCanvas(sourceCanvas, pageNum) {
    if (!sourceCanvas) return;

    const file = this._currentFile();
    pageNum = pageNum || 1;

    // split 模式：直接显示原始页面，不加水印/裁剪/页码
    const resultCanvas = (this.state.mode === 'pdfsplit')
      ? WatermarkEngine._cloneCanvas(sourceCanvas)
      : PageProcessor.processPage(
          sourceCanvas,
          this.state,
          pageNum,
          file ? file.pageCount : 1
        );

    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = '';
    const img = document.createElement('img');
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.cursor = 'zoom-in';
    img.title = '点击放大查看';
    img.addEventListener('click', () => this._openLightbox(resultCanvas));
    img.src = resultCanvas.toDataURL();
    previewContainer.appendChild(img);
  },

  // ========== 灯箱放大 ==========
  _openLightbox(canvas) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = canvas.toDataURL();
    lightbox.style.display = 'flex';
  },

  _closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
  },

  // ========== 水印面板切换 ==========
  _toggleWatermarkPanels() {
    const type = this.state.watermarkType;
    document.getElementById('panel-text').style.display =
      (type === 'text' || type === 'tile-text') ? 'block' : 'none';
    document.getElementById('panel-image').style.display =
      (type === 'image' || type === 'tile-image') ? 'block' : 'none';
    document.getElementById('panel-tile').style.display =
      (type === 'tile-text' || type === 'tile-image') ? 'block' : 'none';
  },

  // ========== 下载 ==========
  async _downloadCurrent() {
    const file = this._currentFile();
    if (!file) return;

    const indicator = document.getElementById('page-indicator').textContent;
    const match = indicator.match(/(\d+)\s*\/\s*\d+/);
    const pageNum = match ? parseInt(match[1]) : 1;
    const pageCanvas = await this._getPageCanvas(pageNum);

    const canvas = PageProcessor.processPage(pageCanvas, this.state, pageNum, file.pageCount);

    const pageLabel = String(pageNum).padStart(3, '0');
    DownloadManager.downloadPage(
      canvas,
      `${file.baseName}_${pageLabel}`,
      this.state.outputFormat,
      this.state.outputQuality
    );
  },

  // ========== 文档分割 ==========

  /** 根据当前模式和输出格式显示/隐藏 DOCX 提示 */
  _updateSplitFormatNote() {
    const formatEl = document.querySelector('input[name="split-output-format"]:checked');
    const isDocx = formatEl && formatEl.value === 'docx';
    const note = document.getElementById('split-docx-note');
    if (note) {
      note.style.display = isDocx ? '' : 'none';
      note.textContent = 'DOCX 格式：保留原始文字与格式，生成可编辑的 Word 文档';
    }
  },

  async _handleSplit() {
    const file = this._currentFile();
    if (!file) return;

    const btn = document.getElementById('btn-split-document');
    const originalText = btn.textContent;
    btn.disabled = true;

    try {
      const formatEl = document.querySelector('input[name="split-output-format"]:checked');
      const outputFormat = formatEl ? formatEl.value : 'pdf';

      // 解析范围分组：每个逗号分隔的段 = 一个输出文件
      const rangeStr = document.getElementById('split-range-input').value.trim();
      let groups = []; // [[1,2,3], [5,6,7]]
      const allPages = new Set();

      if (rangeStr) {
        const parts = rangeStr.split(/[,，\s]+/).filter(Boolean);
        for (const part of parts) {
          const parsed = this._parseRange(part, file.pageCount);
          if (parsed && parsed.size > 0) {
            const sorted = [...parsed].sort((a, b) => a - b);
            groups.push(sorted);
            sorted.forEach((p) => allPages.add(p));
          }
        }
      }

      if (groups.length === 0) {
        // 没有输入 → 整个文档作为一个文件
        groups.push(Array.from({ length: file.pageCount }, (_, i) => i + 1));
      }

      // 剩余页面
      const includeRemainder = document.getElementById('split-remainder-cb').checked;
      let remainder = null;
      if (includeRemainder) {
        const remaining = [];
        for (let p = 1; p <= file.pageCount; p++) {
          if (!allPages.has(p)) remaining.push(p);
        }
        if (remaining.length > 0) remainder = remaining;
      }

      // 确保 PDFRenderer 已加载
      if (!file._arrayBuffer || file._arrayBuffer.byteLength === 0) {
        throw new Error('PDF 数据丢失，请重新上传文件');
      }
      if (PDFRenderer._currentFileId !== file.fileId) {
        await PDFRenderer.loadFromArrayBuffer(file._arrayBuffer, file.fileId);
      }

      if (outputFormat === 'docx') {
        await this._splitPdfToDocx(file.baseName, groups, remainder, btn);
      } else {
        await DocumentSplitter.splitPdf(
          PDFRenderer.pdfDoc,
          file.baseName,
          groups,
          remainder,
          outputFormat,
          (current, total) => { btn.textContent = `正在分割 ${current}/${total}...`; }
        );
      }

      btn.textContent = '✅ 分割完成！';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    } catch (err) {
      console.error('分割失败:', err);
      alert('分割失败：' + (err.message || '未知错误'));
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },
  async _splitPdfToDocx(baseName, groups, remainder, btn) {
    const allGroups = remainder && remainder.length > 0 ? [...groups, remainder] : groups;
    const zip = new JSZip();

    for (let g = 0; g < allGroups.length; g++) {
      const pages = allGroups[g];
      btn.textContent = `正在提取文本 ${g + 1}/${allGroups.length}...`;

      const docxBlob = await PdfToWord.convert(PDFRenderer.pdfDoc, { pages });

      const first = pages[0], last = pages[pages.length - 1];
      const label = first === last ? `p${String(first).padStart(3, '0')}`
        : `p${String(first).padStart(3, '0')}-${String(last).padStart(3, '0')}`;
      zip.file(`${baseName}_${label}.docx`, docxBlob);
    }

    btn.textContent = '正在打包 ZIP...';
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_分割为Word.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  async _downloadAll() {
    const allPages = await this._collectSelectedPages();
    if (allPages.length === 0) {
      alert('没有选中任何页面');
      return;
    }

    const btn = document.getElementById('btn-download-all');
    const originalText = btn.textContent;
    btn.disabled = true;

    const isSingleFile = this.state.fileList.length === 1;

    try {
      if (isSingleFile) {
        const file = this.state.fileList[0];
        const pages = [];
        for (const entry of allPages) {
          for (const page of entry.pages) {
            pages.push(page);
          }
        }

        btn.textContent = '正在打包...';
        await DownloadManager.downloadAllAsZip(
          pages,
          file.baseName,
          this.state.outputFormat,
          this.state.outputQuality,
          (current, total) => { btn.textContent = `打包中 ${current}/${total}...`; }
        );
      } else {
        const zip = new JSZip();
        const ext = this.state.outputFormat === 'jpeg' ? 'jpg' : 'png';
        const mimeType = this.state.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

        let totalPages = 0;
        for (const entry of allPages) {
          totalPages += entry.pages.length;
        }

        let processed = 0;
        for (const entry of allPages) {
          const folder = zip.folder(entry.baseName);
          for (const { canvas, pageNum } of entry.pages) {
            try {
              const blob = await DownloadManager._canvasToBlob(canvas, mimeType, this.state.outputQuality);
              const pageLabel = String(pageNum).padStart(3, '0');
              folder.file(`${entry.baseName}_${pageLabel}.${ext}`, blob);
            } catch (err) {
              console.error(`${entry.baseName} 第${pageNum}页出错:`, err);
            }
            processed++;
            btn.textContent = `打包中 ${processed}/${totalPages}...`;
          }
        }

        btn.textContent = '正在生成ZIP...';
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const url = URL.createObjectURL(zipBlob);
        DownloadManager._triggerDownload(url, `批量导出_${this.state.fileList.length}个文件.zip`);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (err) {
      console.error('下载失败:', err);
      alert('下载失败：' + (err.message || '未知错误'));
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  /** 导出 PDF */
  async _downloadPdf() {
    const allPages = await this._collectSelectedPages();
    if (allPages.length === 0) { alert('没有选中任何页面'); return; }

    const btn = document.getElementById('btn-download-pdf');
    const originalText = btn.textContent;
    btn.disabled = true;

    try {
      const pages = [];
      for (const entry of allPages) {
        for (const page of entry.pages) {
          pages.push(page);
        }
      }

      const file = this._currentFile();
      const pdfName = file ? file.baseName : '导出';

      btn.textContent = '正在生成PDF...';
      await DownloadManager.downloadAllAsPdf(
        pages,
        pdfName,
        (current, total) => { btn.textContent = `PDF ${current}/${total}...`; }
      );
    } catch (err) {
      console.error('PDF导出失败:', err);
      alert('PDF导出失败：' + (err.message || '未知错误'));
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  async _collectSelectedPages() {
    const result = [];
    const isPdfMode = this.state.mode === 'pdf';

    for (const file of this.state.fileList) {
      const selected = [...file.selectedPages].sort((a, b) => a - b);
      if (selected.length === 0) continue;

      const pages = [];
      for (const pageNum of selected) {
        try {
          let srcCanvas;
          if (isPdfMode) {
            // 用 _getPageCanvasForFile 统一处理文档切换+渲染
            srcCanvas = await this._getPageCanvasForFile(file, pageNum);
          } else {
            srcCanvas = file.pages[pageNum - 1];
            if (!srcCanvas) continue;
          }
          if (!srcCanvas) continue;

          const canvas = PageProcessor.processPage(srcCanvas, this.state, pageNum, file.pageCount);
          pages.push({ canvas, pageNum });
        } catch (err) {
          console.error(`${file.name} 第${pageNum}页处理失败:`, err);
          // 单页失败不影响其他页
        }
      }
      if (pages.length > 0) {
        result.push({ baseName: file.baseName, pages });
      }
    }
    return result;
  },

  _canvasToBlob(canvas, mimeType) {
    return DownloadManager._canvasToBlob(canvas, mimeType, this.state.outputQuality);
  },

  // ========== 裁剪辅助 ==========

  async _autoDetectCrop() {
    const file = this._currentFile();
    if (!file) return;

    const indicator = document.getElementById('page-indicator').textContent;
    const match = indicator.match(/(\d+)\s*\/\s*\d+/);
    const pageNum = match ? parseInt(match[1]) : 1;

    const pageCanvas = await this._getPageCanvas(pageNum);
    if (!pageCanvas) return;

    const values = PageProcessor.getAutoCropValues(pageCanvas, this.state.crop.autoTolerance);
    this.state.crop.top = values.top;
    this.state.crop.bottom = values.bottom;
    this.state.crop.left = values.left;
    this.state.crop.right = values.right;

    document.getElementById('crop-top').value = values.top;
    document.getElementById('crop-bottom').value = values.bottom;
    document.getElementById('crop-left').value = values.left;
    document.getElementById('crop-right').value = values.right;

    const resultDiv = document.getElementById('auto-crop-result');
    resultDiv.style.display = '';
    document.getElementById('auto-top').textContent = values.top;
    document.getElementById('auto-bottom').textContent = values.bottom;
    document.getElementById('auto-left').textContent = values.left;
    document.getElementById('auto-right').textContent = values.right;

    this._refreshPreview();
  },

  // ========== 清空 ==========
  _clearAll() {
    // cut / number / convert 模式不操作常规 DOM
    if (this.state.mode === 'cut' || this.state.mode === 'number' || this.state.mode === 'convert') return;

    const mode = this.state.mode;
    const placeholders = {
      pdf: '请上传PDF文件',
      pdfsplit: '请上传PDF文件，选择输出格式后分割',
      word: '请上传Word文件(.docx / .doc)',
      photo: '请上传图片文件',
    };
    document.getElementById('file-tabs').style.display = 'none';
    document.getElementById('file-tabs').innerHTML = '';
    document.getElementById('thumbnail-list').innerHTML = '';
    document.getElementById('page-select-bar').style.display = 'none';
    document.getElementById('preview-container').innerHTML =
      `<div class="preview-placeholder">${placeholders[mode] || placeholders.pdf}</div>`;
    document.getElementById('page-indicator').textContent = '0 / 0';
    document.getElementById('page-range-input').value = '';
  },

  // ========== UI状态更新 ==========
  _updateUI() {
    // cut / number / convert 模式由独立模块管理，不处理常规 UI
    if (this.state.mode === 'cut' || this.state.mode === 'number' || this.state.mode === 'convert') return;

    const hasFiles = this.state.fileList.length > 0;
    const isPhoto = this.state.mode === 'photo';
    const isSplit = this.state.mode === 'pdfsplit';

    // split 模式使用独立面板
    document.getElementById('panel-watermark').style.display =
      (hasFiles && !isSplit) ? '' : 'none';
    document.getElementById('panel-splitter').style.display =
      (hasFiles && isSplit) ? '' : 'none';
    if (isSplit) this._updateSplitFormatNote();
    document.getElementById('preview-section').style.display = hasFiles ? '' : 'none';
    document.getElementById('download-section').style.display =
      (hasFiles && !isSplit) ? '' : 'none';

    // 页面选择栏：图片模式隐藏，split 模式需要
    document.getElementById('page-select-bar').style.display =
      (hasFiles && !isPhoto) ? 'flex' : 'none';

    // 页码叠加：图片/split 模式不可用
    const pagenumSection = document.getElementById('pagenum-toggle').closest('.panel-section');
    if (pagenumSection) pagenumSection.style.display = (isPhoto || isSplit) ? 'none' : '';

    // 页边距裁剪：图片/split 模式不可用
    const cropSection = document.getElementById('crop-toggle').closest('.panel-section');
    if (cropSection) cropSection.style.display = (isPhoto || isSplit) ? 'none' : '';

    // 文件标签栏：图片和 Word 模式也显示
    if (!hasFiles) {
      this._clearAll();
    }

    this._toggleWatermarkPanels();
  },
};

// ========== 启动应用 ==========
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
