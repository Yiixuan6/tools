"""
Markitdown PDF Toolbox Server
PDF Toolbox server — static files + Markitdown + LibreOffice API
Usage: python server.py [port]
"""
import sys
import os
import time
import shutil
import threading
import tempfile
import subprocess
import webbrowser
from pathlib import Path
from datetime import datetime

# ── Config ──────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.absolute()
DEFAULT_PORT = 60000

# Add vendor directory to sys.path for bundled dependencies (markitdown)
sys.path.insert(0, str(ROOT_DIR / 'vendor'))

from flask import Flask, request, jsonify, send_from_directory, send_file
from markitdown import MarkItDown

# ── LibreOffice detection ───────────────────────────────
_soffice_path = None

# 1. Try vendor/ bundle (project-local portable LibreOffice)
_vendor_lo = ROOT_DIR / 'vendor' / 'libreoffice' / 'program' / 'soffice.exe'
if _vendor_lo.is_file():
    _soffice_path = str(_vendor_lo)

# 2. Try PATH (shim or direct install)
if not _soffice_path:
    candidate = shutil.which('soffice') or shutil.which('libreoffice')
    if candidate and os.path.isfile(candidate):
        _soffice_path = candidate

# 3. Search scoop apps directory
if not _soffice_path:
    scoop_base = os.path.expandvars(r'%USERPROFILE%\scoop\apps\libreoffice')
    if os.path.isdir(scoop_base):
        # Find the latest version directory
        versions = sorted(
            [d for d in os.listdir(scoop_base) if os.path.isdir(os.path.join(scoop_base, d))],
            reverse=True
        )
        for ver in versions:
            exe = os.path.join(scoop_base, ver, 'LibreOffice', 'program', 'soffice.exe')
            if os.path.isfile(exe):
                _soffice_path = exe
                break

if _soffice_path:
    try:
        result = subprocess.run([_soffice_path, '--version'], capture_output=True, text=True, timeout=5)
        _soffice_version = result.stdout.strip().split('\n')[0] if result.returncode == 0 else 'unknown'
    except Exception:
        _soffice_version = 'detected'
    _soffice_available = True
else:
    _soffice_version = None
    _soffice_available = False

