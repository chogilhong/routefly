# routefly 바탕 지도(벡터 PMTiles) - C-2

2026-11-23 지도 만드는 도구는 tools 저장소 `map/` 으로 옮겼습니다(짜임 · 층 목록 · 쓰는 법은 거기 README). 이 문서는 routefly 에 붙이는 쪽만 남깁니다.
지도 모양(색 · 글자 · 층) · 글꼴 · 구 이름 · 지하철 노선 자료도 같은 날 패키지(tools `map/rfmap`, `window.RFMap`)로 옮겼습니다. routefly 는 `node map/rfmap/sync.js` 가 복사한 `vendor/rfmap-1.0.0/` 을 씁니다(직접 고치지 않음).

| 서버 파일(`/var/www/routefly/tiles/`) | 무엇 | 없으면 |
|---|---|---|
| `korea.pmtiles` | 바탕(OpenMapTiles 양식) | V-World 바탕으로 그림 |
| `korea-extra.pmtiles` | 더하기 층 - 아파트 단지 · 동 이름(tools `map/extra.yml`) | 바탕만(화면이 머리를 못 읽으면 건너뜀) |

2026-11-22 홍TV님 "이거 하자고". OSM 타일 서버(tile.openstreetmap.org · OpenTopoMap)는 이용 규칙 때문에 손님 화면에 못 쓰고(운영자 기기만),
V-World 화면은 영상 · 다시 배포에 조건이 있어(약관 제13 · 19조, PC 확인), 우리 서버에 우리 바탕 지도를 둡니다.
램블러 출처 줄(© Mapterhorn | © OpenMapTiles © OpenStreetMap contributors)로 보아 같은 종류의 방법입니다. 램블러의 색 · 아이콘 · 글꼴은 따라 하지 않습니다.

## 순서

| 단계 | 할 일 | 누가 |
|---|---|---|
| 1 | tools 저장소 `map/build-korea.ps1`(2026-11-23 routefly `tools/basemap/` 에서 옮김) 로 korea.pmtiles 를 만들고 크기 · 걸린 시간을 잼 | PC Claude |
| 2 | 서버에 파일을 두고(nginx 가 Range 요청으로 내줌) trip.html 에만 붙여 봄. 글꼴(glyphs) · 아이콘(sprite)도 우리 서버에 | 웹 Claude(코드) · PC(배포) |
| 3 | 마음에 들면 따라가기 · GPX 편집 · 3D 영상으로 넓힘 | 홍TV님 결정 뒤 |

## 1단계 결과 적는 곳

(PC 가 채움: 파일 크기 MB · 걸린 시간 · 받은 자료 크기 · planetiler.jar SHA-256 · OSM 자료 날짜)

2026-11-22 PC(814b2ec2 build-korea.ps1, 기록 target\basemap-last.txt):

| 무엇 | 값 |
|---|---|
| 결과 | korea.pmtiles 361.5 MB(Planetiler 집계 archive 379MB), 확대 0 ~ 14 |
| 걸린 시간 | 스크립트 전체 53.7분(남한 pbf 받기 포함) · Planetiler 12분 14초(그중 바다 · 호수 · Natural Earth 받기 8분 8초) |
| 받은 자료 | south-korea.osm.pbf 278.9 MB · water-polygons-split-3857.zip 890.8 MB · natural_earth_vector.sqlite.zip 414.1 MB · lake_centerline.shp.zip 77.2 MB |
| planetiler.jar | v0.10.2(빌드 2026-03-28T14:35:36Z), SHA-256 F310BD0413E2E4512B27F4046D418664E8E1D3BF31603C2A70E23DE06C167E4D |
| OSM 자료 날짜 | 2026-11-22 에 받은 Geofabrik asia/south-korea-latest.osm.pbf(pbf 안의 기준 시각은 따로 확인 안 함) |
| OSM 크기 | 점 39,093,507 · 길 3,879,404 · 관계 65,336 |
| 자료 오류(Planetiler 집계) | render_snap_fix_input 78,094 · merge_snap_fix_input 34 · osm_multipolygon_duplicate_member 18 · omt_fix_water_before_ne_intersect 6 (모두 고쳐서 그림 - 실패 아님) |
| 출처 문구(Planetiler 안내) | © OpenMapTiles © OpenStreetMap contributors |

## 자료 · 사용 조건

| 무엇 | 조건 |
|---|---|
| OpenStreetMap 자료 | ODbL - "© OpenStreetMap contributors" 늘 보이게 |
| OpenMapTiles 양식(Planetiler 기본 결과) | CC-BY 4.0 - "© OpenMapTiles" 표시 |
| Planetiler 프로그램 | Apache-2.0(만드는 데만 씀, 서버에 올리지 않음) |
| 지형 음영 · 등고선 | 지금처럼 Terrain Tiles(AWS Open Data) + maplibre-contour, 폰에서 그림 |

## 다시 만들기

몇 달에 한 번 PC 에서 `-Force` 로 다시 만들어 올립니다(OSM 이 바뀐 만큼). 주기는 1 · 2단계를 본 뒤 정합니다.

## 2단계 - 기록 보기(trip.html)에 붙이기 (2026-11-22)

화면 쪽은 들어가 있고, 설정 `map.basemap.url` 이 비어 있으면 지금 바탕(V-World · 지형 음영) 그대로입니다.

