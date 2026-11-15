// js/tidefly.js 의 순수 함수(타이드플라이) - TideflyJsTest 가 node 로 돌림(node 가 없으면 건너뜀)
'use strict';
const assert = require('assert');
const TF = require('../../main/webapp/js/tidefly.js');

assert.strictEqual(TF.kst('2026111415'), '15일 00시');   // 14일 15시 UTC = 15일 0시 우리 시간
assert.strictEqual(TF.kst('2026111400'), '14일 09시');
assert.strictEqual(TF.kst('2026113015'), '1일 00시');    // 달 넘김
assert.strictEqual(TF.kst('bad'), '');

assert.strictEqual(TF.dir16(0), '북');
assert.strictEqual(TF.dir16(298.3), '서북서');
assert.strictEqual(TF.dir16(319.0), '북서');
assert.strictEqual(TF.dir16(355), '북');
assert.strictEqual(TF.dir16(null), '');

assert.strictEqual(TF.swell(1), '관심');
assert.strictEqual(TF.swell(4), '위험');
assert.strictEqual(TF.swell(null), '');

// 2026-11-14 PC 가 받은 김녕 응답의 sea
assert.strictEqual(TF.nums({ waveM: 0.1, windMs: 3.2, windDir: 298.3, swell: 1, waterC: 19.1 }), '파고 0.1m · 바람 3.2m/s 서북서풍 · 너울 관심 · 수온 19.1℃');
// 강릉항북동(2km) - 수온 없음
assert.strictEqual(TF.nums({ waveM: 0.4, windMs: 4.9, windDir: 318.6, swell: 1 }), '파고 0.4m · 바람 4.9m/s 북서풍 · 너울 관심');
assert.strictEqual(TF.nums(null), '바다 예측을 받는 중');
// 남애항(L62-S2) - 파고 · 바람이 -999 라 서버가 뺀 응답(2026-11-14 PC)
assert.strictEqual(TF.nums({ visM: 20000.0, rainMm: 1.0, waterC: 18.0, swell: 1 }), '이 바다 칸은 파고 · 바람 예측 없음 · 너울 관심 · 수온 18.0℃');

assert.deepStrictEqual(TF.markOf('○'), ['○', 'ok']);
assert.deepStrictEqual(TF.markOf('✕'), ['✕', 'no']);
assert.deepStrictEqual(TF.markOf(null), ['-', 'none']);
// 다음 물때 - 2026-11-14 받은 군산(DT_0018) 응답을 Tide.parse 가 만든 모양으로
const gunsan = { station: '군산', events: [
  { t: '2026-11-14 00:00', cm: 176, high: false }, { t: '2026-11-14 05:30', cm: 539, high: true },
  { t: '2026-11-14 11:45', cm: 111, high: false }, { t: '2026-11-14 18:02', cm: 612, high: true }] };
assert.deepStrictEqual(TF.nextTide(gunsan.events, '2026-11-14 12:00'), { what: '만조', at: '18:02', left: '6시간 2분 뒤', slack: '17:02 ~ 19:02' });
assert.deepStrictEqual(TF.nextTide(gunsan.events, '2026-11-14 05:00'), { what: '만조', at: '05:30', left: '30분 뒤', slack: '04:30 ~ 06:30' });
assert.strictEqual(TF.nextTide(gunsan.events, '2026-11-14 11:00').what, '간조');
assert.strictEqual(TF.nextTide(gunsan.events, '2026-11-14 23:00'), null);
// 밤 - 서버가 오늘 · 내일을 함께 줌(2026-11-14 PC 김녕 23:59)
const jeju = [{ t: '2026-11-14 00:28', cm: 198, high: true }, { t: '2026-11-14 07:05', cm: 80, high: false },
  { t: '2026-11-14 13:53', cm: 242, high: true }, { t: '2026-11-14 20:31', cm: 139, high: false }, { t: '2026-11-15 01:10', cm: 200, high: true }];
