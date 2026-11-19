// 쇼츠 끝 장면 - 코스 선이 정상까지 그어지고 높이 그래프가 따라 차오르는 5초(세로 1080x1920)
// 2026-11-19 홍TV님 "1, 6번으로 해줘"(6: 우리 자료로 그린 그림) - 배경 지도 · 위성은 쓰지 않음(이용 조건 확인 전).
// 코스 선 · 높이는 운영 /api/course 의 points [경도, 위도, 높이, 거리m](산림청 100대 명산 · 국립공원공단 탐방로 자료), 정상 높이는 data/peak-elev.json.
// 쓰는 법(Playwright · ffmpeg 필요, 운영 서버에 닿아야 함):
//   node tools/youtube/endcard.js 계룡산            → 정상 높이에 가장 가까운 코스를 골라 target/video/end-계룡산.mp4
//   node tools/youtube/endcard.js 금산 kmp-5383010090-1  → 코스를 정해서
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'target', 'video');
const API = 'https://routefly.kr/routefly/api/';
const UA = { 'User-Agent': 'routefly-check' };   // 통계 방문 수에서 빠짐(StatsFilter.selfCheck)
const FPS = 20, DRAW = 3, HOLD = 2;              // 3초 동안 그리고 2초 멈춤

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 순수 함수 - 코스 고르기: 정상 높이(official)에 가장 가까운 최고 높이, 같으면 2 ~ 10km 에 가까운 것. 등산 코스만. */
function pickCourse(courses, official) {
  const ok = (courses || []).filter(c => c.kind === 'hike' && c.ele_max_m != null);
  const off = c => Math.abs(c.ele_max_m - official) + (c.distance_m < 2000 ? 50 : c.distance_m > 10000 ? 30 : 0);
  return ok.sort((a, b) => off(a) - off(b))[0] || null;
}

