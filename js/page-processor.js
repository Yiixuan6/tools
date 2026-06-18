/**
 * 后处理管道模块 — 裁剪 → 缩放 → 水印 → 页码
 * 统一处理入口: PageProcessor.processPage()
 */

const PageProcessor = {
  /**
   * 统一后处理管道
   * @param {HTMLCanvasElement} sourceCanvas — 原始渲染 Canvas
   * @param {object} state — App.state（包含 watermark、crop、resize、pageNumber 等）
   * @param {number} pageNum — 当前页码（用于页码叠加）
   * @param {number} totalPages — 总页数（用于页码叠加）
   * @returns {HTMLCanvasElement}
   */
  processPage(sourceCanvas, state, pageNum, totalPages) {
    let canvas = WatermarkEngine._cloneCanvas(sourceCanvas);

    // 1. 裁剪边距（最先处理，在原始高清图上裁剪）
    if (state.crop && state.crop.enabled) {
      canvas = this._cropCanvas(canvas, state.crop);
    }

    // 2. 缩放到自定义尺寸
    if (state.resize && state.resize.enabled) {
      canvas = this._resizeCanvas(canvas, state.resize);
    }

    // 3. 叠加水印（复用现有水印引擎）
    if (state.watermarkEnabled) {
      canvas = this._applyWatermark(canvas, state);
    }

    // 4. 叠加页码（最上层）
    if (state.pageNumber && state.pageNumber.enabled) {
      canvas = this._overlayPageNumber(canvas, pageNum, totalPages, state.pageNumber);
    }

    return canvas;
  },

  // ========== 裁剪 ==========

  /**
   * 裁剪画布边距
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {object} cropOpts — { enabled, mode, top, bottom, left, right, autoTolerance }
   * @returns {HTMLCanvasElement}
   */
  _cropCanvas(sourceCanvas, cropOpts) {
    // 手动/自动模式都使用 state 中存储的裁剪值
    // 自动模式的值由 App._autoDetectCrop() 检测后写入 state
    const top = cropOpts.top || 0;
    const bottom = cropOpts.bottom || 0;
    const left = cropOpts.left || 0;
    const right = cropOpts.right || 0;

    const newWidth = sourceCanvas.width - left - right;
    const newHeight = sourceCanvas.height - top - bottom;

    // 至少保留 1px
    if (newWidth <= 0 || newHeight <= 0) {
      return WatermarkEngine._cloneCanvas(sourceCanvas);
    }

    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceCanvas, left, top, newWidth, newHeight, 0, 0, newWidth, newHeight);

    return canvas;
  },

  /**
   * 自动检测内容边界（扫描四边找到非白色像素）
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {number} tolerance — 颜色容差 0-255
   * @returns {{top: number, bottom: number, left: number, right: number}}
   */
  _detectContentBounds(sourceCanvas, tolerance) {
    const ctx = sourceCanvas.getContext('2d');
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // 采样步长：每隔 step 像素检测一次，提升性能
    const step = Math.max(1, Math.floor(Math.min(w, h) / 400));

    const isBackground = (idx) => {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      // 透明像素也视为背景
      if (a < 128) return true;
      // 检查是否接近白色
      return (r >= 255 - tolerance && g >= 255 - tolerance && b >= 255 - tolerance);
    };

    // 扫描顶边
    let top = 0;
    topLoop:
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        if (!isBackground(idx)) { top = y; break topLoop; }
      }
    }

    // 扫描底边
    let bottom = h - 1;
    bottomLoop:
    for (let y = h - 1; y >= 0; y -= step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        if (!isBackground(idx)) { bottom = y; break bottomLoop; }
      }
    }

    // 扫描左边
    let left = 0;
    leftLoop:
    for (let x = 0; x < w; x += step) {
      for (let y = top; y <= bottom; y += step) {
        const idx = (y * w + x) * 4;
        if (!isBackground(idx)) { left = x; break leftLoop; }
      }
    }

    // 扫描右边
    let right = w - 1;
    rightLoop:
    for (let x = w - 1; x >= 0; x -= step) {
      for (let y = top; y <= bottom; y += step) {
        const idx = (y * w + x) * 4;
        if (!isBackground(idx)) { right = x; break rightLoop; }
      }
    }

    // 容错：边界至少保留一点余量
    if (top >= bottom) { top = 0; bottom = h - 1; }
    if (left >= right) { left = 0; right = w - 1; }

    return {
      top: Math.max(0, top),
      bottom: Math.min(h - 1, bottom),
      left: Math.max(0, left),
      right: Math.min(w - 1, right),
    };
  },

  /**
   * 手动获取自动检测的裁剪值（供 App 使用以显示预览）
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {number} tolerance
   * @returns {{top: number, bottom: number, left: number, right: number}}
   */
  getAutoCropValues(sourceCanvas, tolerance) {
    const bounds = this._detectContentBounds(sourceCanvas, tolerance || 10);
    return {
      top: bounds.top,
      bottom: sourceCanvas.height - 1 - bounds.bottom,
      left: bounds.left,
      right: sourceCanvas.width - 1 - bounds.right,
    };
  },

  // ========== 自定义尺寸缩放 ==========

  /**
   * 缩放画布到目标尺寸
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {object} resizeOpts — { width, height, keepAspect }
   * @returns {HTMLCanvasElement}
   */
  _resizeCanvas(sourceCanvas, resizeOpts) {
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;
    const tw = resizeOpts.width || sw;
    const th = resizeOpts.height || sh;

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');

    if (resizeOpts.keepAspect) {
      // fit-inside：等比缩放居中，空白区域填充白色
      const scale = Math.min(tw / sw, th / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (tw - dw) / 2;
      const dy = (th - dh) / 2;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
    } else {
      // 直接拉伸到目标尺寸
      ctx.drawImage(sourceCanvas, 0, 0, tw, th);
    }

    return canvas;
  },

  // ========== 水印（内部调用 WatermarkEngine） ==========

  _applyWatermark(canvas, state) {
    switch (state.watermarkType) {
      case 'text':
        return WatermarkEngine.applyTextWatermark(canvas, state.watermark);
      case 'image':
        return state.watermarkImage
          ? WatermarkEngine.applyImageWatermark(canvas, state.watermarkImage, state.watermark)
          : canvas;
      case 'tile-text':
        return WatermarkEngine.applyTileTextWatermark(canvas, state.watermark);
      case 'tile-image':
        return state.watermarkImage
          ? WatermarkEngine.applyTileImageWatermark(canvas, state.watermarkImage, state.watermark)
          : canvas;
      default:
        return canvas;
    }
  },

  // ========== 页码叠加 ==========

  /**
   * 在画布上叠加页码
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {number} pageNum — 当前页码
   * @param {number} totalPages — 总页数
   * @param {object} opts — { format, fontSize, color, opacity, position, offsetX, offsetY }
   * @returns {HTMLCanvasElement}
   */
  _overlayPageNumber(sourceCanvas, pageNum, totalPages, opts) {
    const canvas = WatermarkEngine._cloneCanvas(sourceCanvas);
    const ctx = canvas.getContext('2d');

    const text = (opts.format || '{page} / {total}')
      .replace(/\{page\}/g, String(pageNum))
      .replace(/\{total\}/g, String(totalPages));

    const fontSize = opts.fontSize || 30;
    const fontFamily = 'Arial, Helvetica, "Microsoft YaHei", "PingFang SC", sans-serif';
    const color = opts.color || '#333333';
    const opacity = opts.opacity != null ? opts.opacity : 0.8;

    const pos = this._getPosition(canvas.width, canvas.height, opts.position || 'bottom-center');
    const x = pos.x + (opts.offsetX || 0);
    const y = pos.y + (opts.offsetY || 0);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 半透明背景框使页码更可读
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize; // 近似值
    const padding = fontSize * 0.3;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(
      x - textWidth / 2 - padding,
      y - textHeight / 2 - padding * 0.6,
      textWidth + padding * 2,
      textHeight + padding * 1.2
    );

    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    ctx.restore();
    return canvas;
  },

  /**
   * 九宫格位置计算（与 WatermarkEngine 保持一致）
   */
  _getPosition(canvasWidth, canvasHeight, position) {
    const positions = {
      'top-left': { x: canvasWidth * 0.1, y: canvasHeight * 0.05 },
      'top-center': { x: canvasWidth / 2, y: canvasHeight * 0.05 },
      'top-right': { x: canvasWidth * 0.9, y: canvasHeight * 0.05 },
      'center-left': { x: canvasWidth * 0.1, y: canvasHeight / 2 },
      'center': { x: canvasWidth / 2, y: canvasHeight / 2 },
      'center-right': { x: canvasWidth * 0.9, y: canvasHeight / 2 },
      'bottom-left': { x: canvasWidth * 0.1, y: canvasHeight * 0.95 },
      'bottom-center': { x: canvasWidth / 2, y: canvasHeight * 0.95 },
      'bottom-right': { x: canvasWidth * 0.9, y: canvasHeight * 0.95 },
    };
    return positions[position] || positions['bottom-center'];
  },
};
