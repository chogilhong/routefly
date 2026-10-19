# routefly WAR without Maven (javac + jar) - same contents as "mvn package" (target/routefly.war).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\build-war.ps1
# Output: target\routefly.war  (copy it to the server - docs/deploy-lightsail.md 7)
# NOTE: ASCII-only on purpose (Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI).
# 2026-10-19: the PC has no Maven; Lightsail deploy needs a war. Jar list = WEB-INF/lib of "mvn package" (pom.xml, runtime scope).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jdk  = 'C:\GH\java\jdk-21\bin'
$m2   = Join-Path $env:USERPROFILE '.m2\repository'

# runtime jars (servlet-api is "provided" by Tomcat, junit is test - not included)
$libs = @(@(
  'com\google\code\gson\gson\2.14.0\gson-2.14.0.jar',
  'com\google\errorprone\error_prone_annotations\2.48.0\error_prone_annotations-2.48.0.jar',
  'org\mybatis\mybatis\3.5.19\mybatis-3.5.19.jar',
  'org\mariadb\jdbc\mariadb-java-client\3.5.10\mariadb-java-client-3.5.10.jar',
  'org\apache\logging\log4j\log4j-api\2.24.3\log4j-api-2.24.3.jar',
  'org\apache\logging\log4j\log4j-core\2.24.3\log4j-core-2.24.3.jar'
) | ForEach-Object { Join-Path $m2 $_ })
$servlet = Join-Path $m2 'jakarta\servlet\jakarta.servlet-api\6.1.0\jakarta.servlet-api-6.1.0.jar'
foreach ($d in $libs + @($servlet)) { if (-not (Test-Path $d)) { Write-Output "MISSING $d"; exit 1 } }

$stage = Join-Path $root 'target\war-stage'
$war   = Join-Path $root 'target\routefly.war'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
$classes = Join-Path $stage 'WEB-INF\classes'
$lib     = Join-Path $stage 'WEB-INF\lib'
New-Item -ItemType Directory -Force $classes, $lib | Out-Null

# 1) web files (html, js, css, data, img ...)
Copy-Item (Join-Path $root 'src\main\webapp\*') $stage -Recurse -Force
# 2) compiled classes (same flags as run-tests.ps1)
$mainSrc = Get-ChildItem (Join-Path $root 'src\main\java') -Recurse -Filter *.java | ForEach-Object FullName
& "$jdk\javac.exe" -encoding UTF-8 --release 17 -nowarn -proc:none -d $classes -cp (($libs + @($servlet)) -join ';') $mainSrc
if ($LASTEXITCODE -ne 0) { Write-Output 'COMPILE-FAILED'; exit 1 }
# 3) resources (log4j2.xml, knps-maps.properties ...) - the real config.properties is never in the repo
Copy-Item (Join-Path $root 'src\main\resources\*') $classes -Recurse -Force
Get-ChildItem $classes -Recurse -Filter 'config.properties' | Remove-Item -Force
# 4) jars
foreach ($d in $libs) { Copy-Item $d $lib }

if (Test-Path $war) { Remove-Item $war -Force }
& "$jdk\jar.exe" --create --file $war -C $stage .
if ($LASTEXITCODE -ne 0) { Write-Output 'JAR-FAILED'; exit 1 }
Remove-Item $stage -Recurse -Force
$n = (& "$jdk\jar.exe" --list --file $war | Measure-Object).Count
Write-Output ("OK " + $war + " " + (Get-Item $war).Length + " bytes, " + $n + " entries")