/** 순수 함수 - 점들을 상자(x, y, w, h)에 맞춘 SVG 경로(위도 줄임 cos 반영, 가로세로 비율 유지). */
function routePath(pts, box) {
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180);
  const xs = pts.map(p => p[0] * k), ys = pts.map(p => -p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min(box.w / ((maxX - minX) || 1e-9), box.h / ((maxY - minY) || 1e-9));
  const ox = box.x + (box.w - (maxX - minX) * s) / 2, oy = box.y + (box.h - (maxY - minY) * s) / 2;
  const xy = xs.map((x, i) => [ox + (x - minX) * s, oy + (ys[i] - minY) * s]);
  // 코스에서 가장 높은 점에 빨간 점만(높이 글은 넣지 않음 - 코스 높이는 GPS · 지형 자료라 위의 공식 높이와 몇십 m 달라 헷갈림, 정상까지 가지 않는 코스도 있음)
  const ti = pts.reduce((b, p, i) => p[2] > pts[b][2] ? i : b, 0);
  return { d: 'M' + xy.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L'), top: xy[ti], topEle: pts[ti][2] };
}

/** 순수 함수 - 높이 그래프 경로(거리 → 가로, 높이 → 세로, 바닥까지 닫음). */
function profilePath(pts, box) {
  const dmax = pts[pts.length - 1][3] || 1, emin = Math.min(...pts.map(p => p[2])), emax = Math.max(...pts.map(p => p[2]));
  const xy = pts.map(p => [box.x + p[3] / dmax * box.w, box.y + box.h - (p[2] - emin) / ((emax - emin) || 1) * box.h]);
  return 'M' + box.x + ' ' + (box.y + box.h) + ' L' + xy.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' L' + (box.x + box.w) + ' ' + (box.y + box.h) + ' Z';
}

function frame(m, course, pts, t) {
  const rp = routePath(pts, { x: 110, y: 400, w: 860, h: 700 }), pp = profilePath(pts, { x: 90, y: 1170, w: 900, h: 260 });
  const done = Math.min(1, t), clipW = 90 + 900 * done;
  return `<html><head><meta charset="utf-8"><style>body{margin:0;width:1080px;height:1920px;background:radial-gradient(circle at 50% 30%,#1e3a5f 0,#0f172a 65%);color:#f8fafc;font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif;overflow:hidden}
.h{position:absolute;left:0;right:0;top:150px;text-align:center}.h b{display:block;font-size:110px;font-weight:900}.h span{font-size:54px;color:#facc15;font-weight:800}
.f{position:absolute;left:0;right:0;bottom:170px;text-align:center}.f b{display:block;font-size:56px;font-weight:900;color:#38bdf8}.f span{display:block;font-size:40px;color:#cbd5e1;margin-top:14px}
.src{position:absolute;left:0;right:0;bottom:60px;text-align:center;font-size:28px;color:#64748b}</style></head><body>
<div class="h"><b>${esc(m.name)}</b><span>${esc(m.height)}m</span></div>
<svg width="1080" height="1920" style="position:absolute;left:0;top:0">
  <defs><clipPath id="c"><rect x="0" y="0" width="${clipW}" height="1920"/></clipPath></defs>
  <path d="${rp.d}" fill="none" stroke="#334155" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${rp.d}" fill="none" stroke="#facc15" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - done).toFixed(4)}"/>
  ${done >= 1 ? `<circle cx="${rp.top[0]}" cy="${rp.top[1]}" r="22" fill="#ef4444" stroke="#fff" stroke-width="6"/>` : ''}
  <path d="${pp}" fill="#1e293b"/>
  <path d="${pp}" fill="rgba(56,189,248,.55)" clip-path="url(#c)"/>
</svg>
<div class="f"><b>routefly 에서 코스 보기</b><span>routefly.kr/routefly/m/${esc(m.id)}</span><span>${esc(course.name)} · ${(course.distance_m / 1000).toFixed(1)}km</span></div>
<div class="src">코스: ${esc(m.src)}</div></body></html>`;
}

/** 출처 글 - 코스 ID 앞머리로(knps 국립공원공단 · frst · kmp 산림청). */
function srcOf(id) {
  return /^knps-/.test(id) ? '국립공원공단 탐방로(공공데이터)' : /^(frst|kmp)-/.test(id) ? '산림청 등산로(공공데이터)' : 'routefly';
}

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); } catch (e) { /* 다시 */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('받지 못함: ' + url);
}

async function main() {
  const [name, cid] = process.argv.slice(2);
  if (!name) { console.error('node tools/youtube/endcard.js <산 이름> [코스 ID]'); process.exit(1); }
  const elev = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/main/webapp/data/peak-elev.json'), 'utf8'));
  const height = (elev.elev || elev)[name];
  if (height == null) { console.error('peak-elev.json 에 없는 산: ' + name); process.exit(1); }
  let id = cid;
  if (!id) {
    const list = await getJson(API + 'courses?q=' + encodeURIComponent(name));
    const c = pickCourse(list.courses, height);
    if (!c) { console.error('코스를 찾지 못함'); process.exit(1); }
    id = c.course_id;
  }
  const d = await getJson(API + 'course?id=' + encodeURIComponent(id));
  const pts = d.points.filter(p => p[2] != null);
  const m = { name: name, id: name, height: height, src: srcOf(id) };
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(OUT, 'e-'));
  const { chromium } = require('playwright');
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const n = FPS * DRAW;
  for (let i = 0; i <= n; i++) {
    await p.setContent(frame(m, d.course, pts, i / n));
    await p.screenshot({ path: path.join(tmp, String(i).padStart(4, '0') + '.png') });
  }
  await b.close();
  const file = path.join(OUT, 'end-' + name + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, '%04d.png'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', `tpad=stop_mode=clone:stop_duration=${HOLD},fps=30,format=yuv420p`, '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', file]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(file + '  (' + d.course.name + ', ' + id + ')');
}

module.exports = { pickCourse, routePath, profilePath, srcOf };
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
