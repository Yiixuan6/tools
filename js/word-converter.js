/**
 * Word 转换模块 — 使用 mammoth.js + html2canvas 将 .docx 转为 Canvas 页面
 * html2canvas 是 HTML→Canvas 的工业标准方案，渲染质量可靠
 */

const WordConverter = {
  /** A4 @ 96dpi */
  PAGE_WIDTH: 794,
  PAGE_HEIGHT: 1122,

  /** 页边距 */
  PADDING_X: 40,  // 左右边距
  PADDING_Y: 20,  // 上下边距

  /**
   * 将 .docx 文件转为 Canvas 页面数组
   * @param {File} file — .docx 文件
   * @param {number} [pageWidth] — 页面宽度，默认 A4 794px
   * @param {number} [pageHeight] — 页面高度，默认 A4 1122px
   * @returns {Promise<{canvases: HTMLCanvasElement[], html: string}>}
   */
  async convert(file, pageWidth, pageHeight) {
    const pw = pageWidth || this.PAGE_WIDTH;
    const ph = pageHeight || this.PAGE_HEIGHT;

    if (typeof mammoth === 'undefined') {
      throw new Error('mammoth.js 库未加载，无法转换 Word 文档');
    }
    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas 库未加载，无法渲染 Word 文档');
    }

    // 1. 读取文件
    const arrayBuffer = await this._readFileAsArrayBuffer(file);

    // 2. mammoth 转换 .docx → HTML
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    if (result.messages && result.messages.length > 0) {
      console.warn('mammoth 转换警告:', result.messages);
    }

    if (!html || html.trim().length === 0) {
      throw new Error('Word 文档内容为空');
    }

    // 3. HTML → Canvas 页面（分页）+ 提取每页 HTML
    const { canvases, pageHtmls } = await this._htmlToCanvases(html, pw, ph);

    return { canvases, html, pageHtmls };
  },

  /**
   * 将 HTML 分割为固定高度的 Canvas 页面
   */
  async _htmlToCanvases(html, pageWidth, pageHeight) {
    const contentWidth = pageWidth - this.PADDING_X * 2;
    const contentHeight = pageHeight - this.PADDING_Y * 2;

    // 包装 HTML 内容样式
    const styledHtml = this._buildContentHtml(html, contentWidth);

    // 1. 测量：把内容渲染到隐藏 div 中，获取真实高度
    const totalHeight = await this._measureContentHeight(styledHtml, contentWidth);

    // 2. 分页
    const pageCount = Math.max(1, Math.ceil(totalHeight / contentHeight));

    // 3. 提取每页的 HTML 片段
    const pageHtmls = await this._extractPageHtmls(html, contentWidth, contentHeight, pageCount);

    // 4. 逐页用 html2canvas 渲染
    const canvases = [];
    for (let i = 0; i < pageCount; i++) {
      const canvas = await this._renderPageToCanvas(
        styledHtml, pageWidth, pageHeight, contentWidth, contentHeight, i
      );
      if (canvas) canvases.push(canvas);
    }

    return { canvases, pageHtmls };
  },

  /**
   * 按 DOM 元素拆分 HTML 为每页的 HTML 片段
   * 将整个内容渲染到测量容器中，遍历子元素按 Y 坐标分页
   */
  async _extractPageHtmls(html, contentWidth, contentHeight, pageCount) {
    if (pageCount <= 1) return [html];

    // 创建测量容器
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: ${contentWidth}px;
      font-family: 'SimSun', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', '宋体', sans-serif;
      font-size: 15px; line-height: 1.8; color: #1e293b;
      word-wrap: break-word; overflow-wrap: break-word;
    `;
    container.innerHTML = html;
    document.body.appendChild(container);

    // 等待布局
    await new Promise((r) => setTimeout(r, 100));
    await this._waitForImages(container);

    // 遍历直接子元素，确定每个属于哪一页
    const pageElements = Array.from({ length: pageCount }, () => []);
    const containerTop = container.getBoundingClientRect().top;

    for (const child of [...container.children]) {
      const rect = child.getBoundingClientRect();
      const midY = rect.top + rect.height / 2 - containerTop;

      // 确定该元素中间点落在哪一页
      let pageIdx = Math.floor(midY / contentHeight);
      if (pageIdx < 0) pageIdx = 0;
      if (pageIdx >= pageCount) pageIdx = pageCount - 1;

      // 跨页元素：添加到起始页
      pageElements[pageIdx].push(child.cloneNode(true));
    }

    document.body.removeChild(container);

    // 序列化每页的 HTML
    const pageHtmls = pageElements.map((elements) => {
      if (elements.length === 0) return '<p></p>';
      return elements.map((el) => el.outerHTML || el.textContent).join('\n');
    });

    return pageHtmls;
  },

  /**
   * 等待容器内图片加载完成
   */
  _waitForImages(container) {
    return new Promise((resolve) => {
      const imgs = [...container.querySelectorAll('img')].filter((img) => !img.complete);
      if (imgs.length === 0) { resolve(); return; }
      let done = 0;
      const check = () => { done++; if (done >= imgs.length) resolve(); };
      imgs.forEach((img) => { img.onload = check; img.onerror = check; });
      setTimeout(resolve, 5000); // 超时保护
    });
  },

  /**
   * 构建带样式的内容 HTML
   */
  _buildContentHtml(html, contentWidth) {
    return `<div style="
      font-family: 'SimSun', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', '宋体', sans-serif;
      font-size: 15px; line-height: 1.8; color: #1e293b;
      width: ${contentWidth}px;
      word-wrap: break-word; overflow-wrap: break-word;
    ">${html}</div>`;
  },

  /**
   * 测量 HTML 内容渲染后的真实高度
   */
  async _measureContentHeight(styledHtml, contentWidth) {
    // 创建测量容器
    const measureDiv = document.createElement('div');
    measureDiv.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: ${contentWidth}px;
      font-family: 'SimSun', 'Microsoft YaHei', 'PingFang SC', sans-serif;
      font-size: 15px; line-height: 1.8; color: #1e293b;
      word-wrap: break-word; overflow-wrap: break-word;
    `;
    measureDiv.innerHTML = styledHtml;
    document.body.appendChild(measureDiv);

    // 等待图片加载
    const height = await this._waitForLayout(measureDiv);

    document.body.removeChild(measureDiv);
    return Math.max(height, 100);
  },

  /**
   * 等待 DOM 布局完成 + 图片加载
   */
  _waitForLayout(container) {
    return new Promise((resolve) => {
      const images = container.querySelectorAll('img');
      const pending = Array.from(images).filter((img) => !img.complete);

      const measure = () => {
        requestAnimationFrame(() => {
          resolve(container.scrollHeight);
        });
      };

      if (pending.length === 0) {
        measure();
        return;
      }

      // 等待图片加载，最多等 8 秒
      let loaded = 0;
      const onDone = () => { loaded++; if (loaded >= pending.length) measure(); };
      pending.forEach((img) => { img.onload = onDone; img.onerror = onDone; });
      setTimeout(() => {
        // 超时也继续
        pending.forEach((img) => { img.onload = null; img.onerror = null; });
        measure();
      }, 8000);
    });
  },

  /**
   * 渲染单页到 Canvas（使用 html2canvas）
   */
  async _renderPageToCanvas(styledHtml, pageWidth, pageHeight, contentWidth, contentHeight, pageIndex) {
    const offsetY = pageIndex * contentHeight;

    // 构建页面容器：overflow:hidden 裁剪 + negative margin 偏移
    const pageContainer = document.createElement('div');
    pageContainer.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: ${pageWidth}px; height: ${pageHeight}px;
      overflow: hidden;
      background: #ffffff;
    `;

    // 内层：padding 做边距 + margin-top 偏移显示正确的页
    const innerDiv = document.createElement('div');
    innerDiv.style.cssText = `
      padding: ${this.PADDING_Y}px ${this.PADDING_X}px;
      margin-top: -${offsetY}px;
    `;
    innerDiv.innerHTML = styledHtml;
    pageContainer.appendChild(innerDiv);

    document.body.appendChild(pageContainer);

    // 用 html2canvas 捕获
    try {
      const captured = await html2canvas(pageContainer, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: pageWidth,
        height: pageHeight,
        windowWidth: pageWidth,
        windowHeight: pageHeight,
      });

      document.body.removeChild(pageContainer);

      // 确保输出尺寸精确
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = pageWidth;
      finalCanvas.height = pageHeight;
      const ctx = finalCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      ctx.drawImage(captured, 0, 0);

      return finalCanvas;
    } catch (err) {
      document.body.contains(pageContainer) && document.body.removeChild(pageContainer);
      console.error('html2canvas 渲染第' + (pageIndex + 1) + '页失败:', err);
      return this._fallbackRender(styledHtml, pageWidth, pageHeight, pageIndex, contentHeight);
    }
  },

  /**
   * 回退：纯文本 Canvas 渲染（html2canvas 失败时）
   */
  _fallbackRender(styledHtml, pageWidth, pageHeight, pageIndex, contentHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidth, pageHeight);

    // 提取纯文本
    const temp = document.createElement('div');
    temp.innerHTML = styledHtml;
    const plainText = (temp.textContent || '').trim();
    const lines = this._splitLines(ctx, plainText, pageWidth - this.PADDING_X * 2, 15);

    ctx.fillStyle = '#1e293b';
    ctx.font = '15px "SimSun", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'top';

    const lineHeight = 27;
    const maxLines = Math.floor(contentHeight / lineHeight);

    // 逐字换行
    const wrappedLines = [];
    for (const line of lines) {
      let current = '';
      for (const char of line) {
        if (ctx.measureText(current + char).width > pageWidth - this.PADDING_X * 2) {
          wrappedLines.push(current);
          current = char;
        } else {
          current += char;
        }
      }
      if (current) wrappedLines.push(current);
    }

    const startLine = pageIndex * maxLines;
    const pageLines = wrappedLines.slice(startLine, startLine + maxLines);

    pageLines.forEach((line, i) => {
      ctx.fillText(line, this.PADDING_X, this.PADDING_Y + i * lineHeight);
    });

    return canvas;
  },

  /**
   * 按换行分割文本
   */
  _splitLines(ctx, text, maxWidth, fontSize) {
    ctx.font = `${fontSize}px "SimSun", "Microsoft YaHei", sans-serif`;
    return text.split('\n');
  },

  /**
   * FileReader 封装：File → ArrayBuffer
   */
  _readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Word 文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  },
};
