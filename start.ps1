# PDF Watermark Tool - One-click launcher
# Interactive port selection, default: 60000
# Press [Q] in console to stop, or close browser tab to auto-exit

$folder = $PSScriptRoot

# ---- Interactive port selection ----
$defaultPort = 60000
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF -> Image + Watermark" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$inputPort = Read-Host "Enter port (default: $defaultPort)"
if ([string]::IsNullOrWhiteSpace($inputPort)) {
    $Port = $defaultPort
}
elseif ($inputPort -match '^\d+$' -and [int]$inputPort -ge 1 -and [int]$inputPort -le 65535) {
    $Port = [int]$inputPort
}
else {
    Write-Host "Invalid port, using default: $defaultPort" -ForegroundColor Yellow
    $Port = $defaultPort
}
Write-Host ""

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
}

function Get-MimeType($ext) {
    if ($mime.ContainsKey($ext)) { return $mime[$ext] }
    return 'application/octet-stream'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host "Run as admin once: netsh http add urlacl url=http://localhost:$Port/ user=Everyone" -ForegroundColor Yellow
    Write-Host "Or try a different port." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF -> Image + Watermark" -ForegroundColor Cyan
Write-Host "  http://localhost:$Port" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Press [Q] to stop server" -ForegroundColor Yellow
Write-Host "  Close browser tab to auto-exit" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://localhost:$Port"

$lastBeat = Get-Date
$timeout = 8
$stopFlag = $false

while ($listener.IsListening -and -not $stopFlag) {
    # Begin async wait for the next request
    $asyncResult = $listener.BeginGetContext($null, $null)

    # Poll while waiting: check for Q key press and heartbeat timeout
    while (-not $asyncResult.IsCompleted) {
        # Check for [Q] key press in console
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq 'Q') {
                Write-Host "`nShutdown requested via key press" -ForegroundColor Green
                $stopFlag = $true
                $listener.Stop()
                break
            }
        }

        # Check heartbeat timeout (page closed)
        $elapsed = ((Get-Date) - $lastBeat).TotalSeconds
        if ($elapsed -gt $timeout) {
            Write-Host "Page closed, server shutting down" -ForegroundColor Green
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
    catch {
        # Listener was stopped while waiting
        break
    }

    $req = $ctx.Request
    $resp = $ctx.Response

    $path = $req.Url.LocalPath.TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }

    # Heartbeat — keeps server alive while page is open
    if ($path -eq 'heartbeat') {
        $lastBeat = Get-Date
        $resp.StatusCode = 200
        $resp.Close()
        continue
    }

    # Manual shutdown endpoint — visit http://localhost:<port>/shutdown to stop
    if ($path -eq 'shutdown' -or $path -eq 'stop') {
        Write-Host "Shutdown requested via HTTP endpoint" -ForegroundColor Green
        $msg = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Server Stopped</title><style>body{font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F0F4FF;color:#1E293B;}div{text-align:center;padding:2rem;border-radius:16px;background:rgba(255,255,255,.72);backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,.08);}h2{color:#4F46E5;}p{color:#64748B;}</style></head><body><div><h2>服务器已停止</h2><p>Server stopped. You can close this page.</p></div></body></html>'
        $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
        $resp.ContentType = 'text/html; charset=utf-8'
        $resp.ContentLength64 = $bytes.Length
        $resp.StatusCode = 200
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        $resp.Close()
        $stopFlag = $true
        break
    }

    # Check heartbeat timeout before serving
    $elapsed = ((Get-Date) - $lastBeat).TotalSeconds
    if ($elapsed -gt $timeout) {
        Write-Host "Page closed, server shutting down" -ForegroundColor Green
        $resp.StatusCode = 200
        $resp.Close()
        break
    }

    # Serve static file
    $filePath = Join-Path $folder $path
    if ((Test-Path $filePath -PathType Leaf) -eq $false) {
        $resp.StatusCode = 404
        $resp.Close()
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
    }
    catch {
        $resp.StatusCode = 500
    }
    $resp.Close()
}

$listener.Stop()
$listener.Close()
