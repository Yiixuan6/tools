# PDF Watermark Tool - One-click launcher
# Interactive port selection, request logging, clean shutdown
# Press [Q] in console to stop, or close browser tab to auto-exit

$folder = $PSScriptRoot

# =============================================
#  Helper: color-coded request logging
# =============================================

function Write-Log($method, $path, $status, $ms) {
    $time = Get-Date -Format "HH:mm:ss"
    $timeColor = "DarkGray"
    $methodColor = "Cyan"
    $pathColor = "White"

    # Color the status code
    if ($status -lt 300) { $statusColor = "Green" }
    elseif ($status -lt 400) { $statusColor = "Cyan" }
    elseif ($status -lt 500) { $statusColor = "Yellow" }
    else { $statusColor = "Red" }

    Write-Host "  " -NoNewline
    Write-Host $time -ForegroundColor $timeColor -NoNewline
    Write-Host "  " -NoNewline
    Write-Host $method.PadRight(6) -ForegroundColor $methodColor -NoNewline
    Write-Host $path.PadRight(26) -ForegroundColor $pathColor -NoNewline
    Write-Host ("{0,3}" -f $status) -ForegroundColor $statusColor -NoNewline
    if ($ms -ge 0) {
        Write-Host (" {0,4}ms" -f $ms) -ForegroundColor $timeColor -NoNewline
    }
    Write-Host ""
}

function Write-Banner($port) {
    $W = 48

    # Box-drawing characters (double-line)
    $dH = [char]0x2550  # horizontal
    $dV = [char]0x2551  # vertical
    $dTL = [char]0x2554 # top-left
    $dTR = [char]0x2557 # top-right
    $dBL = [char]0x255A # bottom-left
    $dBR = [char]0x255D # bottom-right
    $dVL = [char]0x2560 # vertical-left (T)
    $dVR = [char]0x2563 # vertical-right (T)

    $top = $dTL + [string]::new($dH, ($W-2)) + $dTR
    $mid = $dVL + [string]::new($dH, ($W-2)) + $dVR
    $bot = $dBL + [string]::new($dH, ($W-2)) + $dBR

    $title = "PDF Toolbox"
    $subtitle = "Conversion | Watermark | Split | Crop"
    $url = "http://localhost:$port"

    Write-Host ""
    # Top border
    Write-Host "  $top" -ForegroundColor "DarkCyan"

    # Blank line
    Write-Host ("  $dV" + (" " * ($W-2)) + "$dV") -ForegroundColor "DarkCyan"

    # Title (centered)
    $tp = [math]::Floor(($W - 2 - $title.Length) / 2)
    $tr = $W - 2 - $tp - $title.Length
    Write-Host ("  $dV" + (" " * $tp)) -NoNewline -ForegroundColor "DarkCyan"
    Write-Host $title -NoNewline -ForegroundColor "Cyan"
    Write-Host ((" " * $tr) + "$dV") -ForegroundColor "DarkCyan"

    # Subtitle (centered)
    $sp = [math]::Floor(($W - 2 - $subtitle.Length) / 2)
    $sr = $W - 2 - $sp - $subtitle.Length
    Write-Host ("  $dV" + (" " * $sp)) -NoNewline -ForegroundColor "DarkCyan"
    Write-Host $subtitle -NoNewline -ForegroundColor "DarkGray"
    Write-Host ((" " * $sr) + "$dV") -ForegroundColor "DarkCyan"

    # Blank line
    Write-Host ("  $dV" + (" " * ($W-2)) + "$dV") -ForegroundColor "DarkCyan"

    # Divider
    Write-Host "  $mid" -ForegroundColor "DarkCyan"

    # URL row
    $label = "  URL"
    $pad = $W - 2 - $label.Length - $url.Length
    if ($pad -lt 1) { $pad = 1 }
    Write-Host ("  $dV ") -NoNewline -ForegroundColor "DarkCyan"
    Write-Host $label -NoNewline -ForegroundColor "DarkGray"
    Write-Host (" " * $pad) -NoNewline
    Write-Host $url -ForegroundColor "White"

    # Root folder row
    $label = "  Root"
    $displayFolder = $folder
    if ($displayFolder.Length -gt $W - 10) {
        $displayFolder = "..." + $displayFolder.Substring($displayFolder.Length - ($W - 13))
    }
    $pad = $W - 2 - $label.Length - $displayFolder.Length
    if ($pad -lt 1) { $pad = 1 }
    Write-Host ("  $dV ") -NoNewline -ForegroundColor "DarkCyan"
    Write-Host $label -NoNewline -ForegroundColor "DarkGray"
    Write-Host (" " * $pad) -NoNewline
    Write-Host $displayFolder -ForegroundColor "DarkGray"

    # Divider
    Write-Host "  $mid" -ForegroundColor "DarkCyan"

    # Controls row
    $left = "  [Q] Stop"
    $right = "Auto-exit on tab close"
    $pad = $W - 2 - $left.Length - $right.Length
    if ($pad -lt 1) { $pad = 1 }
    Write-Host ("  $dV ") -NoNewline -ForegroundColor "DarkCyan"
    Write-Host $left -NoNewline -ForegroundColor "Yellow"
    Write-Host (" " * $pad) -NoNewline
    Write-Host $right -ForegroundColor "DarkGray"

    # Bottom border
    Write-Host "  $bot" -ForegroundColor "DarkCyan"
    Write-Host ""
    Write-Host "  Browser opened. Listening for requests..." -ForegroundColor "DarkGray"
    Write-Host ""
}

# =============================================
#  Port Selection
# =============================================

$defaultPort = 60000

# Header line separator (single-line horizontal)
$sep = [string]::new([char]0x2500, 46)

