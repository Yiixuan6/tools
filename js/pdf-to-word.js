/**
 * PDF → Word 转换模块 — 使用 PDF.js 提取文本 + JSZip 生成 .docx (OOXML)
 * 纯客户端实现，保留基本格式（字号、加粗、段落结构）
 */

const PdfToWord = {
  /** Y 坐标容差（pt），小于此值视为同一行 */
  LINE_Y_TOLERANCE: 4,

  /** 段落间距阈值：两行间距超过此行高的倍数则分段 */
  PARAGRAPH_GAP_RATIO: 1.5,

  /** 默认正文字号（pt），用于无字号信息时的回退 */
  DEFAULT_FONT_SIZE: 12,

  /**
   * 将 PDF 文档转换为 DOCX Blob
   * @param {object} pdfDoc — PDF.js 加载后的文档对象
   * @param {object} [options]
   * @param {number[]} [options.pages] — 要转换的页码数组（1-based），默认全部
   * @param {function} [options.onProgress] — 进度回调 (current, total)
   * @returns {Promise<Blob>} — DOCX 文件的 Blob
   */
  async convert(pdfDoc, options = {}) {
    const totalPages = pdfDoc.numPages;
    const pages = options.pages || Array.from({ length: totalPages }, (_, i) => i + 1);
    const allParagraphs = [];
    const pageInfos = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      if (options.onProgress) {
        options.onProgress(i + 1, pages.length);
      }

      const page = await pdfDoc.getPage(pageNum);
      const textItems = await this._extractTextFromPage(page);
      const paragraphs = this._groupIntoParagraphs(textItems, pageNum);

      if (paragraphs.length > 0) {
        // 在每页开头添加分页标记（第一页除外）
        if (pageNum > 1) {
          paragraphs.unshift({ type: 'pageBreak' });
        }
        allParagraphs.push(...paragraphs);
      }

      const viewport = page.getViewport({ scale: 1 });
      pageInfos.push({ pageNum, width: viewport.width, height: viewport.height });
    }

    const blob = await this._buildDocx(allParagraphs, pageInfos);
    return blob;
  },

  /**
   * 从单页 PDF 提取文本项
   * @returns {Promise<Array<{str, x, y, fontSize, fontName, isBold}>>}
   */
  async _extractTextFromPage(page) {
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const items = [];

    for (const item of textContent.items) {
      if (!item.str || item.str.trim().length === 0) continue;

      // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const transform = item.transform;
      const x = transform[4]; // translateX
      const y = transform[5]; // translateY

      // 字号从 transform[0]（scaleX）或 height 推算
      // pdf.js 返回的 height 是文本高度（pt），transform[0] 也近似等于字号
      let fontSize = item.height || Math.abs(transform[0]);
      // 有些 PDF 的 height 非常小或异常大，做合理限制
      if (fontSize < 4 || fontSize > 200) {
        fontSize = this.DEFAULT_FONT_SIZE;
      }

      // 检测加粗：字体名含 Bold/Heavy/Black
      const fontName = item.fontName || '';
      const isBold = /bold|heavy|black|粗/i.test(fontName);

      items.push({
        str: item.str,
        x: x,
        y: y,
        fontSize: Math.round(fontSize * 10) / 10,
        fontName: fontName,
        isBold: isBold,
      });
    }

    return items;
  },

  /**
   * 将文本项分组为行 → 段落
   * @returns {Array<{type: 'paragraph', runs: Array, pageNum: number}>}
   */
  _groupIntoParagraphs(textItems, pageNum) {
    if (textItems.length === 0) return [];

    // 1. 按 y 坐标分组为行 (考虑多栏布局: 先按 x 粗略分栏再分组)
    const lines = this._groupIntoLines(textItems);

    // 2. 每行内按 x 排序
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
    }

    // 3. 按 y 排序所有行
    lines.sort((a, b) => a.midY - b.midY);

    // 4. 合并相邻行为段落
    const paragraphs = this._linesToParagraphs(lines, pageNum);

    return paragraphs;
  },

  /**
   * 按 y 坐标分组为行
   */
  _groupIntoLines(textItems) {
    // 先按 y 坐标排序
    const sorted = [...textItems].sort((a, b) => a.y - b.y);
    if (sorted.length === 0) return [];

    const lines = [];
    let currentLine = { items: [sorted[0]], midY: sorted[0].y };

    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      // 检查 y 是否接近当前行
      if (Math.abs(item.y - currentLine.midY) <= this.LINE_Y_TOLERANCE) {
        currentLine.items.push(item);
        // 更新中线为加权平均
        const totalY = currentLine.items.reduce((sum, it) => sum + it.y, 0);
        currentLine.midY = totalY / currentLine.items.length;
      } else {
        lines.push(currentLine);
        currentLine = { items: [item], midY: item.y };
      }
    }
    lines.push(currentLine);

    return lines;
  },

  /**
   * 将行合并为段落：间距超过阈值则分段
   */
  _linesToParagraphs(lines, pageNum) {
    if (lines.length === 0) return [];

    const paragraphs = [];
    let currentPara = [lines[0]];

    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currLine = lines[i];

      // 计算行间距
      const gap = currLine.midY - prevLine.midY;

      // 估算上一行的字号
      const prevFontSize = Math.max(
        ...prevLine.items.map((it) => it.fontSize),
        this.DEFAULT_FONT_SIZE
      );

      // 如果间距超过行高的 PARAGRAPH_GAP_RATIO 倍，则分段
      if (gap > prevFontSize * this.PARAGRAPH_GAP_RATIO) {
        paragraphs.push(this._buildParagraph(currentPara, pageNum));
        currentPara = [currLine];
      } else {
        currentPara.push(currLine);
      }
    }

    // 最后一个段落
    if (currentPara.length > 0) {
      paragraphs.push(this._buildParagraph(currentPara, pageNum));
    }

    return paragraphs;
  },

  /**
   * 将多行构建为一个段落对象
   */
  _buildParagraph(lines, pageNum) {
    const runs = [];

    for (const line of lines) {
      // 每行开始检查是否需要换行
      if (runs.length > 0) {
        runs.push({ type: 'lineBreak' });
      }

      for (const item of line.items) {
        runs.push({
          type: 'text',
          str: item.str,
          fontSize: item.fontSize,
          isBold: item.isBold,
        });
      }
    }

    return { type: 'paragraph', runs, pageNum };
  },

  // ========== DOCX 生成 ==========

  /**
   * 用 JSZip 构建 OOXML 包
   */
  async _buildDocx(paragraphs, pageInfos) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 库未加载，无法生成 DOCX 文件');
    }

    const zip = new JSZip();

    // [Content_Types].xml
    zip.file('[Content_Types].xml', this._generateContentTypesXml());

    // _rels/.rels
    zip.folder('_rels').file('.rels', this._generateRootRelsXml());

    // word/document.xml
    zip.folder('word').file('document.xml', this._generateDocumentXml(paragraphs));

    // word/_rels/document.xml.rels
    zip.folder('word').folder('_rels').file('document.xml.rels', this._generateDocumentRelsXml());

    // 生成 blob
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    });

    return blob;
  },

  /**
   * 生成 [Content_Types].xml
   */
  _generateContentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  },

  /**
   * 生成 _rels/.rels
   */
  _generateRootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  },

  /**
   * 生成 word/_rels/document.xml.rels
   */
  _generateDocumentRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
  },

  /**
   * 生成 word/document.xml — 核心文档内容
   */
  _generateDocumentXml(paragraphs) {
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const nsR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

    let bodyXml = '';

    for (const para of paragraphs) {
      if (para.type === 'pageBreak') {
        // 分页符
        bodyXml += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n';
        continue;
      }

      bodyXml += '<w:p><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr>';

      for (const run of para.runs) {
        if (run.type === 'lineBreak') {
          bodyXml += '<w:r><w:br/></w:r>';
          continue;
        }

        // 文本运行
        const fontSizeHalfPt = Math.round((run.fontSize || this.DEFAULT_FONT_SIZE) * 2);

        bodyXml += '<w:r><w:rPr>';
        bodyXml += `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/>`;
        bodyXml += `<w:sz w:val="${fontSizeHalfPt}"/>`;
        bodyXml += `<w:szCs w:val="${fontSizeHalfPt}"/>`;
        if (run.isBold) {
          bodyXml += '<w:b/><w:bCs/>';
        }
        bodyXml += '</w:rPr>';
        bodyXml += `<w:t xml:space="preserve">${this._escapeXml(run.str)}</w:t></w:r>`;
      }

      bodyXml += '</w:p>\n';
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${ns} ${nsR}>
  <w:body>
${bodyXml}  </w:body>
</w:document>`;
  },

  /**
   * XML 转义
   */
  _escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },
};
