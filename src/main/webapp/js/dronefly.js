/*
 * dronefly(드론) - 2026-11-17 홍TV님 "타이드플라이 바로 아래에 드론을 넣고 드론 관련 정보를"(홍TV님은 드론 교관 자격).
 * 규칙 · 자료는 docs/dronefly/README.md. 공역은 data/drone-airspace.json(브이월드 항공 레이어)을 받아 폰 안에서만 셈 - 위치를 서버로 보내지 않음.
 * 순수 함수는 src/test/js/dronefly.test.js 가 node 로 돌림(DroneflyJsTest).
 */
(function (root) {
  'use strict';

  var LEVEL = { ok: 0, care: 1, need: 2, no: 3 };
  var KIND_NAME = { port: '항만시설', tmp: '임시 비행금지구역', tmpq: '임시 비행금지구역', prh: '비행금지구역', res: '비행제한구역', ctr: '관제권', tca: '접근관제구역', moa: '군작전구역', ua: '초경량비행장치공역(UA)' };
  var KIND_EN = { port: 'Harbour facility', tmp: 'Temporary prohibited area', tmpq: 'Temporary prohibited area', prh: 'Prohibited area', res: 'Restricted area', ctr: 'Control zone', tca: 'Terminal control area', moa: 'Military operations area', ua: 'UA airspace' };
  // 화면 말(2026-11-17 홍TV님 "한/영, 가 도 넣어줘"). 비행승인 신청 정리(applyText)는 드론원스톱 한국어 칸에 붙이므로 늘 한국어
  var lang = 'ko';
  function setLang(l) { lang = l === 'en' ? 'en' : 'ko'; }
  function tr(ko, en) { return lang === 'en' ? en : ko; }
  function kindName(k) { return tr(KIND_NAME[k], KIND_EN[k]); }

  /** 순수 함수 - 점(lon, lat)이 고리(첫 점 = 끝 점일 수 있음) 안인가(반직선 셈). */
  function inRing(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** 순수 함수 - MultiPolygon 좌표 안인가(바깥 고리 안 · 구멍 밖). */
  function inGeom(lon, lat, g) {
    for (var p = 0; p < g.length; p++) {
      if (!inRing(lon, lat, g[p][0])) continue;
      var hole = false;
      for (var h = 1; h < g[p].length; h++) if (inRing(lon, lat, g[p][h])) { hole = true; break; }
      if (!hole) return true;
    }
    return false;
  }

  /** 순수 함수 - 관제권 레이어 이름 중 접근관제구역(TCA)인가(2026-11-17 홍TV님: TCA 는 관제권과 기준이 다름). */
  function isTca(name) {
    return /\bTCA\b/i.test(name || '');
  }

  /**
   * 순수 함수 - 임시 비행금지 NOTAM 기간(B) 시작 · C) 끝, YYMMDDhhmm 세계시)으로 지금 상태: 'on' 지금 유효 · 'off' 기간 지남(또는 아직) · '?' 기간 정보 없음.
   * 2026-11-17 받은 3개 중 2개는 기간이 지났고(2025-04-30 · 2025-10-30 끝), 1개(D3554/25)는 기간 칸이 없음.
   */
  function tmpState(notam, when) {
    var b = /B\)\s*(\d{10})/.exec(notam || ''), c = /C\)\s*(\d{10})/.exec(notam || '');
    if (!b || !c) return '?';
    var t = function (s) { return Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10)); };
    // when - 시각 하나 또는 [처음, 끝](점검 12차 A1: 지금부터 비행 계획 끝까지 - 비행 날에 시작할 NOTAM 도 잡음)
    var a = Array.isArray(when) ? when[0] : when, z = Array.isArray(when) ? when[1] : when;
    return t(b[1]) <= z && t(c[1]) >= a ? 'on' : 'off';
  }

  /** 순수 함수 - 볼 때(세계시 ms) [지금, 비행 계획 끝]. date "YYYY-MM-DD" · to "HH:MM"(우리 시간)이 맞지 않거나 지난 때면 [지금, 지금]. */
  function planWindow(nowMs, date, to) {
    var d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(date || ''), h = /^(\d\d):(\d\d)$/.exec(to || '23:59');
    if (!d || !h) return [nowMs, nowMs];
    var end = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2]) - 9 * 3600000;
    return [nowMs, Math.max(nowMs, end)];
  }

  /** 순수 함수 - 화면에 쓰는 종류: 관제권 중 TCA 는 tca, 임시 비행금지는 지금 유효 tmp · 기간 모름 tmpq · 지난 것 null(뺌). */
  function kindOf(k, z, nowMs) {
    if (k === 'ctr' && isTca(z.l[0])) return 'tca';
    if (k === 'tmp') { var st = tmpState(z.l[3], nowMs); return st === 'on' ? 'tmp' : st === '?' ? 'tmpq' : null; }
    return k;
  }

  /** 순수 함수 - 그 자리가 걸린 공역들 [{k, l}]. k 는 tmp · tmpq · prh · port · res · ctr · tca · moa · ua. nowMs - 임시 비행금지 기간을 볼 때(없으면 지금). */
  function zonesAt(data, lat, lon, nowMs) {
    var out = [], now = nowMs == null ? Date.now() : nowMs;
    ['tmp', 'prh', 'port', 'res', 'ctr', 'moa', 'ua'].forEach(function (k) {
      (data[k] || []).forEach(function (z) {
        var kk = kindOf(k, z, now);
        if (kk && inGeom(lon, lat, z.g)) out.push({ k: kk, l: z.l });
      });
    });
    return out;
  }

  /** 순수 함수 - 공역 하나의 판정 단계. */
  function levelOf(k) {
    return k === 'prh' || k === 'tmp' ? 'no' : k === 'res' || k === 'ctr' || k === 'port' || k === 'tmpq' ? 'need' : k === 'moa' ? 'care' : 'ok';
  }

  /** 순수 함수 - 공역 하나의 이름 · 높이 한 줄. */
  function zoneLine(z, ko) {
    var l = z.l || [], name = function (k) { return ko ? KIND_NAME[k] : kindName(k); };
    if (z.k === 'prh') return ((ko || lang !== 'en') && l[3] ? l[3] : name('prh')) + ' ' + l[0] + ' (' + l[1] + ' ~ ' + l[2] + ')';
    if (z.k === 'ctr' || z.k === 'tca') return name(z.k) + ' ' + l[0];
    // 항만: [이름, 위, 아래, 운영사, 전화, 관리청, 전화] - 드론원스톱 "※ 항만시설 별도 승인 필요"
    if (z.k === 'port') return name('port') + ' ' + l[0] + tr(' - 문의 ', ' - contact ') + [l[3] + ' ' + l[4], l[5] + ' ' + l[6]].filter(function (x) { return x.trim(); }).join(' · ');
    // 임시 비행금지: [이름, 위, 아래, NOTAM]
    if (z.k === 'tmp' || z.k === 'tmpq') return name(z.k) + ' ' + (l[0] || 'NOTAM') + ' (' + (l[2] || '?') + ' ~ ' + (l[1] || '?') + ')'
      + (z.k === 'tmpq' ? tr(' - 기간 정보 없음, 드론원스톱에서 지금 유효한지 확인', ' - no period given, check on Drone One-stop whether it is active') : '');
    // res · moa · ua: [이름, 위 높이, 아래 높이]
    var hi = l[1] || '', lo = l[2] || '';
    return name(z.k) + ' ' + l[0] + (hi || lo ? ' (' + (lo || '?') + ' ~ ' + (hi || '?') + ')' : '');
  }

  /**
   * 순수 함수 - 판정(docs/dronefly/README.md 표). zones - zonesAt 결과, o - {photo: 카메라로 찍음, heavy: 25kg 초과, high: 150m 이상}.
   * → {level: ok|care|need|no, head: 한 줄, lines: [공역 줄], notes: [늘 함께 볼 것]}
   */
  function verdict(zones, o) {
    o = o || {};
    var level = 'ok';
    zones.forEach(function (z) { if (LEVEL[levelOf(z.k)] > LEVEL[level]) level = levelOf(z.k); });
    if ((o.heavy || o.high) && LEVEL[level] < LEVEL.need) level = 'need';
    var ua = zones.filter(function (z) { return z.k === 'ua'; })[0];
    var head = level === 'no' ? tr('비행금지구역 - 승인 없이 날 수 없습니다', 'Prohibited area - no flying without approval')
      : level === 'need' ? tr('비행승인이 필요합니다', 'Flight approval required')
      : level === 'care' ? tr('군작전구역 - 다른 공역과 겹치지 않으면 25kg 이하 · 150m 아래 · 낮에는 승인 없이, 관할 부대 확인',
        'Military operations area - if no other airspace overlaps, 25 kg or less · below 150 m · daytime needs no approval; check with the controlling unit')
      : ua ? tr('허용구역(UA) - 낮에 ' + ua.l[1] + ' 까지 승인 없이', 'UA airspace - no approval needed up to ' + ua.l[1] + ' in daytime')
      : tr('25kg 이하 · 150m 아래 · 낮 · 눈으로 보이는 곳이면 승인 없이 | 국토부 안내', '25 kg or less · below 150 m · daytime · within sight: no approval needed | MOLIT guidance');
    var notes = [];
    if (o.heavy) notes.push(tr('25kg 넘는 기체는 고도와 상관없이 모든 비행에 비행승인이 필요합니다. 참고: 항공안전기술원 안전성인증 · 기체 신고 · 1종 조종자 증명도 필요합니다(드론원스톱 · 한국교통안전공단 안내).',
      'Aircraft over 25 kg need flight approval for every flight regardless of height. For reference: a safety certificate (KIAST), device registration and a class 1 pilot certificate are also required.'));
    if (zones.some(function (z) { return z.k === 'port'; })) notes.push(tr('항만시설은 항공 비행승인과 별도로 관할기관(항만) 승인이 필요합니다. 위 문의 전화로 먼저 확인하세요.', 'Harbour facilities need separate approval from the port authority, apart from flight approval. Call the contacts above first.'));
    if (o.high) notes.push(tr('150m 이상은 어디서나 비행승인이 필요합니다.', '150 m or higher needs flight approval anywhere.'));
    // 비행제한구역은 실무대로 "승인 필요"(2026-11-17 홍TV님 1안), 법 원문(시행규칙 제310조 ① 3호 나목)의 예외는 덧붙임으로
    // 예외는 25kg 이하 · 150m 미만만 - 25kg 초과 · 150m 이상을 고르면 뺌(2026-11-17 PC)
    if (!o.heavy && !o.high && zones.some(function (z) { return z.k === 'res'; })) notes.push(tr('단, 일부 비행제한구역은 25kg 이하 · 150m 미만 기체에 한해 예외가 적용될 수 있으니 드론원스톱에서 해당 구역의 세부 고시를 확인하세요.',
      'Note: some restricted areas allow an exception for aircraft of 25 kg or less below 150 m - check that area\'s details on Drone One-stop.'));
    // 항공촬영은 2022. 12. 1. 부터 "허가" 가 아니라 "사전 신청" - 지역책임부대가 촬영금지시설 유무를 알려 줌(2026-11-17 홍TV님이 보낸 드론원스톱 항공촬영 신청 안내)
    if (o.photo) notes.push(tr('카메라로 찍으려면 항공촬영 사전 신청(근무일 기준 4일)을 따로 하세요(비행승인과 별개). 지역책임부대가 촬영금지시설 유무를 알려 주고, 그런 시설이 없는 개활지는 자유롭게 찍을 수 있습니다. 촬영금지시설이 찍힌 책임은 촬영한 사람에게 있습니다.',
      'To film, submit an aerial photography pre-application (4 working days) separately from flight approval. The local military unit tells you whether restricted facilities are there; open land without them can be filmed freely. You are responsible if restricted facilities are filmed.'));
    // P518 · R73 · R75 는 비행승인 신청 전 드론원스톱 공지사항을 보라고 함(같은 안내). R73 은 2026-11-17 받은 공역 자료에 없음(안내 글대로 둠 - 점검 12차 E2)
    if (zones.some(function (z) { return /^(RK )?P518|^R73$|^R75$/.test(z.l[0] || ''); })) notes.push(tr('P518 · R73 · R75 공역은 비행승인 신청 전 드론원스톱 공지사항을 확인하세요.', 'For P518 · R73 · R75, check the Drone One-stop notices before applying.'));
    notes.push(tr('야간(일몰 후 ~ 일출 전)은 어디서나 특별비행승인이 필요합니다.', 'Night flights (sunset to sunrise) need a special flight approval anywhere.'));
    return { level: level, head: head + (o.photo ? tr(' + 촬영 사전 신청', ' + filming pre-application') : ''), lines: zones.map(function (z) { return zoneLine(z); }), notes: notes };
  }

  /** 순수 함수 - 두 점 거리(m, 짧은 거리용 평면 셈). */
  function meters(lat1, lon1, lat2, lon2) {
    var kx = 111320 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180), ky = 110540;
    return Math.sqrt(Math.pow((lon2 - lon1) * kx, 2) + Math.pow((lat2 - lat1) * ky, 2));
  }

  /** 순수 함수 - 점에서 MultiPolygon 경계까지 가장 가까운 점 {m, lat, lon}(안이면 m 0). */
  function nearest(lat, lon, g) {
    if (inGeom(lon, lat, g)) return { m: 0, lat: lat, lon: lon };
    var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540, best = null;
    g.forEach(function (poly) {
      poly.forEach(function (ring) {
        for (var i = 1; i < ring.length; i++) {
          var ax = (ring[i - 1][0] - lon) * kx, ay = (ring[i - 1][1] - lat) * ky, bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
          var dx = bx - ax, dy = by - ay, t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
          var px = ax + t * dx, py = ay + t * dy, m = Math.sqrt(px * px + py * py);
          if (!best || m < best.m) best = { m: m, lat: lat + py / ky, lon: lon + px / kx };
        }
      });
    });
    return best;
  }

  /** 순수 함수 - 가까운 허용구역(UA) n 곳 [{name, top, m, lat, lon}]. */
  function nearUa(data, lat, lon, n) {
    return (data.ua || []).map(function (z) {
      var p = nearest(lat, lon, z.g);
      return { name: z.l[0], top: z.l[1], m: p.m, lat: p.lat, lon: p.lon };
    }).sort(function (a, b) { return a.m - b.m; }).slice(0, n);
  }

  /**
   * 순수 함수 - 지금 자리 밖의 가장 가까운 "승인이 필요한" 공역(비행금지 · 비행제한 · 관제권, TCA 빼고) {z: {k, l}, m} 또는 null.
   * 2026-11-17 홍TV님 "영종도 내 위치가 비행장이 있어서 금지구역 아니야?" - 인천 관제권 경계(공항에서 약 9.2km) 바로 밖에서 초록만 떠 헷갈렸음.
   */
  function nearStrict(data, lat, lon) {
    var best = null;
    ['prh', 'port', 'res', 'ctr'].forEach(function (k) {
      (data[k] || []).forEach(function (z) {
        if (k === 'ctr' && isTca(z.l[0])) return;
        var p = nearest(lat, lon, z.g);
        if (p.m > 0 && (!best || p.m < best.m)) best = { z: { k: k, l: z.l }, m: p.m };
      });
    });
    return best;
  }

  /** 순수 함수 - 거리 글 "850m" · "12.3km". */
  function dist(m) {
    return m < 1000 ? Math.round(m) + 'm' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'km';
  }

  /** 순수 함수 - 드론원스톱 비행승인 신청에 옮길 값 정리(복사용 글). f - 입력 칸 값들. */
  function applyText(f, zones) {
    return [
      '[드론 비행승인 신청 정리 - dronefly]',
      '비행 장소: ' + (f.place || '') + ' (위도 ' + f.lat.toFixed(5) + ', 경도 ' + f.lon.toFixed(5) + ')',
      '비행 반경: ' + f.radius + 'm · 고도: ' + f.alt + 'm',
      '일시: ' + f.date + ' ' + f.from + ' ~ ' + f.to,
      '목적: ' + f.purpose + (f.photo ? ' · 항공촬영 있음(항공촬영 사전 신청 함께)' : ''),
      '기체: 최대이륙중량 ' + f.weight,
      '걸린 공역: ' + (zones.length ? zones.map(function (z) { return zoneLine(z, true); }).join(' / ') : '없음')
    ].join('\n');
  }

  /** 순수 함수 - 드론원스톱 항공촬영 사전 신청에 옮길 값 정리(복사용 글, 늘 한국어). f - applyText 와 같은 값 + what(촬영 대상). */
  function shootText(f, zones) {
    return [
      '[항공촬영 사전 신청 정리 - dronefly]',
      '촬영구역: ' + (f.place || '') + ' (위도 ' + f.lat.toFixed(5) + ', 경도 ' + f.lon.toFixed(5) + ') 반경 ' + f.radius + 'm',
      '촬영 고도: ' + f.alt + 'm',
      '일시: ' + f.date + ' ' + f.from + ' ~ ' + f.to,
      '목적: ' + f.purpose,
      '촬영 대상: ' + (String(f.what || '').trim() || '(적어 넣기)'),
      '기체: 최대이륙중량 ' + f.weight,
      '걸린 공역: ' + (zones.length ? zones.map(function (z) { return zoneLine(z, true); }).join(' / ') : '없음'),
      '※ 사전 신청(허가 아님) - 지역책임부대가 촬영금지시설 유무를 알려 줌. 비행승인은 따로.'
    ].join('\n');
  }

  /** 순수 함수 - 공역 파일 → 지도용 GeoJSON(속성 kind: prh · res · ctr · tca · moa · ua, name). 위에 그릴 것이 나중에 오게 moa → ua → ctr · tca → res → prh. */
  function toGeoJSON(data, nowMs) {
    var feats = [], now = nowMs == null ? Date.now() : nowMs;
    ['moa', 'ua', 'ctr', 'res', 'port', 'prh', 'tmp'].forEach(function (k) {
      (data[k] || []).forEach(function (z) {
        var kk = kindOf(k, z, now);
        if (kk) feats.push({ type: 'Feature', properties: { kind: kk, name: z.l[0] }, geometry: { type: 'MultiPolygon', coordinates: z.g } });
      });
    });
    return { type: 'FeatureCollection', features: feats };
  }

  /** 순수 함수 - 오늘(YYYY-MM-DD) 다음 날부터 비행 날 전날까지 평일 수(토 · 일만 뺌 - 공휴일은 모름). */
  function workdays(today, day) {
    if (!/^\d{4}-\d\d-\d\d$/.test(today || '') || !/^\d{4}-\d\d-\d\d$/.test(day || '')) return null;   // 빈 날짜를 0일로 셈(점검 12차 A2)
    var t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)), d = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)), n = 0;
    if (isNaN(t) || isNaN(d)) return null;
    for (var x = t + 86400000; x < d; x += 86400000) { var w = new Date(x).getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }

  /** 순수 함수 - 오늘부터 사이 평일이 n 일 이상인 첫 날(YYYY-MM-DD). */
  function firstDay(today, n) {
    var t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
    for (var k = 1; k < 120; k++) {   // 근무일 30일(특별비행)은 달력으로 40일 남짓 - 전에는 30일까지만 봐 오늘을 돌려줬음(2026-11-18)
      var d = new Date(t + k * 86400000).toISOString().slice(0, 10);
      if (workdays(today, d) >= n) return d;
    }
    return today;
  }

  /**
   * 순수 함수 - 신청 기한 안내(드론원스톱 첫 화면의 처리 기간: 비행승인 평일 3일 · 항공촬영 4일 - 2026-11-17 홍TV님 "우리가 할 수 있는 것이 있으면").
   * → {ok, text}. need - 승인이 필요한 판정인가, photo - 촬영.
   */
  function dueText(today, day, need, photo) {
    var n = workdays(today, day);
    if (n == null || (!need && !photo)) return null;
    var want = photo ? 4 : 3, what = photo ? tr('항공촬영 사전 신청(근무일 기준 4일)', 'aerial photography pre-application (4 working days)') : tr('비행승인(근무일 기준 3일)', 'flight approval (3 working days)');
    return n >= want ? { ok: true, text: tr('비행 날까지 근무일 ' + n + '일 - ' + what + ' 처리 기간 안입니다. 토 · 일만 뺀 셈이라 공휴일은 따로 빼 보세요.', n + ' working days until the flight - within the ' + what + ' processing time. Public holidays are not counted out.') }
      : { ok: false, text: tr('비행 날까지 근무일 ' + n + '일 - ' + what + ' 처리에 모자랄 수 있습니다. 날짜를 늦추거나 바로 신청하세요.', 'Only ' + n + ' working days until the flight - may be too short for ' + what + '. Move the date or apply now.') };
  }

  /**
   * 순수 함수 - 야간 비행의 특별비행승인 기한(2026-11-18 홍TV님 "1~4 해줘" 1). 처리 기간 근무일 30일(드론원스톱 - 화면의 처리 기간 표).
   * → null(날짜가 맞지 않음) 또는 {ok, text}. 모자라면 가장 이른 비행 날(firstDay)도 알려 줌.
   */
  function specialDue(today, day) {
    var n = workdays(today, day);
    if (n == null) return null;
    if (n >= 30) return { ok: true, text: tr('야간 비행은 특별비행승인(근무일 기준 30일)이 필요합니다. 비행 날까지 근무일 ' + n + '일 - 처리 기간 안입니다. 토 · 일만 뺀 셈이라 공휴일은 따로 빼 보세요.',
      'Night flight needs a special flight approval (30 working days). ' + n + ' working days until the flight - within the processing time. Public holidays are not counted out.') };
    var f = firstDay(today, 30);
    return { ok: false, text: tr('야간 비행은 특별비행승인(근무일 기준 30일)이 필요합니다. 비행 날까지 근무일 ' + n + '일 - 모자랄 수 있습니다. 지금 신청하면 가장 이른 비행 날은 ' + f + ' 무렵입니다(공휴일 빼고 셈하면 더 늦음).',
      'Night flight needs a special flight approval (30 working days). Only ' + n + ' working days until the flight - may be too short. Applying now, the earliest flight day is around ' + f + ' (later with public holidays).') };
  }

  /** 순수 함수 - 자리가 든 고정 격자 칸 [서, 남, 동, 북](0.1°, 약 10km - /api/heritage 가 받는 칸, 모든 사용자에게 같은 칸). */
  function heritageCell(lat, lon) {
    var w = Math.floor(lon * 10 + 1e-9) / 10, s = Math.floor(lat * 10 + 1e-9) / 10;
    return [w, s, Math.round((w + 0.1) * 10) / 10, Math.round((s + 0.1) * 10) / 10];
  }

  /** 순수 함수 - 문화재보호구역 안내 줄들(판정에는 넣지 않음 - 드론원스톱과 같게). her - /api/heritage 답. */
  function heritageNotes(her, lat, lon) {
    if (!her || !her.zones) return [];
    var hits = her.zones.filter(function (z) { return inGeom(lon, lat, z.g); }), out = [];
    if (hits.length) {
      var z = hits[0].l;
      out.push(tr('문화재보호구역(' + [z[0], z[1], z[2]].filter(Boolean).join(' · ') + ') 안입니다 - 문화유산법 제35조에 따라 관리자와 사전 협의하세요(비행승인과 별개).',
        'Inside a cultural heritage protection zone (' + [z[0], z[1], z[2]].filter(Boolean).join(' · ') + ') - consult the manager in advance under the Cultural Heritage Act art. 35 (apart from flight approval).'));
    }
    if (her.partial) out.push(tr('이 둘레는 문화재 구역이 많아 일부만 확인했습니다. 드론원스톱 지도로 한 번 더 보세요.', 'There are many heritage zones around here and only some were checked. Check again on the Drone One-stop map.'));
    return out;
  }

  var SIZES = ['m', 'l', 'xl'];
  /** 순수 함수 - 글자 크기 다음 단계(보통 → 크게 → 아주 크게 → 보통) - 타이드플라이와 같음. */
  function nextSize(cur) {
    var i = SIZES.indexOf(cur);
    return SIZES[(i < 0 ? 1 : i + 1) % SIZES.length];
  }

  // ---- 2026-11-18 홍TV님 "1~8 전부": 1 비행 날씨 · 2 날 수 있는 시간 · 3 점검표 · 4 기록장 ----

  /** 순수 함수 - 날씨를 물을 고정 칸(0.05°, 약 5km - 모든 사용자에게 같은 칸, 내 위치 그대로는 보내지 않음). */
  function wxCell(lat, lon) {
    return [Math.round(lat * 20) / 20, Math.round(lon * 20) / 20];
  }

  /**
   * 순수 함수 - 그 날 · 시각(from ~ to, "HH:MM")의 기상청 단기예보 시간 칸(/api/weather 의 hours: t "YYYY-MM-DD HH:00", wsd 풍속 m/s, pty 강수형태, pop 강수확률, tmp 기온)으로 판정.
   * limit - 기체 최대 풍속(설명서, m/s, 없으면 null). → null(그 날 예보 없음) 또는 {rows, wind, rain, pop, tmin, level: no|care|ok|null}.
   * ✕ no: 비 · 눈(pty > 0) 또는 풍속 ≥ limit, △ care: 풍속 > limit 의 70%(돌풍 여유 - routefly 기준), ○ ok: 그 아래. limit 이 없으면 비 · 눈만 ✕, 나머지는 숫자만(level null).
   */
  function flyWx(hours, date, from, to, limit) {
    var day = (hours || []).filter(function (h) { return String(h.t || '').slice(0, 10) === date; });
    if (!day.length) return null;
    var fh = parseInt(String(from || '').slice(0, 2), 10), th = parseInt(String(to || '').slice(0, 2), 10);
    if (isNaN(fh) || isNaN(th) || th < fh) { fh = 0; th = 23; }
    var rows = day.filter(function (h) { var hh = +String(h.t).slice(11, 13); return hh >= fh && hh <= th; });
    if (!rows.length) rows = day.filter(function (h) { return +String(h.t).slice(11, 13) >= fh; }).slice(0, 1);
    if (!rows.length) rows = day.slice(-1);
    var num = function (k) { return rows.map(function (h) { return h[k]; }).filter(function (v) { return typeof v === 'number'; }); };
    var ws = num('wsd'), ps = num('pop'), ts = num('tmp');
    var wind = ws.length ? Math.max.apply(null, ws) : null, pop = ps.length ? Math.max.apply(null, ps) : null, tmin = ts.length ? Math.min.apply(null, ts) : null;
    var rain = rows.some(function (h) { return h.pty > 0; });
    var lim = typeof limit === 'number' && limit > 0 ? limit : null;
    var level = rain || (lim && wind != null && wind >= lim) ? 'no' : !lim || wind == null ? null : wind > lim * 0.7 ? 'care' : 'ok';
    return { rows: rows, wind: wind, rain: rain, pop: pop, tmin: tmin, level: level };
  }

  /** 순수 함수 - 강수형태(기상청 PTY) 낱말. */
  function ptyWord(n) {
    return [null, tr('비', 'rain'), tr('비/눈', 'rain/snow'), tr('눈', 'snow'), tr('소나기', 'shower')][n] || null;
  }

  /** 순수 함수 - ms → 우리 시간 "HH:MM". */
  function kstHm(ms) {
    return new Date(ms + 9 * 3600000).toISOString().slice(11, 16);
  }

  /** 순수 함수 - 그 날 해 뜨고 지는 때(ms)와 계획 시각("HH:MM")으로 {rise, set, night}. night - 계획이 일출 전 · 일몰 뒤에 걸림(시행규칙 제310조 ① 6호). */
  function dayWindow(riseMs, setMs, from, to) {
    if (riseMs == null || setMs == null) return null;
    var rise = kstHm(riseMs), set = kstHm(setMs);
    var ok = /^\d\d:\d\d$/;
    // 시작 · 끝 어느 쪽이든 일출 전 · 일몰 뒤면 야간(2026-11-18 - 시작 18:30 · 끝 12:00 처럼 끝을 안 고친 때도)
    var out = function (t) { return ok.test(t || '') && (t < rise || t > set); };
    return { rise: rise, set: set, night: out(from) || out(to) };
  }

  // 비행 전 점검표 [id, 한국어, 영어] - 법 원문(docs/dronefly/law)에 있는 것은 조문을 붙임
  var CHECKS = [
    ['zone', '공역 판정대로 비행승인 · 항공촬영 신청을 했다(필요한 자리만)', 'Flight approval / filming application done if this spot needs it'],
    ['wx', '날씨 · 바람이 기체 한계 안이다(위 🌤 칸)', 'Weather and wind are within the drone\'s limits (🌤 above)'],
    ['day', '일출 ~ 일몰 사이다(야간은 특별비행승인 - 시행규칙 제310조 ① 6호)', 'Between sunrise and sunset (night needs a special flight approval)'],
    ['reg', '기체 신고 · 조종자 증명이 필요한 기체면 갖췄다', 'Registration and pilot certificate, if the drone needs them'],
    ['bat', '배터리(기체 · 조종기 · 예비)를 충전했다', 'Batteries charged (drone, controller, spares)'],
    ['prop', '프로펠러 · 기체에 금 · 헐거움이 없다', 'No cracks or loose parts on propellers and frame'],
    ['gps', '펌웨어 · 앱을 확인하고 GPS · 나침반이 잡혔다', 'Firmware/app checked, GPS and compass ready'],
    ['rth', '자동 귀환(RTH) 높이 · 귀환 지점을 맞췄다', 'Return-to-home height and home point set'],
    ['vlos', '눈으로 보이는 곳에서만, 사람이 많은 곳 위로는 날지 않는다(제310조 ① 2호 · ④)', 'Keep it in sight and stay away from crowds (art. 310)'],
    ['alc', '술 · 약 기운 없이 조종한다(제310조 ① 7호)', 'No alcohol or drugs (art. 310)'],
    ['ins', '보험(사업 목적이면 꼭)을 확인했다', 'Insurance checked (required for business use)']
  ];

  /** 순수 함수 - 저장한 점검 상태({d, on})에서 오늘 고른 것만(날이 바뀌면 비움). */
  function checksToday(saved, today) {
    return saved && saved.d === today && Array.isArray(saved.on) ? saved.on.filter(function (id) { return CHECKS.some(function (c) { return c[0] === id; }); }) : [];
  }

  /** 순수 함수 - 기록장 합계 {n 번, min 분}. */
  function logSum(list) {
    return (list || []).reduce(function (a, e) { return { n: a.n + 1, min: a.min + (+e.min || 0) }; }, { n: 0, min: 0 });
  }

  /** 순수 함수 - 조종자별 합계 [{pilot, n, min}](2026-11-18 - 교관 · 교육생 여럿), 비행 시간이 긴 차례. 조종자를 적은 기록이 없으면 []. */
  function logByPilot(list) {
    var by = {}, out = [];
    (list || []).forEach(function (e) {
      var p = String(e.pilot || '').trim();
      if (!p) return;
      if (!by[p]) out.push(by[p] = { pilot: p, n: 0, min: 0 });
      by[p].n++; by[p].min += +e.min || 0;
    });
    return out.sort(function (a, b) { return b.min - a.min; });
  }

  /** 순수 함수 - 기록장 CSV(엑셀이 한글을 읽게 BOM, 쉼표 · 따옴표 · 줄바꿈은 따옴표로 감쌈). 조종자 칸은 2026-11-18 부터(옛 기록은 빈칸). */
  function logCsv(list) {
    var q = function (v) { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [['날짜', '비행 시간(분)', '장소', '기체', '조종자', '메모']].concat((list || []).map(function (e) { return [e.d, e.min, e.place, e.drone, e.pilot, e.note]; }));
    return '\ufeff' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n') + '\r\n';
  }

  /**
   * 순수 함수 - 저장한 기록장 CSV 줄(RF.csvRows) → 기록 [{d, min, place, drone, pilot, note}](2026-11-18 홍TV님 "1~5 번까지" 1 - 폰을 바꿔도 되살리기).
   * 머리 줄은 logCsv 것(조종자 칸이 없던 11-18 앞 CSV 도 읽음). 날짜(YYYY-MM-DD) · 분(1 ~ 600)이 맞지 않는 줄은 버림. 머리가 다르면 null(다른 파일).
   */
  function logFromCsv(rows) {
    var head = (rows && rows[0] || []).map(function (h) { return String(h).trim(); });
    if (head[0] !== '날짜' || head[1] !== '비행 시간(분)') return null;
    var col = function (name) { return head.indexOf(name); }, ci = { place: col('장소'), drone: col('기체'), pilot: col('조종자'), note: col('메모') };
    var out = [];
    rows.slice(1).forEach(function (r) {
      var d = String(r[0] || '').trim(), min = parseInt(r[1], 10);
      if (!/^\d{4}-\d\d-\d\d$/.test(d) || !(min > 0 && min <= 600)) return;
      var e = { d: d, min: min };
      ['place', 'drone', 'pilot', 'note'].forEach(function (k) { e[k] = ci[k] >= 0 ? String(r[ci[k]] || '').trim() : ''; });
      out.push(e);
    });
    return out;
  }

  /**
   * 순수 함수 - 비행 날 아침 앱 알림(2026-11-18 홍TV님 "1~5" 4): 그날 07:00(KST), 시작이 08:00 앞이면 시작 1시간 전.
   * 날씨 숫자는 알림을 맞출 때 것이 낡으므로 넣지 않고 "다시 보세요" 만. 이미 지난 시각이거나 날짜 · 시각이 맞지 않으면 null. id 9200(출조 9100 ~ 9199 다음).
   */
  function flyMorning(p, now) {
    var d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(p.date || ''), f = /^(\d\d):(\d\d)$/.exec(p.from || '');
    if (!d || !f) return null;
    var min = Math.min(7 * 60, +f[1] * 60 + +f[2] - 60);
    if (min < 0) return null;   // 01:00 앞 시작 - 전날 밤 알림은 하지 않음
    var at = Date.UTC(+d[1], +d[2] - 1, +d[3], 0, min) - 9 * 3600000;
    if (!(at > now)) return null;
    var pl = p.place ? ' · ' + p.place : '';
    return { id: 9200, at: at, title: tr('🚁 드론플라이', '🚁 Dronefly'),
      body: tr('오늘 ' + p.from + ' 비행 계획' + pl + ' - 떠나기 전에 바람 · 비 · 공역을 다시 보세요.', 'Flight planned today at ' + p.from + pl + ' - check wind, rain and airspace again before you go.') };
  }

  /** 순수 함수 - 한 조종자 기록만(2026-11-18 "1~5" 5 - 조종자별 CSV). 이름 앞뒤 빈칸은 무시, 빈 이름이면 모두. */
  function logOf(list, pilot) {
    var p = String(pilot || '').trim();
    return (list || []).filter(function (e) { return !p || String(e.pilot || '').trim() === p; });
  }

  /**
   * 순수 함수 - 비행 계획 → 기록장 칸 값 {d, min, place}(2026-11-18 "비행 계획 → 기록장 한 번에").
   * 장소는 고른 이름 · "내 위치" · 위경도, 시간은 계획 시작 ~ 끝(분, 맞지 않으면 빈칸 - 실제 비행 시간은 사람이 고침).
   */
  function planToLog(p) {
    var a = /^(\d\d):(\d\d)$/.exec(p.from || ''), b = /^(\d\d):(\d\d)$/.exec(p.to || '');
    var min = a && b ? (+b[1] * 60 + +b[2]) - (+a[1] * 60 + +a[2]) : 0;
    var place = p.name || (p.me ? tr('내 위치', 'My location') : typeof p.lat === 'number' ? p.lat.toFixed(4) + ', ' + p.lon.toFixed(4) : '');
    return { d: /^\d{4}-\d\d-\d\d$/.test(p.date || '') ? p.date : '', min: min > 0 ? String(min) : '', place: place };
  }

  /** 순수 함수 - 분 → "1시간 25분" · "40분". */
  function minText(m) {
    var h = Math.floor(m / 60), r = m % 60;
    if (lang === 'en') return (h ? h + ' h' : '') + (r || !h ? (h ? ' ' : '') + r + ' min' : '');
    return (h ? h + '시간' : '') + (r || !h ? (h ? ' ' : '') + r + '분' : '');
  }

  // ---- 📝 4종 필기 연습(2026-11-18 홍TV님 블로그 95문항 "참조해") ----

  /** 순수 함수 - 풀 차례(문항 번호들). mode: all 1번부터 · mix 섞어 20 · wrong 틀린 것만. rnd - 0 ~ 1 을 주는 함수(테스트는 고정값). */
  function quizOrder(nos, mode, wrong, rnd) {
    if (mode === 'wrong') return nos.filter(function (n) { return (wrong || []).indexOf(n) >= 0; });
    if (mode !== 'mix') return nos.slice();
    var a = nos.slice(), r = rnd || Math.random;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, 20);
  }

  /**
   * 순수 함수 - 틀린 문항 열쇠 목록 고치기: 틀리면 넣고, 맞히면 뺌. 열쇠는 "묶음:번호"(c4:7 · inst:1-관련), 옛 숫자(4종만 있던 때)는 c4: 로 옮김.
   * 차례는 묶음 · 번호 순(숫자는 숫자로).
   */
  function quizMark(wrong, key, ok) {
    var w = quizKeys(wrong).filter(function (k) { return k !== key; });
    if (!ok) w.push(key);
    return w.sort(function (a, b) { return a.localeCompare(b, 'ko', { numeric: true }); });
  }

  /** 순수 함수 - 저장한 틀린 목록을 열쇠 꼴로(옛 숫자 7 → "c4:7", 꼴이 틀린 값은 버림). */
  function quizKeys(wrong) {
    return (Array.isArray(wrong) ? wrong : []).map(function (k) { return typeof k === 'number' ? 'c4:' + k : k; })
      .filter(function (k) { return typeof k === 'string' && /^[a-z0-9]+:./.test(k); });
  }

  /**
   * 순수 함수 - "1번부터" 를 이어서(2026-11-18 홍TV님 "3번문항까지 풀면 그다음 4번문항을 풀어야 해"): 마지막으로 푼 번호 다음 자리(0 부터).
   * 푼 것이 없거나, 마지막 문항까지 풀었거나, 그 번호가 없으면(문항이 바뀜) 0 - 처음부터.
   */
  function quizResume(nos, last) {
    var i = (nos || []).indexOf(last);
    return i >= 0 && i + 1 < nos.length ? i + 1 : 0;
  }

  /** 순수 함수 - 점수 기록 더하기(2026-11-18 "1~5" 3): {d, set, mode, n, ok} 를 맨 앞에, 30개까지. 한 문항도 안 푼 것은 넣지 않음. */
  function quizScoreAdd(log, rec) {
    var l = Array.isArray(log) ? log.slice() : [];
    if (rec && rec.n > 0) l.unshift(rec);
    return l.slice(0, 30);
  }

  /** 순수 함수 - 점수 한 줄: "11-18 섞어서 · 15/20 (75%)". */
  function quizScoreText(r) {
    var mode = { all: tr('차례대로', 'In order'), mix: tr('섞어서', 'Random'), wrong: tr('틀린 것', 'Wrong ones') }[r.mode] || '';
    return String(r.d || '').slice(5) + ' ' + mode + ' · ' + r.ok + '/' + r.n + ' (' + Math.round(r.ok / r.n * 100) + '%)';
  }

  /** 순수 함수 - 문항 번호 글: "7" → "7.", "1-관련" → "1번 관련 문제)". */
  function quizLabel(no) {
    var m = /^(\d+)-관련$/.exec(no);
    return m ? tr(m[1] + '번 관련 문제)', 'Related to no. ' + m[1] + ')') : no + '.';
  }

  var api = { flyMorning: flyMorning, logFromCsv: logFromCsv, logOf: logOf, quizResume: quizResume, quizScoreAdd: quizScoreAdd, quizScoreText: quizScoreText, logByPilot: logByPilot, specialDue: specialDue, planToLog: planToLog, quizOrder: quizOrder, quizMark: quizMark, quizKeys: quizKeys, quizLabel: quizLabel, wxCell: wxCell, flyWx: flyWx, ptyWord: ptyWord, kstHm: kstHm, dayWindow: dayWindow, CHECKS: CHECKS, checksToday: checksToday, logSum: logSum, logCsv: logCsv, minText: minText, planWindow: planWindow, heritageCell: heritageCell, heritageNotes: heritageNotes, shootText: shootText, tmpState: tmpState, firstDay: firstDay, workdays: workdays, dueText: dueText, toGeoJSON: toGeoJSON, nearStrict: nearStrict, setLang: setLang, nextSize: nextSize, inRing: inRing, inGeom: inGeom, isTca: isTca, zonesAt: zonesAt, levelOf: levelOf, zoneLine: zoneLine, verdict: verdict, meters: meters, nearest: nearest, nearUa: nearUa, dist: dist, applyText: applyText };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.DF = api;

  // ---------------- 화면 ----------------
  var $ = function (id) { return document.getElementById(id); };
  var data = null, here = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function opts() {
    return { photo: $('photo').checked, heavy: $('heavy').checked, high: +$('alt').value >= 150 };
  }

  var phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  /** 허용구역 줄의 고리 [글, 주소, 새 창] - 지도 · 길찾기(카카오맵), 휴대폰이면 🚗 티맵(코스 모음 산 페이지와 같은 RF.tmapHref - 2026-11-17 홍TV님 "길찾기, 티맵 연결해줘"). 도착은 그 공역 경계의 가장 가까운 점. */
  function uaLinks(u, mobile) {
    var nm = encodeURIComponent(String(u.name).replace(/[,/?#&]/g, ' ').trim()), at = ',' + u.lat.toFixed(6) + ',' + u.lon.toFixed(6);
    var out = [[tr('🗺 지도', '🗺 Map'), 'https://map.kakao.com/link/map/' + nm + at, true], [tr('🧭 길찾기', '🧭 Directions'), 'https://map.kakao.com/link/to/' + nm + at, true]];
    if (mobile && window.RF && window.RF.tmapHref) out.push([tr('🚗 티맵', '🚗 TMAP'), window.RF.tmapHref(u.name, u.lat, u.lon), false]);
    return out;
  }

  function draw() {
    if (!data || !here) return;
    var when = planWindow(Date.now(), $('date').value, $('to').value);
    var zones = zonesAt(data, here.lat, here.lon, when), v = verdict(zones, opts());
    refreshAir(when);
    $('result').hidden = false;
    $('result').className = 'dcard result ' + v.level;
    $('place').textContent = here.me ? tr('📍 내 위치', '📍 My location') : here.name || (tr('위도 ', 'lat ') + here.lat.toFixed(5) + tr(', 경도 ', ', lon ') + here.lon.toFixed(5));
    $('head').textContent = v.head;
    $('zones').innerHTML = v.lines.length ? v.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') : '<li>' + tr('걸린 공역 없음(비행금지 · 제한 · 관제권 · 군작전 · UA 밖)', 'No listed airspace here (outside prohibited · restricted · control zone · MOA · UA)') + '</li>';
    // 이미 승인 필요 · 금지 안이면 다른 공역 거리는 헷갈려 뺌(2026-11-17 PC: P73A 안인데 "김포 관제권 6.5km" 줄)
    var ns = LEVEL[v.level] < LEVEL.need ? nearStrict(data, here.lat, here.lon) : null;
    if (ns) $('zones').insertAdjacentHTML('beforeend', '<li class="near">' + esc(tr('가장 가까운 승인 필요 공역: ' + zoneLine(ns.z) + ' - 경계까지 ' + dist(ns.m), 'Nearest airspace needing approval: ' + zoneLine(ns.z) + ' - ' + dist(ns.m) + ' to its edge')) + '</li>');
    var her = heritageFor(here.lat, here.lon);
    heritageNotes(her, here.lat, here.lon).forEach(function (n) { v.notes.unshift(n); });
    $('notes').innerHTML = v.notes.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    $('ua').hidden = false;
    $('uaList').innerHTML = nearUa(data, here.lat, here.lon, 5).map(function (u) {
      return '<li><b>' + esc(u.name) + '</b> <span class="dim">' + esc(tr(u.top + ' 까지', 'up to ' + u.top)) + '</span> · ' + (u.m === 0 ? tr('지금 안', 'you are in it') : dist(u.m))
        + '<span class="go">' + uaLinks(u, phone).map(function (g) { return '<a href="' + esc(g[1]) + '"' + (g[2] ? ' target="_blank" rel="noopener"' : '') + '>' + g[0] + '</a>'; }).join('') + '</span></li>';
    }).join('');
    $('plan').hidden = false;
    // 비행승인 요청은 승인이 필요한 자리(🟠 · 🔴, 25kg 초과 · 150m 이상 포함)일 때만(2026-11-17 홍TV님 "승인이 필요할 때만 정보 보여줘")
    $('apply').hidden = LEVEL[v.level] < LEVEL.need;
    // 비행승인 기한은 비행승인(근무일 3일)만 - 항공촬영은 아래 칸이 따로 셈(2026-11-17 홍TV님 "비행승인 요청처럼 항공촬영도")
    var today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    var due = dueText(today, $('date').value, LEVEL[v.level] >= LEVEL.need, false);
    $('due').hidden = !due;
    if (due) { $('due').textContent = due.text; $('due').className = 'due' + (due.ok ? ' ok' : ''); }
    var f = { place: here.me ? '내 위치' : here.name || '', lat: here.lat, lon: here.lon, radius: $('radius').value, alt: $('alt').value,
      date: $('date').value, from: $('from').value, to: $('to').value, purpose: $('purpose').value, photo: $('photo').checked, weight: $('heavy').checked ? '25kg 초과' : '25kg 이하',
      what: $('shootWhat').value };
    $('applyOut').value = applyText(f, zones);
    $('shoot').hidden = !$('photo').checked;   // 촬영을 고른 때만
    var sd = dueText(today, $('date').value, false, true);
    $('shootDue').hidden = !sd;
    if (sd) { $('shootDue').textContent = sd.text; $('shootDue').className = 'due' + (sd.ok ? ' ok' : ''); }
    $('shootOut').value = shootText(f, zones);
    drawWx();
  }

  // ---- 비행 날씨 · 날 수 있는 시간(2026-11-18) - 약 5km 고정 칸 가운데로 /api/weather(기상청 단기예보, 산 페이지와 같은 것)를 묻고 판정은 폰이 ----
  var wxCache = {}, wxWait = {};   // wxWait[칸] - 묻는 중 true, 못 받은 때(ms) - 2분 동안 다시 묻지 않음(문화재 칸과 같게)
  function wxFor(lat, lon) {
    var c = wxCell(lat, lon), key = c.join(',');
    if (wxCache[key]) return wxCache[key];
    var w = wxWait[key];
    if (!w || (w !== true && Date.now() - w > 120000)) {
      wxWait[key] = true;
      fetch('api/weather?lat=' + c[0] + '&lon=' + c[1]).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || d.unavailable || !d.hours) { wxWait[key] = Date.now(); drawWx(); return; }
        wxWait[key] = false;
        wxCache[key] = d;
        if (here && wxCell(here.lat, here.lon).join(',') === key) drawWx();
      }).catch(function () { wxWait[key] = Date.now(); drawWx(); });
    }
    return null;
  }
  function windLimit() {
    var v = parseFloat($('windMax').value);
    return v > 0 ? v : null;
  }
  function dayLabel(date) {
    var d = new Date(date + 'T00:00:00Z');
    if (isNaN(d)) return date;
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + tr('일월화수목금토'.charAt(d.getUTCDay()), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]) + ')';
  }
  function drawWx() {
    if (!here) return;
    $('wx').hidden = false;
    var date = $('date').value, from = $('from').value, to = $('to').value;
    var today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    // 날 수 있는 때 - 해 뜨고 지는 시각은 폰이 셈(코스 모음 산 페이지와 같은 RF.sunrise · RF.sunset)
    var dms = /^\d{4}-\d\d-\d\d$/.test(date) ? Date.parse(date + 'T03:00:00Z') : NaN;
    var win = !isNaN(dms) && window.RF && window.RF.sunrise ? dayWindow(window.RF.sunrise(dms, here.lat, here.lon), window.RF.sunset(dms, here.lat, here.lon), from, to) : null;
    $('sun').textContent = win ? tr('☀ ' + dayLabel(date) + ' 날 수 있는 때 ' + win.rise + ' ~ ' + win.set + ' (일출 ~ 일몰)', '☀ ' + dayLabel(date) + ' daylight flying ' + win.rise + ' – ' + win.set + ' (sunrise to sunset)')
      + (win.night ? tr(' - ⚠ 계획 ' + from + ' ~ ' + to + ' 이 야간에 걸립니다. 야간은 특별비행승인이 필요합니다.', ' - ⚠ your plan ' + from + '–' + to + ' runs into the night, which needs a special flight approval.') : '') : '';
    $('sun').className = 'sunLine' + (win && win.night ? ' night' : '');
    var nd = win && win.night ? specialDue(today, date) : null;   // 야간이면 특별비행승인 기한(근무일 30일)
    $('nightDue').hidden = !nd;
    if (nd) { $('nightDue').textContent = nd.text; $('nightDue').className = 'due' + (nd.ok ? ' ok' : ''); }
    var d = wxFor(here.lat, here.lon), lim = windLimit();
    if (!d) {
      var w = wxWait[wxCell(here.lat, here.lon).join(',')];
      $('wxHead').className = 'wxHead';
      $('wxHead').textContent = w === true ? tr('기상청 예보를 받는 중…', 'Loading the KMA forecast…') : tr('예보를 받지 못했습니다. 잠시 뒤 다시 골라 주세요.', 'Could not load the forecast. Please pick the spot again in a moment.');
      $('wxRows').innerHTML = '';
      return;
    }
    var r = flyWx(d.hours, date, from, to, lim), on = date;
    // 비행 날이 단기예보 밖이면(기본 날짜는 신청 기간 뒤라 흔함) 오늘 남은 때를 대신 보임
    if (!r) { on = today; r = flyWx(d.hours.filter(function (h) { return String(h.t) >= new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 13).replace('T', ' '); }), today, '00:00', '23:59', lim); }
    var mark = r && r.level ? { no: '✕', care: '△', ok: '○' }[r.level] : '';
    $('wxHead').className = 'wxHead ' + (r && r.level ? r.level : '');
    if (!r) { $('wxHead').textContent = tr('이 날은 아직 기상청 단기예보 밖입니다(모레 · 글피까지 나옴).', 'This day is beyond the KMA short-range forecast (about 3 days).'); $('wxRows').innerHTML = ''; return; }
    var lead = on !== date ? tr(dayLabel(date) + ' 은 아직 예보 밖이라 오늘 ' + dayLabel(on) + ' 남은 때: ', dayLabel(date) + ' is beyond the forecast, so today ' + dayLabel(on) + ': ') : tr(dayLabel(on) + ' ' + from + ' ~ ' + to + ': ', dayLabel(on) + ' ' + from + '–' + to + ': ');
    var bits = [];
    if (r.wind != null) bits.push(tr('바람 최대 ', 'wind up to ') + r.wind + 'm/s' + (lim ? tr(' (기체 ' + lim + 'm/s)', ' (limit ' + lim + ' m/s)') : ''));
    if (r.rain) bits.push(tr('비 · 눈 예보', 'rain/snow forecast'));
    else if (r.pop != null) bits.push(tr('강수확률 ', 'chance of rain ') + r.pop + '%');
    if (r.tmin != null) bits.push(tr('최저 ', 'low ') + r.tmin + '℃');
    // △ 는 "비행 자제 권장"(2026-11-18 홍TV님 "가 로해" - 70% 를 실질 비행 상한으로 보는 운용 기준, 판단은 조종자)
    var care = r.level === 'care' ? tr('비행 자제 권장(돌풍 여유 없음) - ', 'Better not to fly (no margin for gusts) - ') : '';
    $('wxHead').textContent = (mark ? mark + ' ' : '') + care + lead + bits.join(' · ') + (lim ? '' : tr(' - 아래에 기체 최대 풍속을 넣으면 ○ △ ✕ 로 봅니다.', ' - enter your drone\'s max wind below to get ○ △ ✕.'));
    $('wxRows').innerHTML = r.rows.map(function (h) {
      var p = ptyWord(h.pty);
      return '<li>' + esc(String(h.t).slice(11, 13) + tr('시', ':00') + ' · ' + tr('바람 ', 'wind ') + (h.wsd != null ? h.wsd + 'm/s' : '-') + ' · ' + (p ? p : tr('강수 ', 'rain ') + (h.pop != null ? h.pop + '%' : '-')) + ' · ' + (h.tmp != null ? h.tmp + '℃' : '')) + '</li>';
    }).join('');
  }

  // ---- 문화재보호구역(2026-11-17 홍TV님 "문화재보호구역도 넣어줘") - 약 10km 고정 칸마다 서버(/api/heritage)에 묻고 칸 안 셈은 폰이 ----
  var herCache = {}, herWait = {};   // herWait[칸] - 묻는 중 true, 못 받은 때(ms) - 2분 동안 다시 묻지 않음(점검 12차 A3)
  function heritageFor(lat, lon) {
    var c = heritageCell(lat, lon), key = c.join(',');
    if (herCache[key]) return herCache[key];
    var w = herWait[key];
    if (!w || (w !== true && Date.now() - w > 120000)) {
      herWait[key] = true;
      fetch('api/heritage?w=' + c[0] + '&s=' + c[1] + '&e=' + c[2] + '&n=' + c[3]).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || d.unavailable) { herWait[key] = Date.now(); return; }
        herWait[key] = false;
        herCache[key] = d;
        showHeritage();
        if (here && heritageCell(here.lat, here.lon).join(',') === key) draw();
      }).catch(function () { herWait[key] = Date.now(); });
    }
    return null;
  }
  function showHeritage() {
    if (!map || !mapReady) return;
    var feats = [];
    Object.keys(herCache).forEach(function (k) { (herCache[k].zones || []).forEach(function (z) { feats.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: z.g } }); }); });
    var fc = { type: 'FeatureCollection', features: feats };
    if (map.getSource('her')) { map.getSource('her').setData(fc); return; }
    map.addSource('her', { type: 'geojson', data: fc, attribution: '문화재보호구역 Heritage: V-World (국토교통부 MOLIT)' });
    map.addLayer({ id: 'her-fill', type: 'fill', source: 'her', paint: { 'fill-color': '#2e9e44', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'her-line', type: 'line', source: 'her', paint: { 'line-color': '#2e9e44', 'line-width': 1.5 } });
  }

  // ---- 지도(2026-11-17 홍TV님 "이 지도 좋은데" - 드론원스톱처럼 공역을 지도에, 누르면 그 자리 판정) ----
  var map = null, mark = null, mapReady = false;
  var COLOR = { tmp: '#8e24aa', tmpq: '#8e24aa', port: '#b3261e', prh: '#d93025', res: '#e8710a', ctr: '#5b8c6b', tca: '#5b8c6b', moa: '#c9a400', ua: '#e0559a' };
  function colorExpr() {
    var e = ['match', ['get', 'kind']];
    Object.keys(COLOR).forEach(function (k) { e.push(k, COLOR[k]); });
    e.push('#888');
    return e;
  }
  // 지도의 임시 비행금지도 판정과 같은 때로(점검 12차 A7 - 처음 한 번만 셈해 열어 둔 채 기간이 지나도 그대로였음). 같은 날이면 다시 넣지 않음
  var airKey = '';
  function refreshAir(when) {
    var k = new Date(when[0]).toISOString().slice(0, 13) + '|' + new Date(when[1]).toISOString().slice(0, 13);
    if (!map || !map.getSource('air') || k === airKey) return;
    airKey = k;
    map.getSource('air').setData(toGeoJSON(data, when));
  }
  function addAirspace() {
    if (!map || !mapReady || !data || map.getSource('air')) return;
    // 출처는 말과 상관없이 한 글로(점검 12차 A7 - 한/EN 을 바꿔도 처음 말로 남았음)
    map.addSource('air', { type: 'geojson', data: toGeoJSON(data), attribution: '공역 Airspace: V-World (국토교통부 MOLIT)' });
    // 문화재 칸이 먼저 그려졌으면 그 아래로(점검 12차 A8 - 초록 칸이 공역 색에 가렸음)
    var before = map.getLayer('her-fill') ? 'her-fill' : undefined;
    map.addLayer({ id: 'air-fill', type: 'fill', source: 'air', paint: { 'fill-color': colorExpr(), 'fill-opacity': ['match', ['get', 'kind'], 'tmp', 0.35, 'tmpq', 0.15, 'port', 0.3, 'prh', 0.35, 'ua', 0.35, 'ctr', 0.22, 'tca', 0.08, 'res', 0.18, 0.06] } }, before);
    map.addLayer({ id: 'air-line', type: 'line', source: 'air', paint: { 'line-color': colorExpr(), 'line-width': ['match', ['get', 'kind'], 'prh', 2, 'ua', 2, 1.2],
      'line-dasharray': ['match', ['get', 'kind'], 'moa', ['literal', [3, 2]], 'tca', ['literal', [2, 2]], 'tmpq', ['literal', [2, 2]], ['literal', [1, 0]]] } }, before);
  }
  function showOnMap(p, fly) {
    if (!map) return;
    if (!mark) {
      var el = document.createElement('div');
      el.className = 'here-dot';
      mark = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    } else mark.setLngLat([p.lon, p.lat]);
    if (fly) map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 11) });
  }
  function initMap() {
    if (!window.maplibregl || !window.RF || !window.RF.baseStyle) return;
    fetch('api/map-config').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (cfg) {
      var st = window.RF.baseStyle(cfg || {});
      // 2D 공역 지도라 지형 음영은 장식 - 바탕 지도(V-World)가 있으면 빼서 타일 요청을 줄임(점검 12차 C2)
      if (cfg && cfg.vworldKey) { st.layers = st.layers.filter(function (l) { return l.id !== 'hillshade'; }); delete st.sources.hillshade; }
      map = new maplibregl.Map({ container: 'map', style: st, center: [127.8, 36.3], zoom: 6, locale: window.RF.mapLocale(),
        attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
      // 출처는 ⓘ 로 접어 둠(공원 · 따라가기 지도와 같게 - 지도를 가리지 않게, 누르면 늘 보임)
      var fold = function () { var a = document.querySelector('.maplibregl-ctrl-attrib'); if (a) a.classList.remove('maplibregl-compact-show'); };
      fold();
      map.once('load', fold);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), 'bottom-left');
      map.once('load', function () { mapReady = true; addAirspace(); showHeritage(); if (here) showOnMap(here, true); });
      map.on('click', function (e) { setHere({ lat: e.lngLat.lat, lon: e.lngLat.lng }, true); });
    });
  }

  /** 기다리는 동안 도는 표시 + 글(2026-11-17 홍TV님 "작업중이라는 화면 돌아가는 것들") - 다음 글(textContent)이 들어오면 저절로 사라짐. */
  function busy(text) {
    $('state').innerHTML = '<span class="spin" aria-hidden="true"></span>' + esc(text);
  }

  var ask = 0;   // 자리 묻기 차례(점검 12차 A4 - 늦게 온 위치 · 찾기 답이 나중에 고른 자리를 덮었음)
  function setHere(p, fromMap) {
    ask++;
    here = p;
    showOnMap(p, !fromMap);
    $('state').textContent = '';
    if (!data) { busy(tr('공역 자료를 받는 중…', 'Loading airspace data…')); pendingScroll = !fromMap; return; }
    draw();
    if (!fromMap) showResult();
  }
  // 📍 · 찾기로 고른 자리는 판정 칸으로 내려가 보여 줌(점검 12차 D1 - 결과가 화면 아래에 나와 "안 된 줄" 알았음). 지도를 누른 때는 지도를 보던 중이라 그대로
  var pendingScroll = false;
  function showResult() {
    pendingScroll = false;
    try { $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { $('result').scrollIntoView(); }
  }

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 기억 못 해도 지금 화면은 바뀜 */ } }
  function todayKst() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }

  // ---- 비행 전 점검표(2026-11-18) - 고른 것은 그날만(df-check) ----
  function paintCheck() {
    var on = checksToday(load('df-check'), todayKst());
    $('checkList').innerHTML = CHECKS.map(function (c) {
      return '<li><label><input type="checkbox" data-c="' + c[0] + '"' + (on.indexOf(c[0]) >= 0 ? ' checked' : '') + '> <span>' + esc(tr(c[1], c[2])) + '</span></label></li>';
    }).join('');
    $('check').querySelector('summary h2').setAttribute('data-count', on.length + '/' + CHECKS.length);
  }
  function initCheck() {
    paintCheck();
    $('checkList').addEventListener('change', function () {
      var on = Array.prototype.map.call($('checkList').querySelectorAll('input:checked'), function (x) { return x.getAttribute('data-c'); });
      save('df-check', JSON.stringify({ d: todayKst(), on: on }));
      $('check').querySelector('summary h2').setAttribute('data-count', on.length + '/' + CHECKS.length);
    });
    $('checkClear').addEventListener('click', function () { save('df-check', JSON.stringify({ d: todayKst(), on: [] })); paintCheck(); });
  }

  // ---- 비행 기록장(2026-11-18) - 이 폰에만(df-log), 새 것이 위, 500개까지 ----
  function logList() { var l = load('df-log'); return Array.isArray(l) ? l : []; }
  function paintLog() {
    var list = logList(), s = logSum(list);
    $('logSum').textContent = s.n ? tr('모두 ' + s.n + '번 · ' + minText(s.min), s.n + ' flights · ' + minText(s.min)) : tr('아직 기록이 없습니다.', 'No flights logged yet.');
    var bp = logByPilot(list);
    $('logPilots').hidden = !bp.length;
    $('logPilots').textContent = bp.length ? tr('조종자별: ', 'By pilot: ') + bp.map(function (x) { return x.pilot + ' ' + tr(x.n + '번 ', x.n + ' · ') + minText(x.min); }).join(' / ') : '';
    $('logList').innerHTML = list.map(function (e, i) {
      return '<li><span>' + esc(e.d + ' · ' + minText(+e.min || 0) + (e.place ? ' · ' + e.place : '') + (e.drone ? ' · ' + e.drone : '') + (e.pilot ? ' · 👤 ' + e.pilot : '') + (e.note ? ' · ' + e.note : '')) + '</span> <button type="button" class="del" data-i="' + i + '" aria-label="' + esc(tr('이 기록 지우기', 'Delete this entry')) + '">✕</button></li>';
    }).join('');
    $('logCsv').hidden = !list.length;
    // 조종자가 둘 이상 적혀 있으면 CSV 에 넣을 사람을 고름(처음은 모두)
    var who = $('logWho'), was = who.value;
    who.hidden = !list.length || !bp.length;
    who.innerHTML = '<option value="">' + esc(tr('모든 조종자', 'All pilots')) + '</option>' + bp.map(function (x) { return '<option>' + esc(x.pilot) + '</option>'; }).join('');
    who.value = bp.some(function (x) { return x.pilot === was; }) ? was : '';
  }
  function initLog() {
    $('logDate').value = todayKst();
    paintLog();
    $('logForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var min = parseInt($('logMin').value, 10);
      if (!(min > 0) || !$('logDate').value) return;
      var list = logList();
      list.unshift({ d: $('logDate').value, min: min, place: $('logPlace').value.trim() || (here && here.name) || '', drone: $('logDrone').value.trim(), pilot: $('logPilot').value.trim(), note: $('logNote').value.trim() });
      save('df-log', JSON.stringify(list.slice(0, 500)));
      $('logMin').value = ''; $('logNote').value = '';
      paintLog();
    });
    $('logList').addEventListener('click', function (e) {
      var b = e.target.closest('button.del');
      if (!b || !window.confirm(tr('이 기록을 지울까요?', 'Delete this entry?'))) return;
      var list = logList();
      list.splice(+b.getAttribute('data-i'), 1);
      save('df-log', JSON.stringify(list));
      paintLog();
    });
    // 📒 이 비행을 기록장에 - 비행 계획의 날짜 · 장소 · 시작 ~ 끝 시간을 기록장 칸에 채우고 그리로(더하기는 사람이 확인하고 누름)
    $('toLog').addEventListener('click', function () {
      var v = planToLog({ name: here && here.name, me: here && here.me, lat: here && here.lat, lon: here && here.lon, date: $('date').value, from: $('from').value, to: $('to').value });
      if (v.d) $('logDate').value = v.d;
      $('logPlace').value = v.place;
      $('logMin').value = v.min;
      $('log').open = true;
      try { $('log').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { $('log').scrollIntoView(); }
      $('logMin').focus({ preventScroll: true });
    });
    initFlyAlarm();
    $('logCsv').addEventListener('click', function () {
      var a = document.createElement('a');
      var who = $('logWho').value;
      a.href = URL.createObjectURL(new Blob([logCsv(logOf(logList(), who))], { type: 'text/csv;charset=utf-8' }));
      a.download = 'dronefly-log-' + (who ? who.replace(/[\\/:*?"<>|\s]+/g, '_') + '-' : '') + todayKst() + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
    // ⬆ CSV 불러오기 - 받아 둔 기록장 CSV 를 합침(같은 기록은 건너뜀). 파일은 폰 안에서만 읽고 서버로 보내지 않음
    $('logLoad').addEventListener('click', function () { $('logFile').value = ''; $('logFile').click(); });
    $('logFile').addEventListener('change', function () {
      var f = $('logFile').files && $('logFile').files[0], out = $('logLoaded');
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var add = logFromCsv(RF.csvRows(r.result));
        out.hidden = false;
        if (!add) { out.textContent = tr('비행 기록장 CSV 가 아닙니다("⬇ CSV 로 저장" 으로 받은 파일을 고르세요).', 'This is not a flight-log CSV (pick a file saved with “⬇ Save as CSV”).'); return; }
        var m = RF.mergeRows(logList(), add.map(function (e) { e.min = String(e.min); return e; }), ['d', 'min', 'place', 'drone', 'pilot', 'note'], 500);
        save('df-log', JSON.stringify(m.list));
        paintLog();
        out.textContent = tr(add.length + '줄 가운데 ' + m.added + '개를 더했습니다(이미 있던 ' + (add.length - m.added) + '개는 건너뜀).', 'Added ' + m.added + ' of ' + add.length + ' rows (' + (add.length - m.added) + ' already here).');
      };
      r.onerror = function () { out.hidden = false; out.textContent = tr('파일을 읽지 못했습니다.', 'Could not read the file.'); };
      r.readAsText(f, 'utf-8');
    });
  }

  // 🔔 비행 날 아침 알림 - 앱(안드로이드)에서만, 화면을 닫아도 울림(출조 알림과 같은 LocalNotifications). 브라우저는 단추를 숨김
  function initFlyAlarm() {
    var CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    var LN = NATIVE && (!CAP.isPluginAvailable || CAP.isPluginAvailable('LocalNotifications')) && CAP.Plugins && CAP.Plugins.LocalNotifications || null;
    if (!LN) return;
    var msg = $('flyAlarmMsg'), show = function (t) { msg.hidden = false; msg.textContent = t; };
    $('flyAlarm').hidden = false;
    $('flyAlarm').addEventListener('click', function () {
      var n = flyMorning({ date: $('date').value, from: $('from').value, place: planToLog({ name: here && here.name, me: here && here.me, lat: here && here.lat, lon: here && here.lon }).place }, Date.now());
      if (!n) { show(tr('비행 날짜 · 시작 시각이 이미 지났거나 비어 있습니다.', 'The flight date and start time are empty or already past.')); return; }
      Promise.resolve(LN.createChannel({ id: 'rf-dronefly', name: tr('드론플라이 비행 알림', 'Dronefly alerts'), importance: 4, visibility: 1, vibration: true })).catch(function () { /* 이미 있음 */ })
        .then(function () { return Promise.resolve(LN.cancel({ notifications: [{ id: n.id }] })).catch(function () { /* 없음 */ }); })
        .then(function () { return Promise.resolve(LN.requestPermissions()).catch(function () { return null; }); })
        .then(function (perm) {
          if (perm && perm.display && perm.display !== 'granted') throw new Error('denied');
          return LN.schedule({ notifications: [{ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true }, channelId: 'rf-dronefly', extra: { page: 'dronefly' } }] });
        })
        .then(function () { var when = $('date').value.slice(5) + ' ' + kstHm(n.at); show(tr(when + ' 에 알립니다(한 번에 한 비행만 - 다시 누르면 바뀜).', 'You will be alerted at ' + when + ' (one flight at a time - tapping again replaces it).')); })
        .catch(function () { show(tr('알림을 맞추지 못했습니다. 폰 설정에서 routefly 알림을 켜 주세요.', 'Could not set the alert. Please allow notifications for routefly in phone settings.')); });
    });
  }

  // ---- 📝 필기 연습 화면(4종 · 교관 과정) - 칸을 처음 펼 때 data/drone-quiz.json 을 받음, 틀린 문항은 이 폰에(df-quiz, "묶음:번호") ----
  var quiz = null, run = null;
  function wrongList() { return quizKeys(load('df-quiz')); }
  function curSet() { return quiz ? quiz.sets.filter(function (s) { return s.id === $('quizSet').value; })[0] || quiz.sets[0] : null; }
  function setId() { return $('quizSet').value || 'c4'; }
  // 이어 풀기 자리(df-quiz-at {묶음: 마지막으로 푼 번호}) · 점수 기록(df-quiz-score, 30개) - 2026-11-18 홍TV님 "1~5" 3 · "3번문항까지 풀면 그다음 4번"
  function quizAt() { var a = load('df-quiz-at'); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; }
  function paintWrongBtn() {
    var pre = setId() + ':', n = wrongList().filter(function (k) { return k.indexOf(pre) === 0; }).length;
    $('quizWrong').textContent = tr('틀린 것만 (' + n + ')', 'Wrong ones (' + n + ')');
    $('quizWrong').disabled = !n;
    // "1번부터" → 푼 자리가 있으면 "4번부터 이어서" + "처음부터"(문항 목록을 받기 전에는 번호만 보고 둠)
    var set = curSet(), last = quizAt()[setId()], nos = set ? set.qs.map(function (q) { return q.no; }) : [];
    var i = set ? quizResume(nos, last) : 0, early = !set && last != null;   // 문항을 받기 전(칸을 펴기 전) - 번호는 몰라도 이어 풀 자리가 있음(2026-11-18 PC)
    $('quizAll').textContent = i ? tr(quizLabel(nos[i]).replace(/\.$/, '번').replace(/\)$/, '') + '부터 이어서', 'Continue from no. ' + nos[i]) : early ? tr('이어서 풀기', 'Continue') : tr('1번부터', 'From no. 1');
    $('quizRestart').hidden = !i && !early;
    var sc = (load('df-quiz-score') || []).filter(function (r) { return r && r.set === setId() && r.n > 0; }).slice(0, 3);
    $('quizScores').hidden = !sc.length;
    $('quizScores').textContent = sc.length ? tr('지난 점수: ', 'Recent scores: ') + sc.map(quizScoreText).join(' / ') : '';
  }
  /** 이번에 푼 것을 점수 기록에 한 번만(다 풀었을 때 · 다른 시험으로 바꾸거나 새로 시작할 때 · 화면을 떠날 때). */
  function keepScore() {
    if (!run || run.kept || !run.n) return;
    run.kept = true;
    save('df-quiz-score', JSON.stringify(quizScoreAdd(load('df-quiz-score'), { d: todayKst(), set: run.set.id, mode: run.mode, n: run.n, ok: run.ok })));
  }
  var quizWait = null;
  function loadQuiz(then) {
    if (quiz) { if (then) then(); return; }
    if (!quizWait) quizWait = fetch('data/drone-quiz.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { quiz = d; })
      .catch(function () { quizWait = null; $('quizBox').hidden = false; $('quizBox').textContent = tr('문항을 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.', 'Could not load the questions. Please try again in a moment.'); });
    quizWait.then(function () { if (quiz) paintWrongBtn(); if (quiz && then) then(); });
  }
  function startQuiz(mode, fresh, at) {
    if (!quiz) { loadQuiz(function () { startQuiz(mode, fresh, at); }); return; }
    keepScore();
    var set = curSet(), pre = set.id + ':';
    var wrong = wrongList().filter(function (k) { return k.indexOf(pre) === 0; }).map(function (k) { return k.slice(pre.length); });
    run = { set: set, mode: mode, list: quizOrder(set.qs.map(function (q) { return q.no; }), mode, wrong), i: 0, ok: 0, n: 0 };
    if (mode === 'all' && !fresh) run.i = quizResume(run.list, quizAt()[set.id]);
    if (at != null && run.list.indexOf(at) >= 0) run.i = run.list.indexOf(at);   // 문항 페이지의 "✏️ 풀고 정답 보기" - 그 문항부터
    if (!run.list.length) return;
    showQ();
    try { $('quizBox').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* 옛 브라우저 */ }
  }
  function qOf(no) { return run.set.qs.filter(function (q) { return q.no === no; })[0]; }
  function showQ() {
    var box = $('quizBox'), q = qOf(run.list[run.i]);
    box.hidden = false;
    box.innerHTML = '<p class="qProg">' + esc(tr(run.set.name, run.set.en) + ' · ' + (run.i + 1) + ' / ' + run.list.length + tr(' · 맞음 ', ' · right ') + run.ok) + '</p>'
      + '<p class="qText">' + esc(quizLabel(q.no) + ' ' + q.q) + '</p>'
      + '<ol class="qChoices">' + q.c.map(function (c, i) { return '<li><button type="button" data-a="' + (i + 1) + '">' + esc('①②③④'.charAt(i) + ' ' + c) + '</button></li>'; }).join('') + '</ol>'
      + '<div class="qAfter" hidden></div>';
  }
  function answer(a) {
    var q = qOf(run.list[run.i]), ok = a === q.ans, box = $('quizBox');
    Array.prototype.forEach.call(box.querySelectorAll('.qChoices button'), function (b) {
      var n = +b.getAttribute('data-a');
      b.disabled = true;
      if (n === q.ans) b.className = 'right';
      else if (n === a) b.className = 'wrong';
    });
    if (ok) run.ok++;
    run.n++;
    save('df-quiz', JSON.stringify(quizMark(wrongList(), run.set.id + ':' + q.no, ok)));
    var last = run.i + 1 >= run.list.length, after = box.querySelector('.qAfter');
    if (run.mode === 'all') { var at = quizAt(); at[run.set.id] = q.no; save('df-quiz-at', JSON.stringify(at)); }
    if (last) keepScore();
    paintWrongBtn();
    after.hidden = false;
    after.innerHTML = '<p class="qRes ' + (ok ? 'ok' : 'no') + '">' + esc(ok ? tr('⭕ 맞았습니다', '⭕ Right') : tr('❌ 틀렸습니다 - 정답 ', '❌ Wrong - answer ') + '①②③④'.charAt(q.ans - 1)) + '</p>'
      + (q.ex ? '<p class="qEx">' + esc(q.ex) + '</p>' : '')
      // 그림 해설은 블로그 글에만(그림을 옮기지 않음) - 그림이 있는 문항에만 링크(2026-11-18 홍TV님 "1번으로" - 그림 없는 문항은 헛걸음이었음)
      + (q.post && q.pic ? '<p class="small"><a href="https://hongtv.tistory.com/' + q.post + '" target="_blank" rel="noopener">' + esc(tr('📷 그림 해설 보기(블로그) ›', '📷 Picture explanation (blog) ›')) + '</a></p>' : '')
      + (q.basis ? '<p class="small dim">' + esc(tr('근거: ', 'Basis: ') + q.basis) + '</p>' : '')
      + (last ? '<p class="qEnd">' + esc(tr('이번에 ' + run.n + '문항 중 ' + run.ok + '문항 맞음 (' + Math.round(run.ok / run.n * 100) + '%)', run.ok + ' of ' + run.n + ' right this time (' + Math.round(run.ok / run.n * 100) + '%)')) + '</p>'
        : '<div class="row"><button type="button" class="btn go qNext">' + esc(tr('다음 문항 ›', 'Next ›')) + '</button></div>');
  }
  function quizHash() { try { return decodeURIComponent(location.hash); } catch (e) { return ''; } }
  function initQuiz() {
    // 마지막으로 고른 시험(df-quiz-set) - 1종만 풀던 사람이 새로 열 때마다 4종으로 돌아가 "1번부터" 가 보였음(2026-11-18 PC)
    var lastSet = load('df-quiz-set');
    if (typeof lastSet === 'string' && Array.prototype.some.call($('quizSet').options, function (o) { return o.value === lastSet; })) $('quizSet').value = lastSet;
    paintWrongBtn();
    // 문항 페이지(/drone-quiz/c1 등)의 "📝 풀어 보기" → dronefly.html#quiz-c1: 그 시험을 골라 칸을 펴고 그리로
    // 문항 하나(#quiz-c1-17 · #quiz-inst-1-관련)면 그 문항부터 바로 풂
    var hq = /^#quiz-([a-z0-9]+)(?:-(.+))?$/.exec(quizHash());
    if (hq && Array.prototype.some.call($('quizSet').options, function (o) { return o.value === hq[1]; })) {
      $('quizSet').value = hq[1];
      save('df-quiz-set', JSON.stringify(hq[1]));
      paintWrongBtn();
      $('quiz').open = true;
      if (hq[2]) startQuiz('all', true, hq[2]); else loadQuiz();
      if (!hq[2]) setTimeout(function () { try { $('quiz').scrollIntoView({ block: 'start' }); } catch (e) { /* 옛 브라우저 */ } }, 300);
    }
    $('quiz').addEventListener('toggle', function () { if ($('quiz').open) loadQuiz(); });   // 칸을 펼 때 미리 받음
    $('quizAll').addEventListener('click', function () { startQuiz('all'); });
    $('quizRestart').addEventListener('click', function () { startQuiz('all', true); });
    // 화면을 떠나면 그때까지 푼 것을 점수로(이어 풀기 자리는 문항마다 저장됨)
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') keepScore(); });
    $('quizMix').addEventListener('click', function () { startQuiz('mix'); });
    $('quizWrong').addEventListener('click', function () { startQuiz('wrong'); });
    $('quizSet').addEventListener('change', function () { keepScore(); run = null; $('quizBox').hidden = true; save('df-quiz-set', JSON.stringify($('quizSet').value)); paintWrongBtn(); $('quizPage').href = 'drone-quiz/' + $('quizSet').value; });
    $('quizPage').href = 'drone-quiz/' + $('quizSet').value;   // 시험을 바꾸면 풀던 것은 닫음
    $('quizBox').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !run) return;
      if (b.hasAttribute('data-a')) answer(+b.getAttribute('data-a'));
      else if (b.classList.contains('qNext')) { run.i++; showQ(); }
    });
  }

  function init() {
    initMap();
    // 기본 날짜는 처리 기간(항공촬영 평일 4일)을 넘긴 첫날 - 내일로 두면 승인 필요 자리마다 "모자랄 수 있습니다" 가 먼저 떴음(2026-11-17)
    $('date').value = firstDay(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), 4);
    // 공역: 서버가 하루 한 번 새로 받은 것(/api/airspace, 2026-11-18 - 임시 비행금지가 수시로 바뀜) → 아직 없거나 못 받으면 고정 파일(11-17 받음)
    var good = function (d) { return d && Array.isArray(d.prh) && Array.isArray(d.ua) ? d : null; };
    fetch('api/airspace').then(function (r) { return r.ok ? r.json() : null; }).then(good).catch(function () { return null; }).then(function (d) {
      return d || fetch('data/drone-airspace.json').then(function (r) { return r.json(); });
    }).then(function (d) {
      data = d;
      paintSrc();
      addAirspace();
      if (here) { $('state').textContent = ''; draw(); if (pendingScroll) showResult(); }   // 받는 중 표시를 지움
    }).catch(function () { $('state').textContent = tr('공역 자료를 받지 못했습니다. 잠시 뒤 다시 열어 주세요.', 'Could not load the airspace data. Please reopen in a moment.'); });

    $('me').addEventListener('click', function () {
      if (!navigator.geolocation) { $('state').textContent = tr('이 브라우저는 위치를 쓸 수 없습니다.', 'This browser cannot use location.'); return; }
      busy(tr('위치를 찾는 중…', 'Finding your location…'));
      var my = ++ask;
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (my !== ask) return;
        setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude, me: true });
      }, function () { if (my !== ask) return; $('state').textContent = tr('위치를 쓸 수 없습니다. 위치 권한을 확인하거나 장소를 찾아 주세요.', 'Location is not available. Check the permission or search for a place.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });

    function find() {
      var q = $('q').value.trim();
      if (q.length < 2) { $('state').textContent = tr('두 글자 이상 적어 주세요.', 'Type at least two letters.'); return; }   // 말없이 무시했음(점검 12차 D6)
      busy(tr('찾는 중…', 'Searching…'));
      $('q').blur();
      var my = ++ask;
      fetch('api/place?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
        if (my !== ask) return;
        var ps = (d && d.places) || [];
        $('state').textContent = ps.length ? '' : tr('찾지 못했습니다. 다른 이름으로 찾아 주세요.', 'Nothing found. Try another name.');
        $('found').innerHTML = ps.map(function (p, i) { return '<li><button type="button" data-i="' + i + '">' + esc(p.name) + (p.addr ? ' <small>' + esc(p.addr) + '</small>' : '') + '</button></li>'; }).join('');
        $('found').onclick = function (e) {
          var b = e.target.closest('button');
          if (!b) return;
          var p = ps[+b.getAttribute('data-i')];
          $('found').innerHTML = '';
          setHere({ lat: p.lat, lon: p.lon, name: p.name });
        };
      }).catch(function () { if (my !== ask) return; $('state').textContent = tr('찾기를 하지 못했습니다. 잠시 뒤 다시 해 주세요.', 'Search failed. Please try again in a moment.'); });
    }
    $('findForm').addEventListener('submit', function (e) { e.preventDefault(); find(); });

    ['photo', 'heavy', 'alt', 'radius', 'date', 'from', 'to', 'purpose', 'shootWhat'].forEach(function (id) { $(id).addEventListener('change', draw); });
    // 치는 동안에도(0.3초 쉬면) - 고도 200 을 쳐도 칸을 벗어날 때까지 판정이 그대로였음(점검 12차 A5)
    var typing = null;
    ['alt', 'radius', 'shootWhat'].forEach(function (id) { $(id).addEventListener('input', function () { clearTimeout(typing); typing = setTimeout(draw, 300); }); });
    // 💬 보내기 둘(2026-11-18 홍TV님 "1~4 해줘" 2) - 폰 공유 창(카톡 · 문자 · 메일)으로 정리 글을 그대로. 공유가 없는 브라우저(PC 등)는 복사만
    // 앱(안드로이드) 웹뷰에는 navigator.share 가 없어 앱의 Share 플러그인으로(2026-11-18 PC - 앱에서 단추가 숨어 있었음, hike.js SOS 공유와 같게)
    var CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    var SH = NATIVE && (!CAP.isPluginAvailable || CAP.isPluginAvailable('Share')) && CAP.Plugins && CAP.Plugins.Share || null;
    [['share', 'applyOut', '드론 비행승인 신청 정리'], ['shareShoot', 'shootOut', '항공촬영 사전 신청 정리']].forEach(function (c) {
      if (!SH && !navigator.share) return;
      $(c[0]).hidden = false;
      $(c[0]).addEventListener('click', function () {
        var text = $(c[1]).value;
        Promise.resolve(SH ? SH.share({ title: c[2], text: text, dialogTitle: c[2] }) : navigator.share({ title: c[2], text: text })).catch(function () { /* 닫음 · 막힘 - 복사 단추가 있음 */ });
      });
    });
    // 복사 단추 둘(비행승인 · 항공촬영) - 같은 셈
    [['copy', 'applyOut'], ['copyShoot', 'shootOut']].forEach(function (c) {
      $(c[0]).addEventListener('click', function () {
        var b = $(c[0]), out = $(c[1]), done = function () { b.textContent = tr('✓ 복사함', '✓ Copied'); setTimeout(function () { b.textContent = tr('📋 복사', '📋 Copy'); }, 2000); };
        if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, function () { out.select(); });
        else out.select();
      });
    });

    // 기체 최대 풍속 - 이 폰에만(df-wind)
    try { var wm = localStorage.getItem('df-wind'); if (wm) $('windMax').value = wm; } catch (e) { /* 저장이 막힌 브라우저 */ }
    $('windMax').addEventListener('input', function () { save('df-wind', $('windMax').value); drawWx(); });
    initCheck();
    initLog();
    initQuiz();

    var themeBtn = $('theme'), sizeBtn = $('size'), rootEl = document.documentElement;
    var SIZE_NAME = { m: ['보통', 'normal'], l: ['크게', 'large'], xl: ['아주 크게', 'extra large'] };
    function paintTheme() {
      var dark = rootEl.getAttribute('data-theme') !== 'light';
      themeBtn.textContent = dark ? '☀️' : '🌙';
      themeBtn.setAttribute('aria-label', dark ? tr('밝은 모드로', 'Light mode') : tr('다크모드로', 'Dark mode'));
      themeBtn.title = themeBtn.getAttribute('aria-label');
      var cur = rootEl.getAttribute('data-size') || 'm', nx = nextSize(cur), li = lang === 'en' ? 1 : 0;
      sizeBtn.textContent = tr('가', 'A') + (cur === 'xl' ? '++' : cur === 'l' ? '+' : '');
      sizeBtn.setAttribute('aria-label', tr('글자 크기: ' + SIZE_NAME[cur][0] + ' (누르면 ' + SIZE_NAME[nx][0] + ')', 'Text size: ' + SIZE_NAME[cur][li] + ' (tap for ' + SIZE_NAME[nx][li] + ')'));
    }
    sizeBtn.addEventListener('click', function () {
      var next = nextSize(rootEl.getAttribute('data-size') || 'm');
      if (next === 'm') rootEl.removeAttribute('data-size'); else rootEl.setAttribute('data-size', next);
      save('tf-size', next);
      paintTheme();
    });
    // 고정 글: data-en 에 영어, 처음 한국어는 기억(타이드플라이와 같은 방식)
    var fixed = Array.prototype.map.call(document.querySelectorAll('[data-en]'), function (e) { return [e, e.innerHTML]; });
    var phs = Array.prototype.map.call(document.querySelectorAll('[data-en-ph]'), function (e) { return [e, e.getAttribute('placeholder')]; });
    var arias = Array.prototype.map.call(document.querySelectorAll('[data-en-aria]'), function (e) { return [e, e.getAttribute('aria-label')]; });
    var langBtns = document.querySelectorAll('.lang button');
    function paintSrc() {
      if (data) $('srcDate').textContent = tr(data.src + ', ' + data.date + ' 받음', 'V-World aviation layers (MOLIT), received ' + data.date);
    }
    function paintLang() {
      rootEl.setAttribute('lang', lang);
      document.title = tr('드론플라이 비행금지 · 허용구역 · 비행승인 - dronefly', 'dronefly - drone no-fly zones, UA airspace and flight approval');
      $('back').setAttribute('href', lang === 'en' ? 'en/m/' : 'm/');
      fixed.forEach(function (f) { f[0].innerHTML = lang === 'en' ? f[0].getAttribute('data-en') : f[1]; });
      phs.forEach(function (f) { f[0].setAttribute('placeholder', lang === 'en' ? f[0].getAttribute('data-en-ph') : f[1]); });
      arias.forEach(function (f) { f[0].setAttribute('aria-label', lang === 'en' ? f[0].getAttribute('data-en-aria') : f[1]); });   // 화면 읽기 이름도(점검 12차 D8)
      Array.prototype.forEach.call(langBtns, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
      paintSrc();
      paintTheme();
      paintCheck();
      paintLog();
      paintWrongBtn();
      draw();
    }
    Array.prototype.forEach.call(langBtns, function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); save('tf-lang', lang); paintLang(); });
    });
    themeBtn.addEventListener('click', function () {
      var next = rootEl.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      rootEl.setAttribute('data-theme', next);
      save('tf-theme', next);
      paintTheme();
    });
    // 처음 말: 주소(?lang=) → 고른 것(tf-lang, 타이드플라이와 같이 씀) → 브라우저 말
    var saved = null;
    try { saved = localStorage.getItem('tf-lang'); } catch (e) { /* 저장이 막힌 브라우저 */ }
    setLang((/[?&]lang=(ko|en)\b/.exec(location.search) || [])[1] || saved || (/^ko\b/i.test(navigator.language || 'ko') ? 'ko' : 'en'));
    paintLang();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
