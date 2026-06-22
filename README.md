# PDF 工具箱

> 转换 · 水印 · 分割 · 裁剪 — 一个纯前端的 PDF 处理工具，配合 Python 后端实现全格式转换。

## 功能概览

### PDF 处理
- **添加水印** — 文字水印 / 图片水印，支持旋转、透明度、平铺、自定义位置
- **分割 PDF** — 按页数或自定义页码范围拆分
- **页边距裁剪** — 手动裁剪或自动白边检测
- **自定义尺寸** — 调整输出尺寸，支持保持宽高比
- **页码叠加** — 自定义格式、位置、字体大小和颜色
- **PDF 转图片** — 导出为 PNG（可调质量）

### Word 文档
- **.doc → .docx** — 通过 LibreOffice 将旧格式转为新格式
- **Word → PDF** — 基于 LibreOffice 转换，保留全部排版格式
- **PDF → Word** — 提取 PDF 文本和图片到 Word 文档（jsPDF 实现）
- **文件转 Markdown** — 支持 30+ 格式（docx/pptx/xlsx/pdf/html/csv/json/xml/zip 等），基于 MarkItDown

### 图片处理
- **照片拼接** — 多图纵向或网格拼接
- **图片裁剪** — 可视化的自由裁剪工具

### 小工具
- **数字工具** — 数字转大写中文金额

## 项目结构

```
├── index.html              # 主页面
├── server.py               # Python Flask 后端
├── 启动.bat                 # Windows 一键启动脚本
├── css/
│   └── style.css           # 样式
├── js/
│   ├── app.js              # 主控制器（状态管理、事件绑定）
│   ├── download.js         # 下载逻辑
│   ├── watermark.js        # 水印渲染
│   ├── page-processor.js   # 页码叠加、裁剪、缩放
│   ├── pdf-renderer.js     # PDF 预览渲染（pdf.js）
│   ├── pdf-to-word.js      # PDF → Word 转换
│   ├── picture-cut.js      # 图片裁剪
│   ├── document-splitter.js # PDF 分割
│   ├── number-tool.js      # 数字工具
│   └── markitdown-converter.js  # Markitdown 格式转换（前端）
└── lib/
    ├── pdf.min.js          # pdf.js
    ├── pdf.worker.min.js   # pdf.js Worker
    ├── jspdf.umd.min.js    # jsPDF
    ├── jszip.min.js        # JSZip
    └── cmaps/              # pdf.js 字符映射
```

## 环境要求

| 依赖 | 用途 | 安装方式 |
|---|---|---|
| **Python 3.10+** | 后端服务 | [python.org](https://python.org) |
| **LibreOffice**（可选） | .doc → .docx / Word → PDF | `scoop install libreoffice` |

如需完整格式转换功能，还需安装 Python 依赖：

```bash
pip install flask markitdown
```

## 快速开始

### Windows

双击 `启动.bat` 或运行：

```bash
python server.py 60000
```

浏览器会自动打开 `http://localhost:60000`。

### 其他平台

```bash
python server.py              # 默认端口 60000，启动后可手动输入端口
python server.py 8000         # 指定端口 8000
```

---

### 工作流程

1. 选择功能分类（PDF 处理 / Word 文档 / 图片处理 / 小工具）
2. 上传文件或输入内容
3. 调整参数（水印、页码、裁剪等）——**左侧实时预览**
4. 点击下载按钮，导出处理后的文件

### 关键特性

- **批量处理**：支持上传多个 PDF，统一设置后逐一导出
- **实时预览**：所有参数调整在左侧 PDF 预览中即时生效
- **纯前端渲染**：PDF 水印、页码、裁剪等处理完全在浏览器中完成，文件不上传服务器
- **自动退出**：关闭浏览器标签页后，后端服务自动停止
- **LibreOffice 自动检测**：启动时自动查找系统中安装的 LibreOffice

## 后端 API

| 端点 | 方法 | 说明 |
|---|---|---|
| `/` | GET | 主页面 |
| `/heartbeat` | GET | 前端心跳检测 |
| `/shutdown` | GET | 关闭后端服务 |
| `/api/lo/status` | GET | LibreOffice 状态查询 |
| `/api/convert/doc-to-docx` | POST | .doc → .docx（需要 LibreOffice） |
| `/api/convert/docx-to-pdf` | POST | .docx → PDF（需要 LibreOffice） |
| `/api/convert/file` | POST | 文件 → Markdown（MarkItDown） |
| `/api/convert/url` | POST | URL → Markdown（MarkItDown） |

## 技术栈

**前端**：HTML5 Canvas · pdf.js · jsPDF · JSZip  
**后端**：Python Flask · MarkItDown · LibreOffice（headless）  
**设计**：Inter 字体 · SVG 图标 · CSS 自定义属性

## 许可证

MIT