# ── Color helpers for terminal logging ───────────────────
class Colors:
    RESET = '\033[0m'
    DARK_GRAY = '\033[90m'
    GREEN = '\033[92m'
    CYAN = '\033[96m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    WHITE = '\033[97m'

def log_request(method, path, status, ms):
    """Color-coded request logging, matching the PowerShell style"""
    time_str = datetime.now().strftime('%H:%M:%S')
    method_disp = method.ljust(6)
    path_disp = path[:26].ljust(26)
    status_str = f"{status:>3}"

    if status < 300:
        status_color = Colors.GREEN
    elif status < 400:
        status_color = Colors.CYAN
    elif status < 500:
        status_color = Colors.YELLOW
    else:
        status_color = Colors.RED

    print(f"  {Colors.DARK_GRAY}{time_str}{Colors.RESET}  "
          f"{Colors.CYAN}{method_disp}{Colors.RESET}"
          f"{Colors.WHITE}{path_disp}{Colors.RESET}"
          f"{status_color}{status_str}{Colors.RESET}"
          f"{Colors.DARK_GRAY}{ms:>5}ms{Colors.RESET}")


# ── App setup ───────────────────────────────────────────
app = Flask(__name__, static_folder=str(ROOT_DIR), static_url_path='')

# Disable Flask's default request log; we log ourselves
import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# Initialize MarkItDown (lazy — first conversion)
_md_instance = None

def get_md():
    global _md_instance
    if _md_instance is None:
        _md_instance = MarkItDown()
    return _md_instance


# ── Static file serving ─────────────────────────────────
@app.route('/')
def index():
    """Serve index.html"""
    return send_from_directory(str(ROOT_DIR), 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve all static files (css, js, lib, etc.)"""
    file_path = ROOT_DIR / filename
    if file_path.is_file():
        return send_from_directory(str(ROOT_DIR), filename)
    return jsonify({"error": "Not found"}), 404


# ── Heartbeat & Shutdown ────────────────────────────────
_last_heartbeat = time.time()
_shutdown_flag = False
HEARTBEAT_TIMEOUT = 8  # seconds, matching original PowerShell behavior

@app.route('/heartbeat')
def heartbeat():
    """Heartbeat endpoint for frontend liveness check"""
    global _last_heartbeat
    _last_heartbeat = time.time()
    return '', 200

@app.route('/shutdown')
def shutdown():
    """Graceful shutdown from the browser"""
    global _shutdown_flag
    _shutdown_flag = True
    print(f"\n  {Colors.YELLOW}Shutdown requested (HTTP endpoint){Colors.RESET}")
    return '''
    <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Server Stopped</title>
    <style>body{font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F0F4FF;color:#1E293B;}
    div{text-align:center;padding:2rem;border-radius:16px;background:rgba(255,255,255,.72);backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,.08);}
    h2{color:#4F46E5;}p{color:#64748B;}</style></head>
    <body><div><h2>Server stopped</h2><p>You can close this page.</p></div></body></html>
    ''', 200


# ── LibreOffice .doc → .docx ───────────────────────────
@app.route('/api/lo/status')
def libreoffice_status():
    """Check if LibreOffice is available"""
    return jsonify({
        "available": _soffice_available,
        "path": _soffice_path,
        "version": _soffice_version,
        "hint": None if _soffice_available else "scoop install libreoffice"
    })

@app.route('/api/convert/doc-to-docx', methods=['POST'])
def convert_doc_to_docx():
    """Convert .doc to .docx using LibreOffice"""
    if not _soffice_available:
        return jsonify({"success": False, "error": "LibreOffice 未安装。请运行: scoop install libreoffice"}), 503

    if 'file' not in request.files:
        return jsonify({"success": False, "error": "未收到文件"}), 400

    file = request.files['file']
    if not file.filename or not file.filename.lower().endswith('.doc'):
        return jsonify({"success": False, "error": "仅支持 .doc 格式"}), 400

    # Create temp directory for conversion (LibreOffice writes output to same dir)
    tmp_dir = tempfile.mkdtemp()
    doc_path = os.path.join(tmp_dir, file.filename)

    try:
        file.save(doc_path)

        # Run LibreOffice conversion
        result = subprocess.run(
            [_soffice_path, '--headless', '--convert-to', 'docx', '--outdir', tmp_dir, doc_path],
            capture_output=True, text=True, timeout=60
        )

        # Find the generated .docx
        base = os.path.splitext(file.filename)[0]
        docx_path = os.path.join(tmp_dir, base + '.docx')

        if result.returncode != 0 or not os.path.exists(docx_path):
            return jsonify({
                "success": False,
                "error": f"LibreOffice 转换失败: {result.stderr or result.stdout}"
            }), 500

        return send_file(docx_path, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                         as_attachment=True, download_name=base + '.docx')

    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "转换超时（超过60秒）"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": f"转换异常: {str(e)}"}), 500
    finally:
        try:
            shutil.rmtree(tmp_dir)
        except OSError:
            pass


# ── Server-side Word → PDF (preserves all formatting) ───
@app.route('/api/convert/docx-to-pdf', methods=['POST'])
def convert_docx_to_pdf():
    """Convert .docx to PDF using LibreOffice (preserves all formatting)"""
    if not _soffice_available:
        return jsonify({"success": False, "error": "LibreOffice 未安装，无法转换 Word 文档"}), 503

    if 'file' not in request.files:
        return jsonify({"success": False, "error": "未收到文件"}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"success": False, "error": "文件名为空"}), 400

    tmp_dir = tempfile.mkdtemp()
    docx_path = os.path.join(tmp_dir, file.filename)

    try:
        file.save(docx_path)

        # LibreOffice .docx → PDF
        result = subprocess.run(
            [_soffice_path, '--headless', '--convert-to', 'pdf', '--outdir', tmp_dir, docx_path],
            capture_output=True, text=True, timeout=120
        )

        base = os.path.splitext(file.filename)[0]
        pdf_path = os.path.join(tmp_dir, base + '.pdf')

        if result.returncode != 0 or not os.path.exists(pdf_path):
            return jsonify({
                "success": False,
                "error": f"转换失败: {result.stderr or result.stdout}"
            }), 500

        return send_file(pdf_path, mimetype='application/pdf',
                         as_attachment=True, download_name=base + '.pdf')

    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "转换超时（超过120秒）"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": f"转换异常: {str(e)}"}), 500
    finally:
        try:
            shutil.rmtree(tmp_dir)
        except OSError:
            pass


# ── Markitdown API ──────────────────────────────────────
@app.route('/api/convert/file', methods=['POST'])
def convert_file():
    """Convert an uploaded file to Markdown"""
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "未收到文件"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "文件名为空"}), 400

    # Save to temp file with original extension
    suffix = Path(file.filename).suffix or ''
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        file.save(tmp_path)

    try:
        md = get_md()
        result = md.convert(tmp_path)
        return jsonify({
            "success": True,
            "markdown": str(result),
            "title": result.title or file.filename,
            "source_type": suffix.lstrip('.').upper() or "unknown"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"转换失败: {str(e)}"
        }), 500
    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.route('/api/convert/url', methods=['POST'])
def convert_url():
    """Convert a URL to Markdown"""
    data = request.get_json(silent=True)
    if not data or 'url' not in data:
        return jsonify({"success": False, "error": "未提供 URL"}), 400

    url = data['url'].strip()
    if not url:
        return jsonify({"success": False, "error": "URL 为空"}), 400

    try:
        md = get_md()
        result = md.convert(url)
        return jsonify({
            "success": True,
            "markdown": str(result),
            "title": result.title or url,
            "source_type": "URL"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"转换失败: {str(e)}"
        }), 500


# ── Request logging middleware ──────────────────────────
@app.before_request
def before_request():
    request._start_time = time.time()

@app.after_request
def after_request(response):
    elapsed = int((time.time() - request._start_time) * 1000)
    # Don't log heartbeat
    if request.path != '/heartbeat':
        log_request(request.method, request.path, response.status_code, elapsed)
    return response


# ── Banner ──────────────────────────────────────────────
def print_banner(port):
    W = 48
    dH = '═'; dV = '║'
    dTL = '╔'; dTR = '╗'
    dBL = '╚'; dBR = '╝'
    dVL = '╠'; dVR = '╣'

    top = dTL + dH * (W - 2) + dTR
    mid = dVL + dH * (W - 2) + dVR
    bot = dBL + dH * (W - 2) + dBR

    title = "PDF Toolbox"
    subtitle = "Conversion | Watermark | Split | Crop | Markitdown"
    url = f"http://localhost:{port}"

    print()
    print(f"  {Colors.CYAN}{top}{Colors.RESET}")
    print(f"  {Colors.CYAN}{dV}{' ' * (W - 2)}{dV}{Colors.RESET}")
    tp = (W - 2 - len(title)) // 2
    tr_pad = W - 2 - tp - len(title)
    print(f"  {Colors.CYAN}{dV}{' ' * tp}{Colors.RESET}{Colors.CYAN}{title}{Colors.RESET}{' ' * tr_pad}{Colors.CYAN}{dV}{Colors.RESET}")
    sp = (W - 2 - len(subtitle)) // 2
    sr_pad = W - 2 - sp - len(subtitle)
    print(f"  {Colors.CYAN}{dV}{' ' * sp}{Colors.RESET}{Colors.DARK_GRAY}{subtitle}{Colors.RESET}{' ' * sr_pad}{Colors.CYAN}{dV}{Colors.RESET}")
    print(f"  {Colors.CYAN}{dV}{' ' * (W - 2)}{dV}{Colors.RESET}")
    print(f"  {Colors.CYAN}{mid}{Colors.RESET}")
    print(f"  {Colors.CYAN}{dV} {Colors.RESET}{Colors.DARK_GRAY}  URL{Colors.RESET}{' ' * (W - 10 - len(url))}{Colors.WHITE}{url}{Colors.RESET}{' ' * 3}{Colors.CYAN}{dV}{Colors.RESET}")
    display_folder = str(ROOT_DIR)
    if len(display_folder) > W - 10:
        display_folder = "..." + display_folder[-(W - 13):]
    print(f"  {Colors.CYAN}{dV} {Colors.RESET}{Colors.DARK_GRAY}  Root{Colors.RESET}{' ' * (W - 9 - len(display_folder))}{Colors.DARK_GRAY}{display_folder}{Colors.RESET}{' ' * 2}{Colors.CYAN}{dV}{Colors.RESET}")
    # LibreOffice status
    if _soffice_available:
        lo_line = f"  LibreOffice  {Colors.GREEN}detected{Colors.RESET}  |  .doc support  {Colors.GREEN}enabled{Colors.RESET}"
    else:
        lo_line = f"  LibreOffice  {Colors.YELLOW}not found{Colors.RESET}  |  {Colors.DARK_GRAY}scoop install libreoffice{Colors.RESET}"
    print(lo_line)
    print(f"  {Colors.CYAN}{mid}{Colors.RESET}")
    print(f"  {Colors.CYAN}{dV} {Colors.RESET}{Colors.YELLOW}  [Q] Stop{Colors.RESET}{' ' * (W - 29)}{Colors.DARK_GRAY}Auto-exit on tab close{Colors.RESET}  {Colors.CYAN}{dV}{Colors.RESET}")
    print(f"  {Colors.CYAN}{bot}{Colors.RESET}")
    print()
    print(f"  {Colors.DARK_GRAY}Browser opened. Listening for requests...{Colors.RESET}")
    print()


# ── Heartbeat watchdog ───────────────────────────────────
def heartbeat_watchdog(port, timeout=HEARTBEAT_TIMEOUT):
    """Auto-shutdown if frontend heartbeat stops for too long"""
    global _last_heartbeat
    while True:
        time.sleep(1)
        elapsed = time.time() - _last_heartbeat
        if elapsed > timeout:
            print()
            print(f"  {Colors.YELLOW}Page closed, server shutting down (no heartbeat for {elapsed:.0f}s){Colors.RESET}")
            # Send a shutdown request to ourselves
            try:
                import requests as _r
                _r.get(f"http://127.0.0.1:{port}/shutdown", timeout=2)
            except Exception:
                pass
            # Force exit
            os._exit(0)


# ── Main ────────────────────────────────────────────────
def main():
    W = 48
    sep_line = f"  {Colors.CYAN}{'─' * 46}{Colors.RESET}"

    # ═══════════════════════════════════════════════
    #  Phase 1: Startup checks
    # ═══════════════════════════════════════════════
    print()
    print(sep_line)
    print(f"   {Colors.CYAN}PDF Toolbox{Colors.RESET}  |  Conversion | Watermark | Split | Crop | Markitdown")
    print(sep_line)
    print()

    # LibreOffice detection
    if _soffice_available:
        print(f"  {Colors.GREEN}LibreOffice detected{Colors.RESET}  —  .doc → .docx conversion  {Colors.GREEN}enabled{Colors.RESET}")
        print(f"  {Colors.DARK_GRAY}Path: {_soffice_path}{Colors.RESET}")
    else:
        print(f"  {Colors.RED}{Colors.RED}LibreOffice NOT found{Colors.RESET}  —  .doc → .docx conversion  {Colors.RED}disabled{Colors.RESET}")
        print(f"  {Colors.RED}Install: scoop install libreoffice{Colors.RESET}")
        print(f"  {Colors.DARK_GRAY}(The app still works for all other formats){Colors.RESET}")
    print()

    # ═══════════════════════════════════════════════
    #  Phase 2: Port input
    # ═══════════════════════════════════════════════
    port = DEFAULT_PORT

    # Check command line arg first
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
            if port < 1 or port > 65535:
                print(f"  {Colors.YELLOW}Invalid port '{sys.argv[1]}', falling back to interactive input{Colors.RESET}")
                port = None
        except ValueError:
            print(f"  {Colors.YELLOW}Invalid port '{sys.argv[1]}', falling back to interactive input{Colors.RESET}")
            port = None

    # Interactive port prompt (if no valid CLI arg)
    if port == DEFAULT_PORT and len(sys.argv) == 1:
        try:
            user_input = input(f"  Enter port (default: {Colors.CYAN}{DEFAULT_PORT}{Colors.RESET}): ").strip()
            if user_input:
                p = int(user_input)
                if 1 <= p <= 65535:
                    port = p
                else:
                    print(f"  {Colors.YELLOW}Port out of range, using default: {DEFAULT_PORT}{Colors.RESET}")
        except (ValueError, EOFError):
            print(f"  {Colors.YELLOW}Invalid input, using default: {DEFAULT_PORT}{Colors.RESET}")

    print()
    print(f"  Starting server on {Colors.CYAN}http://localhost:{port}{Colors.RESET} ...")
    print()

    # ═══════════════════════════════════════════════
    #  Phase 3: Banner + Start
    # ═══════════════════════════════════════════════
    print_banner(port)

    # Start heartbeat watchdog thread
    monitor = threading.Thread(target=heartbeat_watchdog, args=(port,), daemon=True)
    monitor.start()

    # Open browser after a short delay
    threading.Timer(0.5, lambda: webbrowser.open(f"http://localhost:{port}")).start()

    # Reset heartbeat timer right before server starts listening
    global _last_heartbeat
    _last_heartbeat = time.time()

    # Run Flask
    try:
        app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        pass
    finally:
        print()
        print(sep_line)
        print(f"  {Colors.GREEN}Server stopped. Goodbye!{Colors.RESET}")
        print(sep_line)
        print()


if __name__ == '__main__':
    main()
