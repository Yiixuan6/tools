/**
 * 水印引擎模块 — 文字水印、图片水印、平铺水印叠加渲染
 */

const WatermarkEngine = {
  /**
   * 默认水印配置
   */
  defaults: {
    text: '机密文件',
    fontSize: 45,
    fontFamily: 'Arial, sans-serif',
    color: '#000000',
    opacity: 0.3,
    rotation: 45,
    position: 'center', // 'top-left'|'top-center'|'top-right'|'center-left'|'center'|'center-right'|'bottom-left'|'bottom-center'|'bottom-right'
    offsetX: 0,
    offsetY: 0,
    // 图片水印
    imageScale: 0.3,
    // 平铺模式
    tileGapX: 200,
    tileGapY: 200,
  },

  /**
   * 在源 Canvas 上叠加文字水印，返回新的 Canvas
   * @param {HTMLCanvasElement} sourceCanvas - 源画布
   * @param {object} options - 水印选项
   * @returns {HTMLCanvasElement}
   */
  applyTextWatermark(sourceCanvas, options) {
    const opts = { ...this.defaults, ...options };
    const result = this._cloneCanvas(sourceCanvas);
    const ctx = result.getContext('2d');

    const pos = this._getPosition(sourceCanvas.width, sourceCanvas.height, opts);
    const x = pos.x + opts.offsetX;
    const y = pos.y + opts.offsetY;

    ctx.save();
    ctx.globalAlpha = opts.opacity;
    ctx.fillStyle = opts.color;
    ctx.font = `${opts.fontSize}px ${opts.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 旋转
    ctx.translate(x, y);
    ctx.rotate((opts.rotation * Math.PI) / 180);
    ctx.fillText(opts.text, 0, 0);

    ctx.restore();
    return result;
  },

  /**
   * 在源 Canvas 上叠加图片水印
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {HTMLImageElement} watermarkImage - 水印图片
   * @param {object} options
   * @returns {HTMLCanvasElement}
   */
  applyImageWatermark(sourceCanvas, watermarkImage, options) {
    const opts = { ...this.defaults, ...options };
    const result = this._cloneCanvas(sourceCanvas);
    const ctx = result.getContext('2');

    const imgW = watermarkImage.width * opts.imageScale;
    const imgH = watermarkImage.height * opts.imageScale;
    const pos = this._getPosition(sourceCanvas.width, sourceCanvas.height, opts);
    const x = pos.x - imgW / 2 + opts.offsetX;
    const y = pos.y - imgH / 2 + opts.offsetY;

    ctx.save();
    ctx.globalAlpha = opts.opacity;
    ctx.drawImage(watermarkImage, x, y, imgW, imgH);
    ctx.restore();

    return result;
  },

  /**
   * 在源 Canvas 上平铺文字水印
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {object} options
   * @returns {HTMLCanvasElement}
   */
  applyTileTextWatermark(sourceCanvas, options) {
    const opts = { ...this.defaults, ...options };
    const result = this._cloneCanvas(sourceCanvas);
    const ctx = result.getContext('2');

    ctx.save();
    ctx.globalAlpha = opts.opacity;
    ctx.fillStyle = opts.color;
    ctx.font = `${opts.fontSize}px ${opts.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    // 计算文字宽度用于间距
    const metrics = ctx.measureText(opts.text);
    const textWidth = metrics.width;
    const stepX = textWidth + opts.tileGapX;
    const stepY = opts.fontSize + opts.tileGapY;

    for (let y = -h; y < h * 2; y += stepY) {
      for (let x = -w; x < w * 2; x += stepX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((opts.rotation * Math.PI) / 180);
        ctx.fillText(opts.text, 0, 0);
        ctx.restore();
      }
    }

    ctx.restore();
    return result;
  },

  /**
   * 在源 Canvas 上平铺图片水印
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {HTMLImageElement} watermarkImage
   * @param {object} options
   * @returns {HTMLCanvasElement}
   */
  applyTileImageWatermark(sourceCanvas, watermarkImage, options) {
    const opts = { ...this.defaults, ...options };
    const result = this._cloneCanvas(sourceCanvas);
    const ctx = result.getContext('2');

    const imgW = watermarkImage.width * opts.imageScale;
    const imgH = watermarkImage.height * opts.imageScale;
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    const stepX = imgW + opts.tileGapX;
    const stepY = imgH + opts.tileGapY;

    ctx.save();
    ctx.globalAlpha = opts.opacity;

    for (let y = -h; y < h * 2; y += stepY) {
      for (let x = -w; x < w * 2; x += stepX) {
        ctx.drawImage(watermarkImage, x, y, imgW, imgH);
      }
    }

    ctx.restore();
    return result;
  },

  /**
   * 九宫格位置计算
   */
  _getPosition(canvasWidth, canvasHeight, opts) {
    const positions = {
      'top-left': { x: canvasWidth * 0.1, y: canvasHeight * 0.1 },
      'top-center': { x: canvasWidth / 2, y: canvasHeight * 0.1 },
      'top-right': { x: canvasWidth * 0.9, y: canvasHeight * 0.1 },
      'center-left': { x: canvasWidth * 0.1, y: canvasHeight / 2 },
      'center': { x: canvasWidth / 2, y: canvasHeight / 2 },
      'center-right': { x: canvasWidth * 0.9, y: canvasHeight / 2 },
      'bottom-left': { x: canvasWidth * 0.1, y: canvasHeight * 0.9 },
      'bottom-center': { x: canvasWidth / 2, y: canvasHeight * 0.9 },
      'bottom-right': { x: canvasWidth * 0.9, y: canvasHeight * 0.9 },
    };
    return positions[opts.position] || positions['center'];
  },

  /**
   * 克隆 Canvas
   */
  _cloneCanvas(source) {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);
    return canvas;
  },
};
