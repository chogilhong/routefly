# 일반상대성이론 쉽게 풀기 영상 - 계획 (2026-11-26)

홍TV님 "다음 주제 영상은 아인슈타인 일반 상대성이론으로 하면 어떨까? … 쉽게 풀어보는 영상" · "금방 내용을 넣어서 작업해봐"(2026-11-26 - "산행을 자주하는 사람은 더 빨리 늙는가?" 계산을 넣음).
리만 · 워프와 같은 방식: 대본 → 덱(tools video/slides/decks/relativity) → 목소리(/routefly/check/voice) → slides_video.py. 긴 영상(합니다체) + 쇼츠 3분(해요체), routefly 채널, 재생목록 "쉽게 보는 수학 · 과학 이야기"(안).

## 지킬 것

- 수식 없이 그림 · 생각 실험으로. 쓰는 식은 g × h ÷ c² 하나(높이 차 시계).
- 트램펄린 비유는 쓰되 "중력으로 중력을 설명한 반쪽짜리" 라는 한계를 말함.
- "산에 자주 가면 더 빨리 늙는다" 는 원리로는 맞지만 평생 100만분의 몇 초 - 몸의 나이와 헷갈리지 않게. 과장 없이.
- 숫자 · 연도 · 인용은 받은 자료(자료/)로 확인한 뒤에만 고정. 대본 1판은 웹 Claude 가 널리 알려진 물리학사 · 교과서 공식으로 먼저 씀 → 아래 "확인할 값" 을 PC 가 받은 자료로 맞추고 다르면 고침.
- 나무위키는 줄기 잡기에만(옮기지 않음).

## 순서

1. 뉴턴의 중력은 왜 부족했나 - 멀리서 순간에 당기는 힘? 수성 궤도 43초각
2. 엘리베이터 생각 실험 - 등가 원리(1907 "가장 행복한 생각"), 빛도 휜다, 1915년 11월
3. 중력은 휘어진 시공간 - 지구본 위 두 사람, 휠러의 말, 트램펄린과 그 한계, 시간도 휜다
4. 시간도 휜다 - 파운드 · 레브카(1959) · 하펠레 · 키팅(1971) · 광시계 33 cm(2010), 산 정상 시계 셈, "산에 자주 가면 더 빨리 늙을까", GPS
5. 증거 - 1919 일식 · 수성 · 중력 렌즈 · 중력파(2015) · 블랙홀 그림자(2019)
6. 어디까지 맞나 - 진리가 아니라 가장 잘 맞는 설명, 뉴턴은 근사, 양자 · 암흑물질 · 암흑에너지, 워프 영상으로

## 산 정상 시계 셈(웹 Claude, 2026-11-26 - 교과서 근사식 Δt/t ≈ g h / c², g = 9.8 m/s², c = 3 × 10^8 m/s)

| 경우 | 셈 | 값 |
|---|---|---|
| 해발 1,000 m 에서 1시간 | 9.8 × 1000 / 9e16 = 1.09e-13 × 3600 s | 약 0.39 ns |
| 에베레스트 8,848 m 에서 하루 | 9.8 × 8848 / 9e16 = 9.63e-13 × 86400 s | 약 83 ns |
| 40년 · 해마다 50번 · 6시간 · 평균 500 m | 12,000 h = 4.32e7 s × 5.44e-14 | 약 2.4 μs |
| 걷는 속도 1.4 m/s 의 속도 효과 | v² / 2c² = 1.96 / 1.8e17 ≈ 1.1e-17 | 높이 500 m 효과(5.4e-14)의 약 5,000분의 1 |
| 눈 깜빡임(약 0.1 ~ 0.4 s)과 견줌 | 0.1 / 2.4e-6 | 4만 배 넘게 - 대본 "10만 배 넘게" 는 0.3 s 로 본 것, 자료로 깜빡임 시간 확인 뒤 맞춤 |

## 확인할 값(PC 가 자료를 받으면 자료/ 요약에 적고, 다르면 대본을 고침)

