/**
 * 文档分割模块 — 将 PDF / Word 文档按页拆分为独立文件（PDF / PNG / JPEG）
 * 输出为 ZIP 包，纯客户端实现
 */

const DocumentSplitter = {
  /** 渲染分辨率倍率（用于 PDF 输出时的画质） */
  RENDER_SCALE: 2.0,

  /** PDF输出 JPEG 质量 */
  JPEG_QUALITY: 0.92,

  /**
   * 将 PDF 按页面范围分组分割，打包为 ZIP
   * @param {object} pdfDoc — PDF.js 文档对象
   * @param {string} baseName — 原始文件名
   * @param {number[][]} groups — 页面分组，如 [[1,2,3], [5,6,7]]，每组一个文件
   * @param {number[]|null} remainder — 剩余页面（可选，null 表示不生成）
   * @param {string} format — 'pdf' | 'png' | 'jpeg'
   * @param {function} [onProgress]
   */
  async splitPdf(pdfDoc, baseName, groups, remainder, format, onProgress) {
    const allGroups = remainder && remainder.length > 0
      ? [...groups, remainder]
      : groups;
    const totalGroups = allGroups.length;

    if (format === 'pdf') {
      await this._splitPdfToPdf(pdfDoc, baseName, allGroups, onProgress, totalGroups);
    } else {
      // 图片格式：每组内每页独立一张图，按组建立子文件夹
      await this._splitPdfToImages(pdfDoc, baseName, allGroups, format, onProgress, totalGroups);
    }
  },

  /**
   * PDF 按组 → 独立 PDF 文件（每组一个多页 PDF），打包 ZIP
   */
  async _splitPdfToPdf(pdfDoc, baseName, groups, onProgress, totalGroups) {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      throw new Error('jsPDF 库未加载');
    }
    const { jsPDF } = window.jspdf;
    const zip = new JSZip();
    const pxToMm = 25.4 / 72;

    for (let g = 0; g < groups.length; g++) {
      const pages = groups[g];
      if (pages.length === 0) continue;
      if (onProgress) onProgress(g + 1, totalGroups);

      // 渲染第一页确定 PDF 尺寸
      const firstPage = await pdfDoc.getPage(pages[0]);
      const firstVp = firstPage.getViewport({ scale: this.RENDER_SCALE });
      let pw = firstVp.width * pxToMm;
      let ph = firstVp.height * pxToMm;
      const orientation = pw >= ph ? 'landscape' : 'portrait';
      const doc = new jsPDF(orientation, 'mm', [pw, ph]);

      // 渲染第一页
      const canvas1 = await this._renderPage(pdfDoc, pages[0]);
      doc.addImage(canvas1.toDataURL('image/jpeg', this.JPEG_QUALITY), 'JPEG', 0, 0, pw, ph);

      // 后续页面
      for (let i = 1; i < pages.length; i++) {
        const page = await pdfDoc.getPage(pages[i]);
        const vp = page.getViewport({ scale: this.RENDER_SCALE });
        const pw2 = vp.width * pxToMm;
        const ph2 = vp.height * pxToMm;
        doc.addPage([pw2, ph2], pw2 >= ph2 ? 'landscape' : 'portrait');

        const canvas = await this._renderPage(pdfDoc, pages[i]);
        doc.addImage(canvas.toDataURL('image/jpeg', this.JPEG_QUALITY), 'JPEG', 0, 0, pw2, ph2);
      }

      const first = pages[0], last = pages[pages.length - 1];
      const label = first === last ? `p${String(first).padStart(3, '0')}`
        : `p${String(first).padStart(3, '0')}-${String(last).padStart(3, '0')}`;
      zip.file(`${baseName}_${label}.pdf`, doc.output('arraybuffer'));
    }

    await this._packageAndDownload(zip, `${baseName}_分割`, onProgress, totalGroups);
  },

  /**
   * PDF 按组 → 图片文件（每组内每页一张图，子文件夹分组），打包 ZIP
   */
  async _splitPdfToImages(pdfDoc, baseName, groups, format, onProgress, totalGroups) {
    const zip = new JSZip();
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

    for (let g = 0; g < groups.length; g++) {
      const pages = groups[g];
      if (pages.length === 0) continue;
      if (onProgress) onProgress(g + 1, totalGroups);

      const first = pages[0], last = pages[pages.length - 1];
      const folderName = first === last ? `p${String(first).padStart(3, '0')}`
        : `p${String(first).padStart(3, '0')}-${String(last).padStart(3, '0')}`;
      const folder = pages.length > 1 ? zip.folder(folderName) : null;

      for (const pageNum of pages) {
        const canvas = await this._renderPage(pdfDoc, pageNum);
        const blob = await this._canvasToBlob(canvas, mimeType);
        const pageLabel = String(pageNum).padStart(3, '0');
        const filename = `${baseName}_p${pageLabel}.${ext}`;
        if (folder) {
          folder.file(filename, blob);
        } else {
          zip.file(filename, blob);
        }
      }
    }

    await this._packageAndDownload(zip, `${baseName}_分割`, onProgress, totalGroups);
  },

  /**
   * 渲染单页 PDF 到 Canvas
   */
  async _renderPage(pdfDoc, pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  },

  /**
   * 将 Canvas 页面数组按页分割，打包 ZIP
   * @param {HTMLCanvasElement[]} canvases — 预渲染的页面 Canvas 数组（0-based）
   * @param {string} baseName — 原始文件名
   * @param {number[]} pages — 要分割的页码（1-based，对应 canvases 索引）
   * @param {string} format — 'pdf' | 'png' | 'jpeg'
   * @param {function} [onProgress]
   * @returns {Promise<void>}
   */
  async splitCanvases(canvases, baseName, pages, format, onProgress) {
    const total = pages.length;

    if (format === 'pdf') {
      await this._splitCanvasesToPdf(canvases, baseName, pages, onProgress, total);
    } else if (format === 'docx') {
      await this._splitCanvasesToDocx(canvases, baseName, pages, onProgress, total);
    } else {
      await this._splitCanvasesToImages(canvases, baseName, pages, format, onProgress, total);
    }
  },

  /**
   * Canvas 页面 → 独立 PDF，打包 ZIP
   */
  async _splitCanvasesToPdf(canvases, baseName, pages, onProgress, total) {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      throw new Error('jsPDF 库未加载');
    }
    const { jsPDF } = window.jspdf;
    const zip = new JSZip();
    const pxToMm = 25.4 / 96; // 96dpi → mm

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      const canvas = canvases[pageNum - 1];
      if (!canvas) continue;

      if (onProgress) onProgress(i + 1, total);

      const pw = canvas.width * pxToMm;
      const ph = canvas.height * pxToMm;
      const orientation = pw >= ph ? 'landscape' : 'portrait';
      const doc = new jsPDF(orientation, 'mm', [pw, ph]);

      const imgData = canvas.toDataURL('image/jpeg', this.JPEG_QUALITY);
      doc.addImage(imgData, 'JPEG', 0, 0, pw, ph);

      const pdfBytes = doc.output('arraybuffer');
      const pageLabel = String(pageNum).padStart(3, '0');
      zip.file(`${baseName}_p${pageLabel}.pdf`, pdfBytes);
    }

    await this._packageAndDownload(zip, `${baseName}_分割`, onProgress, total);
  },

  /**
   * Canvas 页面 → 独立图片，打包 ZIP
   */
  async _splitCanvasesToImages(canvases, baseName, pages, format, onProgress, total) {
    const zip = new JSZip();
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      const canvas = canvases[pageNum - 1];
      if (!canvas) continue;

      if (onProgress) onProgress(i + 1, total);

      const blob = await this._canvasToBlob(canvas, mimeType);
      const pageLabel = String(pageNum).padStart(3, '0');
      zip.file(`${baseName}_p${pageLabel}.${ext}`, blob);
    }

    await this._packageAndDownload(zip, `${baseName}_分割`, onProgress, total);
  },

  /**
   * Canvas 页面 → 独立 DOCX（图像嵌入），打包 ZIP
   * 每页作为一张全页图片嵌入 DOCX，保留视觉完整
   */
  async _splitCanvasesToDocx(canvases, baseName, pages, onProgress, total) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 库未加载');
    }

    const zip = new JSZip();

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      const canvas = canvases[pageNum - 1];
      if (!canvas) continue;

      if (onProgress) onProgress(i + 1, total);

      const pageLabel = String(pageNum).padStart(3, '0');
      const docxBlob = await this._generateDocxFromImage(canvas);
      zip.file(`${baseName}_p${pageLabel}.docx`, docxBlob);
    }

    await this._packageAndDownload(zip, `${baseName}_分割`, onProgress, total);
  },

  /**
   * 从单张 Canvas 生成含嵌入图像的 DOCX Blob
   */
  async _generateDocxFromImage(canvas) {
    // 将 Canvas 转为 JPEG blob（体积更小）
    const imgBlob = await this._canvasToBlob(canvas, 'image/jpeg');
    const imgExt = 'jpg';

    const zip = new JSZip();

    // [Content_Types].xml
    zip.file('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="${imgExt}" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    // _rels/.rels
    zip.folder('_rels').file('.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // word/_rels/document.xml.rels
    zip.folder('word').folder('_rels').file('document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.${imgExt}"/>
</Relationships>`);

    // word/media/image1.jpg
    zip.folder('word').folder('media').file(`image1.${imgExt}`, imgBlob);

    // 图像尺寸（EMU: 1px = 9525 EMU at 96dpi）
    const emuW = Math.round(canvas.width * 9525);
    const emuH = Math.round(canvas.height * 9525);

    // word/document.xml
    zip.folder('word').file('document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${emuW}" cy="${emuH}"/>
            <wp:docPr id="1" name="Picture 1"/>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="0" name="page.jpg"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="rIdImg"/>
                    <a:stretch>
                      <a:fillRect/>
                    </a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${emuW}" cy="${emuH}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect">
                      <a:avLst/>
                    </a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`);

    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  },

  /**
   * 从 HTML 片段数组生成独立 DOCX（使用 altChunk 嵌入 HTML，保留文字格式）
   * @param {string[]} pageHtmls — 每页的 HTML 字符串（0-based 索引）
   * @param {string} baseName
   * @param {number[]} pages — 要导出的页码（1-based）
   * @param {function} [onProgress]
   */
  async splitDocxFromHtml(pageHtmls, baseName, pages, onProgress) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 库未加载');
    }

    const total = pages.length;
    const zip = new JSZip();

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      const html = pageHtmls[pageNum - 1] || '<p></p>';

      if (onProgress) onProgress(i + 1, total);

      const pageLabel = String(pageNum).padStart(3, '0');
      const docxBlob = await this._generateDocxFromHtml(html, pageNum);
      zip.file(`${baseName}_p${pageLabel}.docx`, docxBlob);
    }

    await this._packageAndDownload(zip, `${baseName}_分割`, onProgress, total);
  },

  /**
   * 从 HTML 字符串生成 DOCX（altChunk 嵌入）
   */
  async _generateDocxFromHtml(html, pageNum) {
    const zip = new JSZip();

    // 包装为完整 HTML 文档
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: 'SimSun','Microsoft YaHei','PingFang SC',sans-serif; font-size: 15px; line-height: 1.8; color: #1e293b; margin: 0; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 4px 8px; }
  img { max-width: 100%; height: auto; }
</style></head>
<body>${html}</body></html>`;

    // [Content_Types].xml
    zip.file('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="htm" ContentType="text/html"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    // _rels/.rels
    zip.folder('_rels').file('.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // word/_rels/document.xml.rels — 指向 HTML 块
    zip.folder('word').folder('_rels').file('document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdHtml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="content.htm"/>
</Relationships>`);

    // word/content.htm — 每页的 HTML 内容
    zip.folder('word').file('content.htm', fullHtml);

    // word/document.xml — 使用 altChunk 引用 HTML
    zip.folder('word').file('document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="rIdHtml"/>
  </w:body>
</w:document>`);

    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  },

  /**
   * 打包 ZIP 并触发下载
   */
  async _packageAndDownload(zip, zipName, onProgress, total) {
    if (onProgress) onProgress(total, total);

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${zipName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  /**
   * Canvas → Blob（带超时保护）
   */
  _canvasToBlob(canvas, mimeType) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          const dataUrl = canvas.toDataURL(mimeType, 0.92);
          const binary = atob(dataUrl.split(',')[1]);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
          resolve(new Blob([arr], { type: mimeType }));
        } catch (e) {
          reject(new Error('Canvas 转 Blob 超时: ' + e.message));
        }
      }, 15000);

      try {
        canvas.toBlob((blob) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          blob ? resolve(blob) : reject(new Error('toBlob 返回空'));
        }, mimeType, 0.92);
      } catch (e) {
        clearTimeout(timeout);
        if (!settled) { settled = true; reject(e); }
      }
    });
  },
};
