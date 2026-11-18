// 드론 필기 문항 → 유튜브 영상(2026-11-18 홍TV님 "c로 하고 목소리 없음 으로 하고")
//   긴 영상(가로 1920x1080): 시험마다 20문항씩 - 문제 · 보기 + 생각할 시간(문제 길이에 따라 10 ~ 20초) → 정답 · 해설(6 ~ 12초)
//   쇼츠(세로 1080x1920): 골라 뽑은 3문항 - 생각할 시간 5초 → 정답 · 해설
//   목소리 없음(소리 없는 음성 칸만 넣음 - 배경음은 유튜브 스튜디오 "오디오 보관함" 에서 붙이면 저작권 걱정이 없음).
// 쓰는 법(Playwright · ffmpeg 필요):
//   node tools/drone-quiz/video.js long c1 1 20      → target/video/c1-001-020.mp4 + .txt(제목 · 설명)
//   node tools/drone-quiz/video.js short c1 6,26,30  → target/video/short-c1-6-26-30.mp4 + .txt
// 문항은 src/main/webapp/data/drone-quiz.json(앱과 같은 것). 4종 · 교관 해설 속 블로그 그림은 넣지 않음.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'target', 'video');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/main/webapp/data/drone-quiz.json'), 'utf8'));
const NAMES = { c4: '드론 4종 평가시험', c1: '드론 1종 학과 연습', inst: '드론 조종교육 교관 과정 필기' };
const NUM = '①②③④';

/** 순수 함수 - 생각할 시간(초): 쇼츠 5초, 긴 영상은 문제 · 보기 글자 수 / 12 를 10 ~ 20 사이로. */
function thinkSec(q, kind) {
  if (kind === 'short') return 5;
  const n = (q.q + q.c.join('')).length;
  return Math.max(10, Math.min(20, Math.round(n / 12)));
}

/** 순수 함수 - 정답 · 해설 보여 줄 시간(초): 해설 글자 수 / 15 를 6 ~ 12 사이로. */
function answerSec(q) {
  return Math.max(6, Math.min(12, Math.round(String(q.ex || '').length / 15)));
}

/**
 * 순수 함수 - 긴 해설을 화면 여러 장으로(2026-11-18 - 교관 과정 법 조문 해설 등 43문항이 화면 아래로 잘렸음).
 * 줄 단위로 max 글자 · maxLines 줄까지 묶음(짧은 줄이 많아도 넘침, 한 줄이 max 보다 길면 그 줄만 한 장). 빈 해설은 [''].
 */
function exPages(ex, max, maxLines) {
  const lines = String(ex || '').split('\n'), out = [];
  let cur = '', n = 0;
  lines.forEach(l => {
    if (cur && ((cur + '\n' + l).length > max || n >= (maxLines || 1e9))) { out.push(cur); cur = l; n = 1; }
    else { cur = cur ? cur + '\n' + l : l; n++; }
  });
  out.push(cur);
  return out;
}

/** 순수 함수 - 문항 번호 글("1-관련" → "1번 관련"). */
function label(no) { return /-관련$/.test(no) ? no.replace(/-관련$/, '번 관련') : no + '번'; }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function css(w, h) {
  const tall = h > w;
  return `*{box-sizing:border-box}body{margin:0;width:${w}px;height:${h}px;background:#0f172a;color:#e5e7eb;font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif;display:flex;flex-direction:column;padding:${tall ? '110px 70px' : '56px 90px'}}
.top{display:flex;justify-content:space-between;font-size:${tall ? 40 : 34}px;color:#38bdf8;font-weight:700}.top span{color:#94a3b8;font-weight:500}
.q{font-size:${tall ? 58 : 50}px;font-weight:800;line-height:1.4;margin:${tall ? '40px 0 44px' : '28px 0 30px'}}
.cs{display:${tall ? 'block' : 'grid'};grid-template-columns:1fr 1fr;gap:18px 26px}
.c{font-size:${tall ? 48 : 38}px;line-height:1.4;padding:${tall ? '24px 32px' : '18px 26px'};border:3px solid #334155;border-radius:24px;margin:0 0 ${tall ? 24 : 0}px}
.ok{border-color:#22c55e;color:#4ade80;font-weight:800;background:rgba(34,197,94,.08)}.dim{opacity:.45}
.bar{margin-top:auto;height:22px;border-radius:11px;background:#1e293b;overflow:hidden}.bar i{display:block;height:100%;background:#facc15}
.t{font-size:${tall ? 110 : 46}px;font-weight:900;color:#facc15;text-align:center;margin-top:${tall ? 'auto' : '0'}}
.hint{font-size:${tall ? 38 : 28}px;color:#94a3b8;text-align:center;margin-top:10px}
/* 가로(긴 영상)는 초 세기를 문항에서 떨어진 맨 아래 한 줄로(2026-11-18 홍TV님 - 보기 바로 아래라 푸는 데 방해) */
.timer{margin-top:auto;display:flex;align-items:center;gap:22px}.timer .bar{flex:1;margin:0;height:14px}.timer .hint{margin:0;white-space:nowrap}
.ex{font-size:${tall ? 42 : 34}px;line-height:1.55;color:#cbd5e1;white-space:pre-line;margin-top:${tall ? 26 : 22}px;overflow:hidden}
.ans{font-size:${tall ? 50 : 40}px;color:#4ade80;font-weight:800;margin-top:${tall ? 30 : 22}px}
.foot{margin-top:auto;font-size:${tall ? 38 : 30}px;color:#94a3b8;text-align:center}
.card{margin:auto;text-align:center}.card h1{font-size:${tall ? 84 : 76}px;margin:0 0 30px}.card p{font-size:${tall ? 44 : 38}px;color:#cbd5e1;line-height:1.6;margin:0}`;
}