assert.deepStrictEqual(TF.nextTide(jeju, '2026-11-14 23:59'), { what: '만조', at: '내일 01:10', left: '1시간 11분 뒤', slack: '00:10 ~ 02:10' });
// 오늘 것 없이 내일 것만 있으면 "다음" 을 보이지 않음(2026-11-15 PC 김녕)
assert.strictEqual(TF.nextTide([{ t: '2026-11-16 02:06', cm: 181, high: true }], '2026-11-15 00:39'), null);
assert.strictEqual(TF.untilText('2026-11-14 12:00', '2026-11-14 12:03'), '곧');
assert.strictEqual(TF.untilText('2026-11-14 12:00', '2026-11-14 14:00'), '2시간 뒤');
assert.strictEqual(TF.untilText('2026-11-14 12:00', '2026-11-14 11:00'), '');
assert.strictEqual(TF.nowKst(Date.UTC(2026, 10, 14, 14, 5)), '2026-11-14 23:05');
assert.strictEqual(TF.nowKst(Date.UTC(2026, 10, 14, 15, 0)), '2026-11-15 00:00');
// 물 높이 곡선 - 만조 · 간조 시각에는 그 높이, 가운데는 평균(코사인), 그날 첫 물때 앞은 그리지 않음
const cv = TF.curve(gunsan.events, '2026-11-14');
assert.deepStrictEqual(cv[0], [0, 176]);
assert.strictEqual(cv.find(p => p[0] === 330)[1], 539);            // 05:30 만조
const mid = cv.find(p => p[0] === 170);                               // 00:00 → 05:30 사이 가운데(02:45 근처 02:50)
assert.ok(mid[1] > 340 && mid[1] < 380, String(mid));
assert.strictEqual(cv[cv.length - 1][0], 1080);                       // 받은 마지막 물때(18:02) 앞까지 - 그 뒤는 그리지 않음
assert.deepStrictEqual(TF.curve([], '2026-11-14'), []);
assert.strictEqual(TF.markWord('○'), '특보 없음');
assert.strictEqual(TF.markWord('✕'), '출조 자제');
assert.strictEqual(TF.markWord(null), '판단 전');

