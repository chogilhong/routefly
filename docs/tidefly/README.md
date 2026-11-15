# 타이드플라이(tidefly.html) - 바다낚시 물때 · 바람 · 파고

2026-11-15 홍TV님 "tidefly 를 routefly 앱 안의 기능으로 전부 옮겨줘" - 예전 비공개 저장소 chogilhong/tidefly(v0.10.1, 5dd85df)에서 그대로 옮김.
주소 `/routefly/tidefly.html`, 서버 `/routefly/api/tidefly`(`tidefly.TideflyServlet`), 자바 `com.gh.routefly.tidefly`, 테스트 데이터 `src/test/resources/tidefly/`.

바다낚시하는 사람이 "오늘 나가도 되나" 를 폰에서 한눈에 보게 돕는 화면입니다. 포인트(국립해양조사원 바다낚시지수 49곳 + 국가어항 103곳 + 지방어항 232곳 = 384곳, 2026-11-15)마다 ○ / △ / ✕ 와 까닭, 바다 예측 · 물때 · 해 · 음력.

## 판단 · 자료(바꿀 때 홍TV님과 정함)

- ○ / △ / ✕(`Verdict`, 2026-11-14 홍TV님 "권하는 대로 해"): ✕ 그 포인트 해상 특보구역의 특보(예비 빼고) · 너울 3 경계 · 4 위험, △ 예비특보 · 너울 2 주의, ○ 그 밖.
  파고 · 바람 숫자 기준은 두지 않습니다. 특보구역 짝(`data/tidefly-point-wrn.json` = `points-wrn-draft.md` 표, PointWrnTest)이 없거나 자료를 못 받으면 판단하지 않습니다. 선상 자리는 늘 "출항은 선사에 확인".
- 바다: 기상청 API허브 소해구 예측(파고 · 바람 · 너울 · 수온, 1시간 기억) · 지금 특보(10분마다 따로). 키 `kma.apihub.key`(routefly 레이더와 같음).
- 물때: 가장 가까운 조석 예보지점(`data/tide-stations.json` - 별거 별거 물때와 같은 파일)의 만조 · 간조, 15일치(물 세기 %). 키 `tide.serviceKey`(없으면 `tour.serviceKey`).
  받은 물때는 `tidefly.cacheDir`(없으면 톰캣 폴더/routefly-tidefly-cache)/tide/지점-날짜.json 에도 남김(예측은 바뀌지 않음, F5 · 재시작 뒤 이어 씀).
- 일출몰 · 음력 · 물때 이름은 계산(`Astro`, AstroTest 가 astral · korean-lunar-calendar 와 맞는지 봄). 물때 이름은 남해 · 동해 · 제주 15간법, 서해는 1 ~ 13물 · 조금 · 무시.
- 알림: 카드 🔔 에서 사용자가 고른 기준(간조 뒤 · 해 지기 전)으로만, 화면을 열어 둔 동안.
- 화면: 지역 묶음 · 카드 접기(둘 다 하나만 펼침 - 다른 곳을 펴면 앞의 것은 접힘, 2026-11-15 홍TV님), 다크 · 글자 크기 · 한 | EN(장소 이름은 로마자 표기법 규칙으로만), 고른 것은 localStorage(tf-*).
- 다른 사이트(바다타임 등)는 정보 항목만 참고하고 화면 · 표 · 값은 옮기지 않습니다.
- 자세한 받은 자료 모양은 `data-sources.md`, 국가어항(2026-11-15 홍TV님 "바로 시작해"): 해양수산부 어항정보 `src/test/resources/tidefly/points/fishing-ports-3083027.csv` 113곳 가운데
  기존 포인트 1.5km 안 9곳 · 원본 잘못(소안항 - 사동항과 주소 · 위경도가 같음) 1곳을 빼고 103곳(`PortsBuild`, json 의 "port":true, 화면 "항구 · 방파제(국가어항)").
  특보구역 짝은 가까운 포인트 빌리기 대신 기상청 예보업무규정 별표 4(앞바다 시군 · 읍면) · 별표 5(앞바다 경계)대로 셈(`docs/tidefly/kma-coastal-zones.md`, PortsTest).
  이 규정으로 기존 49곳 가운데 7곳 짝도 바로잡음(points-wrn-draft.md).
  📍 내 근처: 폰이 준 위치로 가까운 10곳을 맨 위에(곧은 거리 km, `TF.nearest`). 위치는 화면 안에서만 쓰고 저장 · 전송하지 않음.
  지방어항(2단계, 같은 날): 해양수산부_공동활용체계_지방어항(15147449) 242곳에서 위치 빈 1곳 · 1.5km 안 9곳을 빼고 232곳("local":true, 화면 "항구 · 방파제(지방어항)"), 짝은 같은 규정 셈.
- 갯바위 · 선상 자리(3단계, 같은 날 홍TV님 "2번으로 해주고 찾기에도 찾아질 수 있도록"): 15148580 갯바위 1,076 · 15148435 선상 329 = 1,405곳을 `data/tidefly-spots.json`(`SpotsBuild`)으로.
  지역 목록에는 넣지 않고 📍 내 근처 · 찾기에서만 보임(/api/tidefly?spots=1 - 위치는 보내지 않음). 위치는 "공간정보" UTM-K(EPSG:5179)를 위경도로(도분초 칸과 1,401곳 100m 안, 4곳은 도분초 칸 오타).
  바다 예측 · 물때 · 해 · 판단은 가장 가까운 포인트(base, 21km 안) 것, 앞바다 경계선 바깥 · 3km 안인 91곳은 그 먼바다를 더해 서버가 따로 판단(marks). 카드에 수심 · 바닥 · 좋은 물때 · 대상어.
  코스 모음 찾기(js/mountain.js · mountain-en.js): 산 이름이 아니면 /api/tidefly?find= 로 묻고, 포인트 · 자리 이름과 같으면(뒤 "항" · 끝 "낚시" 등은 봐 줌) tidefly.html?q= 로.
- 아직 안 한 것: 낚시금지 · 출입통제 구역(SHP - 받아 둠),
  TideBED 포인트 자리 물때(먼 포인트 9곳 중 2곳만 됨 - 바꾸지 않음), 화면을 닫아도 오는 알림.

## 실제 응답 받기(PC, 키가 필요)

```
.claude\run-tests.ps1 -Run tidefly.PortalProbe all                 → src/test/resources/tidefly/portal/
.claude\run-tests.ps1 -Run tidefly.ApiHubProbe <이름> "<요청 예시 주소>" → src/test/resources/tidefly/apihub/
.claude\run-tests.ps1 -Run tidefly.PointsBuild                      → data/tidefly-points.json 다시 만들기(PointsTest 가 봄)
```
