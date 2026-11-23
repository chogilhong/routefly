# rfmap - 우리 지도 패키지

routefly 의 지도 모양 · 글꼴 · 지도 자료를 한 묶음으로 둔 것입니다(2026-11-23 홍TV님 "지도 모양까지 전부 · 패키지로 만들어 두자").
지도 파일(korea.pmtiles · korea-extra.pmtiles)은 `map/` 의 스크립트가 만들고, 이 패키지는 그 파일을 MapLibre 지도로 그리는 쪽입니다.

| 파일 | 무엇 |
|---|---|
| `rfmap.js` | `window.RFMap` - 지도 모양 · 아이콘 · 봉우리 거름 · 조각 직접 읽기 · 등고선 설정 |
| `data/gu-labels.json` | 구 이름 자리 98곳(`../gu-labels.py` 가 바탕에서 뽑음) |
| `data/subway-lines.json` | 지하철 노선 색 선(`../subway-lines.py` 가 OSM 노선 관계에서 만듦) |
| `fonts/Noto Sans Regular/*.pbf` · `fonts/OFL.txt` | 숫자 · 로마자 · ▲ 글꼴(protomaps/basemaps-assets, OFL). 한글은 폰 글꼴 |
| `test/rfmap.test.js` | `node test/rfmap.test.js` |
| `sync.js` | 앱에 복사: `node sync.js <앱의 웹 폴더> [앱의 테스트 폴더]` → `vendor/rfmap-<판>/` (+ rfmap.test.js) |

## 쓰는 법

```html
<script src="vendor/maplibre-gl-5.24.0/maplibre-gl.js"></script>
<script src="vendor/pmtiles-4.5.0/pmtiles.js"></script>
<script src="vendor/rfmap-1.1.7/rfmap.js"></script>
<script>
RFMap.open("tiles/korea.pmtiles", "https://…/{z}/{x}/{y}.png", { lang: "ko" }).then(function (style) {
    var map = new maplibregl.Map({ container: "map", style: style || 다른_바탕, localIdeographFontFamily: "'Noto Sans KR', sans-serif" });
    map.on("styleimagemissing", function (e) { RFMap.iconImage(map, e.id); });
});
</script>
```

| 이름 | 하는 일 |
|---|---|
| `open(basemapUrl, demUrl, {lang})` | 바탕 파일 머리를 읽고 pmtiles:// 를 걸어 지도 모양을 돌려줌. 옆에 `-extra.pmtiles` 가 있으면 겹침. 못 읽으면 null |
| `style(c, fonts)` | 지도 모양(순수 함수). c = {basemapUrl, demUrl, extraUrl?, lang?, data?}, fonts 기본 = 이 패키지 fonts/ |
| `ICONS` · `iconImage(map, id)` | poi 아이콘(대피소 · 절 · 전망대 · 약수터 · 역) 그리기 |
| `poiShowFilter(icon, hidden, dropNames)` | poi 층 거름(숨긴 종류 · 겹치는 이름 빼기) |
| `PEAK_KEY_EXPR` · `peakKey(p)` · `peakOnFilter(keys, on, drop)` · `peaksNear(peaks, lat[], lon[], m)` | 봉우리를 이름\|높이로 가리켜 "지나간 봉우리" 층을 고름 |
| `mvtPoints(u8, layer)` · `tilesAlong(lat[], lon[], z, max)` · `tileLonLat(...)` · `tilePeaks(lat[], lon[])` | 지도 프로그램 밖에서 조각을 바로 읽음(처음 화면에 없는 작은 봉우리 찾기) |
| `CONTOUR_STEPS` · `contourPaint(light)` | 등고선(maplibre-contour) 간격 · 색 |
| `demEle(demUrl, lon, lat, z?)` · `terrariumEle` · `tilePixel` | 한 자리의 지형 해발(Terrarium 지형 그림 한 장을 읽음, 약 30m 격자 - "약" 으로 보일 값) |
| `shopList(map, layer?)` | 가게 점(rf-shop)을 누르면 그 건물 가게 목록 창(글자는 textContent 로만) |

