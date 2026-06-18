/**
 * PDF渲染模块 — 封装 PDF.js，负责加载PDF、逐页渲染到Canvas
 * 兼容 file:// 协议纯本地运行
 */

const PDFRenderer = {
  pdfDoc: null,
  currentPage: 1,
  scale: 1.5,
  _initialized: false,
  _currentFileId: null, // 追踪当前加载的是哪个文件

  /**
   * 初始化 PDF.js worker
   * 对于 file:// 协议，尝试多种方式加载 worker
   */
  async init() {
    if (this._initialized) return;
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js 库未加载');
    }

    // 方法1：XHR 读 worker 文件 → Blob URL（兼容 file://）
    try {
      const workerUrl = new URL('lib/pdf.worker.min.js', window.location.href).href;
      const blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', workerUrl, true);
        xhr.responseType = 'blob';
        xhr.onload = () => { if (xhr.status === 200 || xhr.status === 0) resolve(xhr.response); else reject(new Error('XHR failed')); };
        xhr.onerror = () => reject(new Error('XHR error'));
        xhr.send();
      });
      const blobUrl = URL.createObjectURL(blob);
      pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl;
      console.log('PDF.js worker: blob URL 方式加载成功');
      this._initialized = true;
      return;
    } catch (e) {
      console.warn('XHR worker 加载失败:', e.message);
    }

    // 方法2：直接设置路径
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      console.log('PDF.js worker: 直接路径方式');
      this._initialized = true;
      return;
    } catch (e) {
      console.warn('Worker 路径设置失败:', e.message);
    }

    // 方法3：无 worker（主线程运行，CJK 字体可能不渲染）
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    console.warn('PDF.js: 无 worker 模式，文字可能显示不全');
    this._initialized = true;
  },

  /**
   * 加载 PDF 文件（返回 ArrayBuffer 引用供后续切换使用）
   * @param {File} file - PDF文件
   * @param {string} [fileId] - 文件唯一标识
   * @returns {Promise<object>} - { numPages, arrayBuffer }
   */
  async load(file, fileId) {
    await this.init();

    const arrayBuffer = await this._readFileAsArrayBuffer(file);
    // loadFromArrayBuffer 内部会 clone，所以直接存原始引用即可
    const result = await this.loadFromArrayBuffer(arrayBuffer, fileId);
    result.arrayBuffer = arrayBuffer;
    return result;
  },

  /**
   * 直接从 ArrayBuffer 加载 PDF（多文件切换时复用缓存的 buffer）
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} [fileId] - 文件唯一标识
   * @returns {Promise<object>} - { numPages }
   */
  async loadFromArrayBuffer(arrayBuffer, fileId) {
    await this.init();

    // 如果已经是当前文件，跳过重复加载
    if (fileId && this._currentFileId === fileId && this.pdfDoc) {
      return { numPages: this.pdfDoc.numPages };
    }

    // clone：PDF.js 可能 transfer 给 Worker，不能让它动我们的原始 buffer
    const data = arrayBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({
      data,
      cMapUrl: 'lib/cmaps/',
      cMapPacked: true,
      useWorkerFetch: false,
      standardFontDataUrl: 'lib/',
    });
    this.pdfDoc = await loadingTask.promise;
    this.currentPage = 1;
    if (fileId) this._currentFileId = fileId;

    return {
      numPages: this.pdfDoc.numPages,
    };
  },

  /**
   * 将指定页面渲染到 Canvas
   */
  async renderPage(pageNum, canvas, scale = this.scale) {
    if (!this.pdfDoc) throw new Error('请先加载PDF文件');

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    return canvas;
  },

  /**
   * 创建离屏 Canvas 并渲染页面
   */
  async createPageCanvas(pageNum, scale = this.scale) {
    const canvas = document.createElement('canvas');
    return this.renderPage(pageNum, canvas, scale);
  },

  /**
   * 生成缩略图 Canvas
   */
  async createThumbnail(pageNum, thumbHeight = 160) {
    if (!this.pdfDoc) throw new Error('请先加载PDF文件');

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const thumbScale = thumbHeight / viewport.height;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width * thumbScale;
    canvas.height = thumbHeight;

    const ctx = canvas.getContext('2d');
    await page.render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale: thumbScale }),
    }).promise;

    return canvas;
  },

  /**
   * 获取页面原始尺寸
   */
  async getPageSize(pageNum) {
    if (!this.pdfDoc) throw new Error('请先加载PDF文件');
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  },

  get numPages() {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  },

  /**
   * FileReader 封装：File → ArrayBuffer
   */
  _readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  },
};
