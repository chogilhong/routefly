# routefly

경로를 3D 지형 위에서 따라가며 보여 주는 웹입니다. 코스를 고르면 출발점으로 날아가 경로를 그리면서
카메라가 따라가고, 진행 거리 · 고도 · 고도 그래프 · 지점 이름표가 같이 움직입니다.

코스 자료는 **routefly-batch** 가 GPX 를 읽어 MariaDB 에 넣습니다. 이 웹은 그 표를 **읽기만** 합니다.
구성은 investing 과 같습니다(Tomcat 11 · Jakarta Servlet 6.1 WAR, JDBC 직접, Gson, Log4j2, 설정 파일은 저장소 밖).

## 처음 셋업

1. 설정 파일을 저장소 밖에 만듭니다: `src/main/resources/config.properties.example` →
   `C:\GH\config\routefly\config.properties` 로 복사하고 값을 채웁니다.
   - `db.url` / `db.user` / `db.password` - routefly-batch 와 같은 DB. 웹은 SELECT 권한만 있으면 됩니다.
     ```sql
     GRANT SELECT ON routefly.* TO '웹계정'@'localhost';
     ```
   - `map.vworld.key` - 배경 위성사진(국토교통부 V-World, 무료 발급, 서비스 주소 등록). 비우면 지형 음영만 나옵니다.
   - `map.dem.url` - 3D 지형 타일. 비우면 AWS Terrain Tiles(routefly-batch 의 기본 `dem.url` 과 같음).
2. 다른 위치에 두려면 톰캣 실행 인자에 `-Droutefly.config=<경로>` 를 넣습니다.
3. 이클립스: File → Import → Maven → Existing Maven Projects → 톰캣 11 서버에 추가.
   주소는 `http://localhost:8080/routefly/`.

## 구조

| 자리 | 내용 |
|---|---|
| `RouteflyConfig` | 설정 파일 읽기(investing 의 InvestingConfig 와 같은 방식) |
| `Db` | 요청마다 JDBC 연결 |
| `CourseQueries` | 코스 표 읽기 + 요청 값 검사(코스 ID · bbox · kind) |
| `CoursesServlet` | `GET /api/courses[?bbox=minLon,minLat,maxLon,maxLat][&kind=hike]` - 코스 목록(요약) |
| `CourseServlet` | `GET /api/course?id=<코스ID>` - 요약 + 경로 점 `[경도,위도,고도,누적거리]` + 이름표 |
| `MapConfigServlet` | `GET /api/map-config` - V-World 키 · 지형 타일 주소 |
| `webapp/index.html`, `js/app.js` | 지도 화면(MapLibre) |
| `webapp/vendor/maplibre-gl-5.24.0` | MapLibre GL JS(BSD-3, LICENSE.txt 동봉) - CDN 없이 이 앱이 내려줍니다 |

코스 자료 응답은 5분 캐시(`Cache-Control: public, max-age=300`)입니다 - 배치가 1시간마다 바꾸는 공개 자료라서입니다.
로그인은 없습니다(investing 과 달리 개인 자료가 없는 공개 화면). 쓰기 API 가 생기면 그때 붙입니다.

## 화면

- **지도**: 3D 지형(Terrarium 고도 타일, 1.25배 과장) + 하늘 · 안개. 배경은 V-World 위성사진(키가 있으면)과
  지명 겹침, 없으면 지형 음영.
- **비행**: `▶ 비행` - 출발점으로 날아간 뒤 경로를 따라갑니다. 코스 길이에 맞춰 줌 · 앞보기 거리 · 시간
  (1× 기준 20~90초)을 정하므로 등산로부터 장거리 경로까지 같은 방식으로 씁니다. `1× / 2× / 4×` 빠르기,
  `전체` 로 코스 전체 보기. 지도를 직접 끌거나 돌리면 멈춥니다. 스페이스 키로 멈춤 / 이어서.
- **고도 그래프**: 지나온 구간을 칠하고 커서가 따라갑니다. 그래프를 누르면 그 거리로 옮깁니다.
- **이름표**: GPX 의 `<wpt>`. 비행 중에는 그 지점에 닿을 때 나타납니다.
- 주소 `#c=<코스ID>` 로 그 코스를 바로 엽니다. 휴대폰 화면에서는 비행을 시작하면 목록을 접습니다.
- 출처 표시(지형 · 위성사진 이용 조건)는 오른쪽 위에 있습니다 - 가리거나 지우지 마세요.

## 시험

```
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\run-tests.ps1
```

DB 없이 돕니다(설정 경로, 코스 ID · bbox · kind 검사, 응답 모양). 화면은 주소에 `?debug` 를 붙이면
`window.routeflyDebug` 로 지도 상태를 볼 수 있습니다(브라우저 자동 시험용).
