# 자료 출처 - 받을 수 있는지 확인 전

2026-11-14 웹 Claude 가 공공데이터포털 각 서비스 설명 페이지(`https://www.data.go.kr/data/<번호>/openapi.do`)의 명세(swagger)에서 옮겼습니다.
실제 응답은 아직 받지 않았습니다(키는 클라우드에 없음). `tidefly.PortalProbe` · `tidefly.ApiHubProbe` 로 받아 `src/test/resources/` 에 둔 뒤 화면을 만듭니다.

## 1. 공공데이터포털 - 국립해양조사원(공공누리 1유형)

모두 `https://apis.data.go.kr/1192136/...`, 공통 요청 칸 `serviceKey`(필수) · `pageNo` · `numOfRows`(최대 300) · `type`(xml · json) · `include` · `exclude`.
응답은 `{header:{resultCode, resultMsg}, body:{items:{item:[...]}, pageNo, numOfRows, totalCount}}`(오류 코드: 3 데이터 없음 · 10 잘못된 요청 칸 · 11 필수 칸 없음).

| 번호 | 이름 | 주소 | 요청 칸(공통 밖) | 응답 칸 |
|---|---|---|---|---|
| 15156018 | 조석예보(고, 저조) | tideFcstHghLw/GetTideFcstHghLwApiService | obsCode(필수, 예 DT_0018) · reqDate | obsvtrNm · lot · lat · predcDt · predcTdlvVl(cm) · extrSe(1 오전 고조 · 2 오전 저조 · 3 오후 고조 · 4 오후 저조) |
| 15156022 | 조석예보(시계열) | tideFcstTime/GetTideFcstTimeApiService | obsCode(필수) · reqDate · min(1 ~ 60) | obsvtrNm · lot · lat · predcDt · tdlvHgt(cm) |
| 15156026 | TideBED 예측 조위(1분) | tidebed/GetTidebedApiService | lat · lot(필수, 예 33.96194 · 126.44527) · reqDate · min | 기준항(obsvtrNm · obsrvnDt · obsrvnHgt · 조화상수) · 선택지점(slctdDt · slctdHgt · 조화상수) · jogo(조고비) · josi(조시차) · msl |
| 15155508 | 조위관측소 최신 관측 | dtRecent/GetDTRecentApiService | obsCode(필수, 예 DT_0018) · reqDate · min | obsrvnDt · wndrct · wspd · maxMmntWspd · artmp · atmpr · wtem · bscTdlvHgt(조위 cm) · slntQty · crdir · crsp(m/s) |
| 15155516 | 해양관측부이 최신 관측 | twRecent/GetTWRecentApiService | obsCode(필수, 예 TW_0089) · reqDate · min | obsrvnDt · wndrct · wspd · maxMmntWspd · artmp · atmpr · wvhgt(파고 m) · wvpd(파주기 s) · crdir · crsp(cm/s) · wtem · slnty |
| 15155994 | 국가해양관측망 실측 파랑 | noonWave/GetNoonWaveApiService | obsCode(필수, 예 TW_0089) · reqDate · min | obsrvnDt · wvhgt · wvpd · wvdrct(파향) · maxWvhgt · maxWvpd |
| 15142486 | 바다낚시지수 | fcstFishingv2/GetFcstFishingApiServicev2 | gubun(필수, 갯바위 · 선상) · type(필수) · reqDate · placeName(예 김녕) | seafsPstnNm(위치) · lat · lot · predcYmd · predcNoonSeCd(시간) · seafsTgfshNm(대상어) · totalIndex · lastScr · tdlvHrScr(물때점수) · tdlvHrCn(물때) · 파고 · 수온 · 기온 · 유속 · 풍속 최저/최고 |

- 물때 이름(조금 · 사리 등): 조석예보 두 API 에는 칸이 없습니다. 바다낚시지수의 `tdlvHrCn`(물때)에 있습니다 - 실제 값 모양은 응답으로 확인.
- 단위 주의: 유속이 조위관측소는 m/s, 해양관측부이는 cm/s 로 명세에 적혀 있습니다.
- 조석예보(고, 저조)는 routefly 의 별거 별거 물때도 씁니다(`web.TideServlet`, 실제 응답 `src/test/resources/tide/DT_0018-*.json`, 지점 목록 `data/tide-stations.json` - DT_0001 ~ DT_0099 를 물어 모음).
- 관측소 코드(DT_ · TW_) 목록은 아직 없습니다. 예보 지점 코드와 관측소 코드가 같은지는 응답으로 확인합니다.

