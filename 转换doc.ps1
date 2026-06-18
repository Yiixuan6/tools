# .doc → .docx 批量转换工具
# 需要安装 Microsoft Word
# 用法：右键 → 使用 PowerShell 运行，或将 .doc 文件拖到此脚本上

param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$Files
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  .doc → .docx 转换器" -ForegroundColor Cyan
Write-Host "  使用 Microsoft Word COM 自动化" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 如果没有拖入文件，让用户选择
if (-not $Files -or $Files.Count -eq 0) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "选择 .doc 文件"
  $dialog.Filter = "Word 97-2003 (*.doc)|*.doc"
  $dialog.Multiselect = $true
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $Files = $dialog.FileNames
  } else {
    Write-Host "未选择任何文件，退出。" -ForegroundColor Yellow
    exit
  }
}

$success = 0
$failed = 0

foreach ($file in $Files) {
  if (-not (Test-Path $file)) {
    Write-Host "文件不存在: $file" -ForegroundColor Red
    $failed++
    continue
  }

  if ($file -notmatch '\.doc$') {
    Write-Host "跳过非 .doc 文件: $file" -ForegroundColor Yellow
    continue
  }

  $outPath = $file -replace '\.doc$', '.docx'
  Write-Host "转换: $(Split-Path $file -Leaf) ... " -NoNewline

  try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0  # wdAlertsNone

    $doc = $word.Documents.Open($file)
    # 保存为 .docx (WdSaveFormat.wdFormatXMLDocument = 12)
    $doc.SaveAs([ref]$outPath, [ref]12)
    $doc.Close()
    $word.Quit()

    # 释放 COM 对象
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null

    Write-Host "完成 ✓" -ForegroundColor Green
    $success++
  } catch {
    Write-Host "失败 ✗" -ForegroundColor Red
    Write-Host "  错误: $_" -ForegroundColor Red
    # 确保 Word 进程退出
    try { $word.Quit() } catch {}
    $failed++
  }
}

Write-Host ""
Write-Host "转换完成: $success 成功, $failed 失败" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "提示：转换后的 .docx 文件可直接在 PDF 水印工具中使用" -ForegroundColor Cyan
Write-Host ""

# 暂停等待用户查看结果
Read-Host "按 Enter 键退出"
