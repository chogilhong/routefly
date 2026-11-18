// 홍TV님 블로그 평가시험 글(src/test/resources/drone/quiz/*.html) → src/main/webapp/data/drone-quiz.json
// 2026-11-18 홍TV님 "참조해" - 4종(무인멀티콥터) 평가시험 95문항(145 ~ 149), 같은 날 "교관과정도 4종처럼 해 줘" - 조종교육 교관 과정 필기시험 50문항 + 관련 문제(85 ~ 101).
// node tools/drone-quiz/build.js 로 다시 만듦(dronefly.test.js 가 같은지 봄 - 원문과 다르면 실패).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src/test/resources/drone/quiz');
const C4 = [145, 146, 147, 148, 149];
const INST = [85, 89, 92, 93, 95, 97, 98, 99, 100, 101];

function unescape(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { nbsp: ' ', lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", middot: '·', sup2: '²', ge: '≥', le: '≤' }[e] || m;   // 원문에 나온 이름표만(2026-11-18 받은 5편)
  });
}

/** 글 본문 → 줄들(태그를 먼저 지우고 글자 표시를 풂 - "&lt;4.1" 이 태그로 지워지지 않게). 블로그 광고 자리 글(728x90 · 반응형)은 뺌. */
function lines(html) {
  const m = /<div[^>]*class="[^"]*(tt_article_useless_p_margin|contents_style)[^"]*"[^>]*>([\s\S]*)/.exec(html);
  let body = m ? m[2] : html;
  const end = body.indexOf('<div class="container_postbtn');
  if (end > 0) body = body.slice(0, end);
  body = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  const t = unescape(body.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>|<\/h\d>|<\/tr>/g, '\n').replace(/<[^>]+>/g, ''))
    .replace(/​/g, '').replace(/ /g, ' ').replace(/　/g, ' ');
  return t.split('\n').map(l => l.trim()).filter(l => l && l !== '728x90' && l !== '반응형');
}

/** 순수 함수 - 4종 글들(번호 → HTML) → 문항 [{no, q, c: [4], ans: 1~4, ex, post}]. "N. 문제" · ①~④ · "정답 : N번" · 해설. */
function parse(posts) {
  const out = [];
  Object.keys(posts).forEach(n => {
    let cur = null;
    lines(posts[n]).forEach(l => {
      const m = /^(\d{1,3})\.\s*(.+)$/.exec(l);
      if (m && (!cur || +m[1] === cur.no + 1 || (cur.ans && +m[1] > cur.no))) {
        cur = { no: +m[1], q: m[2].trim(), c: [], ans: null, ex: [], post: +n };
        out.push(cur);
        return;
      }
      if (!cur) return;
      const c = /^([①②③④])\s*(.*)$/.exec(l);
      if (c && !cur.ans) { cur.c.push(c[2].trim()); return; }
      const a = /^정답\s*[:：]\s*(\d)\s*번?(.*)$/.exec(l);
      if (a && !cur.ans) { cur.ans = +a[1]; if (a[2].trim()) cur.ex.push(a[2].trim()); return; }
      if (!cur.ans && !cur.c.length) { cur.q += ' ' + l; return; }
      if (cur.ans) cur.ex.push(l);
      else if (cur.c.length) cur.c[cur.c.length - 1] += ' ' + l;
    });
  });
  out.forEach(q => { q.ex = q.ex.join('\n'); });
  return out;
}

/**
 * 순수 함수 - 교관 과정 글들 → 문항 [{no, q, c, ans, ex, post}]. "문제 N) 문제" · ①~④(④ 를 "4." 로 쓴 곳도 - 10번) ·
 * 맞는 보기를 한 번 더 쓴 줄이 정답(그 줄부터 해설) · "관련 문제) …" 는 앞 문항 번호에 "-관련" 을 붙인 문항.
 * 글 머리 · 끝의 다른 글 제목("문제1) … 비행교수법" - 번호 뒤 빈칸 없음)은 문항이 아님.
 */
function parseInst(posts) {
  const out = [];
  Object.keys(posts).forEach(n => {
    let cur = null;
    lines(posts[n]).forEach(l => {
      const m = /^문제\s+(\d+)\)\s*(.+)$/.exec(l), r = /^관련\s*문제\)\s*(.+)$/.exec(l);
      if (m) { cur = { no: m[1], q: m[2].trim(), c: [], ans: null, ex: [], post: +n }; out.push(cur); return; }
      if (r && cur) { cur = { no: cur.no.split('-')[0] + '-관련', q: r[1].trim(), c: [], ans: null, ex: [], post: +n }; out.push(cur); return; }
      if (!cur) return;
      const c = /^([①②③④])\s*(.*)$/.exec(l) || (cur.c.length < 4 && new RegExp('^(' + (cur.c.length + 1) + ')\\.\\s*(.*)$').exec(l));
      if (c && cur.c.length < 4 && cur.ans == null) { cur.c.push(c[2].trim()); return; }
      if (c && cur.ans == null) { cur.ans = '①②③④'.indexOf(c[1]) + 1; cur.ex.push(l); return; }
      if (cur.ans == null && !cur.c.length) { cur.q += ' ' + l; return; }
      if (cur.ans == null) { cur.c[cur.c.length - 1] += ' ' + l; return; }
      cur.ex.push(l);
    });
  });
  out.forEach(q => { q.ex = q.ex.join('\n'); });
  return out;
}

function read(list) {
  const posts = {};
  list.forEach(n => { posts[n] = fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'); });
  return posts;
}

/** 문항 묶음들 - 문항 열쇠(no)는 글(묶음 안)에서 하나, 화면은 "묶음:번호" 로 틀린 것을 기억. */
function build() {
  const c4 = parse(read(C4)).map(q => Object.assign(q, { no: String(q.no) }));
  return { date: '2026-11-18', sets: [
    { id: 'c4', name: '4종(무인멀티콥터) 평가시험', en: 'Class 4 (multicopter) test', qs: c4 },
    { id: 'inst', name: '조종교육 교관 과정 필기시험', en: 'Flight instructor course test', qs: parseInst(read(INST)) }
  ] };
}

module.exports = { build, parse, parseInst, lines };
if (require.main === module) {
  const d = build();
  const bad = [].concat.apply([], d.sets.map(s => s.qs.filter(q => q.c.length !== 4 || !(q.ans >= 1 && q.ans <= 4)).map(q => s.id + ':' + q.no)));
  if (bad.length) { console.error('보기 · 정답이 맞지 않는 문항', bad); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, 'src/main/webapp/data/drone-quiz.json'), JSON.stringify(d) + '\n');
  console.log('drone-quiz.json', d.sets.map(s => s.id + ' ' + s.qs.length + '문항').join(' · '));
}
