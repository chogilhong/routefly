# routefly 바탕 지도(벡터 PMTiles) - C-2

2026-11-22 홍TV님 "이거 하자고". OSM 타일 서버(tile.openstreetmap.org · OpenTopoMap)는 이용 규칙 때문에 손님 화면에 못 쓰고(운영자 기기만),
V-World 화면은 영상 · 다시 배포에 조건이 있어(약관 제13 · 19조, PC 확인), 우리 서버에 우리 바탕 지도를 둡니다.
램블러 출처 줄(© Mapterhorn | © OpenMapTiles © OpenStreetMap contributors)로 보아 같은 종류의 방법입니다. 램블러의 색 · 아이콘 · 글꼴은 따라 하지 않습니다.

## 순서

| 단계 | 할 일 | 누가 |
|---|---|---|
| 1 | `tools/basemap/build-korea.ps1` 로 korea.pmtiles 를 만들고 크기 · 걸린 시간을 잼 | PC Claude |
| 2 | 서버에 파일을 두고(nginx 가 Range 요청으로 내줌) trip.html 에만 붙여 봄. 글꼴(glyphs) · 아이콘(sprite)도 우리 서버에 | 웹 Claude(코드) · PC(배포) |
| 3 | 마음에 들면 따라가기 · GPX 편집 · 3D 영상으로 넓힘 | 홍TV님 결정 뒤 |

## 1단계 결과 적는 곳

(PC 가 채움: 파일 크기 MB · 걸린 시간 · 받은 자료 크기 · planetiler.jar SHA-256 · OSM 자료 날짜)

## 자료 · 사용 조건

| 무엇 | 조건 |
|---|---|
| OpenStreetMap 자료 | ODbL - "© OpenStreetMap contributors" 늘 보이게 |
| OpenMapTiles 양식(Planetiler 기본 결과) | CC-BY 4.0 - "© OpenMapTiles" 표시 |
| Planetiler 프로그램 | Apache-2.0(만드는 데만 씀, 서버에 올리지 않음) |
| 지형 음영 · 등고선 | 지금처럼 Terrain Tiles(AWS Open Data) + maplibre-contour, 폰에서 그림 |

## 다시 만들기

몇 달에 한 번 PC 에서 `-Force` 로 다시 만들어 올립니다(OSM 이 바뀐 만큼). 주기는 1 · 2단계를 본 뒤 정합니다.
