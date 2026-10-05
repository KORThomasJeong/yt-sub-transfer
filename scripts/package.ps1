# Builds dist/yt-sub-transfer-<version>.zip for Chrome Web Store upload.
# Uses ZipArchive directly: Compress-Archive on Windows PowerShell 5.1
# writes "\" separators, which the Web Store rejects.
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content "$root\manifest.json" -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zipPath = Join-Path $dist "yt-sub-transfer-$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
$zip = [IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  $files = @(Get-Item "$root\manifest.json") + @('_locales', 'icons', 'page', 'popup' | ForEach-Object { Get-ChildItem (Join-Path $root $_) -Recurse -File })
  foreach ($f in $files) {
    $name = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $name, 'Optimal') | Out-Null
  }
} finally { $zip.Dispose() }
Write-Output $zipPath