function qPage(set, q, mode, left, total, kind, part) {
  const W = kind === 'short' ? [1080, 1920] : [1920, 1080];
  const head = `<div class="top">🚁 ${esc(NAMES[set.id])}<span>${esc(label(q.no))} / ${set.qs.length}문항</span></div><div class="q">${esc(q.q)}</div>`;
  const cs = '<div class="cs">' + q.c.map((c, i) => `<div class="c ${mode === 'ans' ? (i + 1 === q.ans ? 'ok' : 'dim') : ''}">${NUM[i]} ${esc(c)}</div>`).join('') + '</div>';
  const tail = mode === 'ans'
    ? `<div class="ans">✅ 정답 ${NUM[q.ans - 1]}${part && part.n > 1 ? ` <span style="color:#94a3b8;font-weight:500">· 해설 ${part.i}/${part.n}</span>` : ''}</div>${part && part.ex ? `<div class="ex">${esc(part.ex)}</div>` : ''}<div class="foot">routefly.kr · dronefly 에서 직접 풀어 보기</div>`
    : kind === 'short'
      ? `<div class="t">${left}</div><div class="bar"><i style="width:${Math.round(left / total * 100)}%"></i></div><div class="hint">⏸ 멈춰 놓고 풀어 보세요</div>`
      : `<div class="timer"><div class="hint">⏸ 멈춰 놓고 풀어 보세요</div><div class="bar"><i style="width:${Math.round(left / total * 100)}%"></i></div><div class="t">${left}</div></div>`;
  return { w: W[0], h: W[1], html: `<html><head><meta charset="utf-8"><style>${css(W[0], W[1])}</style></head><body>${head}${cs}${tail}</body></html>` };
}

function card(kind, title, lines) {
  const W = kind === 'short' ? [1080, 1920] : [1920, 1080];
  return { w: W[0], h: W[1], html: `<html><head><meta charset="utf-8"><style>${css(W[0], W[1])}</style></head><body><div class="card"><h1>${esc(title)}</h1><p>${lines.map(esc).join('<br>')}</p></div></body></html>` };
}

/** 순수 함수 - 장면 목록 [{page, sec}](화면 그리기 전). */
function scenes(set, qs, kind) {
  const out = [];
  const range = kind === 'short' ? qs.map(q => label(q.no)).join(' · ') : label(qs[0].no) + ' ~ ' + label(qs[qs.length - 1].no);
  out.push({ page: card(kind, NAMES[set.id], [kind === 'short' ? '이 문제 풀 수 있나요?' : range, kind === 'short' ? range : '정답 · 해설까지', set.id === 'c1' ? '(법령 원문으로 만든 연습 문제)' : '']), sec: 3 });
  qs.forEach(q => {
    const t = thinkSec(q, kind);
    for (let s = t; s >= 1; s--) out.push({ page: qPage(set, q, 'q', s, t, kind), sec: 1 });
    // 해설은 화면에 들어가는 만큼씩(가로 220자 · 세로 160자 - 글자 크기 기준), 장마다 그 글 길이로 시간
    let parts = exPages(q.ex, kind === 'short' ? 160 : 220, kind === 'short' ? 8 : 7);
    // 쇼츠는 해설 첫 장만(긴 해설을 다 넣으면 4분 가까이 - 쇼츠는 3분까지), 나머지는 앱에서
    if (kind === 'short' && parts.length > 1) parts = [parts[0] + '\n… 전체 해설은 routefly 에서'];
    parts.forEach((ex, i) => out.push({ page: qPage(set, q, 'ans', 0, 0, kind, { ex: ex, i: i + 1, n: parts.length }), sec: answerSec({ ex: ex }), fit: true }));
  });
  out.push({ page: card(kind, '전체 문항 풀어 보기', ['routefly.kr → 코스 모음 → dronefly(드론)', '📝 필기 연습 · 틀린 것만 다시 풀기', '4종 95 · 1종 100 · 교관 과정 65문항']), sec: kind === 'short' ? 4 : 6 });
  return out;
}

