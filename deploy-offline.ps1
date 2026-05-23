#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy exam-system from offline bundle on Windows.
.DESCRIPTION
    Loads Docker images from .tar files, creates .env from .env.example if
    missing, ensures data directories exist, then starts the stack with
    docker-compose.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot

function Require-Command($cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "$cmd is not installed or not in PATH. Please install Docker Desktop for Windows."
        exit 1
    }
}

Require-Command docker
Require-Command docker-compose

Write-Host "==> Loading Docker images..." -ForegroundColor Cyan
foreach ($tar in @("exam-backend.tar", "exam-frontend.tar")) {
    $path = Join-Path $Root $tar
    if (-not (Test-Path $path)) {
        Write-Error "Missing image archive: $path"
        exit 1
    }
    docker load -i $path
}

# Create .env if it doesn't exist
$EnvFile = Join-Path $Root ".env"
if (-not (Test-Path $EnvFile)) {
    $example = Join-Path $Root ".env.example"
    if (Test-Path $example) {
        Copy-Item $example $EnvFile
        Write-Host "==> Created .env from .env.example — edit it before going live!" -ForegroundColor Yellow
    }
}

# Ensure data directories exist (for volume mounts)
foreach ($dir in @("data", "data\uploads", "data\logs")) {
    $p = Join-Path $Root $dir
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

Write-Host "==> Starting stack with docker-compose..." -ForegroundColor Cyan
Push-Location $Root
docker-compose up -d
Pop-Location

Write-Host ""
Write-Host "==> Exam system is running!" -ForegroundColor Green
Write-Host "    Admin panel : http://localhost:80"
Write-Host "    Backend API  : http://localhost:8001"
Write-Host "    Default admin: admin / admin123  (change this!)"
