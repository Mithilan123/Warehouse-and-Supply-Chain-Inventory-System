# ==============================================================================
# Warehouse & Supply Chain Inventory System - One-Click Local Launcher
# No Docker • No Cloud Dependencies • 100% Localhost
# ==============================================================================

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " Starting Warehouse & Supply Chain Inventory System" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

$WorkspaceRoot = $PSScriptRoot

# 1. Start Local PostgreSQL on Port 5433 (if not running)
$pgPort = 5433
$pgListening = netstat -ano | findstr "$pgPort"
if (-not $pgListening) {
    Write-Host "[1/4] Starting PostgreSQL 18 cluster on port $pgPort..." -ForegroundColor Yellow
    Remove-Item "$WorkspaceRoot\db\data\postmaster.pid" -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -ArgumentList "-D", "`"$WorkspaceRoot\db\data`"", "-p", "$pgPort" -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "[1/4] PostgreSQL 18 is already listening on port $pgPort." -ForegroundColor Green
}

# 2. Start Local Standalone RabbitMQ Broker (if not running)
$rabbitPort = 5672
$rabbitListening = netstat -ano | findstr "$rabbitPort"
if (-not $rabbitListening) {
    Write-Host "[2/4] Starting RabbitMQ Broker 4.3.6 (AMQP on :$rabbitPort, Management on :15672)..." -ForegroundColor Yellow
    $env:ERLANG_HOME = "$WorkspaceRoot\tools\erlang"
    $env:PATH = "$env:ERLANG_HOME\bin;$env:PATH"
    $env:RABBITMQ_BASE = "$WorkspaceRoot\tools\rabbitmq\data"
    Start-Process -FilePath "$WorkspaceRoot\tools\rabbitmq\rabbitmq_server-4.3.6\sbin\rabbitmq-server.bat" -WindowStyle Hidden
    Start-Sleep -Seconds 6
} else {
    Write-Host "[2/4] RabbitMQ Broker is already listening on port $rabbitPort." -ForegroundColor Green
}

# 3. Start Backend Server (Node.js Express + Outbox Worker + Consumer)
$backendPort = 5000
$backendListening = netstat -ano | findstr "$backendPort"
if (-not $backendListening) {
    Write-Host "[3/4] Starting Backend Server on http://localhost:$backendPort..." -ForegroundColor Yellow
    Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory "$WorkspaceRoot\backend" -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "[3/4] Backend server is already running on port $backendPort." -ForegroundColor Green
}

# 4. Start Frontend Vite Dev Server
$frontendPort = 5173
$frontendListening = netstat -ano | findstr "$frontendPort"
if (-not $frontendListening) {
    Write-Host "[4/4] Starting React + Vite Frontend on http://localhost:$frontendPort..." -ForegroundColor Yellow
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -- --host --port $frontendPort" -WorkingDirectory "$WorkspaceRoot\frontend" -WindowStyle Hidden
    Start-Sleep -Seconds 2
} else {
    Write-Host "[4/4] Frontend server is already running on port $frontendPort." -ForegroundColor Green
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " Application System is Online and Operational!" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "  Frontend Application : http://localhost:5173" -ForegroundColor White
Write-Host "  Backend REST API     : http://localhost:5000/api/v1" -ForegroundColor White
Write-Host "  API Health Check     : http://localhost:5000/api/v1/health" -ForegroundColor White
Write-Host "  RabbitMQ Management  : http://localhost:15672 (guest / guest)" -ForegroundColor White
Write-Host "  PostgreSQL Cluster   : localhost:5433 (database: postgres, user: postgres)" -ForegroundColor White
Write-Host "====================================================================" -ForegroundColor Green