// 오늘 줄 · 자세히 보기(서버 dayInfo 모양)
assert.strictEqual(TF.dayName('2026-11-15'), '15일(일)');
assert.strictEqual(TF.dayName('2026-11-16'), '16일(월)');
// 물때표(2026-11-15 홍TV님) - 운영 서버 방포항 자세히 보기 실제 응답(src/test/resources/tidefly/detail-bangpo-20261115.json)
{
  const days = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../resources/tidefly/detail-bangpo-20261115.json'), 'utf8')).days;
  const rows = TF.tideTable(days);
  assert.strictEqual(rows.length, days.length);
  assert.deepStrictEqual([rows[0].day, rows[0].lunar, rows[0].mul, rows[0].sun], ['15일(일)', 7, '13물', '07:11 ~ 17:26']);
  assert.deepStrictEqual(rows[0].lows[0], { t: '00:59', cm: 218, diff: null });    // 첫 물때는 앞이 없음
  assert.deepStrictEqual(rows[0].highs[0], { t: '06:23', cm: 549, diff: 331 });    // 549 - 218
  assert.deepStrictEqual(rows[0].lows[1], { t: '12:43', cm: 153, diff: -396 });
  const last0 = days[0].events[days[0].events.length - 1], first1 = days[1].events[0];
  const r1 = (first1.high ? rows[1].highs : rows[1].lows)[0];
  assert.strictEqual(r1.diff, Math.round(first1.cm) - Math.round(last0.cm), '날을 넘어 앞 물때와 비교');
  const max = Math.max.apply(null, days.map(d => d.rangeCm || 0));
  assert.strictEqual(rows[0].pct, Math.round(days[0].rangeCm / max * 100));
  assert.ok(rows.some(r => r.pct === 100));
  // 이 자리 좋은 물때(2026-11-15 홍TV님 "표시해 줘") - 실제 자리 자료의 말들, 방포항 7일(13물 · 조금 · 무시 · 1물 · 2물 · 3물 · 4물, 사리 없음)
  const g = t => TF.goodDays(t, days).map(b => (b ? 1 : 0)).join('');
  assert.strictEqual(g('조금 전·후'), '1111000');                  // 조금 · 무시와 그 앞뒤 하루
  assert.strictEqual(g('조금전후'), '1111000');
  assert.strictEqual(g('조금'), '0110000');
  assert.strictEqual(g('11물~5물/ 정조전후'), '1111111');          // 돌아가며 11 … 13 · 조금 · 무시 · 1 … 5
  assert.strictEqual(g('13물-4물/ 초들물'), '1111111');
  assert.strictEqual(g('10물~13물'), '1000000');
  assert.strictEqual(g('1~3물/ 조금 전·후'), '1111110');
  assert.strictEqual(g('사리를 피한 물때/ 1~3물/ 9~13물'), '1001110');  // "피한" 은 표시하지 않고 범위만
  assert.strictEqual(g('조금~4물'), '0111111');
  assert.strictEqual(g('5 물~11물'), '0000000');
  assert.strictEqual(g('초들물~중날물'), '0000000');               // 하루 안의 때는 날로 표시하지 않음
  assert.strictEqual(g('사리 전후'), '0000000');                   // 이 7일엔 사리 날이 없음
  assert.strictEqual(g('4물~사리'), '0000000');                     // 사리 날이 없으면 끝을 모름 - 표시하지 않음
  const sari = [{ mulddae: '6물' }, { mulddae: '7물', sari: true }, { mulddae: '8물', sari: true }, { mulddae: '9물', sari: true }, { mulddae: '10물' }, { mulddae: '11물' }];
  assert.strictEqual(TF.goodDays('사리 전·후', sari).map(b => (b ? 1 : 0)).join(''), '111110');
  assert.strictEqual(TF.goodDays('4물~사리', sari).map(b => (b ? 1 : 0)).join(''), '111100');
  // 월령: 음력 1 삭 · 8 상현 · 15 보름 · 23 하현 · 29 그믐달(course-kit moonPhase 와 같은 셈)
  assert.deepStrictEqual([1, 4, 8, 12, 15, 19, 23, 27, 30].map(d => TF.moon(d)[0]).join(''), '🌑🌒🌓🌔🌕🌖🌗🌘🌑');
  assert.deepStrictEqual(TF.moon(15), ['🌕', '보름달']);
  assert.strictEqual(TF.moon(null), null);
  assert.deepStrictEqual(rows[0].moon, ['🌓', '상현달']);   // 15일 음력 7일
  assert.strictEqual(TF.sunSpan(rows), '☀ 15일 07:11~17:26 → ' + +days[days.length - 1].date.slice(8) + '일 ' + days[days.length - 1].sunrise + '~' + days[days.length - 1].sunset);
  TF.setLang('en');
  assert.ok(TF.sunSpan(rows).startsWith('☀ 15: 07:11~17:26 → '), '영어 "Sun Sun 15" 겹침 없음');
  assert.strictEqual(TF.placeName('안면도 북부 · 방포항방파제앞해상'), 'Anmyeondo (north) · Bangpohang bangpajeap haesang');   // 2026-11-15 PC: "Anmyeondo bukbu · bangpo…"
  assert.strictEqual(TF.placeName('방포항(어항)'), 'Bangpo Port (fishing port)');   // PC: "Bangpohang(eohang)"
  assert.strictEqual(TF.placeName('대진항(경북)'), 'Daejin Port (Gyeongbuk)');
  assert.strictEqual(TF.placeName('가의도 · 남측 해변 동측 갯바위'), 'Gauido · Namcheuk haebyeon dongcheuk gaetbawi');
  TF.setLang('ko');
  rows.forEach((r, k) => assert.strictEqual(r.cls, days[k].sari ? 'sari' : (days[k].mulddae === '조금' || days[k].mulddae === '무시') ? 'neap' : ''));
  assert.deepStrictEqual(TF.tideTable([{ date: '2026-11-16', lunarDay: 8, mulddae: '조금', sunrise: '07:05', sunset: '17:29' }])[0],
    { date: '2026-11-16', day: '16일(월)', lunar: 8, moon: ['🌓', '상현달'], mul: '조금', cls: 'neap', pct: null, highs: [], lows: [], sun: '07:05 ~ 17:29' });
}
assert.strictEqual(TF.hourLine({ tmEf: '2026111500', waveM: 0.4, windMs: 4.9, windDir: 318.6, swell: 1 }), '15일 09시 파고 0.4m · 바람 4.9m/s 북서풍 · 너울 관심');
// 글자 크기 · 화면 모드
assert.strictEqual(TF.nextSize('m'), 'l');
assert.strictEqual(TF.nextSize('l'), 'xl');
assert.strictEqual(TF.nextSize('xl'), 'm');
assert.strictEqual(TF.nextSize(null), 'l');
assert.strictEqual(TF.isDark('dark'), true);
assert.strictEqual(TF.isDark('light'), false);
assert.strictEqual(TF.isDark(null), true);   // 기본은 다크(2026-11-15 홍TV님) - 기기가 밝은 모드여도
assert.strictEqual(TF.isDark(undefined), true);
// 영어 화면(2026-11-15 홍TV님 "영어화면도 만들어줘")
TF.setLang('en');
assert.strictEqual(TF.roman('김녕'), 'gimnyeong');
assert.strictEqual(TF.roman('울릉도'), 'ulleungdo');       // ㄹㄹ → ll
assert.strictEqual(TF.roman('강릉'), 'gangneung');         // ㅇ + ㄹ → n
assert.strictEqual(TF.roman('남애'), 'namae');             // 연음
assert.strictEqual(TF.roman('서귀포'), 'seogwipo');
assert.strictEqual(TF.placeName('강릉항북동(2km)'), '2 km NE of Gangneung Port');
assert.strictEqual(TF.placeName('부산남부'), 'Busan (south)');
assert.strictEqual(TF.placeName('울진 후정'), 'Hujeong, Uljin');
assert.strictEqual(TF.placeName('포항'), 'Pohang');                                // 2026-11-15 PC: "Po Port"
assert.strictEqual(TF.placeName('목포북항서측(53km)'), '53 km W of Mokpo North Port'); // 2026-11-15 PC: "Mokpobuk Port"
assert.strictEqual(TF.placeName('후포'), 'Hupo');
assert.strictEqual(TF.placeName('남애항'), 'Namae Port');
assert.strictEqual(TF.reason('서해중부바깥먼바다 풍랑 예비특보'), 'West Sea central outer offshore waters: wind-wave warning expected (preliminary)');
assert.strictEqual(TF.reason('강원북부앞바다 풍랑 주의보'), 'Gangwon northern coastal waters: wind-wave advisory');
assert.strictEqual(TF.reason('너울 주의'), 'Swell caution');
assert.strictEqual(TF.reason('특보를 받지 못함 - 판단하지 않음'), 'Not judged - warnings not available');
assert.strictEqual(TF.reason('처음 보는 까닭'), '처음 보는 까닭');
assert.strictEqual(TF.mul('7물'), '7-mul');
assert.strictEqual(TF.mul('조금'), 'Jogeum (neap)');
assert.strictEqual(TF.markWord('✕'), 'Stay ashore');
assert.strictEqual(TF.untilText('2026-11-14 12:00', '2026-11-14 14:10'), 'in 2 h 10 min');
assert.strictEqual(TF.untilText('2026-11-14 12:00', '2026-11-14 12:35'), 'in 35 min');
assert.strictEqual(TF.kst('2026111415'), 'Nov 15 00:00');
assert.strictEqual(TF.dayName('2026-11-15'), 'Sun 15');
assert.strictEqual(TF.nums({ waveM: 0.4, windMs: 4.9, windDir: 318.6, swell: 1 }), 'Waves 0.4m · Wind 4.9m/s NW · Swell watch');
assert.deepStrictEqual(TF.nextTide(jeju, '2026-11-14 23:59'), { what: 'high tide', at: 'tomorrow 01:10', left: 'in 1 h 11 min', slack: '00:10 ~ 02:10' });
assert.strictEqual(TF.placeName('김녕'), 'Gimnyeong');
TF.setLang('ko');
assert.strictEqual(TF.placeName('김녕'), '김녕');
assert.strictEqual(TF.reason('너울 주의'), '너울 주의');
// 알림 계획 - 기준은 사용자가 고른 값(cfg)
TF.setLang('ko');
const plan = TF.alarmPlan(gunsan.events, '17:30', '2026-11-14 10:00', { ebb: 30, sun: 60 });
assert.deepStrictEqual(plan, [{ at: '2026-11-14 12:15', kind: 'ebb', base: '11:45' }, { at: '2026-11-14 16:30', kind: 'sun', base: '17:30' }]);
assert.deepStrictEqual(TF.alarmPlan(gunsan.events, '17:30', '2026-11-14 10:00', {}), []);                 // 끔
assert.strictEqual(TF.alarmPlan(gunsan.events, '17:30', '2026-11-14 12:20', { ebb: 30 }).length, 0);     // 지난 것은 빼고
assert.deepStrictEqual(TF.alarmPlan(jeju, '17:30', '2026-11-14 23:00', { ebb: 0, sun: 30 }), []);       // 오늘 해도 졌고 간조도 지남(내일 첫 물때는 만조)
assert.strictEqual(TF.alarmText(plan[0], '신시도', { ebb: 30 }), '물이 들어오기 시작합니다(간조 11:45 + 30분). 갯바위 · 방파제는 철수하세요 - 신시도');
assert.strictEqual(TF.alarmText(plan[1], '김녕', { sun: 60 }), '해 지기 60분 전입니다(일몰 17:30) - 김녕');
// 📍 내 근처(2026-11-15) - 폰 안에서 곧은 거리로 가까운 차례
{
  const list = [{ point: { name: '김녕', lat: 33.5609, lon: 126.74018 } }, { point: { name: '부산남부', lat: 35.0438, lon: 129.0774 } }, { point: { name: '이름만' } }, { point: { name: '서귀포', lat: 33.24, lon: 126.56 } }];
  const r = TF.nearest(list, 33.4996, 126.5312, 2);   // 제주시청 부근
  assert.deepStrictEqual(r.map(x => x.it.point.name), ['김녕', '서귀포']);
  assert.ok(r[0].km > 19 && r[0].km < 22, '김녕 약 20km: ' + r[0].km);
  assert.ok(r[1].km > 28 && r[1].km < 31, '서귀포 약 29km: ' + r[1].km);
  assert.strictEqual(TF.nearest(list, 35.1, 129.0, 10).length, 3, '위경도 없는 것은 뺌');
}

