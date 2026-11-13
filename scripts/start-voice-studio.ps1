# Iniciar Voice Studio
$installedApp = "C:\Users\Maychel\AppData\Local\Programs\VoiceStudio\VoiceStudio.exe"

Write-Host "Verificando se o Voice Studio já está rodando na porta 3900..." -ForegroundColor Cyan
$conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 3900 -InformationLevel Quiet -WarningAction SilentlyContinue

if ($conn) {
    Write-Host "O Voice Studio já está ativo na porta 3900!" -ForegroundColor Green
    Exit 0
}

Write-Host "Iniciando VoiceStudio..." -ForegroundColor Yellow

if (Test-Path $installedApp) {
    Start-Process -FilePath $installedApp
    Write-Host "VoiceStudio iniciado a partir de $installedApp" -ForegroundColor Green
} else {
    Write-Host "Executável não encontrado em $installedApp" -ForegroundColor Red
}

Write-Host "Aguardando inicialização da API..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

$isUp = Test-NetConnection -ComputerName 127.0.0.1 -Port 3900 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($isUp) {
    Write-Host "Voice Studio ONLINE na porta 3900!" -ForegroundColor Green
} else {
    Write-Host "Aguarde mais alguns instantes para o carregamento dos modelos na GPU." -ForegroundColor Yellow
}
