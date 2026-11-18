// js/dronefly.js 의 순수 함수(드론플라이) - DroneflyJsTest 가 node 로 돌림(node 가 없으면 건너뜀)
'use strict';
const assert = require('assert');
const fs = require('fs');
const DF = require('../../main/webapp/js/dronefly.js');
const data = JSON.parse(fs.readFileSync(__dirname + '/../../main/webapp/data/drone-airspace.json', 'utf8'));

// 서울시청 - 2026-11-17 PC 가 브이월드에 한 점으로 물은 답: aisprhc RK P73A · aisresc R75, 관제권 · 군작전 · UA 는 NOT_FOUND
// + 임시 비행금지 D3554/25(WFS, 2NM 원 - 373523N 1265832E, 기간 칸 없음 → tmpq)
const city = DF.zonesAt(data, 37.5665, 126.9780);
assert.deepStrictEqual(city.map(z => [z.k, z.l[0]]), [['tmpq', 'D3554/25'], ['prh', 'RK P73A'], ['res', 'R75']]);
const v = DF.verdict(city, {});
assert.strictEqual(v.level, 'no');
assert.strictEqual(v.head, '비행금지구역 - 승인 없이 날 수 없습니다');
assert.deepStrictEqual(v.lines, ['임시 비행금지구역 D3554/25 (SFC ~ UND) - 기간 정보 없음, 드론원스톱에서 지금 유효한지 확인', '비행금지구역 RK P73A (GND ~ UNL)', '비행제한구역 R75 (SFC ~ 10 000 AMSL)']);
assert.ok(DF.verdict(city, { photo: true }).head.endsWith(' + 촬영 사전 신청'));
assert.ok(DF.verdict(city, {}).notes.includes('P518 · R73 · R75 공역은 비행승인 신청 전 드론원스톱 공지사항을 확인하세요.'));   // R75
// 비행제한구역 - 실무대로 승인 필요 + 법 원문 예외 덧붙임(2026-11-17 홍TV님 1안)
assert.strictEqual(DF.verdict([{ k: 'res', l: ['R75', '10 000 AMSL', 'SFC'] }], {}).level, 'need');
assert.ok(v.notes[0].startsWith('단, 일부 비행제한구역은 25kg 이하 · 150m 미만 기체에 한해 예외가 적용될 수 있으니'));
assert.ok(!DF.verdict([], {}).notes.some(n => n.startsWith('단, 일부 비행제한구역')));
assert.ok(!DF.verdict(city, { heavy: true }).notes.some(n => n.startsWith('단, 일부 비행제한구역')));   // 25kg 초과면 예외 줄 없음
assert.ok(!DF.verdict(city, { high: true }).notes.some(n => n.startsWith('단, 일부 비행제한구역')));    // 150m 이상도

// UA 2 구성산 - 경계 점들의 가운데(원 모양 공역)
const ua2 = data.ua.find(z => z.l[0] === '(UA 2) GUSEONGSAN'), ring = ua2.g[0][0];
const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
const inUa = DF.zonesAt(data, c[1], c[0]);
assert.ok(inUa.some(z => z.k === 'ua' && z.l[0] === '(UA 2) GUSEONGSAN'));
assert.strictEqual(inUa.length, 1);
{
  assert.strictEqual(DF.verdict(inUa, {}).head, '허용구역(UA) - 낮에 500FT HEI 까지 승인 없이');
  assert.strictEqual(DF.verdict(inUa, { heavy: true }).level, 'need');
  assert.strictEqual(DF.verdict(inUa, { high: true }).level, 'need');
}
assert.strictEqual(DF.nearUa(data, c[1], c[0], 1)[0].m, 0);

