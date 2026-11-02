param([switch]$OpenReview)
$ErrorActionPreference = 'Stop'
$reviewRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$reviewUrl = 'http://127.0.0.1:18766/preview/v35-whitecoat-swordsman-20261102/review.html'
$reviewPort = 18766
$reviewListener = Get-NetTCPConnection -LocalPort $reviewPort -State Listen -ErrorAction SilentlyContinue
if (-not $reviewListener) {
    $reviewNode = (Get-Command node -ErrorAction Stop).Source
    $reviewLogDir = Join-Path $reviewRoot 'output/v35-review-server'
    New-Item -ItemType Directory -Force -Path $reviewLogDir | Out-Null
    $reviewTag = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    # Separate hidden process: it must not be tied to a tool's terminal session.
    $reviewProcess = Start-Process -FilePath $reviewNode -ArgumentList @('preview/v35-v3-upgrade-20261101/serve.mjs') -WorkingDirectory $reviewRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $reviewLogDir "$reviewTag.stdout.log") -RedirectStandardError (Join-Path $reviewLogDir "$reviewTag.stderr.log") -PassThru
    @{ pid=$reviewProcess.Id; script='preview/v35-v3-upgrade-20261101/serve.mjs'; startedAt=(Get-Date).ToUniversalTime().ToString('o'); desktopWindow=$false } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reviewLogDir 'process.json') -Encoding utf8
}
$reviewReady = $false
for ($reviewAttempt=0; $reviewAttempt -lt 40; $reviewAttempt++) {
    try {
        $reviewResponse = Invoke-WebRequest -Uri $reviewUrl -UseBasicParsing -TimeoutSec 2
        if ($reviewResponse.StatusCode -eq 200 -and $reviewResponse.Content.Contains('whitecoat-overview.png')) { $reviewReady = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 150
}
if (-not $reviewReady) { throw 'V3.5 review server did not respond correctly. Existing listeners were not stopped.' }
Write-Output $reviewUrl
if ($OpenReview) { Start-Process $reviewUrl }
