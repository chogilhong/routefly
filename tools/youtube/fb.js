// 페이스북 릴스 글 - 유튜브 올리기 파일(docs/youtube/v2/<산>-올리기.txt)에서 만듦
// 2026-11-24 홍TV님 "각 산 out 에 페이스북에 올릴 정보도 만들어줘. 기존 18개도"
// 사진 · 자료 출처, AI 음성, 안내 줄은 그대로 옮김(공공누리 · CC BY-SA 는 출처를 적는 것이 쓰는 조건).
// 바꾸는 것: 제목 끝 해시태그 빼기, 📘 페이스북 줄 빼기(페이스북 안이라 필요 없음), 해시태그는 앞 5개만,
// 릴스 글 속 주소는 눌리지 않을 수 있어 같은 주소를 [첫 댓글] 로 따로 둠.
// 쓰는 법:
//   node tools/youtube/fb.js            → 올리기 파일이 있는 산 모두
//   node tools/youtube/fb.js 태백산 계룡산 → 그 산만
// 결과: docs/youtube/v2/<산>-페이스북.txt (PC 는 tools v2\<산>\out 에 복사)
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '..', 'docs', 'youtube', 'v2');
const SUFFIX = '-올리기.txt';

function convert(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const ti = lines.findIndex(l => l.startsWith('[제목]'));
  const di = lines.findIndex(l => l.startsWith('[설명란]'));
  if (ti < 0 || di < 0) throw new Error('[제목] · [설명란] 이 없음');
  const title = lines.slice(ti + 1, di).find(l => l.trim());
  if (!title) throw new Error('제목 줄이 없음');
  const hook = title.replace(/(\s+#\S+)+\s*$/, '').trim();
  let body = lines.slice(di + 1).filter(l => !l.startsWith('📘'));
  const link = body.find(l => l.startsWith('▶'));
  if (!link) throw new Error('▶ 코스 줄이 없음');
  body = body.map(l => /^#\S/.test(l) ? l.trim().split(/\s+/).slice(0, 5).join(' ') : l);
  while (body.length && !body[body.length - 1].trim()) body.pop();
  return '[릴스 글] (릴스 올릴 때 설명 칸에 그대로 붙여 넣기)\n' + hook + '\n\n' + body.join('\n') +
    '\n\n[첫 댓글] (올린 뒤 바로 달기 - 릴스 글 속 주소는 눌리지 않을 수 있음)\n' + link + '\n';
}

function main(names) {
  const all = fs.readdirSync(DIR).filter(f => f.endsWith(SUFFIX)).map(f => f.slice(0, -SUFFIX.length));
  const list = names.length ? names : all;
  for (const n of list) {
    if (!all.includes(n)) throw new Error(n + SUFFIX + ' 가 없음');
    const out = path.join(DIR, n + '-페이스북.txt');
    fs.writeFileSync(out, convert(fs.readFileSync(path.join(DIR, n + SUFFIX), 'utf8')));
    console.log(path.relative(process.cwd(), out));
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { convert };
