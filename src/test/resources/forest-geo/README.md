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