// 판정 단계 - docs/dronefly/README.md 표
assert.strictEqual(DF.levelOf('prh'), 'no');
assert.strictEqual(DF.levelOf('res'), 'need');
assert.strictEqual(DF.levelOf('ctr'), 'need');
assert.strictEqual(DF.levelOf('tca'), 'ok');
assert.strictEqual(DF.levelOf('moa'), 'care');
assert.strictEqual(DF.levelOf('ua'), 'ok');
assert.ok(DF.isTca('POHANG TCA AREA A') && !DF.isTca('SEOUL CTLZ') && !DF.isTca('GIMPO'));
// 관제권 레이어의 TCA 는 tca 로 나눔
const tca = data.ctr.find(z => z.l[0] === 'POHANG TCA AREA A'), tr = tca.g[0][0];
const tc = tr.reduce((a, p) => [a[0] + p[0] / tr.length, a[1] + p[1] / tr.length], [0, 0]);
const atT = DF.zonesAt(data, tc[1], tc[0]);
assert.deepStrictEqual(atT.map(z => [z.k, z.l[0]]), [['tca', 'POHANG TCA AREA A'], ['ctr', 'POHANG']]);   // 포항 TCA 가운데는 포항 관제권과도 겹침 → 가장 엄한 것(승인 필요)
assert.strictEqual(DF.verdict(atT, {}).level, 'need');
assert.ok(atT.filter(z => z.l[0] === 'POHANG TCA AREA A').every(z => z.k === 'tca'));
// 걸린 공역이 없으면 그 밖(국토부 안내 문구 - 2026-11-17 홍TV님)
assert.strictEqual(DF.verdict([], {}).head, '25kg 이하 · 150m 아래 · 낮 · 눈으로 보이는 곳이면 승인 없이 | 국토부 안내');
assert.strictEqual(DF.verdict([], {}).level, 'ok');

// 거리 · 신청 정리
assert.strictEqual(DF.dist(850.4), '850m');
assert.strictEqual(DF.dist(12345), '12km');
assert.strictEqual(DF.dist(2345), '2.3km');
assert.ok(Math.abs(DF.meters(37.5, 127, 37.5, 127.01) - 883) < 5);
const t = DF.applyText({ place: '서울시청', lat: 37.5665, lon: 126.978, radius: '500', alt: '100', date: '2026-11-20', from: '10:00', to: '12:00', purpose: '취미 · 레저', photo: true, weight: '25kg 이하' }, city);
assert.ok(t.includes('비행 장소: 서울시청 (위도 37.56650, 경도 126.97800)') && t.includes('항공촬영 있음') && t.includes('걸린 공역: 임시 비행금지구역 D3554/25 (SFC ~ UND) - 기간 정보 없음, 드론원스톱에서 지금 유효한지 확인 / 비행금지구역 RK P73A (GND ~ UNL) / 비행제한구역 R75 (SFC ~ 10 000 AMSL)'));
// 영종 하늘도시 쪽(경도 126.55) - 인천 관제권(공항에서 약 9.2km 원) 바로 밖: 걸린 공역 없음, 가장 가까운 승인 필요 공역은 인천 관제권 경계 약 1.0km(2026-11-17 홍TV님)
assert.deepStrictEqual(DF.zonesAt(data, 37.49, 126.55), []);
const ns = DF.nearStrict(data, 37.49, 126.55);
assert.deepStrictEqual([ns.z.k, ns.z.l[0], DF.dist(ns.m)], ['ctr', 'INCHEON', '1.0km']);
assert.deepStrictEqual(DF.zonesAt(data, 37.49, 126.52).map(z => z.l[0]), ['INCHEON']);   // 하늘도시 서쪽(126.52)은 관제권 안

// 지도용 GeoJSON - 공역 275개(금지 15 · 제한 84 · 관제권 53 · 군작전 75 · UA 48), 위에 그릴 금지가 맨 뒤, TCA 는 따로
const gj = DF.toGeoJSON(data, Date.UTC(2026, 10, 17));
assert.strictEqual(DF.toGeoJSON(data, Date.UTC(2025, 2, 1)).features.length, 15 + 84 + 53 + 75 + 48 + 243 + 2);   // 2025-03 에는 임시 2개(하나는 기간 모름)
assert.strictEqual(gj.features[0].properties.kind, 'moa');
assert.strictEqual(gj.features[gj.features.length - 1].properties.kind, 'tmpq');   // 임시 비행금지가 맨 위
assert.strictEqual(gj.features.find(f => f.properties.name === 'POHANG TCA AREA A').properties.kind, 'tca');

// 신청 기한 - 드론원스톱 처리 기간(비행승인 평일 3일 · 항공촬영 4일). 2026-11-17 은 화요일
assert.strictEqual(DF.workdays('2026-11-17', '2026-11-18'), 0);
assert.strictEqual(DF.workdays('2026-11-17', '2026-11-21'), 3);   // 수 · 목 · 금
assert.strictEqual(DF.workdays('2026-11-20', '2026-11-24'), 1);   // 금 → 화: 토 · 일 빼고 월
assert.strictEqual(DF.dueText('2026-11-17', '2026-11-18', true, false).ok, false);
assert.strictEqual(DF.firstDay('2026-11-17', 4), '2026-11-24');   // 화 → 수목금월(4일) 지난 화요일
assert.strictEqual(DF.firstDay('2026-11-20', 4), '2026-11-27');   // 금 → 월화수목 지난 금요일
assert.strictEqual(DF.dueText('2026-11-17', '2026-11-21', true, false).ok, true);
assert.strictEqual(DF.dueText('2026-11-17', '2026-11-21', false, true).ok, false);   // 촬영은 4일
assert.strictEqual(DF.dueText('2026-11-17', '2026-11-21', false, false), null);   // 승인 · 촬영 둘 다 필요 없으면 안내 없음

