# PDF Watermark Tool - One-click launcher
# Auto-exits when browser tab is closed

$folder = $PSScriptRoot
$port = 8765

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
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host "Run as admin once: netsh http add urlacl url=http://localhost:8765/ user=Everyone" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF -> Image + Watermark" -ForegroundColor Cyan
Write-Host "  http://localhost:$port" -ForegroundColor White
Write-Host "  Server auto-exits when page closes" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://localhost:$port"

$lastBeat = Get-Date
$timeout = 8

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response

    $path = $req.Url.LocalPath.TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }

    if ($path -eq 'heartbeat') {
        $lastBeat = Get-Date
        $resp.StatusCode = 200
        $resp.Close()
        continue
    }

    $elapsed = ((Get-Date) - $lastBeat).TotalSeconds
    if ($elapsed -gt $timeout) {
        Write-Host "Page closed, server shutting down" -ForegroundColor Green
        $resp.StatusCode = 200
        $resp.Close()
        break
    }

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
