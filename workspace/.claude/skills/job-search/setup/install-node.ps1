# Installs Node (current LTS) into <workspace>\.runtime\node for this folder only.
# No admin rights, nothing system-wide. Then installs the skill's dependencies
# and puts Node on the PATH for Claude via .claude\settings.local.json.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/job-search/setup/install-node.ps1
#
# Safe to re-run. Windows.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$SkillDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Workspace = (Resolve-Path (Join-Path $SkillDir '..\..\..')).Path
$Runtime = Join-Path $Workspace '.runtime'
$Dest = Join-Path $Runtime 'node'
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }

Write-Host 'Finding the current Node LTS release...'
$Release = (Invoke-RestMethod -UseBasicParsing 'https://nodejs.org/dist/index.json') | Where-Object { $_.lts } | Select-Object -First 1
if (-not $Release) { throw 'Could not read the Node release list. Check the internet connection.' }
$Version = $Release.version
$Name = "node-$Version-win-$Arch"

$Tmp = Join-Path $Runtime 'tmp'
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
Write-Host "Downloading $Name..."
$Zip = Join-Path $Tmp "$Name.zip"
Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$Version/$Name.zip" -OutFile $Zip
$Sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$Version/SHASUMS256.txt").Content

Write-Host 'Checking the download...'
$Expected = ($Sums -split "`n" | Where-Object { $_ -match " $Name\.zip$" }) -replace ' .*', ''
$Actual = (Get-FileHash -Algorithm SHA256 $Zip).Hash.ToLower()
if (-not $Expected -or $Expected.Trim() -ne $Actual) {
  Remove-Item -Recurse -Force $Tmp
  throw 'The download did not match its checksum. Nothing was installed.'
}

Expand-Archive -Force $Zip -DestinationPath $Tmp
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
Move-Item (Join-Path $Tmp $Name) $Dest
Remove-Item -Recurse -Force $Tmp
Write-Host "Node $Version installed in $Dest"

$env:Path = "$Dest;$env:Path"
Write-Host "Installing the skill's dependencies..."
Push-Location $SkillDir
& (Join-Path $Dest 'npm.cmd') ci --no-audit --no-fund --loglevel=error
Pop-Location

& (Join-Path $Dest 'node.exe') (Join-Path $SkillDir 'setup\write-path.mjs') $Workspace $Dest
Write-Host 'Done.'