// 임시 비행금지 기간(NOTAM B · C, 세계시) - 2026-11-17 받은 것: 2025-04-30 · 2025-10-30 에 끝난 2개는 지금 빠짐
const T = Date.UTC(2026, 10, 17);
assert.strictEqual(DF.tmpState('A)RKRR B)2501311500 C)2504301459', T), 'off');
assert.strictEqual(DF.tmpState('A)RKRR B)2501311500 C)2504301459', Date.UTC(2025, 2, 1)), 'on');
assert.strictEqual(DF.tmpState('D3554/25 E)TEMPO PROHIBITED AREA ACT AS FLW A CIRCLE RADIUS 2NM CENTERED ON 373523N1265832E', T), '?');
const tz = data.tmp.find(z => z.l[3].indexOf('B)2501311500') >= 0), tr0 = tz.g[0][0];
const tcen = tr0.reduce((a, p) => [a[0] + p[0] / tr0.length, a[1] + p[1] / tr0.length], [0, 0]);
assert.ok(!DF.zonesAt(data, tcen[1], tcen[0], T).some(z => z.k === 'tmp'));   // 지난 것은 판정에서 빠짐
assert.ok(DF.zonesAt(data, tcen[1], tcen[0], Date.UTC(2025, 2, 1)).some(z => z.k === 'tmp'));   // 기간 안이면 🔴
assert.strictEqual(DF.levelOf('tmp'), 'no');
assert.strictEqual(DF.levelOf('tmpq'), 'need');

// 항만시설 - 군산항 6부두(WFS 243곳): 승인 필요 + 문의 전화 + 별도 승인 줄
const gz = data.port.find(z => z.l[0] === '군산항 6부두(61,62선석)'), gr = gz.g[0][0];
const gc = gr.reduce((a, p) => [a[0] + p[0] / gr.length, a[1] + p[1] / gr.length], [0, 0]);
const atPort = DF.zonesAt(data, gc[1], gc[0], T).filter(z => z.k === 'port');
assert.strictEqual(atPort.length, 1);
{
  const pv = DF.verdict(atPort, {});
  assert.strictEqual(pv.level, 'need');
  assert.strictEqual(pv.lines[0], '항만시설 군산항 6부두(61,62선석) - 문의 선광㈜ 063-450-4306 · 군산지방해양수산청 063-441-2259');
  assert.ok(pv.notes.some(n => n.startsWith('항만시설은 항공 비행승인과 별도로 관할기관(항만) 승인이 필요합니다.')));
}
assert.strictEqual(DF.levelOf('port'), 'need');
assert.strictEqual(DF.toGeoJSON(data, T).features.length, 15 + 84 + 53 + 75 + 48 + 243 + 1);   // 임시는 기간 모르는 1개만

// 항공촬영 사전 신청 정리(2026-11-17 홍TV님 "비행승인 요청처럼 항공촬영도")
const st = DF.shootText({ place: '서울시청', lat: 37.5665, lon: 126.978, radius: '500', alt: '100', date: '2026-11-24', from: '10:00', to: '12:00', purpose: '취미 · 레저', weight: '25kg 이하', what: '도심 풍경' }, city);
assert.ok(st.startsWith('[항공촬영 사전 신청 정리 - dronefly]\n촬영구역: 서울시청 (위도 37.56650, 경도 126.97800) 반경 500m\n촬영 고도: 100m') && st.includes('촬영 대상: 도심 풍경') && st.includes('※ 사전 신청(허가 아님)'));
assert.ok(DF.shootText({ place: 'x', lat: 37, lon: 127, radius: '1', alt: '1', date: 'd', from: 'a', to: 'b', purpose: 'p', weight: 'w', what: ' ' }, []).includes('촬영 대상: (적어 넣기)'));

