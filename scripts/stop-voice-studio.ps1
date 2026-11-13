# Parar Voice Studio Backend
Write-Host "Localizando processos na porta 3900..." -ForegroundColor Cyan

$connections = Get-NetTCPConnection -LocalPort 3900 -ErrorAction SilentlyContinue

if (-not $connections) {
    Write-Host "Nenhum processo escutando na porta 3900." -ForegroundColor Yellow
    Exit 0
}

$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($procId in $pids) {
    Write-Host "Finalizando processo PID $procId..." -ForegroundColor Yellow
    taskkill /PID $procId /T /F 2>$null
}

Write-Host "Voice Studio parado com sucesso." -ForegroundColor Green