### 1-1. 실제 응답으로 확인한 것(2026-11-14 PC, `src/test/resources/tidefly/portal/` 7건, 모두 resultCode 00)

| 파일 | 확인한 것 |
|---|---|
| hghlw-DT_0018 | 군산 하루 4줄, 명세 그대로. 00:00 에 저조(extrSe 2)가 있는 날도 있음 |
| time-DT_0018 | 24줄(min=60), 00:00 ~ 23:00, tdlvHgt 소수 |
| tidebed(추자도 근처 좌표) | 기준항 "추자도"로 보정. jogo(조고비)는 글자 "0.98…", josi(조시차)는 글자 "-14분", slctdHgt 도 글자 "211" - 숫자 칸과 섞여 있어 읽을 때 글자도 받아야 함. slctdDt 는 기준항 시각 + 조시차 |
| dt-DT_0018 | totalCount 1368(오늘 1분 간격), 최신이 맨 앞(22:47 → 22:38). 군산은 유향 · 유속(crdir · crsp)이 null |
| tw-TW_0089 | 경포대해수욕장, totalCount 271, 최신이 맨 앞(5분 간격) |
| wave-TW_0089 | 같은 관측소인데 오래된 것이 맨 앞(00:00 → 00:45) - 최신을 보려면 마지막 쪽을 받아야 함. dt · tw 와 순서가 다름 |
| fishing-갯바위 | totalCount 1990 인데 한 쪽 최대 300줄 → 쪽 넘겨 받기 필요(`fishing-pages`). 첫 쪽에 포인트 38곳, 한 포인트 · 오전/오후마다 대상어별 여러 줄 |

바다낚시지수 실제 칸(명세와 다름):
- 명세에 있던 `lastScr`(점수) · `tdlvHrScr`(물때점수)는 응답에 없음.
- `tdlvHrCn` 은 물때 이름(조금 · 사리 같은 7물 · 8물)이 아니라 "중조기" 같은 묶음 - 첫 쪽 300줄 모두 "중조기"(그날 하루 값). 어떤 값들이 오는지는 날을 바꿔 더 봐야 함.
- `totalIndex` 는 글자 "매우좋음 · 좋음 · 보통 · 나쁨"(첫 쪽 150 · 127 · 21 · 2). 국립해양조사원의 판단이라 그대로 보일 때는 출처를 밝힘.
- `seafsTgfshNm` 에 "-" · "기타어종" 이 있음. `predcNoonSeCd` 는 "오전" · "오후".
- `seafsPstnNm` 에 "강릉항북동(2km)" · "목포북항서측(53km)" 처럼 항구 기준 거리 이름이 섞여 있음(선상 자리로 보임).

바다낚시지수 전체(2026-11-14 PC, `fishing-갯바위-p1` ~ `p7`, 1990줄):
- 포인트 49곳(이름 · 위경도). 이름에 "(2km)" 같은 항구 기준 거리가 붙은 15곳은 선상 자리, 나머지 34곳은 갯바위 · 방파제 자리로 보임.
- `gubun=선상` 으로 물어도 갯바위와 똑같은 파일(해시 같음) → gubun 은 듣지 않고 늘 두 가지를 섞어 줌. 응답에 구분 칸도 없음.
- 7일치: 11-14 ~ 16 은 오전 · 오후, 11-17 ~ 20 은 "일"(하루 한 값).
- `tdlvHrCn`: 중조기 1194 · 소조기 796(이번 7일 안). `totalIndex`: 매우나쁨 · 나쁨 · 보통 · 좋음 · 매우좋음 다섯 단계.
- 대상어: 기타어종 · 감성돔 · 우럭 · 농어 · 돌돔 · 벵에돔 · 참돔 · 볼락 · 열기 · "-".

## 2. 기상청 API허브(apihub.kma.go.kr) - 요청 칸은 각 API 설명 화면의 "요청 예시" 로

| 묶음 | API |
|---|---|
| 해양관측 | sea_obs.php · kma_buoy.php · kma_buoy2.php · stn_inf.php (매시 00 · 30분) |
| 수치모델 해구별 예측 | marine_large_zone.php(대해구 0.5°) · marine_small_zone.php(소해구) - RWW3 유의파고 · 최대파주기 · 파향 · 풍향 · 풍속, 하루 2번(00 · 12UTC), +75시간 3시간 간격, CSV, 없는 값 -999.0 |
| 기상특보 | wrn_now_data.php · wrn_now_data_new.php · wrn_reg.php |