// 문화재보호구역 - 고정 칸(0.1°)과 안내 줄(2026-11-17 PC 가 받은 lt_c_uo301 WFS 1000곳)
assert.deepStrictEqual(DF.heritageCell(37.5665, 126.978), [126.9, 37.5, 127, 37.6]);
assert.deepStrictEqual(DF.heritageCell(37.5, 126.9), [126.9, 37.5, 127, 37.6]);
const uo = JSON.parse(fs.readFileSync(__dirname + '/../resources/drone/wfs-lt_c_uo301-kr.json', 'utf8'));
const her = { zones: uo.features.map(f => ({ l: [f.properties.uname, f.properties.sido_name, f.properties.sigg_name], g: f.geometry.coordinates })) };
const hz = her.zones[0], hr = hz.g[0][0], hc = hr.reduce((a, p) => [a[0] + p[0] / hr.length, a[1] + p[1] / hr.length], [0, 0]);
const hn = DF.heritageNotes(her, hc[1], hc[0]);
assert.ok(hn.length >= 1 && hn[0].startsWith('문화재보호구역(') && hn[0].includes('문화유산법 제35조'), hn.join('|'));
assert.deepStrictEqual(DF.heritageNotes(her, 37.5665, 126.978), []);   // 받은 1000곳은 대부분 전북 - 서울시청은 없음
assert.ok(DF.heritageNotes({ zones: [], partial: true }, 37, 127)[0].startsWith('이 둘레는 문화재 구역이 많아 일부만'));
assert.deepStrictEqual(DF.heritageNotes(null, 37, 127), []);

// 점검 12차 A1: 비행 계획 날에 시작할 임시 비행금지도 잡음(지금부터 비행 끝까지)
const N = Date.UTC(2026, 10, 18), future = 'A)RKRR B)2612010000 C)2612310000';
assert.strictEqual(DF.tmpState(future, N), 'off');   // 지금 하나만 보면 빠짐(예전 셈)
assert.strictEqual(DF.tmpState(future, [N, Date.UTC(2026, 11, 5)]), 'on');   // 12-05 비행이면 걸림
assert.strictEqual(DF.tmpState(future, [N, Date.UTC(2026, 10, 25)]), 'off');
assert.deepStrictEqual(DF.planWindow(N, '2026-12-05', '12:00'), [N, Date.UTC(2026, 11, 5, 3, 0)]);   // 우리 시간 12시 = 세계시 3시
assert.deepStrictEqual(DF.planWindow(N, '', '12:00'), [N, N]);
assert.deepStrictEqual(DF.planWindow(N, '2026-11-01', '12:00'), [N, N]);   // 지난 날은 지금만
// 점검 12차 A2: 빈 날짜는 0일이 아니라 모름
assert.strictEqual(DF.workdays('2026-11-18', ''), null);
assert.strictEqual(DF.dueText('2026-11-18', '', true, false), null);

// 영어 화면(2026-11-17 홍TV님 "한/영, 가 도 넣어줘") - 신청 정리는 드론원스톱 한국어 칸용이라 늘 한국어
DF.setLang('en');
assert.strictEqual(DF.verdict(city, {}).head, 'Prohibited area - no flying without approval');
assert.deepStrictEqual(DF.verdict(city, {}).lines.slice(1), ['Prohibited area RK P73A (GND ~ UNL)', 'Restricted area R75 (SFC ~ 10 000 AMSL)']);
assert.strictEqual(DF.verdict(inUa, { photo: true }).head, 'UA airspace - no approval needed up to 500FT HEI in daytime + filming pre-application');
assert.ok(DF.applyText({ place: 'x', lat: 37.5665, lon: 126.978, radius: '500', alt: '100', date: '2026-11-20', from: '10:00', to: '12:00', purpose: '취미 · 레저', photo: false, weight: '25kg 이하' }, city)
  .includes(' / 비행금지구역 RK P73A (GND ~ UNL) / 비행제한구역 R75 (SFC ~ 10 000 AMSL)'));
DF.setLang('ko');
assert.strictEqual(DF.nextSize('m'), 'l');
assert.strictEqual(DF.nextSize('l'), 'xl');
assert.strictEqual(DF.nextSize('xl'), 'm');
// 2026-11-18 홍TV님 "1~8 전부" - 비행 날씨(/api/weather 의 hours 모양 - WeatherServlet.body: t · tmp · pop · wsd · pty) · 날 수 있는 때 · 점검표 · 기록장
assert.deepStrictEqual(DF.wxCell(37.5665, 126.978), [37.55, 127]);   // 약 5km 고정 칸 - 내 위치 그대로는 보내지 않음
const hrs = [
  { t: '2026-11-20 09:00', wsd: 2.1, pop: 10, pty: 0, tmp: 3 }, { t: '2026-11-20 10:00', wsd: 4.0, pop: 20, pty: 0, tmp: 5 },
  { t: '2026-11-20 11:00', wsd: 7.5, pop: 30, pty: 0, tmp: 6 }, { t: '2026-11-20 12:00', wsd: 6.0, pop: 30, pty: 0, tmp: 7 },
  { t: '2026-11-20 13:00', wsd: 3.0, pop: 60, pty: 1, tmp: 7 }, { t: '2026-11-21 10:00', wsd: 1.0, pop: 0, pty: 0, tmp: -2 }];
