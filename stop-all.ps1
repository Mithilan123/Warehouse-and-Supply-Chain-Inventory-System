# ==============================================================================
# Warehouse & Supply Chain Inventory System - Graceful Local Shutdown
# ==============================================================================

Write-Host "Stopping all local services and processes..." -ForegroundColor Yellow

# 1. Stop Node processes running in this workspace
Get-WmiObject Win32_Process | Where-Object { 
    $_.Name -eq "node.exe" -and $_.CommandLine -like "*system design*" 
} | ForEach-Object { 
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue 
}

# 2. Stop PostgreSQL instance on port 5433
Get-WmiObject Win32_Process | Where-Object { 
    $_.Name -eq "postgres.exe" -and $_.CommandLine -like "*5433*" 
} | ForEach-Object { 
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue 
}
Remove-Item "$PSScriptRoot\db\data\postmaster.pid" -Force -ErrorAction SilentlyContinue

# 3. Stop RabbitMQ instance running from tools\rabbitmq
Get-WmiObject Win32_Process | Where-Object { 
    $_.Name -like "*erl*.exe" -and $_.CommandLine -like "*system design*" 
} | ForEach-Object { 
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue 
}

Write-Host "All system design processes have been safely stopped." -ForegroundColor Green