// 갯바위 · 선상 자리(2026-11-15) - base 포인트 판단 · 바다 · 물때를 그대로, extra 가 있으면 서버 marks
{
  const s = { id: 'r300', name: '장산도 · 차돌이', boat: false, lat: 34.66156, lon: 126.18858, depth: '2.1~5.0', bottom: '암', tideTime: '조금 전후', fish: '감성돔 · 농어', base: '다수항', baseKm: 6.0 };
  const base = { point: { name: '다수항', tideName: '목포', tideKm: 30 }, area: '서해', mark: '△', reasons: ['서해남부북쪽안쪽먼바다 풍랑 예비특보'], sea: { waveM: 1 }, tides: { events: [] } };
  const a = TF.spotItem(s, base, {});
  assert.strictEqual(a.mark, '△');
  assert.deepStrictEqual(a.reasons, ['서해남부북쪽안쪽먼바다 풍랑 예비특보']);
  assert.strictEqual(a.area, '서해');
  assert.strictEqual(a.sea, base.sea);
  assert.strictEqual(a.point.spot, true);
  assert.strictEqual(a.point.tideName, '목포');
  const b = TF.spotItem(Object.assign({}, s, { boat: true }), base, {});
  assert.deepStrictEqual(b.reasons, ['서해남부북쪽안쪽먼바다 풍랑 예비특보', '출항은 선사에 확인']);
  const c = TF.spotItem(s, base, { r300: { mark: '✕', reasons: ['서해남부북쪽바깥먼바다 풍랑 주의보'] } });
  assert.strictEqual(c.mark, '✕');
  const d = TF.spotItem(s, null, {});
  assert.strictEqual(d.mark, null);
  assert.strictEqual(TF.bare('가의도 · 남측(갯바위)'), '가의도남측');   // TideflyServlet.bare 와 같은 셈
  // 어종으로 찾기(2026-11-15 홍TV님) - 자리 대상어
  assert.strictEqual(TF.fishHit('감성돔 · 넙치 · 주꾸미', '주꾸미'), true);
  assert.strictEqual(TF.fishHit('감성돔 · 넙치 · 주꾸미', '쭈꾸미'), true);    // 흔히 쓰는 표기
  assert.strictEqual(TF.fishHit('감성돔 · 넙치', '광어'), true);               // 같은 고기 다른 이름
  assert.strictEqual(TF.fishHit('감성돔 · 넙치', '갈치'), false);
  assert.strictEqual(TF.fishHit('감성돔', '돔'), false);                        // 한 글자는 안 봄
  assert.strictEqual(TF.fishHit('', '주꾸미'), false);
}

// 연안 출입통제구역 경고(2026-11-15) - data/tidefly-closed.json 실제 줄
{
  TF.setLang('ko');
  assert.strictEqual(TF.closedText(null), '');
  assert.strictEqual(TF.closedText([{ area: '위도항 방파제 테트라포드 일원', type: '방파제', notice: '부안해양경찰서 공고 제2017 - 03호', m: 90 }]),
    '⛔ 약 90m 앞 출입통제구역: 위도항 방파제 테트라포드 일원 (부안해양경찰서 공고 제2017 - 03호 - 해양경찰청 2023 자료, 현지 공고를 확인하세요)');
  assert.ok(TF.closedText([{ area: '해운대해수욕장 APEC 기념 등표', notice: '부산해양경찰서 공고 제2018 - 102호', m: 0 }]).startsWith('⛔ 출입통제구역 안: '));
}

console.log('tidefly.test.js OK');

