# forest-geo - 산림청 등산로 실제 자료(테스트 데이터)

- 출처: 산림청 「등산로 정보」 전국 파일 mountain.zip(산마다 `<산코드>.zip`(shp) · `_geojson.zip` · `_gpx.zip`, 2,932 산)
- 이 폴더: `428302602_geojson.zip`(설악산_대청봉) 을 원본 그대로 - 안쪽 파일 이름은 CP949(zip 의 UTF-8 표시 없음)
  - `PMNTN_설악산_대청봉_428302602.json` 등산로 구간 57줄(esriGeometryPolyline)
  - `PMNTN_SPOT_설악산_대청봉_428302602.json` 지점 45개(esriGeometryPoint)
  - `꼭 읽어보세요.txt` 좌표계 · 자료 설명(CP949)
- 양식: GeoJSON 이 아니라 Esri JSON(`fields` · `features[].attributes` · `geometry.paths`/`x,y`)
- 좌표계: ITRF2000 TM 중부원점(GRS80, 경도 127, 위도 38, 200000 / 600000, 축척 1) - 미터, 위경도로 바꿔야 함
- 기준일: DATA_STDR_ 2016-12-31
- 2026-11-23 PC Claude 가 홍TV님이 받은 파일에서 꺼냄
- `281100601_geojson.zip`(송산, 인천 영종 - 원본 그대로 8,266 B): 구간 3줄 · 지점 11개. 정상부 지점은 MANAGE_SP1 "23" · MANAGE_SP2 "정상" · DETAIL_SPO "정상부", TM 160618.0, 542502.5
  - 전국 지점에서 "정상" 은 MANAGE_SP2 에 1,547개(MANAGE_SP1 23), "정상부" 라는 MANAGE_SP2 도 8개 있음. DETAIL_SPO 는 정상 · 정상부 · 정상석 · "○○산정상" 등 자유 글
- `281100101_geojson.zip`(영종 백운산 - 원본 그대로 40,365 B): 정상 지점이 없고 삼각점(MANAGE_SP2 "기타" · DETAIL_SPO "삼각점") 하나 - 정상 대신 삼각점을 쓰는 테스트용
- `477601201_geojson.zip`(울련산 - 원본 그대로 34,690 B): 시종점 지점 2개의 좌표가 {"x": "NaN", "y": "NaN"} 글자(전국에서 이 2개뿐) - 좌표 NaN 건너뛰기 테스트용
  - 영종 백운산(281100101)은 지점 27개에 "정상" 이 없음(헬기장 · 조망점 · 정자 · 삼각점 157299.7, 543932.2 등)
