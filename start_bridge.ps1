# CATEST Adapter Bridge 启动脚本
# 此脚本负责启动 Python 后台桥接服务，用于协调 Web 端与本地 IDE (Antigravity) 的自动化交付。

$port = 34101
$srcRoot = "e:\CATEST\python\src"
$pythonExe = "C:\Users\leo19\AppData\Local\Programs\Python\Python313\python.exe"

# 1. 环境检查
if (-not (Test-Path $pythonExe)) {
    $pythonExe = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
    if (-not $pythonExe) {
        Write-Error "错误: 未找到 Python 解释器。请确保已安装 Python 并添加到 PATH。"
        exit 1
    }
}

# 2. 清理旧进程 (强制释放端口)
$oldProc = Get-NetTCPConnection -LocalAddress 0.0.0.0 -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($oldProc) {
    Write-Host "检测到端口 $port 已被占用 (PID: $oldProc)，正在清理..." -ForegroundColor Yellow
    Stop-Process -Id $oldProc -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 3. 设置 PYTHONPATH 并启动
$env:PYTHONPATH = $srcRoot
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  CATEST Adapter Bridge 正在启动..." -ForegroundColor Cyan
Write-Host "  端口: $port" -ForegroundColor Cyan
Write-Host "  路径: $srcRoot" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

& $pythonExe -m uvicorn catest_ai.adapter_bridge.main:app --host 0.0.0.0 --port $port --log-level info