/**
 * 정답 화면 맞춤(브라우저 안에서): 해설 글자를 80% 까지 줄이고 → 그래도 넘치면 틀린 보기 셋을 숨기고(정답 보기만) → 60% 까지 더 줄임.
 * 넘침이 남으면 true(scenes 가 해설을 더 잘게 나눔 - 테스트가 봄).
 */
function FIT() {
  const e = document.querySelector('.ex');
  if (!e) return false;
  const over = () => e.scrollHeight > e.clientHeight + 2;
  const base = parseFloat(getComputedStyle(e).fontSize);
  let z = base;
  while (over() && z > base * 0.8) { z -= 1; e.style.fontSize = z + 'px'; }
  if (over()) document.querySelectorAll('.c.dim').forEach(c => { c.style.display = 'none'; });
  while (over() && z > base * 0.6) { z -= 1; e.style.fontSize = z + 'px'; }
  return over();
}

async function render(list, file) {
  const { chromium } = require('playwright');
  const tmp = fs.mkdtempSync(path.join(OUT, 'f-'));
  const b = await chromium.launch(), seen = new Map(), concat = [];
  const p = await b.newPage({ viewport: { width: list[0].page.w, height: list[0].page.h } });
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    let f = seen.get(s.page.html);
    if (!f) {
      f = path.join(tmp, String(i).padStart(5, '0') + '.png');
      await p.setContent(s.page.html);
      // 그래도 넘치면 맞춤(FIT) - 잘린 채로 나가지 않게
      if (s.fit) await p.evaluate(FIT);
      await p.screenshot({ path: f });
      seen.set(s.page.html, f);
    }
    concat.push(`file '${f}'\nduration ${s.sec}`);
  }
  await b.close();
  concat.push(`file '${seen.get(list[list.length - 1].page.html)}'`);
  fs.writeFileSync(path.join(tmp, 'list.txt'), concat.join('\n') + '\n');
  // 소리 없는 음성 칸(유튜브 · 편집기가 음성 칸을 바라는 때가 있음)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', file]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

/** 순수 함수 - 유튜브 제목 · 설명 · 태그(올릴 때 붙여 넣기). */
function meta(set, qs, kind) {
  const range = label(qs[0].no) + (qs.length > 1 ? ' ~ ' + label(qs[qs.length - 1].no) : '');
  const title = kind === 'short'
    ? `${NAMES[set.id]} - 이 문제 풀 수 있나요? #드론자격증 #shorts`
    : `${NAMES[set.id]} ${range} 정답 · 해설 (${set.qs.length}문항 중)`;
  const desc = [
    `${NAMES[set.id]} ${kind === 'short' ? qs.map(q => label(q.no)).join(' · ') : range} 문제와 정답 · 해설입니다.`,
    set.id === 'c1' ? '항공안전법 · 시행령 · 시행규칙 원문(2026. 11. 13. 시행)과 항공기상 · 비행이론 일반 내용으로 만든 연습 문제입니다(실제 시험 문제가 아님).' : '',
    '',
    '▶ 직접 풀어 보기(틀린 문항만 다시 풀기 · 이어 풀기): https://routefly.kr/routefly/dronefly.html#quiz-' + set.id,
    '▶ 문항 모두 한 페이지로 훑어보기: https://routefly.kr/routefly/drone-quiz/' + set.id,
    '',
    '법령 · 고시는 바뀔 수 있으니 국가법령정보센터 · 드론원스톱에서 한 번 더 확인하세요.',
    '',
    '#드론자격증 #드론필기 #초경량비행장치 #무인멀티콥터 #드론' + (set.id === 'c4' ? '4종' : set.id === 'c1' ? '1종' : '교관'),
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  return title + '\n\n' + desc + '\n';
}

async function main() {
  const [kind, id, a, b] = process.argv.slice(2);
  const set = D.sets.find(s => s.id === id);
  if (!set || !/^(long|short)$/.test(kind)) { console.error('node tools/drone-quiz/video.js long <c4|c1|inst> <처음 순번> <끝 순번> | short <묶음> <번호,번호,번호>'); process.exit(1); }
  const qs = kind === 'long' ? set.qs.slice(+a - 1, +b) : String(a).split(',').map(n => set.qs.find(q => q.no === n)).filter(Boolean);
  if (!qs.length) { console.error('문항이 없습니다'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const name = kind === 'long' ? `${id}-${String(a).padStart(3, '0')}-${String(b).padStart(3, '0')}` : `short-${id}-${qs.map(q => q.no).join('-')}`;
  await render(scenes(set, qs, kind), path.join(OUT, name + '.mp4'));
  fs.writeFileSync(path.join(OUT, name + '.txt'), meta(set, qs, kind));
  console.log(path.join(OUT, name + '.mp4'));
}

module.exports = { thinkSec, answerSec, exPages, label, scenes, meta, FIT };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
