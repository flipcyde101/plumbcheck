param([switch]$Release, [switch]$InitializeSigningKey)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK 21 or newer (Gradle 9.2.1). End users do not need a JDK.' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Set ANDROID_HOME to the Android SDK.' }
Push-Location $projectDirectory
try {
    node scripts/build-mobile.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Mobile asset build failed.' }
    if ($Release) {
        $signingDirectory = Join-Path $env:LOCALAPPDATA 'PlumbCheck\Signing'
        $keystorePath = Join-Path $signingDirectory 'android-preview.jks'
        $passwordPath = Join-Path $signingDirectory 'android-preview.password.dpapi'
        if ($InitializeSigningKey -and -not (Test-Path -LiteralPath $keystorePath)) {
            New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
            $randomBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
            $signingPassword = [Convert]::ToBase64String($randomBytes)
            $signingPassword | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordPath
            $env:PLUMBCHECK_ANDROID_STORE_PASSWORD = $signingPassword
            $env:PLUMBCHECK_ANDROID_KEY_PASSWORD = $signingPassword
            & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $keystorePath -storetype JKS -storepass:env PLUMBCHECK_ANDROID_STORE_PASSWORD -keypass:env PLUMBCHECK_ANDROID_KEY_PASSWORD -alias plumbcheck -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=PlumbCheck local preview, O=Plumbnote'
            if ($LASTEXITCODE -ne 0) { throw 'Android preview signing key generation failed.' }
        }
        if (-not (Test-Path -LiteralPath $keystorePath) -or -not (Test-Path -LiteralPath $passwordPath)) { throw 'Initialize a local preview signing key explicitly, or use the documented production keystore environment variables.' }
        $secret = Get-Content -LiteralPath $passwordPath | ConvertTo-SecureString
        $env:PLUMBCHECK_ANDROID_STORE_PASSWORD = [Net.NetworkCredential]::new('', $secret).Password
        $env:PLUMBCHECK_ANDROID_KEY_PASSWORD = $env:PLUMBCHECK_ANDROID_STORE_PASSWORD
        $env:PLUMBCHECK_ANDROID_KEYSTORE = $keystorePath
        $env:PLUMBCHECK_ANDROID_KEY_ALIAS = 'plumbcheck'
    }
    $variant = if ($Release) { 'Release' } else { 'Debug' }
    & android/gradlew.bat -p android --no-daemon --console=plain "test${variant}UnitTest" "assemble$variant" "lint$variant"
    if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
    $version = (Get-Content -Raw package.json | ConvertFrom-Json).version
    $variantPath = $variant.ToLower()
    $apk = Join-Path $projectDirectory "android\app\build\outputs\apk\$variantPath\app-$variantPath.apk"
    $destination = Join-Path $projectDirectory 'dist\android'
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $filename = "PlumbCheck-$version-Android-$variant.apk"
    Copy-Item -LiteralPath $apk -Destination (Join-Path $destination $filename)
    Get-FileHash -LiteralPath (Join-Path $destination $filename) -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLower())  $filename" } | Set-Content -LiteralPath (Join-Path $destination 'SHA256SUMS.txt')
    Write-Output "Android artifact: $destination\$filename"
    if ($Release) { Write-Output "Preview signing key retained privately at $keystorePath. Back it up securely before using this identity for long-term distribution." }
} finally {
    Remove-Item Env:PLUMBCHECK_ANDROID_STORE_PASSWORD,Env:PLUMBCHECK_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
