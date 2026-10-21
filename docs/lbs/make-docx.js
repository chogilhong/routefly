// 위치기반서비스 신고 설명자료 초안 만들기(2026-10-21) - 저장소 뿌리에서: NODE_PATH=$(npm root -g) node docs/lbs/make-docx.js (docx npm 필요). 개인 · 사업자 정보는 넣지 않음
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, HeadingLevel, ShadingType, BorderStyle, PageBreak } = require('docx');
const D = '/home/user/routefly/docs/';
const FONT = 'Malgun Gothic';
const t = (text, o = {}) => new TextRun(Object.assign({ text, font: FONT, size: 21 }, o));
const p = (runs, o = {}) => new Paragraph(Object.assign({ children: Array.isArray(runs) ? runs : [t(runs)], spacing: { after: 80, line: 300 } }, o));
const h = (text, lvl) => new Paragraph({ heading: lvl, children: [new TextRun({ text, font: FONT, bold: true, size: lvl === HeadingLevel.HEADING_1 ? 28 : 24 })], spacing: { before: 240, after: 120 } });
const B = { style: BorderStyle.SINGLE, size: 4, color: '888888' };
const borders = { top: B, bottom: B, left: B, right: B };
const W = 9026;   // A4 본문 폭(DXA)
function cell(content, w, head) {
  const kids = (Array.isArray(content) ? content : [content]).map(c => typeof c === 'string' ? p([t(c, head ? { bold: true } : {})]) : c);
  return new TableCell({ children: kids, width: { size: w, type: WidthType.DXA }, borders, margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E8EEF8' } : undefined });
}
function table(rows, widths) {
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map(r => new TableRow({ children: r.map((c, i) => cell(c && c.text !== undefined ? c.text : c, widths[i], c && c.head)) })) });
}
const H_ = s => ({ text: s, head: true });
const fill = s => p([t(s, { color: 'C00000' })]);   // 홍TV님이 채울 칸
const dims = f => { const b = fs.readFileSync(D + f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };   // PNG 폭 · 높이
const img = (f, w, hgt) => new ImageRun({ type: 'png', data: fs.readFileSync(D + f), transformation: { width: w, height: hgt === undefined ? Math.round(w * dims(f)[1] / dims(f)[0]) : hgt } });

const shots = [
  ['lbs/1-make.png', '① 인솔자가 방을 만듦(산행 이름 · 출발 · 하산 마감 · 좌석 · 탑승지)'],
  ['lbs/2-invite.png', '② 참가 링크를 카카오톡 · 문자 · QR 로 회원에게 보냄(운전자 코드는 기사에게만)'],
  ['lbs/3-join.png', '③ 회원이 참가 - 위치 제공 동의(필수, 만 14세 이상)'],
  ['lbs/4-hiker.png', '④ 출발 3시간 전부터 위치를 보냄 · 출발 1시간 전부터 "버스 탔어요"'],
  ['lbs/5-lead-list.png', '⑤ 인솔자 · 운전자: 회원 위치 · SOS · 배터리 · 소식(명단 · 지도)'],
  ['lbs/6-sos.png', '⑥ 회원 SOS - 같은 방 사람들에게 바로 표시'],
  ['lbs/7-aboard.png', '⑦ 하산 탑승 - 위치 보내기를 멈추고 위치를 지움'],
  ['lbs/8-ended.png', '⑧ 방 끝 - 모든 회원의 위치를 지우고 화면을 닫음'],
];
const IW = 176;   // 한 쪽에 4장(2줄) - PC Word: 200 이면 쪽마다 한 줄만 들어가 아래가 빔
const shotRows = [];
for (let i = 0; i < shots.length; i += 2) {
  shotRows.push(new TableRow({ children: [0, 1].map(k => {
    const s = shots[i + k];
    return new TableCell({ width: { size: W / 2, type: WidthType.DXA }, borders, margins: { top: 80, bottom: 80, left: 80, right: 80 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [img(s[0], IW)] }), new Paragraph({ alignment: AlignmentType.CENTER, children: [t(s[1], { size: 18 })] })] });
  }) }));
}

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1440, right: 1440 } } },
    children: [
      p([t('※ 초안(routefly 웹 Claude 작성, 2026-10-21). 빨간 [ ] 칸은 홍TV님이 사업자등록증과 같게 직접 넣으세요. 공식 양식(소상공인등의 위치기반서비스 사업내용 설명자료)에 옮겨 쓰거나 그대로 다듬어 제출하고, 제출 전 이 줄과 양식의 "작성 방법" 장은 지웁니다.', { color: 'C00000', size: 18 })]),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 400 }, children: [new TextRun({ text: '소상공인등의 위치기반서비스 사업내용 설명자료', font: FONT, bold: true, size: 36 })] }),
      table([
        [H_('위치기반 서비스명'), 'routefly 산악회 방(안내 산악회 회원 위치 · SOS 공유 서비스)'],
        [H_('구분'), '☑ 소상공인     ☐ 1인 창조기업'],
        [H_('신고일'), fill('[2026년    월    일]')],
        [H_('사업자명'), fill('[사업자등록증의 상호]')],
        [H_('담당자'), fill('[이름]')],
        [H_('전화'), fill('[연락 가능한 전화 - 보완 요청이 이 번호로 옴]')],
        [H_('전자우편'), fill('[메일]')],
      ], [2600, W - 2600]),
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: '목 차', font: FONT, bold: true, size: 30 })] }),
      ...['1. 사업자 현황', '    1.1 소상공인 증빙', '2. 서비스 내용', '    2.1 서비스 시나리오', '    2.2 위치정보 데이터 흐름도', '첨부'].map(x => p([t(x, { size: 24 })], { spacing: { after: 160 } })),
      new Paragraph({ children: [new PageBreak()] }),

      h('1. 사업자 현황', HeadingLevel.HEADING_1),
      p('사업자등록증과 같게 적습니다.'),
      table([
        [H_('상호'), fill('[ ]')], [H_('대표자'), fill('[ ]')], [H_('설립일(개업일)'), fill('[ ]')], [H_('주소'), fill('[ ]')],
      ], [2600, W - 2600]),
      h('1.1 소상공인 증빙', HeadingLevel.HEADING_2),
      p('소상공인확인서(중소기업현황정보시스템 sminfo.mss.go.kr 발급) 첨부 - 유효기간 안의 것.'),

      h('2. 서비스 내용', HeadingLevel.HEADING_1),
      table([
        [H_('구분'), H_('내용')],
        [H_('서비스'), '안내 산악회 인솔자가 방을 만들고, 참가 · 동의한 회원의 위치 · SOS 를 같은 방 사람들이 지도에서 보며 출발 · 하산 탑승을 확인(낙오 · 조난 대비)'],
        [H_('서비스 요금'), '무료(광고 · 앱 안 결제 없음)'],
        [H_('방식'), '웹(https://routefly.kr/routefly/party.html) · 안드로이드 앱(routefly)'],
        [H_('고객'), '안내 산악회 인솔자 · 회원 · 버스 운전자(개인)'],
      ], [2000, W - 2000]),
      p([t('덧붙임 - 위치정보 처리 상세', { bold: true })], { spacing: { before: 240, after: 100 } }),
      table([
        [H_('위치를 받는 때'), '참가 · 동의한 뒤, 출발 3시간 전부터 하산 탑승 · 방 나가기 · 방 끝까지 30초마다(위치를 못 잡으면 위치 없이 "폰 켜짐" · 배터리 · SOS 만)'],
        [H_('받는 것'), '위도 · 경도 · 정확도(m) · 배터리 % · SOS. 출발 뒤 산행 회원은 지나온 길(10m 움직일 때마다 한 점)'],
        [H_('보는 사람'), '같은 방 사람들만: 회원 - 별명 · 위치 · SOS · 하산 탑승 / 인솔자 · 운전자 - 더해서 배터리 · 탑승 · 한자리에 머문 시간 · 최근 2시간 지나온 길(조난 대비). 차가 여러 대면 운전자는 자기 호차 회원만. 운영자 화면 · 다른 회사 제공 · 광고 이용 없음'],
        [H_('보관 · 파기'), [p('회원 위치 · 지나온 길: 서버 메모리에만(파일 · DB 에 쓰지 않음).'), p('방 정보 파일(서버, 권한 600 - 재시작 · 배포에도 산행 날까지 이어지게): 방 이름 · 시각 · 인솔자 이름 · 연락처 · 회원 별명 · 좌석 · 탑승지 · 탑승 표시 · 버스 세운 자리(인솔자 · 운전자가 "지금 내 자리를 버스로" 누른 곳). 회원 위치는 없음.'), p('방을 나가면 그 사람 것, 방이 끝나면(인솔자가 끝냄 · 취소, 또는 하산 마감 6시간 뒤 - SOS 회원이 있으면 24시간 뒤, 늦어도 만든 지 40일) 방 전체를 지움.')]],
        [H_('익명 코스 통계'), '방이 끝나면(취소 빼고) 지나온 길을 별명 · 방 코드 · 시각 없이, 처음 · 끝 500m 와 차를 탄 구간을 빼고 DB 에 둠 - 코스 구간별 실제 걸린 시간 · 예상 시간 바로잡기'],
        [H_('보호조치'), '방마다 무작위 열쇠(토큰)를 가진 참가자만 그 방을 봄 · 방 코드 맞히기 막기 · HTTPS 만 · 서버 AWS Lightsail 서울(SSH 키 로그인, 22 · 80 · 443 만 엶) · 운영자 1명만 접속'],
        [H_('확인자료'), '참가(동의) · 나감 · 내보냄 · 출발 때 취소 · 방 끝 · SOS 의 시각과 방 코드 · 방 안 번호만(좌표 · 별명 없음) 서버 로그에 200일 보관 뒤 삭제'],
        [H_('동의 · 고지'), '참가 화면 동의 칸(체크해야 참가) + 개인정보처리방침(https://routefly.kr/routefly/privacy.html#party). 언제든 "방 나가기" 로 그만둠. 만 14세 미만은 참가 불가'],
      ], [2000, W - 2000]),

      new Paragraph({ children: [new PageBreak()] }),
      h('2.1 서비스 시나리오', HeadingLevel.HEADING_2),
      p('시험 방(가상 인솔자 "시험대장" · 010-0000-0000, 가상 회원)으로 찍은 화면입니다. 지도 칸(회원 점 · SOS · 지나온 길)은 실제 폰 화면으로 바꿔 넣으면 더 잘 보입니다.'),
      new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2], rows: shotRows }),

      new Paragraph({ children: [new PageBreak()] }),
      h('2.2 위치정보 데이터 흐름도', HeadingLevel.HEADING_2),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [img('lbs-flow.png', 600)] }),
      table([
        [H_('위치정보사업자(API)'), [p('구글 - 앱: Google Play 서비스 Fused Location Provider API / 웹(안드로이드 크롬 등): 브라우저 Geolocation API(Google 위치 서비스)'), p('애플 - 아이폰 사파리: Geolocation API(Core Location)')]],
        [H_('참고'), '화면의 지도 그림(V-World · OpenStreetMap · 공개 지형 자료)은 위치를 받지 않습니다. 위치 수집에 쓰는 API 는 위 위치정보사업자의 것뿐입니다.'],
      ], [2600, W - 2600]),

      h('첨부', HeadingLevel.HEADING_1),
      p('[첨부 1] 사업자등록증 - 행정정보 공동이용에 동의하면 붙이지 않아도 됨'),
      p('[첨부 2] 소상공인확인서'),
    ],
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync('/home/user/routefly/docs/lbs/lbs-설명자료-초안.docx', b); console.log('ok', b.length); });
