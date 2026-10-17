param(
  [Parameter(Mandatory=$true)][string]$ProjectDirectory,
  [Parameter(Mandatory=$true)][string]$ToolsDirectory,
  [Parameter(Mandatory=$true)][string]$SigningDirectory,
  [switch]$ApkOnly,
  [switch]$RequireExistingKey,
  [string]$ExpectedCertificateSha256
)
$ErrorActionPreference='Stop'
$projectPath=(Resolve-Path -LiteralPath $ProjectDirectory).Path
$toolsPath=(Resolve-Path -LiteralPath $ToolsDirectory).Path
$repoPath=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$signingPath=[IO.Path]::GetFullPath($SigningDirectory)
if($signingPath -eq $repoPath -or $signingPath.StartsWith($repoPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Signing files must be outside the web repository.'}
if($projectPath -eq $repoPath -or $projectPath.StartsWith($repoPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Build outside the web repository.'}
$jdkPath=(Get-ChildItem -LiteralPath (Join-Path $toolsPath 'jdk') -Directory | Where-Object {Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe')} | Select-Object -First 1).FullName
if(!$jdkPath){throw 'JDK 17 is missing.'}
$env:JAVA_HOME=$jdkPath
$env:ANDROID_HOME=Join-Path $toolsPath 'sdk'
$env:PATH="$jdkPath\bin;$env:PATH"
New-Item -ItemType Directory -Path $signingPath -Force | Out-Null
$signingIdentity="$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F"
& icacls.exe $signingPath '/inheritance:r' '/grant:r' $signingIdentity | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect signing directory.'}
$keyPath=Join-Path $signingPath 'upload-key.jks'
$passwordPath=Join-Path $signingPath 'credentials.json'
if($RequireExistingKey -and (!(Test-Path -LiteralPath $keyPath) -or !(Test-Path -LiteralPath $passwordPath))){throw 'The original signing key and credentials are required; no replacement key will be created.'}
if((Test-Path -LiteralPath $keyPath) -ne (Test-Path -LiteralPath $passwordPath)){throw 'Incomplete signing backup; do not generate a replacement key.'}
if(!(Test-Path -LiteralPath $passwordPath)){
  $newPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  @{storePassword=$newPassword;keyPassword=$newPassword;alias='soopketmon-upload'} | ConvertTo-Json | Set-Content -LiteralPath $passwordPath -Encoding utf8
}
$credentials=Get-Content -LiteralPath $passwordPath -Raw | ConvertFrom-Json
$env:SOOP_UPLOAD_KEYSTORE=$keyPath
$env:SOOP_STORE_PASSWORD=$credentials.storePassword
$env:SOOP_KEY_PASSWORD=$credentials.keyPassword
try {
  if(!(Test-Path -LiteralPath $keyPath)){
    & "$jdkPath/bin/keytool.exe" -genkeypair -keystore $keyPath -storetype JKS -storepass:env SOOP_STORE_PASSWORD -keypass:env SOOP_KEY_PASSWORD -alias 'soopketmon-upload' -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=YAKCODE, O=YAKCODE, C=KR'
    if($LASTEXITCODE -ne 0){throw 'Upload key generation failed.'}
  }
  & "$jdkPath/bin/keytool.exe" -exportcert -keystore $keyPath -storepass:env SOOP_STORE_PASSWORD -alias 'soopketmon-upload' -file (Join-Path $projectPath 'upload-certificate.der')
  if($LASTEXITCODE -ne 0){throw 'Certificate export failed.'}
  if($ExpectedCertificateSha256){
    $certificateHash=(Get-FileHash -LiteralPath (Join-Path $projectPath 'upload-certificate.der') -Algorithm SHA256).Hash
    if($certificateHash -ne $ExpectedCertificateSha256.Replace(':','')){throw 'Signing certificate does not match the existing Android application.'}
  }
  ('sdk.dir='+$env:ANDROID_HOME.Replace('\','/')) | Set-Content -LiteralPath (Join-Path $projectPath 'local.properties') -Encoding ascii
  Push-Location $projectPath
  try {
    $buildTasks=@('assembleRelease','lintRelease')
    if(!$ApkOnly){$buildTasks+= 'bundleRelease'}
    & './gradlew.bat' '--no-daemon' '--console=plain' @buildTasks
    if($LASTEXITCODE -ne 0){throw 'Android build or lint failed.'}
  } finally {Pop-Location}
} finally {
  Remove-Item Env:SOOP_STORE_PASSWORD,Env:SOOP_KEY_PASSWORD,Env:SOOP_UPLOAD_KEYSTORE -ErrorAction SilentlyContinue
  $credentials=$null
  $newPassword=$null
}
