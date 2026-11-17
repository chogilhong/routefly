// js/dronefly.js 의 순수 함수(드론플라이) - DroneflyJsTest 가 node 로 돌림(node 가 없으면 건너뜀)
'use strict';
const assert = require('assert');
const fs = require('fs');
const DF = require('../../main/webapp/js/dronefly.js');
const data = JSON.parse(fs.readFileSync(__dirname + '/../../main/webapp/data/drone-airspace.json', 'utf8'));

// 서울시청 - 2026-11-17 PC 가 브이월드에 한 점으로 물은 답: aisprhc RK P73A · aisresc R75, 관제권 · 군작전 · UA 는 NOT_FOUND
const city = DF.zonesAt(data, 37.5665, 126.9780);
assert.deepStrictEqual(city.map(z => z.l[0]).sort(), ['R75', 'RK P73A']);
const v = DF.verdict(city, {});
assert.strictEqual(v.level, 'no');
assert.strictEqual(v.head, '비행금지구역 - 승인 없이 날 수 없습니다');
assert.deepStrictEqual(v.lines, ['비행금지구역 RK P73A (GND ~ UNL)', '비행제한구역 R75 (SFC ~ 10 000 AMSL)']);
assert.ok(DF.verdict(city, { photo: true }).head.endsWith(' + 촬영 허가'));
// 비행제한구역 - 실무대로 승인 필요 + 법 원문 예외 덧붙임(2026-11-17 홍TV님 1안)
assert.strictEqual(DF.verdict([{ k: 'res', l: ['R75', '10 000 AMSL', 'SFC'] }], {}).level, 'need');
assert.ok(v.notes[0].startsWith('단, 일부 비행제한구역은 25kg 이하 · 150m 미만 기체에 한해 예외가 적용될 수 있으니'));
assert.ok(!DF.verdict([], {}).notes.some(n => n.startsWith('단, 일부 비행제한구역')));

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
assert.ok(t.includes('비행 장소: 서울시청 (위도 37.56650, 경도 126.97800)') && t.includes('항공촬영 있음') && t.includes('걸린 공역: 비행금지구역 RK P73A (GND ~ UNL) / 비행제한구역 R75 (SFC ~ 10 000 AMSL)'));
// 영종 하늘도시 쪽(경도 126.55) - 인천 관제권(공항에서 약 9.2km 원) 바로 밖: 걸린 공역 없음, 가장 가까운 승인 필요 공역은 인천 관제권 경계 약 1.0km(2026-11-17 홍TV님)
assert.deepStrictEqual(DF.zonesAt(data, 37.49, 126.55), []);
const ns = DF.nearStrict(data, 37.49, 126.55);
assert.deepStrictEqual([ns.z.k, ns.z.l[0], DF.dist(ns.m)], ['ctr', 'INCHEON', '1.0km']);
assert.deepStrictEqual(DF.zonesAt(data, 37.49, 126.52).map(z => z.l[0]), ['INCHEON']);   // 하늘도시 서쪽(126.52)은 관제권 안

// 지도용 GeoJSON - 공역 275개(금지 15 · 제한 84 · 관제권 53 · 군작전 75 · UA 48), 위에 그릴 금지가 맨 뒤, TCA 는 따로
const gj = DF.toGeoJSON(data);
assert.strictEqual(gj.features.length, 15 + 84 + 53 + 75 + 48);
assert.strictEqual(gj.features[0].properties.kind, 'moa');
assert.strictEqual(gj.features[gj.features.length - 1].properties.kind, 'prh');
assert.strictEqual(gj.features.find(f => f.properties.name === 'POHANG TCA AREA A').properties.kind, 'tca');

// 영어 화면(2026-11-17 홍TV님 "한/영, 가 도 넣어줘") - 신청 정리는 드론원스톱 한국어 칸용이라 늘 한국어
DF.setLang('en');
assert.strictEqual(DF.verdict(city, {}).head, 'Prohibited area - no flying without approval');
assert.deepStrictEqual(DF.verdict(city, {}).lines, ['Prohibited area RK P73A (GND ~ UNL)', 'Restricted area R75 (SFC ~ 10 000 AMSL)']);
assert.strictEqual(DF.verdict(inUa, { photo: true }).head, 'UA airspace - no approval needed up to 500FT HEI in daytime + filming permit');
assert.ok(DF.applyText({ place: 'x', lat: 37.5665, lon: 126.978, radius: '500', alt: '100', date: '2026-11-20', from: '10:00', to: '12:00', purpose: '취미 · 레저', photo: false, weight: '25kg 이하' }, city)
  .includes('걸린 공역: 비행금지구역 RK P73A (GND ~ UNL) / 비행제한구역 R75 (SFC ~ 10 000 AMSL)'));
DF.setLang('ko');
assert.strictEqual(DF.nextSize('m'), 'l');
assert.strictEqual(DF.nextSize('l'), 'xl');
assert.strictEqual(DF.nextSize('xl'), 'm');
console.log('dronefly.test.js OK');
