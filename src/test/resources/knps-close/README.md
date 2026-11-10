# 국립공원 탐방로 통제 자료(원본 그대로)

| 파일 | 받은 곳 | 받은 날 | 내용 |
|---|---|---|---|
| 탐방로_통제이력.csv | https://www.data.go.kr/data/15165806/fileData.do (국립공원공단_탐방로_통제이력, 파일 데이터, 로그인 없이) | 2026-11-10 | UTF-8(BOM), 1000줄 + 머리줄. 칸: 공고연도 · 계절구분 · 공원명 · 통제기간일수 · 통제시작월 · 통제종료월 · 통제목적표준분류 · 출발지점명 · 도착지점명 · 반복통제여부. 2014 · 2016 · 2018 · 2019 · 2020 · 2022 (봄철 · 가을철) |

- 2026 가을(11-15 ~ 12-15, 148구간) 공단 본사 보도자료의 붙임 표는 2026-11-10 에 못 찾음: 공단 누리집 보도 · 설명 자료(제목 "산불" 검색)에는 공원 사무소별 글만 있고, 정책브리핑에서도 원문을 찾지 못함.
- 공단 누리집 "통제정보"(https://www.knps.or.kr/front/portal/safe/acsCtrList.do?menuNo=8000340)는 공원(사무소)별 정상 · 부분통제 · 기준시간을 보여 줌(공원 이름을 누르면 세부).
- acsCtrList.html: 공단 누리집 통제정보 목록(https://www.knps.or.kr/front/portal/safe/acsCtrList.do?menuNo=8000340) - routefly-batch src/test/resources/knps-ctrl/ 에서 복사(2026-11-11 PC 가 받음). 공원(사무소) ↔ 세부 화면 번호(rstId)만 씀. 공단 robots.txt 가 긁기를 막아 배치로 받지 않음.
- 이 둘로 tools/knps-close/build.py 가 src/main/webapp/data/knps-close.json 을 만듦(KnpsCloseTest 가 같은지 봄).
