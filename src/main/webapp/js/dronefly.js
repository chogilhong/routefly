/*
 * dronefly(드론) - 2026-11-17 홍TV님 "타이드플라이 바로 아래에 드론을 넣고 드론 관련 정보를"(홍TV님은 드론 교관 자격).
 * 규칙 · 자료는 docs/dronefly/README.md. 공역은 data/drone-airspace.json(브이월드 항공 레이어)을 받아 폰 안에서만 셈 - 위치를 서버로 보내지 않음.
 * 순수 함수는 src/test/js/dronefly.test.js 가 node 로 돌림(DroneflyJsTest).
 */
(function (root) {
  'use strict';

  var LEVEL = { ok: 0, care: 1, need: 2, no: 3 };
  var KIND_NAME = { prh: '비행금지구역', res: '비행제한구역', ctr: '관제권', tca: '접근관제구역', moa: '군작전구역', ua: '초경량비행장치공역(UA)' };

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

  /** 순수 함수 - 그 자리가 걸린 공역들 [{k, l}]. k 는 prh · res · ctr · tca · moa · ua. */
  function zonesAt(data, lat, lon) {
    var out = [];
    ['prh', 'res', 'ctr', 'moa', 'ua'].forEach(function (k) {
      (data[k] || []).forEach(function (z) {
        if (inGeom(lon, lat, z.g)) out.push({ k: k === 'ctr' && isTca(z.l[0]) ? 'tca' : k, l: z.l });
      });
    });
    return out;
  }

  /** 순수 함수 - 공역 하나의 판정 단계. */
  function levelOf(k) {
    return k === 'prh' ? 'no' : k === 'res' || k === 'ctr' ? 'need' : k === 'moa' ? 'care' : 'ok';
  }

  /** 순수 함수 - 공역 하나의 이름 · 높이 한 줄. */
  function zoneLine(z) {
    var l = z.l || [];
    if (z.k === 'prh') return (l[3] || KIND_NAME.prh) + ' ' + l[0] + ' (' + l[1] + ' ~ ' + l[2] + ')';
    if (z.k === 'ctr' || z.k === 'tca') return KIND_NAME[z.k] + ' ' + l[0];
    // res · moa · ua: [이름, 위 높이, 아래 높이]
    var hi = l[1] || '', lo = l[2] || '';
    return KIND_NAME[z.k] + ' ' + l[0] + (hi || lo ? ' (' + (lo || '?') + ' ~ ' + (hi || '?') + ')' : '');
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
    var head = level === 'no' ? '비행금지구역 - 승인 없이 날 수 없습니다'
      : level === 'need' ? '비행승인이 필요합니다'
      : level === 'care' ? '군작전구역 - 다른 공역과 겹치지 않으면 25kg 이하 · 150m 아래 · 낮은 승인 없이, 관할 부대 확인'
      : ua ? '허용구역(UA) - 낮에 ' + ua.l[1] + ' 까지 승인 없이'
      : '25kg 이하 · 150m 아래 · 낮 · 눈으로 보이는 곳이면 승인 없이 | 국토부 안내';
    var notes = [];
    if (o.heavy) notes.push('25kg 넘는 기체는 어디서나 비행승인이 필요합니다.');
    if (o.high) notes.push('150m 이상은 어디서나 비행승인이 필요합니다.');
    if (o.photo) notes.push('카메라로 찍으면 국방부 항공촬영 허가가 따로 필요합니다(비행승인과 별개).');
    notes.push('야간(일몰 후 ~ 일출 전)은 어디서나 특별비행승인이 필요합니다.');
    return { level: level, head: head + (o.photo ? ' + 촬영 허가' : ''), lines: zones.map(zoneLine), notes: notes };
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
      '목적: ' + f.purpose + (f.photo ? ' · 항공촬영 있음(국방부 촬영 허가 함께)' : ''),
      '기체: 최대이륙중량 ' + f.weight,
      '걸린 공역: ' + (zones.length ? zones.map(zoneLine).join(' / ') : '없음')
    ].join('\n');
  }

  var api = { inRing: inRing, inGeom: inGeom, isTca: isTca, zonesAt: zonesAt, levelOf: levelOf, zoneLine: zoneLine, verdict: verdict, meters: meters, nearest: nearest, nearUa: nearUa, dist: dist, applyText: applyText };
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

  function draw() {
    if (!data || !here) return;
    var zones = zonesAt(data, here.lat, here.lon), v = verdict(zones, opts());
    $('result').hidden = false;
    $('result').className = 'dcard result ' + v.level;
    $('place').textContent = here.name || ('위도 ' + here.lat.toFixed(5) + ', 경도 ' + here.lon.toFixed(5));
    $('head').textContent = v.head;
    $('zones').innerHTML = v.lines.length ? v.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') : '<li>걸린 공역 없음(비행금지 · 제한 · 관제권 · 군작전 · UA 밖)</li>';
    $('notes').innerHTML = v.notes.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    $('ua').hidden = false;
    $('uaList').innerHTML = nearUa(data, here.lat, here.lon, 5).map(function (u) {
      return '<li><b>' + esc(u.name) + '</b> <span class="dim">' + esc(u.top) + ' 까지</span> · ' + (u.m === 0 ? '지금 안' : dist(u.m))
        + ' <a href="https://map.kakao.com/link/map/' + encodeURIComponent(u.name) + ',' + u.lat.toFixed(5) + ',' + u.lon.toFixed(5) + '" target="_blank" rel="noopener">지도</a></li>';
    }).join('');
    $('apply').hidden = false;
    $('applyOut').value = applyText({
      place: here.name || '', lat: here.lat, lon: here.lon, radius: $('radius').value, alt: $('alt').value,
      date: $('date').value, from: $('from').value, to: $('to').value, purpose: $('purpose').value, photo: $('photo').checked, weight: $('heavy').checked ? '25kg 초과' : '25kg 이하'
    }, zones);
  }

  function setHere(p) {
    here = p;
    $('state').textContent = '';
    if (!data) { $('state').textContent = '공역 자료를 받는 중…'; return; }
    draw();
  }

  function init() {
    // 기본 날짜는 내일(우리 시간) - 오늘로 두면 밤에 열었을 때 이미 지난 10:00 ~ 12:00 이 들어갔음(2026-11-17 PC)
    $('date').value = new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
    fetch('data/drone-airspace.json').then(function (r) { return r.json(); }).then(function (d) {
      data = d;
      $('srcDate').textContent = d.src + ', ' + d.date + ' 받음';
      if (here) draw();
    }).catch(function () { $('state').textContent = '공역 자료를 받지 못했습니다. 잠시 뒤 다시 열어 주세요.'; });

    $('me').addEventListener('click', function () {
      if (!navigator.geolocation) { $('state').textContent = '이 브라우저는 위치를 쓸 수 없습니다.'; return; }
      $('state').textContent = '위치를 찾는 중…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: '📍 내 위치' });
      }, function () { $('state').textContent = '위치를 쓸 수 없습니다. 위치 권한을 확인하거나 장소를 찾아 주세요.'; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });

    function find() {
      var q = $('q').value.trim();
      if (q.length < 2) return;
      $('state').textContent = '찾는 중…';
      $('q').blur();
      fetch('api/place?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
        var ps = (d && d.places) || [];
        $('state').textContent = ps.length ? '' : '찾지 못했습니다. 다른 이름으로 찾아 주세요.';
        $('found').innerHTML = ps.map(function (p, i) { return '<li><button type="button" data-i="' + i + '">' + esc(p.name) + (p.addr ? ' <small>' + esc(p.addr) + '</small>' : '') + '</button></li>'; }).join('');
        $('found').onclick = function (e) {
          var b = e.target.closest('button');
          if (!b) return;
          var p = ps[+b.getAttribute('data-i')];
          $('found').innerHTML = '';
          setHere({ lat: p.lat, lon: p.lon, name: p.name });
        };
      }).catch(function () { $('state').textContent = '찾기를 하지 못했습니다. 잠시 뒤 다시 해 주세요.'; });
    }
    $('findForm').addEventListener('submit', function (e) { e.preventDefault(); find(); });

    ['photo', 'heavy', 'alt', 'radius', 'date', 'from', 'to', 'purpose'].forEach(function (id) { $(id).addEventListener('change', draw); });
    $('copy').addEventListener('click', function () {
      var t = $('applyOut').value, done = function () { $('copy').textContent = '✓ 복사함'; setTimeout(function () { $('copy').textContent = '📋 복사'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { $('applyOut').select(); });
      else { $('applyOut').select(); }
    });

    var themeBtn = $('theme'), rootEl = document.documentElement;
    function paintTheme() {
      var dark = rootEl.getAttribute('data-theme') !== 'light';
      themeBtn.textContent = dark ? '☀️' : '🌙';
      themeBtn.setAttribute('aria-label', dark ? '밝은 모드로' : '다크모드로');
      themeBtn.title = themeBtn.getAttribute('aria-label');
    }
    themeBtn.addEventListener('click', function () {
      var next = rootEl.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      rootEl.setAttribute('data-theme', next);
      try { localStorage.setItem('tf-theme', next); } catch (e) { /* 기억 못 해도 지금 화면은 바뀜 */ }
      paintTheme();
    });
    paintTheme();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