| 무엇 | 어디 |
|---|---|
| 지도 모양 | `RF.vectorStyle`(course-kit.js) - OpenMapTiles 양식의 숲 · 물 · 길 · 산길(점선) · 봉우리(▲ 이름 · 높이) · 마을 이름 + 지금 지형 음영 |
| 파일 읽기 | `vendor/pmtiles-4.5.0/pmtiles.js`(BSD-3) - 지도 프로그램이 `pmtiles://` 주소를 Range 조각으로 받음 |
| 글꼴 | `vendor/rfmap-1.0.0/fonts/Noto Sans Regular/*.pbf`(우리 지도 패키지 - tools 저장소 map/rfmap, 2026-11-23)(OFL, protomaps/basemaps-assets) - 숫자 · 로마자 · 기호(▲ 는 9472-9727)만. 한글은 폰 글꼴(localIdeographFontFamily) |
| 주소 | `api/map-config` 의 `basemapUrl`(설정 map.basemap.url - 같은 사이트 경로나 https, .pmtiles 로 끝날 때만) |
| 서비스워커 | `.pmtiles` 는 캐시하지 않고 서버로 |
| 대피소 · 절 등 | `poi-hike` 층(2026-11-22) - OpenMapTiles v3.15 poi: 산장(class lodging · subclass alpine_hut) · 쉼터(shelter) · 절(place_of_worship · subclass buddhist) · 전망대(attraction · viewpoint) · 약수터(drinking_water). 확대 12 ~ 13 은 중요한 것만, 14 부터 모두. 아이콘은 trip.js 가 캔버스로 그림(RF.MAP_ICONS) |
| 지나간 봉우리 | 기록 선 150m 안 봉우리는 `peak-on` 층(크게 · 진하게) - trip.js 가 지도 조각이 올 때마다 RF.peaksNear 로 찾음 |

### PC(로컬)에서 먼저 보기
1. `target\basemap\korea.pmtiles` 를 `wtpwebapps\routefly\tiles\korea.pmtiles` 로 복사(톰캣 기본 서블릿이 Range 를 받음)
2. PC 설정 파일에 `map.basemap.url=tiles/korea.pmtiles` (홍TV님이 넣음 - 설정 파일은 Claude 가 열지 않음)
3. http://localhost:8080/routefly/trip.html 에서 GPX 를 열어 보기

### 운영 서버 (2026-11-22 - 서버 명령은 홍TV님)

운영 설정에는 이미 `map.basemap.url=tiles/korea.pmtiles` 가 들어 있습니다. trip.html(/routefly/trip.html) 기준 상대 주소라 `/routefly/tiles/korea.pmtiles` 로 갑니다.
파일이 없는 동안은 trip.js 가 머리를 못 읽고 V-World 바탕으로 그립니다(2a07db20). 파일을 올리면 톰캣 재시작 없이 저절로 우리 지도로 바뀝니다.
디스크: / 77G 중 63G 남음(2026-11-22 PC) - 파일 361.5 MB(379,031,395 바이트).

파일 자리는 `/var/www/routefly/tiles/` 입니다. `/opt/routefly` 는 설정 파일(config.properties) 자리라 nginx(www-data)가 읽도록 권한을 넓히지 않습니다.

1. PC(PowerShell)에서 올리기

```powershell
scp -i <키.pem> target\basemap\korea.pmtiles ubuntu@routefly.kr:~
```

2. 서버에서 자리 잡기

```bash
sudo mkdir -p /var/www/routefly/tiles
sudo install -o root -g root -m 644 ~/korea.pmtiles /var/www/routefly/tiles/korea.pmtiles && rm ~/korea.pmtiles
ls -l /var/www/routefly/tiles/korea.pmtiles      # 379031395 바이트
```

3. nginx - `/etc/nginx/sites-available/routefly` 의 443 server 블록(certbot 이 만든 것) 안 `location / {` 바로 위에 넣기

```nginx
    # 바탕 지도 파일(2026-11-22) - 정적 파일이라 Range(206)는 nginx 가 기본으로 받음. gzip 하지 않음(octet-stream 은 gzip_types 밖)
    location /routefly/tiles/ {
        alias /var/www/routefly/tiles/;
        add_header Cache-Control "public, max-age=86400" always;
        # location 에 add_header 를 쓰면 server 쪽 add_header(HSTS)가 이어지지 않으니 여기 다시 적음
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options nosniff always;
    }
```

```bash
sudo cp /etc/nginx/sites-available/routefly ~/nginx-site.bak-20261122
sudo nano /etc/nginx/sites-available/routefly
sudo nginx -t && sudo systemctl reload nginx
```

4. 확인(서버나 PC 어디서든)

```bash
curl -s -o /dev/null -A routefly-check -r 0-16383 -w "%{http_code} %{size_download}\n" https://routefly.kr/routefly/tiles/korea.pmtiles   # 206 16384
curl -sI -A routefly-check https://routefly.kr/routefly/tiles/korea.pmtiles | grep -iE "strict-transport|cache-control|accept-ranges"
```

그 뒤 내 기록 → 📂 GPX 열기에서 바탕이 우리 지도(숲 · 물 · 길 · ▲ 봉우리)로 바뀌고, 출처가 "© OpenMapTiles © OpenStreetMap contributors" 인지 봅니다.

다시 만들어 올릴 때는 같은 이름으로 바꿔 넣습니다. 하루 캐시라 섞일 수 있는 조각은 pmtiles.js 가 ETag 로 알아채고 다시 받습니다.