지도 모양의 층 id(앱이 거름 · 숨기기에 씀): `building`(14 ~) · `peak` · `peak-on` · `poi-hike`(산장 · 절 · 전망대 · 약수터 · 역 - OSM 쉼터는 안 그림) · `poi-city`(식당 · 카페 · 가게 · 병원 · 학교 · 은행 · 관공서 · 공원 · 주차장 · 숙소, 15 ~) · `poi-bus`(버스 정류장, 16 ~) · `rf-hut` · `rf-peak`(source `marks` - 앱이 채움) · `gu-name` · `subway` · `rf-complex` · `rf-apt` · `road-name` · `road-name-major` · `place` · `water-name`.

더하기 층이 있으면(파일 안내의 vector_layers 로 든 층만): `rf-complex` · `rf-apt`(아파트) · `rf-shop`(가게, 16 ~ - 있으면 OSM 의 식당 · 카페 · 가게 · 병원 · 학교 · 숙소는 그리지 않음) · `rf-trail` · `rf-trail-label`(산림청 산길 "↑오름 거리 ↓내림") · `rf-summit`(산림청 정상부 봉우리 "▲ 이름", 11 ~ - OSM 봉우리가 없는 산만) · 역은 `rf-station`(data/stations.json, 10 ~).

판 기록: 1.0.0(2026-11-23) 처음 - routefly 에서 옮김 / 1.1.0(2026-11-23) 건물 · 생활 시설 · 버스 정류장 · 역(처음 화면부터) · 산림청 산길 · 상가정보 가게 · ↑↓ 글꼴 조각(8448-8703)("지도 툴을 완성") / 1.1.1(2026-11-23) 산길 글자를 구간 가운데 점에 가로로(rf_trail_mid) · 이름 없는 업소는 업종으로 · 가게 여백 0 / 1.1.2(2026-11-23) 같은 건물 가게는 "대표 외 n곳" + `shopList(map)` 으로 누르면 목록(shops.py 가 같은 점을 묶음) / 1.1.3(2026-11-23) 가게 글자 작게(10) · 한 줄 길게(10em) · "외 n곳" 은 0.85 배(강남이 빽빽했음) / 1.1.4(2026-11-23) `demEle` 누른 자리 지형 해발 · 가게가 많은 건물부터 자리 / 1.1.5(2026-11-23) `rf-summit` 산림청 정상부 봉우리 이름(영종 백운산 · 송산처럼 OSM 에 없는 봉우리, 높이는 공식 값 확인 전까지 안 넣음) / 1.1.6(2026-11-23) 봉우리 이름을 등산 표시 뒤로(확대 14 에서 송산이 정자에 밀렸음) / 1.1.7(2026-11-23) OSM 쉼터(공원 정자 · 비 가림)는 안 그림 - 대피소 아이콘은 OSM 산장(alpine_hut)과 앱의 공단 대피소만.

## 판 올리기

- 고칠 때마다 판을 올립니다(1.1.0 → 1.1.1 처럼). 앱은 `vendor/rfmap-<판>/` 주소로 받아서, 판이 같으면 브라우저가 옛 rfmap.js 를 계속 씀(2026-11-23 PC: 1.1.0 을 고친 뒤 옛 것이 남음).

- 고치면 `test/rfmap.test.js` 를 돌리고, 쓰는 앱에 `sync.js` 로 복사해 그 앱 테스트도 돌립니다(routefly: course-kit.test.js 가 vendor 복사본으로 지도 모양을 자세히 봄).
- 앱이 바뀐 걸 바로 받게 하려면 `VERSION` 을 올립니다 → 폴더 이름이 `rfmap-<새 판>` 이 되니 앱의 `<script src>` · 서비스워커 캐시 목록도 함께 바꿉니다.
- 출처는 지도 모양 sources 에 들어 있어 MapLibre 출처 칸에 저절로 나옵니다: "© OpenMapTiles © OpenStreetMap contributors", 지형 "Terrain Tiles (AWS Open Data)".
