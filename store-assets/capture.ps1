# Renders store screenshots (1280x800) and promo tiles (440x280) with headless Chrome.
$out = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force $out | Out-Null
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$server = Start-Process node -ArgumentList "`"$PSScriptRoot\serve.mjs`" 8765" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 1
try {
  $jobs = @()
  foreach ($lang in 'ko', 'en') {
    $i = 1
    foreach ($scene in 'free', 'export', 'import') {
      $jobs += ,@("$out\screenshot-$lang-$i-$scene.png", "http://localhost:8765/store-assets/shot.html?scene=$scene&lang=$lang", '1280,800', $lang); $i++
    }
    $jobs += ,@("$out\promo-small-$lang.png", "http://localhost:8765/store-assets/promo.html?lang=$lang", '440,280', $lang)
  }
  foreach ($j in $jobs) {
    if (Test-Path $j[0]) { Remove-Item $j[0] -Force }
    for ($try = 1; $try -le 4 -and -not (Test-Path $j[0]); $try++) {
      $profileDir = Join-Path $env:TEMP "yts-capture-$([guid]::NewGuid())"
      $args = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--blink-settings=preferredColorScheme=1', "--lang=$($j[3])", "--user-data-dir=$profileDir", '--virtual-time-budget=6000',
        "--window-size=$($j[2])", "--screenshot=$($j[0])", $j[1])
      Start-Process $chrome -ArgumentList $args -Wait -WindowStyle Hidden
      Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Output "$(Test-Path $j[0]) $($j[0])"
  }
} finally { Stop-Process -Id $server.Id -Force }