let w = DF.flyWx(hrs, '2026-11-20', '10:00', '12:00', 10);
assert.deepStrictEqual(w.rows.map(h => h.t.slice(11, 13)), ['10', '11', '12']);
assert.strictEqual(w.wind, 7.5);
assert.strictEqual(w.level, 'care');   // 7.5 > 10 의 70%
assert.strictEqual(DF.flyWx(hrs, '2026-11-20', '10:00', '12:00', 12).level, 'ok');
assert.strictEqual(DF.flyWx(hrs, '2026-11-20', '10:00', '12:00', 7.5).level, 'no');   // 한계와 같으면 ✕
assert.strictEqual(DF.flyWx(hrs, '2026-11-20', '12:00', '13:00', 12).level, 'no');    // 13시 비
assert.strictEqual(DF.flyWx(hrs, '2026-11-20', '10:00', '12:00', null).level, null);  // 한계 없으면 숫자만
assert.strictEqual(DF.flyWx(hrs, '2026-11-20', '13:00', '13:00', null).level, 'no');  // 비는 한계 없어도 ✕
assert.strictEqual(DF.flyWx(hrs, '2026-11-25', '10:00', '12:00', 10), null);          // 예보 밖
assert.strictEqual(DF.flyWx(hrs, '2026-11-21', '10:00', '12:00', 10).tmin, -2);
assert.deepStrictEqual(DF.flyWx(hrs, '2026-11-20', '10:30', '10:40', 10).rows.map(h => h.t), ['2026-11-20 10:00']);
assert.strictEqual(DF.ptyWord(3), '눈');
assert.strictEqual(DF.ptyWord(0), null);
// 날 수 있는 때 - 2026-11-20 서울 근처: 일출 07:13 · 일몰 17:16 쯤(ms 는 우리 시간으로 보임)
const rise = Date.UTC(2026, 10, 19, 22, 13), set = Date.UTC(2026, 10, 20, 8, 16);
assert.deepStrictEqual(DF.dayWindow(rise, set, '10:00', '12:00'), { rise: '07:13', set: '17:16', night: false });
assert.strictEqual(DF.dayWindow(rise, set, '06:30', '08:00').night, true);   // 일출 전
assert.strictEqual(DF.dayWindow(rise, set, '16:00', '17:30').night, true);   // 일몰 뒤
assert.strictEqual(DF.dayWindow(null, set, '10:00', '12:00'), null);
// 점검표 - 날이 바뀌면 비움, 모르는 칸은 버림
assert.deepStrictEqual(DF.checksToday({ d: '2026-11-18', on: ['bat', 'x', 'alc'] }, '2026-11-18'), ['bat', 'alc']);
assert.deepStrictEqual(DF.checksToday({ d: '2026-11-17', on: ['bat'] }, '2026-11-18'), []);
assert.ok(DF.CHECKS.some(c => c[0] === 'day' && c[1].includes('제310조 ① 6호')));
// 기록장 - 합계 · CSV(BOM, 쉼표 · 따옴표는 감쌈)
const lg = [{ d: '2026-11-18', min: 25, place: '구성산, UA2', drone: 'Mini "4"', note: '' }, { d: '2026-11-17', min: 40, place: '', drone: '', note: '연습' }];
assert.deepStrictEqual(DF.logSum(lg), { n: 2, min: 65 });
assert.strictEqual(DF.logCsv(lg), '\ufeff날짜,비행 시간(분),장소,기체,메모\r\n2026-11-18,25,"구성산, UA2","Mini ""4""",\r\n2026-11-17,40,,,연습\r\n');
DF.setLang('ko');
assert.strictEqual(DF.minText(65), '1시간 5분');
assert.strictEqual(DF.minText(40), '40분');
assert.strictEqual(DF.minText(120), '2시간');
console.log('dronefly.test.js OK');
