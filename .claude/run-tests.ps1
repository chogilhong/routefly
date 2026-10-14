# routefly (web) tests without Maven: javac + JUnit 4.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\run-tests.ps1 [-Only web.WebBasicsTest,...]
#        -Run package.Class [args...] : run a probe program (main) instead of tests, e.g. -Run web.PetTourProbe
# NOTE: ASCII-only on purpose (Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI).
param([string[]]$Only, [string]$Run, [Parameter(ValueFromRemainingArguments = $true)][string[]]$RunArgs)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jdk  = 'C:\GH\java\jdk-21\bin'
$m2   = Join-Path $env:USERPROFILE '.m2\repository'
$out  = Join-Path $root 'target\claude-test'

# @( ... ) around the pipeline keeps it a list (see routefly-batch bin\run-dev.ps1).
$deps = @(@(
  'junit\junit\4.13.2\junit-4.13.2.jar',
  'org\hamcrest\hamcrest-core\1.3\hamcrest-core-1.3.jar',
  'com\google\code\gson\gson\2.14.0\gson-2.14.0.jar',
  'org\mybatis\mybatis\3.5.19\mybatis-3.5.19.jar',
  'org\apache\logging\log4j\log4j-api\2.24.3\log4j-api-2.24.3.jar',
  'org\apache\logging\log4j\log4j-core\2.24.3\log4j-core-2.24.3.jar',
  'jakarta\servlet\jakarta.servlet-api\6.1.0\jakarta.servlet-api-6.1.0.jar'
) | ForEach-Object { Join-Path $m2 $_ })
foreach ($d in $deps) { if (-not (Test-Path $d)) { Write-Output "MISSING $d"; exit 1 } }
$cp = $deps -join ';'

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
$mainOut = Join-Path $out 'main'; $testOut = Join-Path $out 'test'
New-Item -ItemType Directory -Force $mainOut, $testOut | Out-Null

$mainSrc = Get-ChildItem (Join-Path $root 'src\main\java') -Recurse -Filter *.java | ForEach-Object FullName
$testSrc = Get-ChildItem (Join-Path $root 'src\test\java') -Recurse -Filter *.java | ForEach-Object FullName
& "$jdk\javac.exe" -encoding UTF-8 --release 17 -nowarn -proc:none -d $mainOut -cp $cp $mainSrc
if ($LASTEXITCODE -ne 0) { Write-Output 'COMPILE-FAILED main'; exit 1 }
& "$jdk\javac.exe" -encoding UTF-8 --release 17 -nowarn -proc:none -d $testOut -cp "$mainOut;$cp" $testSrc
if ($LASTEXITCODE -ne 0) { Write-Output 'COMPILE-FAILED test'; exit 1 }

$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$classes = @(if ($Only.Count -gt 0) { $Only | ForEach-Object { "com.gh.routefly.$($_.Trim())" } } else {
  Get-ChildItem $testOut -Recurse -Filter *Test.class | Where-Object { $_.Name -notmatch '\$' } |
    ForEach-Object { ($_.FullName.Substring($testOut.Length + 1) -replace '\.class$','') -replace '\\','.' }
})
$resDir = Join-Path $root 'src\main\resources'
if ($Run) {
  Push-Location $root
  & "$jdk\java.exe" "-Dfile.encoding=UTF-8" "-Dstdout.encoding=UTF-8" -cp "$testOut;$mainOut;$resDir;$cp" "com.gh.routefly.$Run" @RunArgs
  $rc = $LASTEXITCODE
  Pop-Location
  exit $rc
}
Push-Location $root
# src\main\resources (knps-maps.properties etc.) must be on the class path too - 2026-10-11 ParkServletTest
& "$jdk\java.exe" -cp "$testOut;$mainOut;$resDir;$cp" org.junit.runner.JUnitCore @classes
$rc = $LASTEXITCODE
Pop-Location
exit $rc