Write-Host ""
Write-Host "  $sep" -ForegroundColor "DarkCyan"
Write-Host "   PDF Toolbox  |  Conversion | Watermark | Split | Crop" -ForegroundColor "Cyan"
Write-Host "  $sep" -ForegroundColor "DarkCyan"
Write-Host ""

$inputPort = Read-Host "  Enter port (default: $defaultPort)"

if ([string]::IsNullOrWhiteSpace($inputPort)) {
    $Port = $defaultPort
}
elseif ($inputPort -match '^\d+$' -and [int]$inputPort -ge 1 -and [int]$inputPort -le 65535) {
    $Port = [int]$inputPort
}
else {
    Write-Host "  Invalid port, using default: $defaultPort" -ForegroundColor Yellow
    $Port = $defaultPort
}

# =============================================
#  MIME Map
# =============================================

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.bcmap'= 'application/octet-stream'
    '.woff2'= 'font/woff2'
    '.woff' = 'font/woff'
    '.ttf'  = 'font/ttf'
}

function Get-MimeType($ext) {
    if ($mime.ContainsKey($ext)) { return $mime[$ext] }
    return 'application/octet-stream'
}

# =============================================
#  Start HTTP Listener
# =============================================

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
}
catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host "  Run as admin once:" -ForegroundColor Yellow
    Write-Host "    netsh http add urlacl url=http://localhost:$Port/ user=Everyone" -ForegroundColor Yellow
    Write-Host "  Or try a different port." -ForegroundColor Yellow
    Read-Host "`n  Press Enter to exit"
    exit 1
}

# Show banner and open browser
Write-Banner $Port
Start-Process "http://localhost:$Port"

# =============================================
#  Main Loop
# =============================================

$lastBeat = Get-Date
$timeout = 8
$stopFlag = $false

while ($listener.IsListening -and -not $stopFlag) {
    $asyncResult = $listener.BeginGetContext($null, $null)

    while (-not $asyncResult.IsCompleted) {
        # [Q] key check (skip if no console attached)
        try {
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                if ($key.Key -eq 'Q') {
                    Write-Host ""
                    Write-Host "  Shutdown requested (key press)" -ForegroundColor Yellow
                    $stopFlag = $true
                    $listener.Stop()
                    break
                }
            }
        }
        catch [System.InvalidOperationException] {
            # No console attached (e.g., piped input) - skip key check
        }

        # Heartbeat timeout
        $elapsed = ((Get-Date) - $lastBeat).TotalSeconds
        if ($elapsed -gt $timeout) {
            Write-Host ""
            Write-Host "  Page closed, server shutting down" -ForegroundColor Yellow
            $stopFlag = $true
            $listener.Stop()
            break
        }

        Start-Sleep -Milliseconds 200
    }

    if ($stopFlag) { break }

    try {
        $ctx = $listener.EndGetContext($asyncResult)
    }
    catch { break }

    $req = $ctx.Request
    $resp = $ctx.Response
    $reqStart = Get-Date

    $path = $req.Url.LocalPath.TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $method = $req.HttpMethod

    # Heartbeat - silent (no log)
    if ($path -eq 'heartbeat') {
        $lastBeat = Get-Date
        $resp.StatusCode = 200
        $resp.Close()
        continue
    }

    # Shutdown endpoint
    if ($path -eq 'shutdown' -or $path -eq 'stop') {
        Write-Host ""
        Write-Host "  Shutdown requested (HTTP endpoint)" -ForegroundColor Yellow
        $msg = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Server Stopped</title><style>body{font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F0F4FF;color:#1E293B;}div{text-align:center;padding:2rem;border-radius:16px;background:rgba(255,255,255,.72);backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,.08);}h2{color:#4F46E5;}p{color:#64748B;}</style></head><body><div><h2>Server stopped</h2><p>You can close this page.</p></div></body></html>'
        $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
        $resp.ContentType = 'text/html; charset=utf-8'
        $resp.ContentLength64 = $bytes.Length
        $resp.StatusCode = 200
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $resp.Close()
        $stopFlag = $true
        break
    }

    # Heartbeat timeout check
    $elapsed = ((Get-Date) - $lastBeat).TotalSeconds
    if ($elapsed -gt $timeout) {
        Write-Host ""
        Write-Host "  Page closed, server shutting down" -ForegroundColor Yellow
        $resp.StatusCode = 200
        $resp.Close()
        break
    }

    # Serve static file
    $filePath = Join-Path $folder $path
    if ((Test-Path $filePath -PathType Leaf) -eq $false) {
        $resp.StatusCode = 404
        $resp.Close()
        $elapsed = [math]::Round(((Get-Date) - $reqStart).TotalMilliseconds)
        Write-Log $method "/$path" 404 $elapsed
        continue
    }

    $ext = [IO.Path]::GetExtension($filePath)
    $mimeType = Get-MimeType $ext

    try {
        $bytes = [IO.File]::ReadAllBytes($filePath)
        $resp.ContentType = $mimeType
        $resp.ContentLength64 = $bytes.Length
        $resp.StatusCode = 200
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $elapsed = [math]::Round(((Get-Date) - $reqStart).TotalMilliseconds)
        Write-Log $method "/$path" 200 $elapsed
    }
    catch {
        $resp.StatusCode = 500
        $elapsed = [math]::Round(((Get-Date) - $reqStart).TotalMilliseconds)
        Write-Log $method "/$path" 500 $elapsed
    }
    $resp.Close()
}

# =============================================
#  Cleanup
# =============================================

$listener.Stop()
$listener.Close()

Write-Host ""
Write-Host "  $sep" -ForegroundColor "DarkCyan"
Write-Host "  Server stopped. Goodbye!" -ForegroundColor Green
Write-Host "  $sep" -ForegroundColor "DarkCyan"
Write-Host ""
