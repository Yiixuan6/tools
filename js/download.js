/**
 * 下载导出模块 — 单页下载、全部ZIP下载
 */

const DownloadManager = {
  /**
   * 下载单个 Canvas 为图片文件
   * @param {HTMLCanvasElement} canvas - 要下载的画布
   * @param {string} filename - 文件名（不含扩展名）
   * @param {string} format - 'png' 或 'jpeg'
   * @param {number} [quality] - JPEG质量 0-1，默认0.92
   */
  async downloadPage(canvas, filename, format = 'png', quality = 0.92) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    try {
      const blob = await this._canvasToBlob(canvas, mimeType, quality);
      const url = URL.createObjectURL(blob);
      this._triggerDownload(url, `${filename}.${ext}`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('单页下载失败:', err);
      alert('下载失败：' + (err.message || '未知错误'));
    }
  },

  /**
   * 下载所有页面为 ZIP 包
   * @param {Array<{canvas: HTMLCanvasElement, pageNum: number}>} pages - 页面画布列表
   * @param {string} zipFilename - ZIP文件名
   * @param {string} format - 'png' 或 'jpeg'
   * @param {number} [quality] - JPEG质量
   * @param {function} [onProgress] - 进度回调 (current, total)
   * @returns {Promise<void>}
   */
  async downloadAllAsZip(pages, zipFilename, format = 'png', quality = 0.92, onProgress) {
    const zip = new JSZip();
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

    for (let i = 0; i < pages.length; i++) {
      const { canvas, pageNum } = pages[i];
      const blob = await this._canvasToBlob(canvas, mimeType, quality);
      const pageLabel = String(pageNum).padStart(3, '0');
      zip.file(`page_${pageLabel}.${ext}`, blob);

      if (onProgress) {
        onProgress(i + 1, pages.length);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    this._triggerDownload(url, `${zipFilename}.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Canvas 转 Blob
   * @param {HTMLCanvasElement} canvas
   * @param {string} mimeType
   * @param {number} quality
   * @returns {Promise<Blob>}
   */
  _canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      let settled = false;
      // 超时保护：大画布 toBlob 可能卡住
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        // 回退到 toDataURL
        try {
          const dataUrl = canvas.toDataURL(mimeType, quality);
          const binary = atob(dataUrl.split(',')[1]);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
          resolve(new Blob([arr], { type: mimeType }));
        } catch (e) {
          reject(new Error('Canvas 转 Blob 超时且回退失败: ' + e.message));
        }
      }, 15000);

      try {
        canvas.toBlob(
          (blob) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('toBlob 返回空结果'));
            }
          },
          mimeType,
          quality
        );
      } catch (e) {
        clearTimeout(timeout);
        if (!settled) { settled = true; reject(e); }
      }
    });
  },

  /**
   * 下载所有页面为 PDF 文件
   * @param {Array<{canvas: HTMLCanvasElement, pageNum: number}>} pages - 页面画布列表
   * @param {string} pdfFilename - PDF文件名（不含扩展名）
   * @param {function} [onProgress] - 进度回调 (current, total)
   * @returns {Promise<void>}
   */
  async downloadAllAsPdf(pages, pdfFilename, onProgress) {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      throw new Error('jsPDF 库未加载');
    }
    const { jsPDF } = window.jspdf;

    // 用第一页的尺寸作为 PDF 页面尺寸（px → mm，72dpi 映射）
    const firstCanvas = pages[0].canvas;
    const pxToMm = 25.4 / 96; // 96dpi → mm
    const pageW = firstCanvas.width * pxToMm;
    const pageH = firstCanvas.height * pxToMm;

    // 创建 PDF（横向/纵向自动判断）
    const orientation = pageW >= pageH ? 'landscape' : 'portrait';
    const doc = new jsPDF(orientation, 'mm', [pageW, pageH]);

    for (let i = 0; i < pages.length; i++) {
      const { canvas } = pages[i];

      if (i > 0) {
        // 后续页面可能与首页尺寸不同，按需调整
        const pw = canvas.width * pxToMm;
        const ph = canvas.height * pxToMm;
        doc.addPage([pw, ph], pw >= ph ? 'landscape' : 'portrait');
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(imgData, 'JPEG', 0, 0, canvas.width * pxToMm, canvas.height * pxToMm);

      if (onProgress) {
        onProgress(i + 1, pages.length);
      }
    }

    doc.save(`${pdfFilename}.pdf`);
  },

  /**
   * 触发浏览器下载
   */
  _triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};
