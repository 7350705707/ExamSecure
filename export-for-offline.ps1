#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Export exam-system Docker images to an offline bundle for Windows transfer.
.DESCRIPTION
    Builds both Docker images, saves them to .tar files, and zips them with
    docker-compose.yml and a copy of the backend .env.example into a single
    bundle: exam-system-offline.zip
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root      = $PSScriptRoot
$OutDir    = Join-Path $Root "offline-bundle"
$ZipPath   = Join-Path $Root "exam-system-offline.zip"

Write-Host "==> Building Docker images..." -ForegroundColor Cyan
docker build -t exam-backend:latest  (Join-Path $Root "exam-server-backend")
docker build -t exam-frontend:latest (Join-Path $Root "frontend-admin")

Write-Host "==> Creating output directory: $OutDir" -ForegroundColor Cyan
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

Write-Host "==> Saving images to .tar files..." -ForegroundColor Cyan
docker save exam-backend:latest  | Out-File -FilePath (Join-Path $OutDir "exam-backend.tar")  -Encoding Byte
docker save exam-frontend:latest | Out-File -FilePath (Join-Path $OutDir "exam-frontend.tar") -Encoding Byte

Write-Host "==> Copying deployment files..." -ForegroundColor Cyan
Copy-Item (Join-Path $Root "docker-compose.yml")                      (Join-Path $OutDir "docker-compose.yml")
Copy-Item (Join-Path $Root "exam-server-backend\.env.example")        (Join-Path $OutDir ".env.example")
Copy-Item (Join-Path $Root "deploy-offline.ps1")                      (Join-Path $OutDir "deploy-offline.ps1")
Copy-Item (Join-Path $Root "deploy-offline.sh")                       (Join-Path $OutDir "deploy-offline.sh")

Write-Host "==> Zipping bundle to $ZipPath ..." -ForegroundColor Cyan
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$OutDir\*" -DestinationPath $ZipPath

Write-Host "==> Done! Transfer $ZipPath to the offline machine." -ForegroundColor Green
Write-Host "    Run 'deploy-offline.ps1' (Windows) or 'deploy-offline.sh' (Linux/macOS)" -ForegroundColor Green
