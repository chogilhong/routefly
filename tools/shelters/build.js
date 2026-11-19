// 국립공원 대피소(공공데이터 2982556, src/test/resources/shelters/국립공원_대피소.dbf) → src/main/webapp/data/knps-shelters.json
// 2026-11-19 홍TV님 "2번으로 해줘"(대피소 예약 링크) · "대피소를 거치는 코스를 모두 보여주면". node tools/shelters/build.js 로 다시 만듦(src/test/js/course-kit.test.js 가 같은지 봄).
// 높이 칸은 원본에 없음(data/shelters.json 의 ele 는 그대로 비어 있음 - Peaks 높이 맞추기용).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DBF = path.join(ROOT, 'src/test/resources/shelters/국립공원_대피소.dbf');

/**
 * 공단 예약 화면(reservation.knps.or.kr /reservation/shelter/searchSimpleShelterReservation.do)에 있는 대피소 - 2026-11-19 PC 가 화면에서 옮겨 적음.
 * 이 밖의 대피소(피아골 · 중청 · 향적봉 · 노인봉무인 · 북한산 · 도봉산 쪽)는 예약 링크를 달지 않음.
 */
const RESERVE = ['벽소령대피소', '세석대피소', '장터목대피소', '로타리대피소', '치밭목대피소', '연하천대피소', '노고단대피소',
  '수렴동대피소', '소청대피소', '희운각대피소', '양폭대피소', '삿갓재대피소', '제2연화봉대피소'];
const RESERVE_URL = 'https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do';

/** 순수 함수 - 사무소 이름 → 산 페이지 이름(mountains100 의 id): 지리산경남 · 전북 · 전남 → 지리산, 북한산도봉 → 도봉산, 소백산북부 → 소백산. */
function parkOf(office) {
  if (/^지리산/.test(office)) return '지리산';
  if (office === '북한산도봉') return '도봉산';
  return office.replace(/(북부|남부|동부|서부)$/, '');
}

/** 순수 함수 - 이름 다듬기: 원본의 "現노고단대피소"(지금의 노고단대피소)는 "노고단대피소". */
function cleanName(n) { return n.replace(/^現/, '').trim(); }

/** dbf(dBASE III, UTF-8) 읽기 - 칸 이름 · 길이는 머리에서. */
function readDbf(buf) {
  const n = buf.readUInt32LE(4), hl = buf.readUInt16LE(8), rl = buf.readUInt16LE(10), fields = [];
  for (let i = 32; buf[i] !== 0x0d; i += 32) fields.push({ name: buf.slice(i, i + 11).toString('utf8').replace(/\0.*$/s, ''), len: buf[i + 16] });
  const rows = [];
  for (let r = 0; r < n; r++) {
    let o = hl + r * rl + 1;
    const row = {};
    fields.forEach(f => { row[f.name] = buf.slice(o, o + f.len).toString('utf8').trim(); o += f.len; });
    rows.push(row);
  }
  return { fields: fields.map(f => f.name), rows };
}

function build() {
  const { fields, rows } = readDbf(fs.readFileSync(DBF));
  // 칸 차례: fid · 순번 · 사무소 · 시설물(이름) · 위치(주소) · 경도 · 위도 · …(README) - 칸 이름이 잘려 있어 차례로 읽음
  const out = rows.map(r => {
    const v = fields.map(f => r[f]), name = cleanName(v[3]);
    return { name, park: parkOf(v[2]), addr: v[4], lat: +(+v[6]).toFixed(6), lon: +(+v[5]).toFixed(6), reserve: RESERVE.indexOf(name) >= 0 };
  });
  return { _note: '국립공원공단_국립공원 대피소(공공데이터포털 2982556, 이용허락범위 제한 없음) 22곳 - tools/shelters/build.js 가 src/test/resources/shelters 원본에서 만듦. reserve 는 공단 예약 화면에 있는 13곳(2026-11-19 PC 확인). 고치지 말고 다시 만드세요.',
    reserveUrl: RESERVE_URL, shelters: out };
}

module.exports = { build, parkOf, cleanName, RESERVE };
if (require.main === module) {
  const d = build();
  const miss = RESERVE.filter(n => !d.shelters.some(s => s.name === n));
  if (miss.length) { console.error('예약 목록에 있는데 원본에 없는 대피소: ' + miss.join(', ')); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, 'src/main/webapp/data/knps-shelters.json'), JSON.stringify(d, null, 1) + '\n');
  console.log('knps-shelters.json', d.shelters.length + '곳 · 예약 ' + d.shelters.filter(s => s.reserve).length + '곳');
}
