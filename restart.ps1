# CATEST 重启脚本 (PowerShell)
# 职责：强制停止所有正在运行的相关进程，并重新执行启动脚本。

$ErrorActionPreference = "Continue" # 允许在尝试杀掉不存在的进程时继续运行

Write-Host "🔄 正在尝试停止 CATEST 相关服务..." -ForegroundColor Yellow

# 1. 停止后端 Rust 服务 (匹配 catest-* 前缀)
Write-Host "   -> 停止 Rust 后端进程..." -ForegroundColor Gray
taskkill /F /IM "catest-*.exe" /T 2>$null

# 2. 停止前端 Node/Next.js 服务
Write-Host "   -> 停止 Node 前端进程..." -ForegroundColor Gray
taskkill /F /IM "node.exe" /T 2>$null

# 3. 停止 cargo 编译进程 (防止死锁)
Write-Host "   -> 停止 Cargo 编译进程..." -ForegroundColor Gray
taskkill /F /IM "cargo.exe" /T 2>$null

Write-Host "🧹 进程清理完成。" -ForegroundColor Green
Write-Host ""

# 4. 调用启动脚本
$StartScript = Join-Path (Get-Location) "start.ps1"
if (Test-Path $StartScript) {
    Write-Host "🚀 正在重新拉起系统..." -ForegroundColor Cyan
    & $StartScript
} else {
    Write-Error "找不到 start.ps1 脚本，请确保它位于根目录下。"
}
