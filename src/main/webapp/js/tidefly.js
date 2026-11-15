/* 타이드플라이(routefly tidefly.html) - /api/tidefly 목록(서버가 미리 받아 둔 것)을 지역별 카드로.
   2026-11-14, 2026-11-15 초보자도 알아보기 쉽게 다시 꾸밈, 2026-11-15 영어 화면(홍TV님 "영어화면도 만들어줘") */
(function () {
  'use strict';

  // 화면 말: 'ko' | 'en'. 순수 함수도 이 값을 따름(테스트는 setLang 으로 바꿔 봄)
  var lang = 'ko';
  function setLang(l) { lang = l === 'en' ? 'en' : 'ko'; }
  function tr(ko, en) { return lang === 'en' ? en : ko; }

  var DIRS = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  var DIRS_EN = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  // 기상청 너울 위험예측 단계(marine_small_zone 머리말: 1 관심 · 2 주의 · 3 경계 · 4 위험)
  var SWELL = { 1: '관심', 2: '주의', 3: '경계', 4: '위험' };
  var SWELL_EN = { 1: 'watch', 2: 'caution', 3: 'alert', 4: 'danger' };
  var MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** 순수 함수 - UTC "yyyyMMddHH" → 우리 시간 "15일 09시" (영어 "Nov 15 09:00"). 모양이 다르면 "". */
  function kst(s) {
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(s || '');
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) + 9 * 3600 * 1000);
    var h = d.getUTCHours(), hh = (h < 10 ? '0' : '') + h;
    return tr(d.getUTCDate() + '일 ' + hh + '시', MONTH_EN[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' ' + hh + ':00');
  }

  /** 순수 함수 - 각도 → 16방위(북 · 북북동 … / N · NNE …). 숫자가 아니면 "". */
  function dir16(deg) {
    if (typeof deg !== 'number' || isNaN(deg)) return '';
    var i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
    return tr(DIRS[i], DIRS_EN[i]);
  }

  /** 순수 함수 - 너울 단계 이름. 없으면 "". */
  function swell(n) {
    return (lang === 'en' ? SWELL_EN[n] : SWELL[n]) || '';
  }

  /** 순수 함수 - 숫자 줄: 파고 · 바람 · 너울 · 수온(있는 것만). */
  function nums(sea) {
    if (!sea) return tr('바다 예측을 받는 중', 'Loading sea forecast');
    var out = [];
    // 해구 예측이 -999(자료 없음)인 칸이 있음(2026-11-14 PC: 남애항 L62-S2 파고 · 바람 없음)
    if (typeof sea.waveM !== 'number' && typeof sea.windMs !== 'number') out.push(tr('이 바다 칸은 파고 · 바람 예측 없음', 'No wave · wind forecast for this sea cell'));
    if (typeof sea.waveM === 'number') out.push(tr('파고 ', 'Waves ') + sea.waveM.toFixed(1) + 'm');
    if (typeof sea.windMs === 'number') out.push(tr('바람 ', 'Wind ') + sea.windMs.toFixed(1) + 'm/s' + (dir16(sea.windDir) ? ' ' + dir16(sea.windDir) + tr('풍', '') : ''));
    if (swell(sea.swell)) out.push(tr('너울 ', 'Swell ') + swell(sea.swell));
    if (typeof sea.waterC === 'number') out.push(tr('수온 ', 'Water ') + sea.waterC.toFixed(1) + '℃');
    return out.join(' · ');
  }

  /** 순수 함수 - 지금 우리 시간 "yyyy-MM-dd HH:mm"(조석예보 predcDt 와 같은 모양). */
  function nowKst(ms) {
    var d = new Date(ms + 9 * 3600 * 1000);
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) + ' ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes());
  }

  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  var WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** 순수 함수 - "2026-11-15" → "15일(일)" (영어 "Sun 15"). */
  function dayName(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!m) return '';
    var w = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return tr(+m[3] + '일(' + WEEK[w] + ')', WEEK_EN[w] + ' ' + +m[3]);
  }

  /** 순수 함수 - 물때 이름(서버는 한국어 "7물" · "조금" · "무시"). 영어는 "7-mul" · "Jogeum (neap)" · "Musi". */
  function mul(name) {
    if (lang !== 'en' || !name) return name || '';
    var m = /^(\d+)물$/.exec(name);
    if (m) return m[1] + '-mul';
    return { '조금': 'Jogeum (neap)', '무시': 'Musi (neap)' }[name] || name;
  }

  /**
   * 순수 함수 - 물때표(2026-11-15 홍TV님 "이런 식으로 만들어주면 보기좋잖아" - 날짜 띠 + 표). days = api detail 의 days(차례대로).
   * 줄마다 날짜 · 음력 · 물때(사리 'sari' · 조금 · 무시 'neap') · 물 세기 %(그 기간 가장 큰 높이 차 대비) · 만조 · 간조(시각 · 높이 cm · 앞 물때와 높이 차) · 해.
   * 높이 차는 앞 만조 · 간조(전날 마지막 것 포함)와의 차이 - 첫 날 첫 물때는 앞이 없어 null.
   */
  /**
   * 순수 함수 - 월령(달 모양) 음력 날로(2026-11-15 홍TV님 "월령 이라고 있네"): 달 나이 ≈ 음력 날 - 1, 8가지 모양은 course-kit.js moonPhase · MOON_NAMES 와 같은 셈 · 이름(둘 다 고침).
   * → [그림, 이름]. 음력 날이 없으면 null.
   */
  var MOON = [['🌑', '삭', 'New moon'], ['🌒', '초승달', 'Waxing crescent'], ['🌓', '상현달', 'First quarter'], ['🌔', '보름 앞 달', 'Waxing gibbous'],
    ['🌕', '보름달', 'Full moon'], ['🌖', '보름 지난 달', 'Waning gibbous'], ['🌗', '하현달', 'Last quarter'], ['🌘', '그믐달', 'Waning crescent']];
  function moon(lunarDay) {
    if (!(lunarDay >= 1 && lunarDay <= 30)) return null;
    var m = MOON[Math.floor(((lunarDay - 1) / 29.530588853 * 8) + 0.5) % 8];
    return [m[0], tr(m[1], m[2])];
  }

  /**
   * 순수 함수 - 자리의 "좋은 물때"(해양수산부 조수물때내용, 예 "조금 전·후" · "11물~5물/ 정조전후" · "사리 전후/ 10~5물")에 맞는 날(2026-11-15 홍TV님 "표시해 줘").
   * days = 물때표 날들(차례대로, mulddae · sari). → 날마다 true/false. 날 단위만 봄 - 초들물 · 만조 같은 하루 안의 때는 글로만 보임.
   * - "사리 전후" · "조금 전후": 사리 날(sari) · 조금 · 무시 날과 그 앞뒤 하루. "조금" 만 있으면 조금 · 무시 날
   * - "a물~b물" · "a~b물" · "a물-b물": 물때 차례 1물 … 13(14)물 → 조금 → 무시 를 돌아가며(11물~5물 = 11 … 조금 · 무시 … 5). 끝이 "사리" 면 그 기간 사리 날의 가장 큰 물
   * - "사리를 피한" · "사리 이외" · "조금 이후" 처럼 빼거나 흐린 말은 표시하지 않음(지어내지 않으려고)
   */
  function goodDays(text, days) {
    days = days || [];
    var ord = days.map(function (d) {
      var m = /^(\d+)물$/.exec(d.mulddae || '');
      return m ? +m[1] : d.mulddae === '조금' ? 100 : d.mulddae === '무시' ? 101 : null;
    });
    var sariTop = null;
    days.forEach(function (d, i) { if (d.sari && ord[i] != null && ord[i] < 100) sariTop = Math.max(sariTop || 0, ord[i]); });
    var out = days.map(function () { return false; });
    function near(test) { days.forEach(function (d, i) { if (test(d, i)) for (var k = i - 1; k <= i + 1; k++) if (k >= 0 && k < out.length) out[k] = true; }); }
    String(text || '').split('/').forEach(function (raw) {
      var t = raw.replace(/\s+/g, '');
      if (!t || /피한|이외|이후/.test(t)) return;
      var r = /(조금|사리|\d+)물?[~\-](조금|사리|\d+)/.exec(t);
      if (r) {
        var end = function (v) { return v === '조금' ? 100 : v === '사리' ? sariTop : +v; };
        var a = end(r[1]), b = end(r[2]);
        if (a == null || b == null) return;
        ord.forEach(function (o, i) { if (o != null && (a <= b ? o >= a && o <= b : o >= a || o <= b)) out[i] = true; });
        return;
      }
      if (/^사리전[·]?후/.test(t)) near(function (d) { return d.sari; });
      else if (/^조금전[·]?후/.test(t)) near(function (d) { return d.mulddae === '조금' || d.mulddae === '무시'; });
      else if (t === '조금') days.forEach(function (d, i) { if (d.mulddae === '조금' || d.mulddae === '무시') out[i] = true; });
    });
    return out;
  }

  function tideTable(days) {
    var max = 0, prev = null;
    (days || []).forEach(function (d) { if (typeof d.rangeCm === 'number' && d.rangeCm > max) max = d.rangeCm; });
    return (days || []).map(function (d) {
      var row = { date: d.date, day: dayName(d.date), lunar: d.lunarDay, moon: moon(d.lunarDay), mul: mul(d.mulddae),
        cls: d.sari ? 'sari' : (d.mulddae === '조금' || d.mulddae === '무시') ? 'neap' : '',
        pct: max > 0 && typeof d.rangeCm === 'number' ? Math.round(d.rangeCm / max * 100) : null,
        highs: [], lows: [], sun: d.sunrise + ' ~ ' + d.sunset };
      (d.events || []).forEach(function (e) {
        var cm = typeof e.cm === 'number' ? Math.round(e.cm) : null;
        (e.high ? row.highs : row.lows).push({ t: String(e.t).slice(11, 16), cm: cm, diff: cm != null && prev != null ? cm - prev : null });
        prev = cm;
      });
      return row;
    });
  }

  /** 순수 함수 - 3시간 예보 한 줄: "15일 09시 파고 0.4m · 바람 4.9m/s 북서풍 · 너울 관심". */
  function hourLine(f) {
    return kst(f.tmEf) + ' ' + nums(f);
  }

  /** 순수 함수 - 표시 → [글자, 칸 이름]. 판단하지 않은 곳은 "-". */
  function markOf(mark) {
    if (mark === '○') return ['○', 'ok'];
    if (mark === '△') return ['△', 'care'];
    if (mark === '✕') return ['✕', 'no'];
    return ['-', 'none'];
  }

  /** 순수 함수 - 표시 아래 쉬운 말(판단 기준 그대로의 뜻 - "좋다" 고 하지 않음). */
  function markWord(mark) {
    if (lang === 'en') return { '○': 'No warning', '△': 'Caution', '✕': 'Stay ashore' }[mark] || 'Not judged';
    return { '○': '특보 없음', '△': '주의', '✕': '출조 자제' }[mark] || '판단 전';
  }

  /** 순수 함수 - "yyyy-MM-dd HH:mm" 두 시각 사이 → "2시간 10분 뒤" · "35분 뒤" · "곧" (영어 "in 2 h 10 min" · "soon"). 지났으면 "". */
  function untilText(now, t) {
    var a = toMin(now), b = toMin(t);
    if (a == null || b == null || b < a) return '';
    var d = b - a;
    if (d < 5) return tr('곧', 'soon');
    var h = Math.floor(d / 60), m = d % 60;
    if (lang === 'en') return 'in ' + (h ? h + ' h' + (m ? ' ' : '') : '') + (m ? m + ' min' : '');
    return (h ? h + '시간 ' : '') + (m ? m + '분 ' : '') + '뒤';
  }

  function toMin(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(t || '');
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
  }

  function fmtMin(min) {
    var d = new Date(min * 60000);
    var h = d.getUTCHours(), m = d.getUTCMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /**
   * 순수 함수 - 다음 물때 한 줄: {what:"만조", at:"14:49", left:"2시간 10분 뒤", slack:"13:49 ~ 15:49"}. 오늘 · 내일 안에 없으면 null.
   * slack 은 만조 · 간조 앞뒤 1시간(정조 - 물 흐름이 거의 없는 때, 2026-11-15 홍TV님이 보내 준 글의 일반적인 설명).
   */
  function nextTide(events, now) {
    var day = now.slice(0, 10);
    var hasToday = (events || []).some(function (e) { return String(e.t).slice(0, 10) === day; });
    if (!hasToday) return null;
    for (var i = 0; i < events.length; i++) {
      var e = events[i], t = String(e.t);
      if (t > now) {
        var mm = toMin(t);
        return { what: e.high ? tr('만조', 'high tide') : tr('간조', 'low tide'), at: (t.slice(0, 10) === day ? '' : tr('내일 ', 'tomorrow ')) + t.slice(11, 16),
          left: untilText(now, t), slack: fmtMin(mm - 60) + ' ~ ' + fmtMin(mm + 60) };
      }
    }
    return null;
  }

  /**
   * 순수 함수 - 그날 물 높이 곡선 [[분(0 ~ 1440), cm], …] 10분 간격. 이웃한 만조 · 간조 사이를 코사인으로 이음(조석의 흔한 근사).
   * 그날 첫 물때 앞 · 받은 마지막 물때 뒤는 그리지 않음(지어내지 않으려고).
   */
  function curve(events, day) {
    var base = toMin(day + ' 00:00');
    var pts = (events || []).filter(function (e) { return typeof e.cm === 'number'; })
      .map(function (e) { return [toMin(String(e.t)) - base, e.cm]; });
    var out = [];
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1];
      if (b[0] <= 0 || a[0] >= 1440) continue;
      for (var m = Math.ceil(Math.max(a[0], 0) / 10) * 10; m <= Math.min(b[0], 1440); m += 10) {
        var f = (m - a[0]) / (b[0] - a[0]);
        out.push([m, a[1] + (b[1] - a[1]) * (1 - Math.cos(Math.PI * f)) / 2]);
      }
    }
    return out;
  }

  /**
   * 순수 함수 - 알림 계획(2026-11-15 홍TV님 "들물 전 철수 알림 · 해 지기 전 알림 작업해"). 기준 숫자는 사용자가 고름(cfg):
   * cfg.ebb = 간조 뒤 몇 분(0 · 30 · 60)에 "물이 들어오기 시작 - 철수", cfg.sun = 해 지기 몇 분 전(30 · 60). null 이면 끔.
   * 지금 뒤(오늘 · 내일 물때, 오늘 해)만, 시각 차례. → [{at:"yyyy-MM-dd HH:mm", kind:"ebb"|"sun", base:"07:49"}]
   */
  function alarmPlan(events, sunset, now, cfg) {
    var out = [];
    cfg = cfg || {};
    if (typeof cfg.ebb === 'number') {
      (events || []).forEach(function (e) {
        if (e.high) return;
        var at = toMin(String(e.t));
        if (at == null) return;
        var t = fmtDate(at + cfg.ebb);
        if (t > now) out.push({ at: t, kind: 'ebb', base: String(e.t).slice(11, 16) });
      });
    }
    if (typeof cfg.sun === 'number' && /^\d{2}:\d{2}$/.test(sunset || '')) {
      var ss = toMin(now.slice(0, 10) + ' ' + sunset);
      var t2 = fmtDate(ss - cfg.sun);
      if (t2 > now) out.push({ at: t2, kind: 'sun', base: sunset });
    }
    out.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    return out;
  }

  function fmtDate(min) {
    var d = new Date(min * 60000);
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) + ' ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes());
  }

  /** 순수 함수 - 알림 글. */
  function alarmText(a, name, cfg) {
    if (a.kind === 'ebb') {
      return tr('물이 들어오기 시작합니다(간조 ' + a.base + (cfg.ebb ? ' + ' + cfg.ebb + '분' : '') + '). 갯바위 · 방파제는 철수하세요 - ' + name,
        'The tide is rising (low tide ' + a.base + (cfg.ebb ? ' + ' + cfg.ebb + ' min' : '') + '). Time to leave the rocks - ' + name);
    }
    return tr('해 지기 ' + cfg.sun + '분 전입니다(일몰 ' + a.base + ') - ' + name, cfg.sun + ' min to sunset (' + a.base + ') - ' + name);
  }

  var SIZES = ['m', 'l', 'xl'];

  /** 순수 함수 - 글자 크기 다음 단계(보통 → 크게 → 아주 크게 → 보통). */
  function nextSize(cur) {
    var i = SIZES.indexOf(cur);
    return SIZES[(i < 0 ? 1 : i + 1) % SIZES.length];   // 모르는 값은 보통으로 보고 그다음(크게)
  }

  /** 순수 함수 - 지금 화면이 어두운지: 밝은 모드를 고른 때만 밝게, 그 밖에는 늘 다크(2026-11-15 홍TV님 "기본으로 다크모드 로 해"). */
  function isDark(chosen) {
    return chosen !== 'light';
  }

  // ---------------------------------------------------------------- 영어 화면: 이름 · 까닭 옮기기

  var CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  var JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  var JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
  // 받침 + 모음(ㅇ)으로 이어질 때 소리(연음): ㄱ g · ㄴ n · ㄷ d · ㄹ r · ㅁ m · ㅂ b · ㅅ s · ㅈ j · ㅊ ch · ㅌ t · ㅍ p
  var LINK = { 1: 'g', 4: 'n', 7: 'd', 8: 'r', 16: 'm', 17: 'b', 19: 's', 22: 'j', 23: 'ch', 25: 't', 26: 'p' };

  /**
   * 순수 함수 - 한글 → 로마자(문화체육관광부 「국어의 로마자 표기법」 기본 규칙: 자모 대응 · 연음 · ㄹㄹ → ll · ㅇ/ㅁ + ㄹ → n · ㄴ + ㄹ → ll).
   * 장소 이름의 영어 이름 자료가 없어 지어내지 않고 규칙대로만 옮김. 한글이 아닌 글자는 그대로.
   */
  function roman(s) {
    var out = '', chars = Array.from(String(s || ''));
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i].charCodeAt(0) - 0xAC00;
      if (c < 0 || c > 11171) { out += chars[i]; continue; }
      var cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
      var prev = i > 0 ? chars[i - 1].charCodeAt(0) - 0xAC00 : -1;
      var prevJong = prev >= 0 && prev <= 11171 ? prev % 28 : -1;
      var init = CHO[cho];
      if (cho === 11 && prevJong > 0 && LINK[prevJong]) init = '';                       // 앞 받침이 넘어옴(아래에서 처리)
      if (cho === 5) init = prevJong === 8 || prevJong === 4 ? 'l' : (prevJong === 21 || prevJong === 16 || prevJong === 1) ? 'n' : 'r';
      var next = i + 1 < chars.length ? chars[i + 1].charCodeAt(0) - 0xAC00 : -1;
      var nextCho = next >= 0 && next <= 11171 ? Math.floor(next / 588) : -1;
      var fin = JONG[jong];
      if (jong > 0 && nextCho === 11 && LINK[jong]) fin = LINK[jong];                   // 연음: 받침을 다음 소리로
      if (jong === 4 && nextCho === 5) fin = 'l';                                         // ㄴ + ㄹ → ll
      if (jong === 1 && nextCho === 5) fin = 'ng';                                        // ㄱ + ㄹ → ngn
      if (jong === 1 && nextCho === 2) fin = 'ng';                                        // ㄱ + ㄴ → ngn
      out += init + JUNG[jung] + fin;
    }
    return out;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var COMPASS = { '북': 'N', '남': 'S', '동': 'E', '서': 'W' };

  /**
   * 순수 함수 - 장소 이름 영어로. "강릉항북동(2km)" → "2 km NE of Gangneung Port", "부산남부" → "Busan (south)",
   * "울진 후정" → "Uljin Hujeong", "남애항" → "Namae Port". 한국어 화면은 그대로.
   */
  function placeName(name) {
    if (lang !== 'en' || !name) return name || '';
    var m = /^(.+?항)([북남동서]+)측?\((\d+)km\)$/.exec(name);
    if (m) return m[3] + ' km ' + Array.from(m[2]).map(function (c) { return COMPASS[c]; }).join('') + ' of ' + portName(m[1]);
    m = /^(.+?)\s*(북부|남부|동부|서부)$/.exec(name);   // "안면도 북부" 처럼 빈칸이 있어도(자리 이름)
    if (m) return cap(roman(m[1])) + ' (' + { '북부': 'north', '남부': 'south', '동부': 'east', '서부': 'west' }[m[2]] + ')';
    if (/항$/.test(name)) return portName(name);
    m = /^(.+)\((.+)\)$/.exec(name);   // 겹친 이름 "방포항(어항)" · "대진항(경북)" (2026-11-15 PC: "Bangpohang(eohang)")
    if (m) return placeName(m[1]) + ' (' + (m[2] === '어항' ? 'fishing port' : cap(roman(m[2]))) + ')';
    if (name.indexOf(' · ') > 0) return name.split(' · ').map(placeName).join(' · ');   // 갯바위 · 선상 자리 "안면도 북부 · 방포항방파제앞해상"(2026-11-15 PC: 뒤가 소문자 한 덩어리)
    var w = name.split(' ');
    // "울진 후정" - 군 · 시 이름이 앞에 오면 영어는 "Hujeong, Uljin"(2026-11-15 PC)
    if (w.length === 2) return cap(roman(w[1])) + ', ' + cap(roman(w[0]));
    // 붙여 쓴 자리 이름 "방포항방파제앞해상" - 방파제 · 해상 · 갯바위 · 부근 · 인근 · 등대 앞에서 띄어 소리 덩어리를 나눔(2026-11-15 PC)
    return cap(roman(name.replace(/([가-힣])(방파제|해상|갯바위|부근|인근|등대)/g, '$1 $2')));
  }

  /** 순수 함수 - "…항" 이름: 한 글자 + 항(포항)은 도시 이름 그대로 "Pohang", "…북항" 은 "… North Port", 그 밖 "… Port"(2026-11-15 PC: "Po Port" · "Mokpobuk Port"). */
  function portName(name) {
    var base = name.replace(/항$/, '');
    if (Array.from(base).length <= 1) return cap(roman(name));
    if (/북$/.test(base)) return cap(roman(base.replace(/북$/, ''))) + ' North Port';
    return cap(roman(base)) + ' Port';
  }

  var AREA_EN = { '동해': 'East Sea', '남해': 'South Sea', '제주': 'Jeju', '서해': 'West Sea', '그 밖': 'Other' };

  // 해상 특보구역 이름 낱말(기상청 wrn_reg 의 S 구역 이름에 나오는 것) - 긴 것부터 바꿈
  var ZONE_WORDS = [['바깥먼바다', ' outer offshore waters'], ['안쪽먼바다', ' inner offshore waters'], ['먼바다', ' offshore waters'], ['앞바다', ' coastal waters'],
    ['전해상', ' all waters'], ['서해', 'West Sea '], ['동해', 'East Sea '], ['남해', 'South Sea '], ['제주도', 'Jeju '], ['인천·경기', 'Incheon · Gyeonggi '],
    ['북부', 'northern'], ['남부', 'southern'], ['중부', 'central'], ['동부', 'eastern'], ['서부', 'western'], ['남쪽', 'south'], ['북쪽', 'north'],
    ['동쪽', 'east'], ['서쪽', 'west'], ['남동쪽', 'southeast'], ['남서쪽', 'southwest'], ['강원', 'Gangwon '], ['경북', 'Gyeongbuk '], ['경남', 'Gyeongnam '],
    ['전북', 'Jeonbuk '], ['전남', 'Jeonnam '], ['충남', 'Chungnam '], ['울산', 'Ulsan'], ['부산', 'Busan'], ['거제시', 'Geoje ']];

  /** 순수 함수 - 특보구역 이름 영어로. "서해중부바깥먼바다" → "West Sea central outer offshore waters". 모르는 낱말은 로마자. */
  function zoneName(ko) {
    var s = ko;
    ZONE_WORDS.slice().sort(function (a, b) { return b[0].length - a[0].length; }).forEach(function (w) { s = s.split(w[0]).join(w[1] + ' '); });
    return roman(s).replace(/\s+/g, ' ').trim();
  }

  var KIND_EN = { '풍랑': 'wind-wave', '폭풍해일': 'storm surge', '태풍': 'typhoon', '강풍': 'strong wind' };
  var LEVEL_EN = { '주의보': 'advisory', '경보': 'warning' };

  /** 순수 함수 - 서버가 보낸 까닭(한국어, Verdict)을 영어로. 모르는 모양은 그대로. */
  function reason(r) {
    if (lang !== 'en') return r;
    var fixed = {
      '출항은 선사에 확인': 'Check sailing with the boat operator',
      '특보구역 연결 확인 전 - 판단하지 않음': 'Not judged - warning zone not linked yet',
      '특보를 받지 못함 - 판단하지 않음': 'Not judged - warnings not available',
      '파고 예측을 받지 못함 - 판단하지 않음': 'Not judged - wave forecast not available',
      '너울 주의': 'Swell caution', '너울 경계': 'Swell alert', '너울 위험': 'Swell danger'
    };
    if (fixed[r]) return fixed[r];
    var m = /^(\S+) (\S+) 예비특보$/.exec(r);
    if (m) return zoneName(m[1]) + ': ' + (KIND_EN[m[2]] || m[2]) + ' warning expected (preliminary)';
    m = /^(\S+) (\S+)(?: (\S+))?$/.exec(r);
    if (m && (KIND_EN[m[2]] || LEVEL_EN[m[3]])) return zoneName(m[1]) + ': ' + (KIND_EN[m[2]] || m[2]) + (m[3] ? ' ' + (LEVEL_EN[m[3]] || m[3]) : '');
    return r;
  }

  /**
   * 순수 함수 - 내 자리에서 가까운 포인트 n 곳(곧은 거리 km, 소수 한 자리 · 가까운 차례). 위치는 폰 안에서만 셈(서버로 보내지 않음, 2026-11-15 홍TV님 "바로 시작해").
   * list - [{point:{lat, lon}}]
   */
  function nearest(list, lat, lon, n) {
    var r = Math.PI / 180;
    return list.filter(function (it) { return it.point && typeof it.point.lat === 'number' && typeof it.point.lon === 'number'; }).map(function (it) {
      var dp = (it.point.lat - lat) * r, dl = (it.point.lon - lon) * r;
      var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(lat * r) * Math.cos(it.point.lat * r) * Math.sin(dl / 2) * Math.sin(dl / 2);
      return { it: it, km: Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10 };
    }).sort(function (a, b) { return a.km - b.km; }).slice(0, n);
  }

  /**
   * 순수 함수 - 갯바위 · 선상 자리(api/tidefly?spots=1 의 spots 한 줄)를 카드 한 장 꼴로(2026-11-15 홍TV님 "2번으로" - 📍 내 근처 · 찾기에서만).
   * 바다 예측 · 물때 · 해 · 판단은 base 포인트 것을 그대로, 그 자리만 먼바다가 더 걸리면(extra) 서버가 센 marks[id] 판단을 씀.
   * base 포인트가 목록에 없으면 판단하지 않음.
   */
  /** 순수 함수 - 찾기 견줄 꼴: 괄호 안 · 빈칸 · 문장 부호를 뺌. TideflyServlet.bare 와 같은 셈(둘 다 고침). */
  function bare(s) {
    return String(s == null ? '' : s).replace(/\(.*?\)/g, '').replace(/[^0-9A-Za-z\uac00-\ud7a3]/g, '');
  }

  /**
   * 같은 고기의 다른 이름(2026-11-15 홍TV님 "어종으로 찾기") - 해양수산부 자리 자료에 둘 다 나오는 것 · 흔히 쓰는 표기. TideflyServlet.FISH_SAME 과 같음(둘 다 고침).
   */
  var FISH_SAME = [['넙치', '광어'], ['주꾸미', '쭈꾸미'], ['우럭', '조피볼락'], ['노래미', '쥐노래미'], ['망둥어', '망둑어'], ['학공치', '학꽁치'], ['쏨뱅이', '쏨벵이']];

  /** 순수 함수 - 자리 대상어("감성돔 · 넙치 · 주꾸미")에 찾는 말(q)이 드는가. 다른 이름도(광어 → 넙치). q 는 두 글자 넘게. */
  function fishHit(fish, q) {
    var k = bare(q);
    if (k.length < 2 || !fish) return false;
    var keys = [k];
    FISH_SAME.forEach(function (g) { if (g.indexOf(k) >= 0) keys = keys.concat(g); });
    return String(fish).split(' · ').some(function (f) { return keys.some(function (x) { return f.indexOf(x) >= 0; }); });
  }

  /** 자리 대상어 → 법령(수산자원관리법 시행령 별표 1 · 2)의 종 이름. 같은 이름은 그대로, 다른 것만(문어는 참문어 · 대문어 둘 다). */
  /** 법령 원문 - 단서(주3) 해역 · 시·도 고시 등)는 여기서 확인. */
  var LAW_URL = 'https://www.law.go.kr/법령/수산자원관리법시행령';
  var LAW_NAME = { '우럭': ['조피볼락'], '노래미': ['쥐노래미'], '문어': ['참문어', '대문어'], '광어': ['넙치'], '쭈꾸미': ['주꾸미'], '망둑어': [], '학꽁치': [] };

  /** 순수 함수 - "MM-DD" 가 from ~ to 안인가(해를 넘는 10-01 ~ 01-31 도). */
  function inSeason(mmdd, from, to) {
    if (!mmdd || !from || !to) return false;
    return from <= to ? mmdd >= from && mmdd <= to : mmdd >= from || mmdd <= to;
  }

  /**
   * 순수 함수 - 금어기 · 금지 체장(2026-11-15 홍TV님 "공식 자료로만"). fish = 자리 대상어 "감성돔 · 주꾸미", law = data/tidefly-law.json, mmdd = 오늘 "MM-DD".
   * → [{fish, species, closed, size, now}] - now: 'now' 단서 없는 기간 안 · 'maybe' 단서(다만 · 지역 · 고시)가 있는 기간 안 · '' 그 밖. 법령에 없는 고기는 뺌.
   */
  function lawFor(fish, law, mmdd) {
    var out = [], seen = {};
    String(fish || '').split(' · ').forEach(function (f) {
      f = f.trim();
      (LAW_NAME[f] || [f]).forEach(function (sp) {
        var e = law && law[sp];
        if (!e || seen[sp]) return;
        seen[sp] = true;
        out.push({ fish: f, species: sp, closed: e.closed || null, size: e.size || null,
          now: inSeason(mmdd, e.from, e.to) ? (e.plain ? 'now' : 'maybe') : '' });
      });
    });
    return out;
  }

  function spotItem(s, baseItem, marks) {
    var b = baseItem || {}, bp = b.point || {}, m = (marks || {})[s.id];
    var p = { name: s.name, lat: s.lat, lon: s.lon, boat: !!s.boat, spot: true, id: s.id, depth: s.depth, bottom: s.bottom, tideTime: s.tideTime, fish: s.fish,
      base: s.base, baseKm: s.baseKm, tideName: bp.tideName, tideKm: bp.tideKm };
    var out = { point: p, area: b.area, sea: b.sea, tides: b.tides, today: b.today, warnings: b.warnings };
    if (!baseItem) { out.mark = null; out.reasons = ['가까운 포인트 자료 없음 - 판단하지 않음']; }
    else if (m) { out.mark = m.mark; out.reasons = m.reasons; }
    else { out.mark = b.mark; out.reasons = (b.reasons || []).filter(function (r) { return r !== '출항은 선사에 확인'; }).concat(s.boat ? ['출항은 선사에 확인'] : []); }
    return out;
  }

  /**
   * 순수 함수 - 연안 출입통제구역 경고 한 줄(data/tidefly-closed.json 의 한 포인트 목록, 2026-11-15 안전). 없으면 ''.
   * 해양경찰청 2023 자료라 지금 공고와 다를 수 있어 늘 "현지 공고 확인" 을 붙임.
   */
  function closedText(list) {
    if (!list || !list.length) return '';
    var first = list[0];
    var where = first.m === 0 ? tr('출입통제구역 안', 'inside a no-entry zone') : tr('약 ' + first.m + 'm 앞 출입통제구역', 'no-entry zone about ' + first.m + ' m away');
    var names = list.map(function (c) { return c.area; }).join(' · ');
    return '⛔ ' + where + ': ' + names + ' (' + first.notice + tr(' - 해양경찰청 2023 자료, 현지 공고를 확인하세요)', ' - Korea Coast Guard 2023 data; check local notices)');
  }

  /**
   * 순수 함수 - 물때표 위 해 한 줄(첫날 → 끝날): "☀ 15일 07:11~17:26 → 29일 07:25~17:20". 폰 한 줄에 들게 짧게(2026-11-15 PC: 두 줄 · 영어 "Sun Sun 15").
   */
  function sunSpan(rows) {
    if (!rows || !rows.length) return '';
    var one = function (r) { return +String(r.date).slice(8) + tr('일 ', ': ') + String(r.sun).replace(' ~ ', '~'); };
    return '☀ ' + one(rows[0]) + (rows.length > 1 ? ' → ' + one(rows[rows.length - 1]) : '');
  }

  var TF = { kst: kst, dir16: dir16, swell: swell, nums: nums, markOf: markOf, markWord: markWord, nowKst: nowKst, dayName: dayName,
    tideTable: tideTable, goodDays: goodDays, moon: moon, sunSpan: sunSpan, hourLine: hourLine, untilText: untilText, nextTide: nextTide, curve: curve, nextSize: nextSize, isDark: isDark,
    setLang: setLang, roman: roman, placeName: placeName, zoneName: zoneName, reason: reason, mul: mul,
    alarmPlan: alarmPlan, alarmText: alarmText, nearest: nearest, spotItem: spotItem, bare: bare, fishHit: fishHit, lawFor: lawFor, inSeason: inSeason, closedText: closedText };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
  if (typeof document === 'undefined') return;

  // ---------------------------------------------------------------- 화면

  var items = [];
  var listEl = document.getElementById('list');
  var stateEl = document.getElementById('state');
  var qEl = document.getElementById('q');
  var timer = null;
  var kind = 'all';            // 전체 · 갯바위(boat 아님) · 선상
  var nearAt = null, NEAR_N = 10;   // 📍 내 근처 - 폰이 준 위치(이 화면 안에서만, 저장 · 전송 안 함)
  var open = {}, detail = {};
  var spots = null, spotMarks = {}, spotsWait = false;   // 갯바위 · 선상 자리 - 📍 내 근처 · 찾기 때 처음 한 번 받음(api/tidefly?spots=1)
  var law = {};                                             // 금어기 · 금지 체장 - data/tidefly-law.json(수산자원관리법 시행령 별표 1 · 2)
  var closed = {};                                          // 출입통제구역 경고 {포인트 · 자리 이름: [...]} - data/tidefly-closed.json
  var SPOT_FIND_N = 30;                                     // 찾기에서 보일 자리 수
  // 2026-11-15 홍TV님 "처음에는 전부 접혀줘" - 펼친 지역 묶음만 기억 { 동해: true }(전에는 접은 것을 기억 tf-folded)
  var openAreas = loadPref('tf-open-areas', {});
  var openCard = {};                          // 펼친 카드(이 화면에서만)
  var lastData = null;

  function loadPref(k, dflt) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { /* 저장이 막혀도 화면은 그대로 */ }
  }
  function loadText(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  var AREAS = ['동해', '남해', '제주', '서해', '그 밖'];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  /** 오늘 물 높이 작은 그래프 - 지금 시각 세로줄, 만조 ▲ · 간조 ▼ 와 시각. */
  function tideChart(events, now) {
    var day = now.slice(0, 10);
    var pts = curve(events, day);
    if (pts.length < 2) return null;
    var W = 300, H = 88, top = 14, bottom = 26;
    var lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    function x(m) { return (m / 1440 * W).toFixed(1); }
    function y(cm) { return (top + (hi - cm) / (hi - lo) * (H - top - bottom)).toFixed(1); }
    var box = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': tr('오늘 물 높이 그래프', "Today's tide height chart") });
    [6, 12, 18].forEach(function (h) {
      box.appendChild(svg('line', { x1: x(h * 60), x2: x(h * 60), y1: top - 4, y2: H - bottom, class: 'grid' }));
      var t = svg('text', { x: x(h * 60), y: H - 3, class: 'axis', 'text-anchor': 'middle' }); t.textContent = tr(h + '시', h + ':00'); box.appendChild(t);
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]) + ' ' + y(p[1]); }).join(' ');
    box.appendChild(svg('path', { d: d + ' L' + x(pts[pts.length - 1][0]) + ' ' + (H - bottom) + ' L' + x(pts[0][0]) + ' ' + (H - bottom) + ' Z', class: 'area' }));
    box.appendChild(svg('path', { d: d, class: 'line' }));
    var base = toMin(day + ' 00:00');
    (events || []).forEach(function (e) {
      var m = toMin(String(e.t)) - base;
      if (m < 0 || m > 1440 || typeof e.cm !== 'number') return;
      var t = svg('text', { x: x(m), y: e.high ? Number(y(e.cm)) - 3 : Number(y(e.cm)) + 11, class: e.high ? 'hi' : 'lo', 'text-anchor': m < 60 ? 'start' : m > 1380 ? 'end' : 'middle' });
      t.textContent = (e.high ? '▲' : '▼') + String(e.t).slice(11, 16);
      box.appendChild(t);
    });
    var nm = toMin(now) - base;
    if (nm >= 0 && nm <= 1440) box.appendChild(svg('line', { x1: x(nm), x2: x(nm), y1: top - 6, y2: H - bottom, class: 'now' }));
    return box;
  }

  function chip(icon, text, cls) {
    var c = el('span', 'chip' + (cls ? ' ' + cls : ''));
    c.appendChild(el('span', 'ic', icon));
    c.appendChild(document.createTextNode(text));
    return c;
  }

  function seaChips(sea) {
    var row = el('div', 'chips');
    if (!sea) { row.appendChild(el('span', 'dim', tr('바다 예측을 받는 중…', 'Loading sea forecast…'))); return row; }
    if (typeof sea.waveM !== 'number' && typeof sea.windMs !== 'number') row.appendChild(chip('🌊', tr('이 바다 칸은 파고 · 바람 예측 없음', 'No wave · wind forecast here')));
    if (typeof sea.waveM === 'number') row.appendChild(chip('🌊', tr('파고 ', 'Waves ') + sea.waveM.toFixed(1) + 'm'));
    if (typeof sea.windMs === 'number') row.appendChild(chip('💨', tr('바람 ', 'Wind ') + sea.windMs.toFixed(1) + 'm/s' + (dir16(sea.windDir) ? ' ' + dir16(sea.windDir) : '')));
    if (swell(sea.swell)) row.appendChild(chip('〰', tr('너울 ', 'Swell ') + swell(sea.swell), sea.swell >= 2 ? 'warn' : ''));
    if (typeof sea.waterC === 'number') row.appendChild(chip('🌡', tr('수온 ', 'Water ') + sea.waterC.toFixed(1) + '℃'));
    return row;
  }

  /** 접힌 카드의 한 줄: 파고 · 바람 · 다음 물때. */
  function summary(it, now) {
    var out = [], sea = it.sea;
    if (sea && typeof sea.waveM === 'number') out.push(tr('파고 ', 'Waves ') + sea.waveM.toFixed(1) + 'm');
    if (sea && typeof sea.windMs === 'number') out.push(tr('바람 ', 'Wind ') + sea.windMs.toFixed(1) + 'm/s');
    if (sea && sea.swell >= 2) out.push(tr('너울 ', 'Swell ') + swell(sea.swell));
    var nt = it.tides && it.tides.events ? nextTide(it.tides.events, now) : null;
    if (nt) out.push(tr('다음 ' + nt.what + ' ' + nt.at, 'Next ' + nt.what + ' ' + nt.at));
    return out.join(' · ') || (sea ? '' : tr('받는 중…', 'Loading…'));
  }

  function card(it, now) {
    var p = it.point || {};
    var m = markOf(it.mark);
    var isOpen = !!openCard[p.name] || !!open[p.name];
    var li = el('li', 'card ' + m[1] + (isOpen ? '' : ' folded'));
    var head = el('button', 'head');
    head.type = 'button';
    head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    li.setAttribute('data-card', p.name);
    head.addEventListener('click', function () {
      // 2026-11-15 홍TV님 "다른 곳 펴기를 하면 기존 것은 접혀줘" - 카드는 하나만 펼침
      var opening = !openCard[p.name];
      if (openCard[p.name]) { delete openCard[p.name]; delete open[p.name]; } else { openCard = {}; open = {}; openCard[p.name] = true; }
      draw();
      if (opening) bringTop('data-card', p.name);   // 위의 카드가 접혀 자리가 밀리므로 편 카드 맨 위로(2026-11-15 홍TV님)
    });
    var badge = el('div', 'mark ' + m[1]);
    badge.appendChild(el('span', 'sym', m[0]));
    badge.appendChild(el('span', 'word', markWord(it.mark)));
    head.appendChild(badge);
    var title = el('div', 'title');
    title.appendChild(el('h3', 'name', placeName(p.name)));
    if (lang === 'en') title.appendChild(el('span', 'kind', p.name + ' · '));
    title.appendChild(el('span', 'kind', p.spot ? (p.boat ? tr('선상 자리', 'Boat spot') : tr('갯바위 자리', 'Rock spot')) : p.boat ? tr('선상', 'Boat fishing') : p.port ? (p.local ? tr('항구 · 방파제(지방어항)', 'Fishing port · breakwater') : tr('항구 · 방파제(국가어항)', 'Fishing port · breakwater')) : tr('갯바위 · 방파제', 'Rocks · breakwater')));
    if (typeof it.km === 'number') title.appendChild(el('span', 'kind', tr(' · 약 ' + it.km + 'km', ' · about ' + it.km + ' km')));   // 📍 내 근처에서 온 카드
    head.appendChild(title);
    head.appendChild(el('span', 'chev', isOpen ? '▴' : '▾'));
    li.appendChild(head);

    var shut = closedText(closed[p.name]);
    if (shut) li.appendChild(el('p', 'alert closed', shut));   // 접혀 있어도 보임(안전)
    var laws = p.spot ? lawFor(p.fish, law, now.slice(5, 10)) : [];
    var nowBan = laws.filter(function (x) { return x.now; });
    if (nowBan.length) li.appendChild(el('p', 'alert closed', nowBan.map(function (x) {   // 금어기 - 접혀 있어도 보임
      return (x.now === 'now' ? tr('⛔ 지금 금어기: ', '⛔ Closed season now: ') : tr('⚠ 금어기일 수 있음(단서 있음 - 원문 확인): ', '⚠ May be closed season (conditions apply - see the law): ')) + x.species + ' ' + x.closed;
    }).join(' / ')));
    var why = (it.reasons || []).filter(function (r) { return r !== '출항은 선사에 확인'; }).map(reason);
    if (why.length) li.appendChild(el('p', 'why ' + m[1], why.join(' · ')));
    if (!isOpen) {
      li.appendChild(el('p', 'sum', summary(it, now)));
      return li;
    }
    if (p.spot) {   // 해양수산부 자리 정보 · 어느 포인트 기준인지
      var info = [];
      if (p.depth) info.push(tr('수심 ' + p.depth + (/m$/.test(p.depth) ? '' : 'm'), 'Depth ' + p.depth + (/m$/.test(p.depth) ? '' : ' m')));
      if (p.bottom) info.push(tr('바닥 ', 'Bottom ') + p.bottom);
      if (p.tideTime) info.push(tr('좋은 물때 ', 'Best tide ') + p.tideTime);
      if (p.fish) info.push(tr('대상어 ', 'Fish ') + p.fish);
      if (info.length) li.appendChild(el('p', 'spot-info', info.join(' · ')));
      if (laws.length) {   // 금어기 · 금지 체장(원문 그대로)
        var lb = el('div', 'law');
        lb.appendChild(el('p', 'label', tr('⚖ 금어기 · 금지 체장 - 수산자원관리법 시행령 별표 1 · 2(2026. 7. 1. 시행) 원문', '⚖ Closed seasons and minimum sizes - Korean Fishery Resources Management Act decree, tables 1 and 2 (Korean text)')));
        laws.forEach(function (x) {
          var t = x.species + (x.species !== x.fish ? '(' + x.fish + ')' : '') + ': ';
          var parts = [];
          if (x.closed) parts.push(tr('금어기 ', 'closed ') + x.closed);
          if (x.size) parts.push(tr('금지 체장 ', 'min. size ban ') + x.size);
          lb.appendChild(el('p', x.now ? 'law-now' : null, t + parts.join(' · ')));
        });
        var src = el('a', 'law-src', tr('법령 원문 보기(국가법령정보센터) ›', 'Read the law (Korean) ›'));
        src.href = LAW_URL;
        src.target = '_blank';
        src.rel = 'noopener';
        lb.appendChild(src);
        li.appendChild(lb);
      }
      li.appendChild(el('p', 'dim small', tr('바다 예측 · 물때 · 해 · 판단은 가까운 ' + p.base + '(' + p.baseKm + 'km) 기준', 'Forecast, tides, sun and verdict are from nearby ' + placeName(p.base) + ' (' + p.baseKm + ' km)')));
    }
    li.appendChild(seaChips(it.sea));

    // 물때
    var tbox = el('div', 'tide');
    var km = typeof p.tideKm === 'number' ? ' ' + p.tideKm.toFixed(0) + 'km' : '';
    tbox.appendChild(el('p', 'label', tr('물때 · ' + (p.tideName || '') + ' 예보지점' + km, 'Tide · ' + placeName(p.tideName || '') + ' station' + km)));
    var ev = it.tides && it.tides.events;
    var nt = ev ? nextTide(ev, now) : null;
    var chart = ev ? tideChart(ev, now) : null;
    if (chart) tbox.appendChild(chart);
    if (nt) {
      var n = el('p', 'next');
      n.appendChild(el('strong', null, tr('다음 ' + nt.what + ' ' + nt.at, 'Next ' + nt.what + ' ' + nt.at)));
      n.appendChild(document.createTextNode(' · ' + nt.left));
      tbox.appendChild(n);
      tbox.appendChild(el('p', 'dim small', tr(nt.what + ' 앞뒤 ' + nt.slack + ' 은 물 흐름이 약한 때(정조)', nt.slack + ': slack water around the ' + nt.what)));
    } else {
      tbox.appendChild(el('p', 'dim small', it.tides ? tr('오늘 물때 자료 없음', 'No tide data for today') : tr('물때를 받는 중…', 'Loading tides…')));
    }
    li.appendChild(tbox);

    // 오늘: 음력 · 물때 이름 · 해
    var t = it.today;
    if (t) {
      var row = el('div', 'chips');
      row.appendChild(chip('🌙', tr('음력 ' + t.lunarDay + '일 · ' + t.mulddae, 'Lunar day ' + t.lunarDay + ' · ' + mul(t.mulddae))));
      if (typeof t.flowPct === 'number') row.appendChild(chip('↔', tr('물 세기 ', 'Tidal range ') + t.flowPct + '%'));
      var sunsetLeft = untilText(now, now.slice(0, 10) + ' ' + t.sunset);
      var soon = sunsetLeft && /^(곧|soon|\d+분|in \d+ min)/.test(sunsetLeft);
      row.appendChild(chip('☀', tr('해 ', 'Sun ') + t.sunrise + ' ~ ' + t.sunset
        + (sunsetLeft ? tr(' (해 지기 ' + sunsetLeft.replace(' 뒤', '') + ' 전)', ' (sunset ' + sunsetLeft + ')') : ''), soon ? 'warn' : ''));
      li.appendChild(row);
      if (t.sari && !p.boat) li.appendChild(el('p', 'alert', tr('⚠ 사리 무렵 - 물이 가장 많이 들고 빠집니다. 갯바위 · 방파제는 들물 때 고립 · 너울에 조심하세요.',
        '⚠ Spring tide - the biggest rise and fall. On rocks and breakwaters, watch out for being cut off by the rising tide and for swells.')));
    }
    if (p.boat) li.appendChild(el('p', 'dim small', tr('⛴ 출항은 선사에 확인하세요.', '⛴ Check sailing with the boat operator.')));
    li.appendChild(alarmBox(it, now));

    var more = el('button', 'more', open[p.name] ? tr('접기 ▴', 'Close ▴') : tr('15일 물때표 · 3일 예보 ▾', '15-day tide table · 3-day forecast ▾'));
    more.type = 'button';
    more.setAttribute('aria-expanded', open[p.name] ? 'true' : 'false');
    more.addEventListener('click', function () { toggle(p.name, p.base || p.name); });   // 자리는 base 포인트의 물때표 · 3일 예보
    li.appendChild(more);
    if (open[p.name]) li.appendChild(detailEl(p.base || p.name, p.spot ? p.tideTime : null));
    return li;
  }

  // ---------------------------------------------------------------- 알림(이 화면을 열어 둔 동안) - 고른 것은 기억 tf-alarms {이름: {ebb, sun}}
  var alarms = loadPref('tf-alarms', {});
  var fired = {};

  function select(label, opts, value, onChange) {
    var wrap = el('label', 'pick');
    wrap.appendChild(el('span', null, label));
    var sel = el('select');
    opts.forEach(function (o) {
      var op = el('option', null, o[1]);
      op.value = o[0] == null ? '' : String(o[0]);
      if (o[0] === value || (o[0] == null && value == null)) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener('change', function () { onChange(sel.value === '' ? null : Number(sel.value)); });
    sel.addEventListener('click', function (e) { e.stopPropagation(); });
    wrap.appendChild(sel);
    return wrap;
  }

  function alarmBox(it, now) {
    var p = it.point || {};
    var cfg = alarms[p.name] || {};
    var box = el('div', 'alarms');
    box.appendChild(el('p', 'label', tr('🔔 알림 - 이 화면을 열어 둔 동안 · 기준은 직접 고르세요', '🔔 Alerts - while this page is open · choose your own timing')));
    function set(k, v) {
      var c = alarms[p.name] || {};
      if (v == null) delete c[k]; else c[k] = v;
      if (Object.keys(c).length) alarms[p.name] = c; else delete alarms[p.name];
      save('tf-alarms', alarms);
      if (v != null && window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* 막혀도 화면 띠로 알림 */ } }
      draw();
    }
    if (!p.boat) {
      box.appendChild(select(tr('철수(간조 뒤 물이 들기 시작)', 'Leave the rocks (after low tide)'),
        [[null, tr('끄기', 'Off')], [0, tr('간조 때', 'At low tide')], [30, tr('간조 30분 뒤', '30 min after')], [60, tr('간조 1시간 뒤', '1 h after')]],
        cfg.ebb, function (v) { set('ebb', v); }));
    }
    box.appendChild(select(tr('해 지기 전', 'Before sunset'),
      [[null, tr('끄기', 'Off')], [30, tr('30분 전', '30 min before')], [60, tr('1시간 전', '1 h before')]],
      cfg.sun, function (v) { set('sun', v); }));
    // 2026-11-15 PC: 앱 브라우저는 알림이 막혀(denied) 허락 창도 안 뜸 - 화면 띠로만 알린다고 밝힘
    if ((cfg.ebb != null || cfg.sun != null) && (!window.Notification || Notification.permission === 'denied')) {
      box.appendChild(el('p', 'dim small', tr('이 브라우저는 알림이 꺼져 있어 화면 띠 · 진동으로만 알립니다(브라우저 설정에서 켤 수 있음).',
        'Notifications are blocked in this browser, so alerts show only as a banner and vibration (you can allow them in browser settings).')));
    }
    var plan = alarmPlan(it.tides && it.tides.events, it.today && it.today.sunset, now, cfg);
    if (plan.length) box.appendChild(el('p', 'dim small', tr('다음 알림 ', 'Next alert ') + (plan[0].at.slice(0, 10) === now.slice(0, 10) ? '' : tr('내일 ', 'tomorrow ')) + plan[0].at.slice(11)));
    return box;
  }

  function checkAlarms() {
    var now = nowKst(Date.now());
    var nowMin = toMin(now);
    items.forEach(function (it) {
      var p = it.point || {}, cfg = alarms[p.name];
      if (!cfg) return;
      // 지나간 2분 안의 것만 울림(화면을 오래 닫았다 열었을 때 지난 알림을 한꺼번에 울리지 않게)
      alarmPlan(it.tides && it.tides.events, it.today && it.today.sunset, fmtDate(nowMin - 2), cfg).forEach(function (a) {
        var id = p.name + '|' + a.kind + '|' + a.at;
        if (a.at > now || fired[id]) return;
        fired[id] = true;
        var text = alarmText(a, placeName(p.name), cfg);
        var bar = document.getElementById('alarm');
        bar.textContent = '🔔 ' + text;
        bar.hidden = false;
        if (navigator.vibrate) { try { navigator.vibrate([300, 150, 300]); } catch (e) { /* 없어도 됨 */ } }
        if (window.Notification && Notification.permission === 'granted') { try { new Notification(tr('타이드플라이', 'Tidefly'), { body: text }); } catch (e) { /* 화면 띠는 보임 */ } }
      });
    });
  }

  function loadSpots() {
    if (spots || spotsWait) return;
    spotsWait = true;
    fetch('api/tidefly?spots=1').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) { spots = d.spots || []; spotMarks = d.marks || {}; spotsWait = false; draw(); })
      .catch(function () { spotsWait = false; });
  }

  /** 받아 둔 자리를 카드 꼴로(base 포인트는 지금 목록 items 에서). */
  function spotItems() {
    if (!spots) return [];
    var by = {};
    items.forEach(function (it) { if (it.point) by[it.point.name] = it; });
    return spots.map(function (s) { return spotItem(s, by[s.base], spotMarks); });
  }

  function draw() {
    var q = (qEl.value || '').trim();
    var ql = q.toLowerCase(), qb = bare(q);   // qb - 빈칸 · 괄호를 뺀 꼴("가의도남측" 이 "가의도 · 남측 해변" 에 맞게)
    var now = nowKst(Date.now());
    listEl.textContent = '';
    var shown = 0;
    function fits(it) {
      var p = it.point || {};
      if (q && String(p.name).indexOf(q) < 0 && placeName(p.name).toLowerCase().indexOf(ql) < 0 && (!qb || bare(p.name).indexOf(qb) < 0) && !(p.spot && fishHit(p.fish, q))) return false;   // 자리는 대상어로도(어종 찾기)
      if (kind === 'shore' && p.boat) return false;
      if (kind === 'boat' && !p.boat) return false;
      return true;
    }
    if (nearAt || q) loadSpots();
    if (q && spots) {   // 찾기 - 갯바위 · 선상 자리 중 이름이 맞는 것(지역 묶음 위, 2026-11-15)
      var found = spotItems().filter(fits);
      if (found.length) {
        var fs = el('section', 'area near');
        fs.appendChild(el('h2', 'near-title', tr('🎣 갯바위 · 선상 자리 ' + found.length + '곳', '🎣 Rock and boat spots: ' + found.length)
          + (found.length > SPOT_FIND_N ? tr(' (앞 ' + SPOT_FIND_N + '곳)', ' (first ' + SPOT_FIND_N + ')') : '')));
        var ql2 = lawFor(q.replace(/\s*(낚시|포인트)$/, ''), law, now.slice(5, 10));   // 고기 이름으로 찾으면 그 고기 금어기 · 금지 체장을 맨 위에
        if (ql2.length) {
          var lw = el('div', 'law');
          ql2.forEach(function (x) {
            var parts = [];
            if (x.closed) parts.push(tr('금어기 ', 'closed ') + x.closed + (x.now === 'now' ? tr(' - 지금 금어기', ' - closed now') : x.now === 'maybe' ? tr(' - 지금일 수 있음(단서 확인)', ' - may be closed now') : ''));
            if (x.size) parts.push(tr('금지 체장 ', 'min. size ban ') + x.size);
            lw.appendChild(el('p', x.now ? 'law-now' : null, '⚖ ' + x.species + ': ' + parts.join(' · ')));
          });
          lw.appendChild(el('p', 'dim small', tr('수산자원관리법 시행령 별표 1 · 2(2026. 7. 1. 시행) 원문', 'Korean Fishery Resources Management Act decree, tables 1 and 2 (Korean text)')));
          fs.appendChild(lw);
        }
        var ful = el('ul', 'cards');
        found.slice(0, SPOT_FIND_N).forEach(function (it) { ful.appendChild(card(it, now)); });
        fs.appendChild(ful);
        listEl.appendChild(fs);
        shown += found.length;
      }
    }
    if (nearAt) {   // 📍 내 근처 - 지역 묶음 위에 가까운 차례로(2026-11-15), 갯바위 · 선상 자리도 함께(받은 뒤)
      var ns = el('section', 'area near');
      ns.appendChild(el('h2', 'near-title', tr('📍 내 근처 ' + NEAR_N + '곳', '📍 Nearest ' + NEAR_N + ' spots')));
      var nul = el('ul', 'cards');
      nearest(items.concat(spotItems()).filter(fits), nearAt.lat, nearAt.lon, NEAR_N).forEach(function (x) {
        var c = Object.create(x.it);
        c.km = x.km;
        nul.appendChild(card(c, now));
      });
      ns.appendChild(nul);
      listEl.appendChild(ns);
    }
    AREAS.forEach(function (area) {
      var group = items.filter(function (it) {
        if ((it.area || '그 밖') !== area) return false;
        return fits(it);
      });
      if (!group.length) return;
      var sec = el('section', 'area');
      var counts = { ok: 0, care: 0, no: 0 };
      group.forEach(function (it) { var c = markOf(it.mark)[1]; if (counts[c] != null) counts[c]++; });
      var h = el('h2');
      var btn = el('button', 'area-toggle');
      btn.type = 'button';
      var isOpen = !!openAreas[area] || !!q;   // 찾을 때는 접힌 묶음도 펼쳐 보임
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      btn.appendChild(document.createTextNode(tr(area, AREA_EN[area] || area)));
      btn.appendChild(el('span', 'count', group.length + tr('곳', group.length === 1 ? ' spot' : ' spots') + (counts.no ? ' · ✕ ' + counts.no : '') + (counts.care ? ' · △ ' + counts.care : '')));
      btn.appendChild(el('span', 'arrow', isOpen ? tr('접기 ▴', 'Hide ▴') : tr('펴기 ▾', 'Show ▾')));
      sec.setAttribute('data-area', area);
      btn.addEventListener('click', function () {
        // 묶음도 하나만 펼침(2026-11-15 홍TV님) - 다른 묶음을 펴면 앞의 것은 접힘
        var opening = !openAreas[area];
        if (openAreas[area]) delete openAreas[area]; else { openAreas = {}; openAreas[area] = true; }
        save('tf-open-areas', openAreas);
        draw();
        if (opening) bringTop('data-area', area);   // "펴기를 누르면 펴지고 제일 상단 데이터로 스크롤"(2026-11-15 홍TV님)
      });
      h.appendChild(btn);
      sec.appendChild(h);
      shown += group.length;
      if (isOpen) {
        var ul = el('ul', 'cards');
        group.forEach(function (it) { ul.appendChild(card(it, now)); });
        sec.appendChild(ul);
      }
      listEl.appendChild(sec);
    });
    // 자리(갯바위 · 선상, 어종 찾기)를 아직 받는 중이면 "없습니다" 대신 기다림(2026-11-15 홍TV님 "쭈꾸미" - 데이터가 없어서 그런가?)
    stateEl.textContent = shown ? '' : (q && !spots ? tr('갯바위 · 선상 자리까지 찾는 중…', 'Searching rock and boat spots too…')
      : q ? tr('찾는 포인트가 없습니다.', 'No matching spots.') : tr('포인트가 없습니다.', 'No spots.'));
    if (lastData && lastData.warming) stateEl.textContent = tr('서버가 바다 예측 · 물때를 받는 중입니다. 곧 채워집니다.', 'The server is still loading forecasts and tides. They will fill in shortly.');
    paintWhen();
  }

  /** 방금 편 묶음 · 카드(attr 값이 key 인 것)를 화면 맨 위로 - 움직임 줄이기 설정이면 바로 옮김. */
  function bringTop(attr, key) {
    var all = listEl.querySelectorAll('[' + attr + ']'), node = null;
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute(attr) === key) { node = all[i]; break; }
    if (!node || !node.scrollIntoView) return;
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  }

  function paintWhen() {
    var sea = null;
    items.forEach(function (it) { if (it.sea) sea = sea || it.sea; });
    document.getElementById('when').textContent = sea
      ? tr('바다 예측 ' + kst(sea.tmEf) + ' 기준(기상청 ' + kst(sea.tmFc) + ' 발표)', 'Sea forecast for ' + kst(sea.tmEf) + ' KST (KMA, issued ' + kst(sea.tmFc) + ')')
      : '';
  }

  function toggle(key, name) {
    open[key] = !open[key];
    if (open[key] && !detail[name]) {
      detail[name] = 'loading';
      fetch('api/tidefly?detail=1&name=' + encodeURIComponent(name), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        detail[name] = d;
        // 2026-11-15 PC: 자세히 보기는 물때가 나왔는데 같은 카드 본문은 "받는 중" - 받은 것으로 카드도 채움
        items.forEach(function (it) {
          if (it.point && it.point.name === name) {
            if (!it.tides && d.tides) it.tides = d.tides;
            if (!it.sea && d.sea) it.sea = d.sea;
          }
        });
        draw();
      }).catch(function () { detail[name] = 'error'; draw(); });
    }
    draw();
  }

  /** 물때표 - 위에 날짜 띠(옆으로 밀어 봄), 아래 표. */
  function tideTableEl(days, good) {
    var rows = tideTable(days), wrap = el('div', 'ttable-wrap');
    var ok = good ? goodDays(good, days) : [];
    wrap.appendChild(el('h4', null, tr('물때표 (' + rows.length + '일)', 'Tide table (' + rows.length + ' days)')));
    var strip = el('div', 'tstrip');
    rows.forEach(function (r, k) {
      var c = el('div', 'tday ' + r.cls + (ok[k] ? ' good' : ''));
      c.appendChild(el('span', 'd', r.day));
      c.appendChild(el('span', 'm', r.mul));
      if (r.moon) { var mo = el('span', 'moon', r.moon[0]); mo.title = r.moon[1]; c.appendChild(mo); }
      strip.appendChild(c);
    });
    wrap.appendChild(strip);
    if (good) {   // 이 자리 좋은 물때(해양수산부) - 맞는 날은 띠 테두리 · 표 줄 바탕을 초록으로
      var g = el('p', 'good-line');
      g.appendChild(el('strong', null, tr('★ 이 자리 좋은 물때(초록 칸): ', '★ Good tides here (green): ')));   // 날짜 칸은 좁아 ★ 대신 줄 바탕 · 띠 테두리로
      g.appendChild(document.createTextNode(good + (ok.some(Boolean) ? '' : tr(' (표에 날로 표시할 수 없는 말)', ' (cannot be marked by day)'))));
      g.appendChild(el('span', 'dim', tr(' - 해양수산부 자료', ' - MOF data')));
      wrap.appendChild(g);
    }
    wrap.appendChild(el('p', 'dim small', tr('주황 사리(물 많이 들고 빠짐 · 흐름 셈) · 보라 조금 · 무시(흐름 약함). 시각 뒤 높이 cm, ▲▼ 앞 물때와 차이. 🌕 달 모양(월령) - 음력 날로 셈.',
      'Orange: spring tide (big range, strong flow) · purple: neap (weak flow). Height in cm, ▲▼ change from the previous tide. 🌕 moon phase from the lunar day.')));
    // 해는 날마다 1 ~ 2분씩만 바뀌어 표 칸 대신 첫날 · 끝날 한 줄(2026-11-15 홍TV님 "날짜 등 줄일 수 있잖아" - 폰에서 간조 · 해 칸이 잘렸음)
    if (rows.length) wrap.appendChild(el('p', 'dim small', sunSpan(rows)));
    var table = el('table', 'ttable'), head = el('tr');
    [[tr('날짜', 'Date'), 'c-date'], [tr('물때', 'Tide'), 'c-mul'], [tr('만조', 'High'), null], [tr('간조', 'Low'), null]].forEach(function (h) { head.appendChild(el('th', h[1], h[0])); });
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tb = el('tbody');
    function evs(list, up) {
      var td = el('td', up ? 'hi' : 'lo');
      if (!list.length) td.textContent = '-';
      list.forEach(function (e) {
        var line = el('div', null, e.t);
        if (e.cm != null) line.appendChild(el('span', 'cm', ' ' + e.cm));
        if (e.diff != null) line.appendChild(el('span', 'diff', (e.diff >= 0 ? '▲' : '▼') + Math.abs(e.diff)));
        td.appendChild(line);
      });
      return td;
    }
    rows.forEach(function (r, k) {
      var tr_ = el('tr', r.cls + (ok[k] ? ' good' : ''));
      var d0 = el('td', 'date');
      if (lang === 'en') {   // "Sun 15" 은 좁은 칸에서 잘려 날 · 요일 · 음력을 세 줄로(2026-11-15)
        d0.appendChild(el('div', null, String(+String(r.date).slice(8))));
        d0.appendChild(el('div', 'dim', r.day.split(' ')[0]));
        d0.appendChild(el('div', 'dim', 'L' + r.lunar));
      } else {
        d0.appendChild(el('div', null, r.day.replace('일(', '(')));   // "15(일)"
        d0.appendChild(el('div', 'dim', '음' + r.lunar));
      }
      tr_.appendChild(d0);
      var m0 = el('td', 'mul');
      var mn = el('div', null, r.mul.replace(' (neap)', ''));   // 영어 "Jogeum (neap)" 은 칸에서 잘려 - 보라색이 조금 · 무시 뜻
      if (r.moon) { var mi = el('span', 'moon', ' ' + r.moon[0]); mi.title = r.moon[1]; mn.appendChild(mi); }   // 월령 - 날짜 칸은 좁아 물때 이름 옆에
      m0.appendChild(mn);
      if (r.pct != null) {
        var bar = el('div', 'bar'), fill = el('span');
        fill.style.width = r.pct + '%';
        bar.appendChild(fill);
        bar.title = tr('물 세기 ', 'Range ') + r.pct + '%';
        m0.appendChild(bar);
      }
      tr_.appendChild(m0);
      tr_.appendChild(evs(r.highs, true));
      tr_.appendChild(evs(r.lows, false));
      tb.appendChild(tr_);
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    return wrap;
  }

  function detailEl(name, good) {
    var box = el('div', 'detail');
    var d = detail[name];
    if (d === 'loading' || !d) { box.appendChild(el('p', 'dim', tr('15일 물때표 · 3일 예보를 받는 중…', 'Loading the 15-day tide table and 3-day forecast…'))); return box; }
    if (d === 'error') { box.appendChild(el('p', 'dim', tr('받지 못했습니다. 다시 눌러 보세요.', 'Could not load. Please tap again.'))); delete detail[name]; return box; }
    box.appendChild(tideTableEl(d.days, good));
    box.appendChild(el('h4', null, tr('3일 바다 예측 (3시간 간격)', '3-day sea forecast (every 3 hours, KST)')));
    var hl = el('ul', 'lines');
    (d.hourly || []).forEach(function (f) { hl.appendChild(el('li', f.swell >= 2 ? 'sari' : null, hourLine(f))); });
    if (!(d.hourly || []).length) hl.appendChild(el('li', 'dim', tr('예측을 받지 못했습니다.', 'Forecast not available.')));
    box.appendChild(hl);
    return box;
  }

  function load() {
    clearTimeout(timer);
    fetch('api/tidefly', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      lastData = data;
      items = data.items || [];
      draw();
      // 서버가 아직 받는 중이면 10초 뒤, 아니면 10분 뒤 다시(남은 시간 글은 1분마다 새로)
      timer = setTimeout(load, data.warming ? 10000 : 600000);
    }).catch(function () {
      stateEl.textContent = tr('불러오지 못했습니다. 잠시 뒤 다시 시도합니다.', 'Could not load. Retrying shortly.');
      timer = setTimeout(load, 60000);
    });
  }

  // ---------------------------------------------------------------- 고정 글(index.html): data-en 에 영어, 처음 한국어는 기억해 둠
  var fixed = Array.prototype.map.call(document.querySelectorAll('[data-en]'), function (e) { return [e, e.innerHTML]; });
  var phs = Array.prototype.map.call(document.querySelectorAll('[data-en-ph]'), function (e) { return [e, e.getAttribute('placeholder')]; });

  var root = document.documentElement;
  var themeBtn = document.getElementById('theme'), sizeBtn = document.getElementById('size');
  var langBtns = document.querySelectorAll('.lang button');
  var SIZE_NAME = { m: ['보통', 'normal'], l: ['크게', 'large'], xl: ['아주 크게', 'extra large'] };

  function paintFixed() {
    root.setAttribute('lang', lang);
    document.title = tr('routefly tidefly(출조)', 'routefly tidefly (fishing trips)');
    document.getElementById('back').setAttribute('href', lang === 'en' ? 'en/m/' : 'm/');   // 코스 모음 - 영어는 /en/m/
    fixed.forEach(function (f) { f[0].innerHTML = lang === 'en' ? f[0].getAttribute('data-en') : f[1]; });
    phs.forEach(function (f) { f[0].setAttribute('placeholder', lang === 'en' ? f[0].getAttribute('data-en-ph') : f[1]); });
    Array.prototype.forEach.call(langBtns, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
    var today = new Date(Date.now() + 9 * 3600 * 1000);
    document.getElementById('today').textContent = '· ' + tr((today.getUTCMonth() + 1) + '월 ' + today.getUTCDate() + '일 ' + WEEK[today.getUTCDay()] + '요일',
      WEEK_EN[today.getUTCDay()] + ', ' + MONTH_EN[today.getUTCMonth()] + ' ' + today.getUTCDate());
    paintOptions();
  }

  // 다크 · 밝은 모드, 글자 크기 단추(2026-11-15 홍TV님) - 고른 것은 이 기기에 기억(tf-theme · tf-size · tf-lang)
  function paintOptions() {
    var dark = isDark(root.getAttribute('data-theme'));
    themeBtn.textContent = dark ? tr('☀ 밝은 모드', '☀ Light') : tr('🌙 다크모드', '🌙 Dark');
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    var cur = root.getAttribute('data-size') || 'm', nx = nextSize(cur), li = lang === 'en' ? 1 : 0;
    sizeBtn.textContent = tr('가', 'A');
    sizeBtn.setAttribute('aria-label', tr('글자 크기: ' + SIZE_NAME[cur][0] + ' (누르면 ' + SIZE_NAME[nx][0] + ')', 'Text size: ' + SIZE_NAME[cur][li] + ' (tap for ' + SIZE_NAME[nx][li] + ')'));
    sizeBtn.style.fontSize = cur === 'm' ? '' : cur === 'l' ? '1.05rem' : '1.15rem';
  }

  themeBtn.addEventListener('click', function () {
    var next = isDark(root.getAttribute('data-theme')) ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    save('tf-theme', next);
    paintOptions();
  });
  sizeBtn.addEventListener('click', function () {
    var next = nextSize(root.getAttribute('data-size') || 'm');
    if (next === 'm') root.removeAttribute('data-size'); else root.setAttribute('data-size', next);
    save('tf-size', next);
    paintOptions();
  });
  Array.prototype.forEach.call(langBtns, function (b) {
    b.addEventListener('click', function () {
      setLang(b.getAttribute('data-lang'));
      save('tf-lang', lang);
      paintFixed();
      draw();
    });
  });
  qEl.addEventListener('input', draw);
  // 코스 모음 찾기에서 낚시 이름으로 왔으면(?q=, 2026-11-15 홍TV님 "찾기에도 찾아질 수 있도록") 그 말로 찾아 둠
  var urlQ = /[?&]q=([^&#]*)/.exec(location.search);
  if (urlQ) { try { qEl.value = decodeURIComponent(urlQ[1].replace(/\+/g, ' ')).slice(0, 40); } catch (e) { /* 깨진 주소는 비워 둠 */ } }
  var nearBtn = document.getElementById('near');
  if (nearBtn) nearBtn.addEventListener('click', function () {
    if (nearAt) { nearAt = null; nearBtn.setAttribute('aria-pressed', 'false'); draw(); return; }
    if (!navigator.geolocation) { stateEl.textContent = tr('이 브라우저는 위치를 알 수 없습니다.', 'This browser cannot tell your location.'); return; }
    nearBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      nearBtn.disabled = false;
      nearAt = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      nearBtn.setAttribute('aria-pressed', 'true');
      draw();
      window.scrollTo({ top: listEl.getBoundingClientRect().top + window.scrollY - 8, behavior: 'smooth' });
    }, function () {
      nearBtn.disabled = false;
      stateEl.textContent = tr('위치를 받지 못했습니다 - 위치 권한을 확인해 주세요.', 'Could not get your location - check the location permission.');
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () {
      kind = b.getAttribute('data-kind');
      Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      draw();
    });
  });

  // 처음 말: 고른 것(tf-lang) → 없으면 브라우저 말(한국어가 아니면 영어)
  // 코스 모음(/m/ · /en/m/)의 🎣 tidefly 줄은 ?lang=ko|en 으로 옴(2026-11-15) - 주소의 말이 먼저, 다음 고른 것(tf-lang), 없으면 브라우저 말
  var urlLang = (/[?&]lang=(ko|en)\b/.exec(location.search) || [])[1];
  var savedLang = loadText('tf-lang');
  setLang(urlLang || savedLang || (/^ko\b/i.test(navigator.language || 'ko') ? 'ko' : 'en'));
  paintFixed();
  setInterval(function () { if (!document.hidden) draw(); }, 60000);
  setInterval(checkAlarms, 30000);
  document.getElementById('alarm').addEventListener('click', function () { this.hidden = true; });
  fetch('data/tidefly-law.json').then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) { law = d || {}; draw(); }).catch(function () { /* 금어기 글 없이 */ });
  fetch('data/tidefly-closed.json').then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) { closed = d || {}; draw(); }).catch(function () { /* 경고 없이 */ });
  load();
})();
