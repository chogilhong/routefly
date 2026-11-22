# routefly 바탕 지도 파일(벡터 PMTiles) 시험 만들기 - C-2 1단계(2026-11-22 홍TV님 "이거 하자고")
# (UTF-8 BOM 으로 저장 - Windows PowerShell 5.1 이 한글을 바로 읽게)
#
# 하는 일: 공개 프로그램 Planetiler(Apache-2.0)로 한국 OSM 자료를 OpenMapTiles 양식의 지도 파일 하나(korea.pmtiles)로 만들고 크기를 잽니다.
# 서버 · 화면은 아직 건드리지 않습니다(2단계에서 trip.html 에만 붙여 봄). 자세한 것은 docs/basemap/README.md.
#
# 받는 것(모두 -Work 폴더 안, 처음 한 번):
#   planetiler.jar v0.10.2(GitHub onthegomap/planetiler) · 남한 OSM(Geofabrik south-korea) ·
#   Planetiler --download 가 받는 바다 · 호수 · Natural Earth 자료(합쳐 1GB 남짓 - 바다 다각형이 가장 큼)
# 출처 표시(지도에 붙일 때): "© OpenMapTiles © OpenStreetMap contributors"
#
# 쓰는 법(PC, PowerShell): .\tools\basemap\build-korea.ps1            # 기본 확대 14 까지(그 위는 폰이 늘려 그림)
#                          .\tools\basemap\build-korea.ps1 -Force     # 다시 만들기
param(
    [string]$Work = "C:\GH\workspace\routefly\target\basemap",
    [string]$Java = "C:\GH\java\jdk-21\bin\java.exe",
    [string]$Version = "v0.10.2",
    [int]$MaxZoom = 14,
    [string]$Heap = "4g",
    [switch]$Force
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$jar = Join-Path $Work "planetiler-$Version.jar"
$out = Join-Path $Work "korea.pmtiles"

if (-not (Test-Path $jar)) {
    Write-Host "Planetiler $Version 받기"
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/onthegomap/planetiler/releases/download/$Version/planetiler.jar" -OutFile $jar
}
Write-Host ("planetiler.jar SHA-256: " + (Get-FileHash $jar -Algorithm SHA256).Hash)

if ((Test-Path $out) -and -not $Force) { Write-Host "이미 있음(다시 만들려면 -Force): $out" }
else {
    $t0 = Get-Date
    Push-Location $Work
    try {
        # --area=south-korea : Geofabrik 남한 자료를 data\sources 에 받음 / --download : 바다 · 호수 · Natural Earth 도
        & $Java "-Xmx$Heap" -jar $jar --download --area=south-korea --maxzoom=$MaxZoom --output=$out --force
        if ($LASTEXITCODE -ne 0) { throw "Planetiler 실패(종료 코드 $LASTEXITCODE)" }
    } finally { Pop-Location }
    Write-Host ("걸린 시간: " + [math]::Round(((Get-Date) - $t0).TotalMinutes, 1) + "분")
}

$mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "결과: $out  ($mb MB, 확대 0 ~ $MaxZoom)"
Get-ChildItem (Join-Path $Work "data\sources") -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ("  받은 자료 " + $_.Name + " " + [math]::Round($_.Length / 1MB, 1) + " MB") }
