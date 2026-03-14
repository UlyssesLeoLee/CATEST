# CATEST 快速启动脚本 (PowerShell)
# 职责：启动基础设施 (Docker) 并批量拉起所有后端微服务及前端。

$ErrorActionPreference = "Stop"
$RootDir = Get-Location

Write-Host "🚀 正在启动 CATEST 分布式平台..." -ForegroundColor Cyan

# 1. 检查并启动基础设施 (Docker)
Write-Host "📦 [1/3] 检查基础设施 (Docker Compose)..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Compose 启动失败，请确保 Docker Desktop 已运行。"
    exit $LASTEXITCODE
}

# 2. 启动后端微服务 (Rust)
Write-Host "🦀 [2/3] 正在后台拉起 Rust 微服务集群..." -ForegroundColor Yellow
$Services = @("catest-gateway", "catest-review", "catest-ingestion", "catest-embedding", "catest-parser")
$LogDir = Join-Path $RootDir "logs"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

foreach ($Service in $Services) {
    Write-Host "   -> 启动 $Service ..." -ForegroundColor Gray
    $LogFile = Join-Path $LogDir "$Service.log"
    # 使用 cmd /c 启动以支持将 stdout 和 stderr 重定向到同一个文件
    Start-Process -FilePath "cmd" -ArgumentList "/c cargo run --bin $Service > `"$LogFile`" 2>&1" -WindowStyle Hidden
}

# 3. 启动前端服务 (Next.js)
Write-Host "🌐 [3/3] 正在启动前端门户 (Next.js)..." -ForegroundColor Yellow
$WebDir = Join-Path $RootDir "web"
$WebLog = Join-Path $LogDir "web.log"

if (Test-Path $WebDir) {
    Push-Location $WebDir
    Write-Host "   -> 启动前端 (端口 33000) ..." -ForegroundColor Gray
    Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev -- -p 33000 > `"$WebLog`" 2>&1" -WindowStyle Hidden
    Pop-Location
} else {
    Write-Warning "未找到 web 目录，跳过前端启动。"
}

Write-Host ""
Write-Host "✅ 所有服务已尝试在后台启动！" -ForegroundColor Green
Write-Host "📊 日志查看目录: $LogDir" -ForegroundColor Gray
Write-Host "🌍 访问前端: http://localhost:33000" -ForegroundColor Cyan

# 4. 自动打开网页
Write-Host "🌐 正在打开浏览器..." -ForegroundColor Gray
Start-Process "http://localhost:33000"

Write-Host ""
Write-Host "提示: 如需停止所有进程，请运行: taskkill /F /IM catest-*.exe /IM node.exe" -ForegroundColor Gray
