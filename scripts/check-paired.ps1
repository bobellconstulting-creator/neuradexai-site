$paths = @(
  'C:/Users/bobel/.openclaw/devices/paired.json',
  'C:/Users/bobel/.openclaw-linda/.openclaw/devices/paired.json',
  'C:/Users/bobel/.openclaw-marcus/.openclaw/devices/paired.json',
  'C:/Users/bobel/.openclaw-vault/.openclaw/devices/paired.json'
)
$deviceId = '3c91276f89d41bf64e9f5811189991383f794818c2eb5a18b3e953574b8111d2'
foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    $c = Get-Content -LiteralPath $p -Raw
    if ($c -match $deviceId) {
      Write-Output "PAIRED: $p"
    } else {
      Write-Output "MISSING_DEVICE: $p"
    }
  } else {
    Write-Output "FILE_NOT_FOUND: $p"
  }
}
