/**
 * Markitdown 转换模块 — 将任意文件/URL 转换为 Markdown
 * 通过后端 Flask API 调用 Markitdown 库
 */

const MarkitdownConverter = {
  /** 当前转换结果 */
  resultMarkdown: '',
  resultTitle: '',

  init() {
    this._bindDropZone();
    this._bindUrlInput();
    this._bindButtons();
  },

  // ========== 拖拽区域 ==========
  _bindDropZone() {
    const dropZone = document.getElementById('md-drop-zone');
    const fileInput = document.getElementById('md-file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        this._convertFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this._convertFile(e.target.files[0]);
      }
    });
  },

  // ========== URL 输入 ==========
  _bindUrlInput() {
    const input = document.getElementById('md-url-input');
    const btn = document.getElementById('md-url-btn');

    btn.addEventListener('click', () => {
      const url = input.value.trim();
      if (!url) return;
      this._convertUrl(url);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = input.value.trim();
        if (!url) return;
        this._convertUrl(url);
      }
    });
  },

  // ========== 按钮 ==========
  _bindButtons() {
    document.getElementById('md-copy-btn').addEventListener('click', () => this._copyResult());
    document.getElementById('md-download-btn').addEventListener('click', () => this._downloadResult());
    document.getElementById('md-clear-btn').addEventListener('click', () => this._clearResult());
    document.getElementById('md-toggle-view').addEventListener('click', () => this._toggleView());
  },

  // ========== 文件转换（带进度条） ==========
  async _convertFile(file) {
    const dropZone = document.getElementById('md-drop-zone');
    dropZone.querySelector('.md-file-name').textContent = file.name;
    dropZone.querySelector('.md-file-size').textContent = this._formatSize(file.size);

    this._showMdProgress('正在上传...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Use XHR for upload progress
      const resp = await this._xhrUpload('/api/convert/file', formData);
      const data = JSON.parse(resp);
      if (data.success) {
        this._showResult(data);
      } else {
        this._showError(data.error || '转换失败');
      }
    } catch (err) {
      this._showError(`请求失败: ${err.message}`);
    } finally {
      this._hideMdProgress();
    }
  },

  /** XHR upload with progress tracking */
  _xhrUpload(url, formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 90); // 90% for upload, rest for server
          this._setMdProgress(pct, `上传中 ${this._formatSize(e.loaded)} / ${this._formatSize(e.total)}`);
        } else {
          this._setMdProgressIndeterminate('上传中...');
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          this._setMdProgress(95, '服务器处理中...');
          resolve(xhr.responseText);
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('网络错误')));
      xhr.send(formData);
    });
  },

  // ========== URL 转换（带进度条） ==========
  async _convertUrl(url) {
    this._showUrlProgress('正在抓取并转换...');

    try {
      const resp = await fetch('/api/convert/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      if (data.success) {
        this._showResult(data);
      } else {
        this._showError(data.error || '转换失败');
      }
    } catch (err) {
      this._showError(`请求失败: ${err.message}`);
    } finally {
      this._hideUrlProgress();
    }
  },

  // ========== 结果显示 ==========
  _showResult(data) {
    this.resultMarkdown = data.markdown;
    this.resultTitle = data.title || '';

    // Show title & source type badge
    document.getElementById('md-result-title').textContent = data.title || '转换结果';
    const badge = document.getElementById('md-source-badge');
    badge.textContent = data.source_type || '';
    badge.style.display = data.source_type ? 'inline-block' : 'none';

    // Set source text
    document.getElementById('md-source-text').textContent = data.markdown;

    // Render markdown preview
    this._renderPreview(data.markdown);

    // Show result panel, hide empty state
    document.getElementById('md-result-empty').style.display = 'none';
    document.getElementById('md-result-content').style.display = '';

    // Default to preview view
    document.getElementById('md-source-view').style.display = 'none';
    document.getElementById('md-preview-view').style.display = '';
    document.getElementById('md-toggle-view').textContent = '查看源码';

    // Scroll result into view
    document.getElementById('md-result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _renderPreview(markdown) {
    const preview = document.getElementById('md-preview-view');
    preview.innerHTML = this._markdownToHtml(markdown);
  },

  /** Built-in markdown-to-HTML renderer, no external dependencies */
  _markdownToHtml(md) {
    // Escape HTML first
    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Code blocks (must be before other rules)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return '<pre><code class="language-' + lang + '">' + code.trim() + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headings
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Images (before links)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^\*\*\*$/gm, '<hr>');

    // Unordered lists
    html = html.replace(/^(\s*)[-*] (.+)$/gm, '<li>$2</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Paragraphs (double newlines)
    html = html.replace(/\n\n+/g, '</p><p>');

    // Single newlines → <br> (within paragraphs)
    html = html.replace(/\n/g, '<br>');

    // Clean up empty tags
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');

    return '<p>' + html + '</p>';
  },

  _showError(msg) {
    document.getElementById('md-result-empty').style.display = '';
    document.getElementById('md-result-content').style.display = 'none';
    const emptyEl = document.getElementById('md-result-empty');
    emptyEl.innerHTML = `
      <svg class="md-empty-icon error" aria-hidden="true"><use href="#icon-x"/></svg>
      <p class="md-empty-text error">${this._escapeHtml(msg)}</p>
    `;
  },

  _clearResult() {
    this.resultMarkdown = '';
    this.resultTitle = '';
    document.getElementById('md-result-empty').style.display = '';
    document.getElementById('md-result-content').style.display = 'none';
    document.getElementById('md-result-empty').innerHTML = `
      <svg class="md-empty-icon" aria-hidden="true"><use href="#icon-file-text"/></svg>
      <p class="md-empty-text">上传文件或输入 URL 开始转换</p>
      <p class="md-empty-hint">支持 PDF · DOCX · XLSX · PPTX · 图片 · 音频 · HTML · CSV · EPUB 等格式</p>
    `;
    document.getElementById('md-url-input').value = '';
    const dropZone = document.getElementById('md-drop-zone');
    dropZone.querySelector('.md-file-name').textContent = '';
    dropZone.querySelector('.md-file-size').textContent = '';
  },

  // ========== 视图切换 ==========
  _toggleView() {
    const sourceView = document.getElementById('md-source-view');
    const previewView = document.getElementById('md-preview-view');
    const btn = document.getElementById('md-toggle-view');

    if (sourceView.style.display === 'none') {
      sourceView.style.display = '';
      previewView.style.display = 'none';
      btn.textContent = '查看预览';
    } else {
      sourceView.style.display = 'none';
      previewView.style.display = '';
      btn.textContent = '查看源码';
    }
  },

  // ========== 复制 ==========
  async _copyResult() {
    if (!this.resultMarkdown) return;
    try {
      await navigator.clipboard.writeText(this.resultMarkdown);
      this._flashButton('md-copy-btn', '已复制!');
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = this.resultMarkdown;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this._flashButton('md-copy-btn', '已复制!');
    }
  },

  // ========== 下载 ==========
  _downloadResult() {
    if (!this.resultMarkdown) return;
    const filename = (this.resultTitle || 'converted').replace(/[<>:"/\\|?*]/g, '_') + '.md';
    const blob = new Blob([this.resultMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this._flashButton('md-download-btn', '已下载!');
  },

  // ========== 辅助方法 ==========

  // ── 文件转换进度条 ──
  _showMdProgress(label) {
    const el = document.getElementById('md-progress');
    el.classList.add('visible');
    document.getElementById('md-progress-label').textContent = label;
    this._setMdProgress(0, label);
  },
  _setMdProgress(pct, label) {
    document.getElementById('md-progress-fill').style.width = pct + '%';
    document.getElementById('md-progress-fill').classList.remove('indeterminate');
    document.getElementById('md-progress-pct').textContent = Math.round(pct) + '%';
    if (label) document.getElementById('md-progress-label').textContent = label;
  },
  _setMdProgressIndeterminate(label) {
    document.getElementById('md-progress-fill').classList.add('indeterminate');
    document.getElementById('md-progress-pct').textContent = '';
    document.getElementById('md-progress-label').textContent = label;
  },
  _hideMdProgress() {
    document.getElementById('md-progress').classList.remove('visible');
    document.getElementById('md-progress-fill').classList.remove('indeterminate');
    document.getElementById('md-progress-fill').style.width = '0%';
  },

  // ── URL 转换进度条 ──
  _showUrlProgress(label) {
    const el = document.getElementById('md-url-progress');
    el.classList.add('visible');
    document.getElementById('md-url-progress-fill').classList.add('indeterminate');
    document.getElementById('md-url-progress-label').textContent = label;
  },
  _hideUrlProgress() {
    document.getElementById('md-url-progress').classList.remove('visible');
    document.getElementById('md-url-progress-fill').classList.remove('indeterminate');
  },

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _flashButton(id, text) {
    const btn = document.getElementById(id);
    const original = btn.textContent;
    btn.textContent = text;
    btn.classList.add('md-flash');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('md-flash');
    }, 1500);
  },
};
