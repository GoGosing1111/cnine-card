#Requires -Version 7.0
param(
  [Parameter(Mandatory=$true)][string]$ProjectDirectory,
  [Parameter(Mandatory=$true)][string]$ToolsDirectory,
  [Parameter(Mandatory=$true)][string]$SigningDirectory,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
$repoPath=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$projectPath=[IO.Path]::GetFullPath($ProjectDirectory)
$outputPath=[IO.Path]::GetFullPath($OutputDirectory)
$toolsPath=(Resolve-Path -LiteralPath $ToolsDirectory).Path
$signingPath=(Resolve-Path -LiteralPath $SigningDirectory).Path
function Assert-External([string]$candidate){
  if($candidate -eq $repoPath -or $candidate.StartsWith($repoPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Builds, APKs and signing files must remain outside the web repository.'}
}
foreach($candidate in @($projectPath,$outputPath,$signingPath)){Assert-External $candidate}
if($projectPath -eq $outputPath){throw 'Project and delivery folders must be different.'}
foreach($candidate in @($projectPath,$outputPath)){
  if((Test-Path -LiteralPath $candidate) -and (Get-ChildItem -LiteralPath $candidate -Force | Select-Object -First 1)){throw "Folder must be empty: $candidate"}
}
foreach($filename in @('upload-key.jks','credentials.json')){
  if(!(Test-Path -LiteralPath (Join-Path $signingPath $filename))){throw 'Restore the existing signing backup; this channel never creates a replacement key.'}
}
$distribution=Get-Content -LiteralPath (Join-Path $repoPath 'packaging/android-direct/distribution.json') -Raw | ConvertFrom-Json
$manifest=Get-Content -LiteralPath (Join-Path $repoPath 'packaging/play-store/twa-manifest.json') -Raw | ConvertFrom-Json
if($manifest.packageId -ne $distribution.packageId){throw 'Keep the existing Android package identity.'}
if($distribution.appVersionCode -le $manifest.appVersionCode){throw 'The direct APK must upgrade the earlier preparation build.'}
foreach($property in @('appVersion','appVersionCode','startUrl')){$manifest.$property=$distribution.$property}
$manifest.name=$distribution.appName
$manifest.launcherName=$distribution.appName
New-Item -ItemType Directory -Path (Join-Path $outputPath 'review') -Force | Out-Null
$manifestPath=Join-Path $outputPath 'review/twa-manifest.json'
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
$previousTools=$env:PLAY_TOOLS_ROOT
try {
  $env:PLAY_TOOLS_ROOT=$toolsPath
  & node (Join-Path $repoPath 'scripts/play-store/generate-android.mjs') $projectPath $manifestPath
  if($LASTEXITCODE -ne 0){throw 'Android project generation failed.'}
  & node (Join-Path $PSScriptRoot 'prepare-native.mjs') $projectPath
  if($LASTEXITCODE -ne 0){throw 'Native Android resource client preparation failed.'}
  & (Join-Path $repoPath 'scripts/play-store/build-android.ps1') -ProjectDirectory $projectPath -ToolsDirectory $toolsPath -SigningDirectory $signingPath -ApkOnly -RequireExistingKey -ExpectedCertificateSha256 $distribution.certificateSha256
  & node (Join-Path $PSScriptRoot 'prepare-delivery.mjs') $projectPath $outputPath $toolsPath
  if($LASTEXITCODE -ne 0){throw 'APK verification or delivery failed.'}
} finally {
  $env:PLAY_TOOLS_ROOT=$previousTools
}
