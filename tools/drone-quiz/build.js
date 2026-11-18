// 홍TV님 블로그 "무인동력비행장치 4종(무인멀티콥터) 평가시험 95문항"(src/test/resources/drone/quiz/*.html) → src/main/webapp/data/drone-quiz.json
// 2026-11-18 홍TV님 "참조해". node tools/drone-quiz/build.js 로 다시 만듦(dronefly.test.js 가 같은지 봄 - 원문과 다르면 실패).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src/test/resources/drone/quiz');
const POSTS = [145, 146, 147, 148, 149];

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

/** 순수 함수 - 글들(번호 → HTML) → 문항 [{no, q, c: [4], ans: 1~4, ex, post}]. */
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

function build() {
  const posts = {};
  POSTS.forEach(n => { posts[n] = fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'); });
  const qs = parse(posts);
  return { src: '홍TV 블로그 - 무인동력비행장치 4종(무인멀티콥터) 평가시험 95문항', url: 'https://hongtv.tistory.com/', date: '2026-11-18', qs: qs };
}

module.exports = { build, parse, lines };
if (require.main === module) {
  const d = build();
  const bad = d.qs.filter(q => q.c.length !== 4 || !(q.ans >= 1 && q.ans <= 4));
  if (bad.length) { console.error('보기 · 정답이 맞지 않는 문항', bad.map(q => q.no)); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, 'src/main/webapp/data/drone-quiz.json'), JSON.stringify(d) + '\n');
  console.log('drone-quiz.json', d.qs.length + '문항');
}
