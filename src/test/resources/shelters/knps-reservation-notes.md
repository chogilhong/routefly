# 공단 대피소 예약 화면 - 탭 · 주소 조사 (PC 2026-11-21, 로그인 없음)

받은 곳: https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do

## 탭(지리산 · 설악산 · 덕유산 · 소백산)

- 탭은 `<a href="#tab1-1" data-dept-id="B01" data-dept-nm="지리산" data-psb-cnt="3">` 꼴. onclick 속성은 없고, shelter.js(?ver2026002)가 `li` 에 click 을 붙임.
- 누르면 주소는 그대로(#tab1-1 만). NetFunnel_Action({action_id: 'reservation1'}) 대기열을 지난 뒤
  `commn.callAjax` 로 POST `/reservation/shelter/tabShelter.do` (deptId · deptNm · isGreenpoint) → 받은 HTML 조각을 표 자리에 넣음.

| 산 | deptId | psbCnt(화면 값) |
|---|---|---|
| 지리산 | B01 | 3 |
| 설악산 | B03 | 2 |
| 덕유산 | B05 | 2 |
| 소백산 | B12 | 2 |

## 주소에 값을 붙여 열기

- `searchSimpleShelterReservation.do?deptId=B01`: 서버가 그 탭에 is-active 를 붙여 보내지만(설악산 B03 도 같음), 표는 불러오지 않음 -
  화면에 "선택된 대피소가 없습니다. 대피소를 선택해주세요." 그대로, 탭을 한 번 더 눌러야 표가 뜸. (`prkCde=` 같은 다른 이름은 효과 없음)
- `tabShelter.do?deptId=B01` (GET, 쿠키 없이도 200): 표 조각만 옴 - 스타일 · 예약 단추 없는 맨 HTML(새 탭에서 보면 깨진 표).
  NetFunnel 대기열도 건너뛰는 주소라 사람에게 링크로 주기에는 맞지 않음.
- 그래서 바로 그 산 표가 뜨는 주소는 없음. 링크는 `searchSimpleShelterReservation.do?deptId=<id>`(탭만 골라진 화면)가 가장 가까움.

## 받은 파일(curl, 로그인 없음, 2026-11-21 22:5x)

- searchSimpleShelterReservation.html (기본 화면)
- searchSimpleShelterReservation-deptId-B01.html (?deptId=B01 - 지리산 탭 is-active, 표 없음)
- tabShelter-B01.html · B03 · B05 · B12 (표 조각, 대피소 이름 · 날짜별 시설 수)