### 2-1. 실제 응답으로 확인한 것(2026-11-14 PC, `src/test/resources/tidefly/apihub/` 6건, 요청 예시 주소 그대로)

모두 글(텍스트), `#START7777` 로 시작해 `#7777END` 로 끝남, `#` 줄은 설명. 주소 앞부분이 API 마다 다름(marine_* 는 `typ06`, 나머지 `typ01`).

| 파일 | 주소 | 확인한 것 |
|---|---|---|
| marine-large | typ06/url/marine_large_zone.php?tma_fc=&tma_ef=&Lzone=&help=1&disp=0 | 대해구 하나 1줄: 발표 · 발효(UTC) · 대해구 번호 · 네 귀퉁이 위경도 · WH_SIG(유의파고 m) · WVPRD_MAX · WVDR · WS · WD. 빈칸으로 나뉨 |
| marine-small | typ06/url/marine_small_zone.php?tma_fc=&tma_ef=&Lzone=&Szone=&disp=0&help=1 | 소해구 하나 1줄. 위 칸 + VS(시정) · RAIN(예상강수량) · TW(수온) · SWELL(너울 위험예측 1 관심 · 2 주의 · 3 경계 · 4 위험, -999 없음) - 18 ~ 21번은 "2026년 7월 1일 00UTC 자료부터" (예시는 2025년이라 이 칸이 없음) |
| wrn-now | typ01/url/wrn_now_data.php?fe=f&tm=&disp=0&help=1 | 지금 특보(받은 때 1줄 - 서해중부바깥먼바다 풍랑 예비). 쉼표로 나뉨, 줄 끝 `=`. 칸: REG_UP · REG_UP_KO · REG_ID · REG_KO · TM_FC · TM_EF(KST) · WRN · LVL · CMD · ED_TM. 예비특보의 TM_EF 는 "02:59 새벽" 같은 맞춤 표가 설명에 있음 |
| wrn-reg | typ01/url/wrn_reg.php?tmfc=0 | 특보구역 414줄: L(육상) 301 · S(해상) 113. 칸 REG_ID · TM_ST · TM_ED · REG_SP · REG_UP · REG_KO · REG_NAME, 빈칸으로 나뉨(이름에 빈칸 없음). 위경도는 없음 |
| kma-buoy | typ01/url/kma_buoy.php?tm=&stn=0&help=1 | 기상청 부이 58줄(요청 시각 -59분 ~ 00분). 지점 이름 · 위경도 없음 - sea_obs 가 더 나음 |
| sea-obs | typ01/url/sea_obs.php?tm=&stn=0&help=1 | 해상 관측 169줄, 한 번에 전국: 관측종류(B 26 · C 66 · F 18 · J 1 · L 9 · N 49) · 지점 ID · 이름 · 경도 · 위도 · 유의파고 · 풍향 · 풍속 · 돌풍 · 수온 · 기온 · 기압 · 습도. 쉼표, 줄 끝 `,=`. 설명 번호 목록에는 경도 · 위도가 빠져 있지만 칸 머리와 자료에는 있음 |

- 오늘 날짜(2026-11-14 PC, `*-today` · `*-all`):
  - 소해구(Lzone 1 Szone 1, 발표 2026111400 UTC → 발효 2026111500): 18 ~ 21번 칸이 실제로 옴 - VS 12250.0 · RAIN 0.2 · TW 7.7 · SWELL 1.
  - 대해구는 Lzone 을 빼면 한 번에 1330곳(LZONE 1 ~ 8304 사이 띄엄띄엄, 발효 시각 하나). 소해구는 Lzone · Szone 을 빼면 "대해구번호를 입력하세요." (자료 없음) → 소해구는 한 곳씩.
  - 소해구 차례(PC, `marine-small-L1-S2` ~ `S9`): 대해구를 3 x 3(1/6도씩), 북쪽 줄부터 1 ~ 3 · 4 ~ 6 · 7 ~ 9, 줄 안은 서 → 동.
    다른 대해구에서도 같음(PC, `marine-small-L210-S7` 가거도 · `L233-S4` 서귀포 - 포인트 위경도가 그 칸 안에 듦).
  - 없는 번호(Szone 10)는 HTTP 200 에 "해구번호를 확인하여 주시기 바랍니다." 한 줄, 번호를 빼면 "대해구번호를 입력하세요." - 둘 다 200 이라 첫 줄이 `#START7777` 인지로 가려야 함.
  - sea_obs(202611142300): 188곳.
