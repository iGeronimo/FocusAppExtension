$ErrorActionPreference = 'Stop'
$cssUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap'
$headers = @{ 'User-Agent' = 'Mozilla/5.0' }
$css = (Invoke-WebRequest -Uri $cssUrl -Headers $headers).Content
$blocks = ($css -split '@font-face') | Where-Object { $_.Trim() -ne '' }
$fontsDir = Join-Path $PSScriptRoot '..' | Join-Path -ChildPath 'fonts'
if (!(Test-Path $fontsDir)) { New-Item -ItemType Directory -Force -Path $fontsDir | Out-Null }
foreach($b in $blocks){
  $weight = [regex]::Match($b, 'font-weight:\s*(\d+)').Groups[1].Value
  $m = [regex]::Match($b, 'url\(([^)]+\.woff2)\)')
  if ($m.Success -and $weight){
    $url = $m.Groups[1].Value.Trim('"',"'")
    if ($url.StartsWith('//')) { $url = 'https:' + $url }
    $out = Join-Path $fontsDir ("roboto-mono-$weight.woff2")
    Invoke-WebRequest -Uri $url -Headers $headers -OutFile $out
    Write-Host "Saved $out"
  }
}