| 값 | 대본 | 찾을 곳 |
|---|---|---|
| 뉴턴 프린키피아 1687 · 수성 근일점 어긋남 100년에 약 43초각 | 1부 · 5부 | 위키백과 Tests of general relativity |
| 1907 "가장 행복한 생각" · 특허청 | 2부 | 위키백과 Equivalence principle / History of general relativity |
| 방정식 발표 1915-11-25(프로이센 학술원) | 2부 | 위키백과 History of general relativity |
| 휠러의 말(Gravitation 1973 등) | 3부 | 위키백과 John Archibald Wheeler / General relativity |
| 지구 둘레 중력은 주로 시간의 휨 | 3부 | 위키백과 Gravitational time dilation 또는 교과서 설명 |
| 파운드 · 레브카 1959 · 탑 22.5 m · 하버드 | 4부 | 위키백과 Pound–Rebka experiment |
| 하펠레 · 키팅 1971 · 여객기 원자시계 | 4부 | 위키백과 Hafele–Keating experiment |
| NIST 광시계 2010 · 33 cm | 4부 · 쇼츠 | 위키백과 Gravitational time dilation (Chou et al. 2010, Science) |
| GPS 위성 고도 약 2만 km · +45 / −7 / +38 μs 하루 · 보정 안 하면 하루 10 km 넘게 | 4부 · 쇼츠 | Ashby(2003) Relativity in the Global Positioning System(Living Reviews in Relativity) · 위키백과 Error analysis for the GPS |
| 1919-05-29 일식 · 에딩턴 · 0.87″ / 1.75″ · 오차가 컸음 | 5부 · 쇼츠 | 위키백과 Eddington experiment |
| 중력파 2015-09 · 라이고 · 1916 예측 · 약 13억 광년 · 4 km 팔 · 양성자보다 훨씬 작게 · 2017 노벨상 | 5부 | 위키백과 First observation of gravitational waves |
| 사건의 지평선 망원경 2019 · M87 | 5부 | 위키백과 Event Horizon Telescope / Messier 87 |
| 에베레스트 8,848 m | 4부 · 쇼츠 | 위키백과 Mount Everest(8,848.86 m, 2020 측정) |

## 자료(PC Claude 가 받아 자료/ 에 글 · 요약만 - 원문 · PDF 는 저장소에 넣지 않음)

| # | 자료 | 주소 |
|---|---|---|
| 1 | 위키백과 General relativity | https://en.wikipedia.org/wiki/General_relativity |
| 2 | 위키백과 Tests of general relativity | https://en.wikipedia.org/wiki/Tests_of_general_relativity |
| 3 | 위키백과 Gravitational time dilation | https://en.wikipedia.org/wiki/Gravitational_time_dilation |
| 4 | 위키백과 Equivalence principle | https://en.wikipedia.org/wiki/Equivalence_principle |
| 5 | 위키백과 Pound–Rebka experiment · Hafele–Keating experiment | https://en.wikipedia.org/wiki/Pound%E2%80%93Rebka_experiment · https://en.wikipedia.org/wiki/Hafele%E2%80%93Keating_experiment |
| 6 | 위키백과 Eddington experiment | https://en.wikipedia.org/wiki/Eddington_experiment |
| 7 | 위키백과 First observation of gravitational waves | https://en.wikipedia.org/wiki/First_observation_of_gravitational_waves |
| 8 | 위키백과 Event Horizon Telescope | https://en.wikipedia.org/wiki/Event_Horizon_Telescope |
| 9 | Ashby(2003) GPS 와 상대성이론 | https://link.springer.com/article/10.12942/lrr-2003-1 |
| 10 | 위키백과 History of general relativity | https://en.wikipedia.org/wiki/History_of_general_relativity |
| 11 | 나무위키 일반 상대성 이론(줄기만) | https://namu.wiki/w/%EC%9D%BC%EB%B0%98%20%EC%83%81%EB%8C%80%EC%84%B1%20%EC%9D%B4%EB%A1%A0 |

※ 9 의 주소(doi 10.12942/lrr-2003-1)는 웹 Claude 의 기억 - PC 가 받을 때 제목 · 지은이 · 연도가 맞는지 확인하고 다르면 알림.