- 해구 번호 → 바다 위치는 응답의 네 귀퉁이 위경도로 알 수 있음.

## 2-2. 포인트 늘리기 후보(2026-11-15 홍TV님 "작업해" - 명세만 확인, 실제 자료 받기 전)

| 번호 | 이름 | 모양 | 칸 | 쓸모 |
|---|---|---|---|---|
| 3083027 | 해양수산부_어항정보 | 파일(CSV, 113줄, 2019-12-31 기준, 이용 제한 없음) | 설명에 "어항의 명칭, 소재지 주소, 위도 및 경도 좌표" | 국가어항 113곳 - 방파제 낚시 자리로 좋음. 받을 때 사람 확인(자동 입력 방지)이 있어 홍TV님이 브라우저로 받음 |
| 15155050 | 행정안전부_낚시터정보 조회서비스 | API(apis.data.go.kr/1741000/fishing_spot_info/info) | 낚시터명 · 유형 · 도로명 · 지번 주소 · 주요어종 · 이용요금 · 주요포인트 … (위경도 없음) | 내수면 · 유료 낚시터가 섞이고 위경도가 없어 뒤로 미룸 |
| (그 밖) | 지방어항 | 시 · 도 파일(경북 15044798, 부산 강서 15051986, 전남 3036090 등) | 시도마다 다름 | 전국을 한 번에 받는 자료는 못 찾음 |

새 포인트도 해상 특보구역 짝이 있어야 판단합니다(없으면 "판단 전"). 국가어항(3083027)은 가까운 포인트 빌리기 대신 기상청 예보업무규정 별표 4 · 5 로 짝을 셈(2026-11-15, README · kma-coastal-zones.md).

## 2-3. TideBED 로 포인트 자리 물때(2026-11-15)

지금 물때는 가장 가까운 예보지점 값(가거도 → 흑산도 75km 등)입니다. TideBED(15156026)는 아무 위경도의 예측 조위를 1 ~ 60분 간격으로 줍니다(고 · 저조 시각은 없음).
10분 간격(하루 144줄, 한 번에 받음)에서 높이가 꺾이는 곳을 찾아 만조 · 간조로 쓰려고 합니다. 먼저 예보지점 자리(군산 DT_0018)를 TideBED 로 받아,
같은 날 조석예보(고, 저조)와 시각 · 높이가 얼마나 맞는지 봅니다(`tidefly.PortalProbe tidebed 35.97555 126.56305 20261114 10`). 맞으면 먼 포인트부터 바꿉니다.

### 2-3-1. 받아 본 결과(2026-11-15 PC, 20261115, 10분 간격)

- 셈 확인: TideBED 응답의 기준항 추자도 높이(obsrvnHgt)에서 꺾이는 곳을 찾으면(10분 간격 + 포물선) 01:45 215.3 · 08:10 88.4 · 15:13 271.1 · 21:45 146.2,
  같은 날 추자도 조석예보(DT_0021) 01:45 215 · 08:10 88 · 15:13 271 · 21:44 146 - 1분 · 1cm 안으로 같음.
- 그러나 포인트 자리에서 되는 곳이 적음: 예보지점이 30km 넘게 먼 9곳 가운데 안흥항서측(40km)(기준항 안흥, 조시차 +6분) · 양포항남동(3km)(기준항 양포항, +21분) 2곳만 되고,
  가거도 · 남애항 · 비금도 · 상태도 · 연도 · 울진 후정 · 임원항동북동은 "10 INVALID_REQUEST_PARAMETER_ERROR"(군산 예보지점 자리도 같음 - 계산 격자 밖으로 보임).
- 그래서 지금은 바꾸지 않음(가장 가까운 예보지점 + 거리 표시 그대로). 되는 2곳만 바꿀지는 홍TV님과 정함.

## 3. 그 밖(나중에)

- 포털 15000415 · 15139476 기상특보, 15112611 · 15112614 파고 격자, 15142502 항만해양지수, 15102239 해수욕장 날씨, 15155050 낚시터정보
- 15074088 낚시 어선업 신고정보 - 개인 · 사업자 정보가 있어 화면에 그대로 옮기지 않음(선사 목록은 "등록 신청 → 홍TV님 확인 후 올림")
- 갯바위 · 방파제 공공 목록은 못 찾음 → 바다낚시지수 포인트 + OSM(man_made=breakwater, © OpenStreetMap contributors 표시)
