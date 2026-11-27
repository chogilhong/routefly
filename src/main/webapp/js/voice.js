/*
 * 🎙 목소리 만들기(/check/voice, VoiceServlet - 운영자만, 2026-11-21 홍TV님 "이거 만들자").
 * 해설 한 줄 = 한 장면. 줄마다 서버(Azure 음성)로 wav 를 받아 줄 사이를 띄우고 이어 붙여 <산>.wav · <산>.srt 를 내려받음 - make_v2 --voice --srt 가 그대로 읽음.
 * 같은 줄 · 목소리 · 빠르기는 다시 보내지 않음(무료 양 아끼기). 순수 함수는 src/test/js/voice.test.js(VoiceJsTest).
 */
(function (root) {
  'use strict';

  /** 순수 함수 - 붙여 넣은 글 → 줄(앞뒤 빈칸 · 빈 줄 · ``` 줄 뺌). */
  function lines(text) {
    return String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && !/^```/.test(s); });
  }

  /** 순수 함수 - 해설 칸 줄마다 번호(lines() 와 같은 차례, 빈 줄 · ``` 줄은 null) - 해설 칸 왼쪽 번호(2026-11-26 홍TV님). */
  function lineNumbers(text) {
    var n = 0;
    return String(text || '').split(/\r?\n/).map(function (s) { s = s.trim(); return s && !/^```/.test(s) ? ++n : null; });
  }

  /**
   * 순수 함수 - 읽는 말 · 자막 말 나누기(2026-11-25 홍TV님 가야산 "대가야" 발음): "대가야{대 가야}" 처럼 낱말 바로 뒤 { } 에 읽는 말을 적으면
   * 소리는 { } 안(spoken), 자막 · srt 는 앞 낱말(shown). { } 가 없으면 둘 다 그대로.
   */
  // 띄어 쓴 여러 낱말은 [ ] 로 묶음(2026-11-25 홍TV님 "켜 두어야{켜두어야} → 켜 켜두어야 로 읽히네"): [켜 두어야]{켜두어야} - { } 는 바로 앞 낱말 하나만 바꿈(붙여 읽기만이면 2026-11-26 부터 [ ] 없이도 - 아래)
  function spoken(x) {
    var s = String(x).replace(/\[([^\[\]{}]+)\]\{([^{}]*)\}/g, function (m, w, r) { return r.trim() || w; });
    // 띄어 쓴 낱말을 붙여 읽는 것은 [ ] 없이도(2026-11-26 홍TV님 "리만 가설{리만가설} 이건 안 돼네. 리만이 두 번 읽혀") -
    // { } 안 말에서 띄어쓰기를 뺀 것이 바로 앞 낱말 몇 개(4개까지)를 붙인 것과 같으면 그 낱말들을 함께 바꿈
    s = s.replace(/\{[^{}]*\}/g, function (m) { return m.replace(/ /g, '\u0001'); });   // { } 안 띄어쓰기는 잠시 감춤(낱말로 나누지 않게)
    var p = s.split(/( +)/);   // 짝수 칸 = 낱말, 홀수 칸 = 띄어쓰기
    for (var i = 0; i < p.length; i += 2) {
      var m = /^([^\s{}\[\]]+)\{([^{}]*)\}(.*)$/.exec(p[i]);
      if (!m) continue;
      var r = m[2].replace(/\u0001/g, ' ').trim(), flat = r.replace(/\s+/g, ''), k = 0, w = m[1];
      for (var j = 1; j <= 3 && i - 2 * j >= 0 && r; j++) {
        w = p[i - 2 * j] + w;
        if (w === flat) { k = j; break; }
      }
      p[i] = (r || m[1]) + m[3];
      for (var q = 1; q <= k; q++) { p[i - 2 * q] = ''; p[i - 2 * q + 1] = ''; }
    }
    return p.join('').replace(/\u0001/g, ' ');
  }
  function shown(x) { return String(x).replace(/\[([^\[\]{}]+)\]\{[^{}]*\}/g, '$1').replace(/\{[^{}]*\}/g, ''); }

  /** 순수 함수 - 이어 듣기 표(2026-11-25 홍TV님 "멈췄다 다시 들으려니 처음부터"): 목소리 · 빠르기 · 줄 사이 · 읽는 말이 같을 때만 멈춘 자리에서 이어 들음. */
  function playSig(voice, rate, gap, texts) { return voice + '|' + rate + '|' + gap + '|' + texts.map(spoken).join('\n'); }

  /** 순수 함수 - 초 → "1:05". */
  function clock(sec) { var t = Math.max(0, Math.floor(sec || 0)); return Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }

  /** 순수 함수 - 캐시 열쇠. */
  function cacheKey(voice, rate, text) { return voice + '|' + rate + '|' + text; }

  function str4(v, o) { return String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)); }

  /** 순수 함수 - wav(ArrayBuffer) → {rate, channels, bits, pcm: Uint8Array}. PCM(형식 1)만, 아니면 null. data 크기가 남은 길이보다 크면 남은 만큼. */
  function parseWav(buf) {
    var v = new DataView(buf);
    if (buf.byteLength < 12 || str4(v, 0) !== 'RIFF' || str4(v, 8) !== 'WAVE') return null;
    var o = 12, fmt = null;
    while (o + 8 <= buf.byteLength) {
      var id = str4(v, o), size = v.getUint32(o + 4, true), body = o + 8;
      if (id === 'fmt ') {
        fmt = { format: v.getUint16(body, true), channels: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
      } else if (id === 'data') {
        if (!fmt || fmt.format !== 1) return null;
        var end = Math.min(buf.byteLength, body + size);
        return { rate: fmt.rate, channels: fmt.channels, bits: fmt.bits, pcm: new Uint8Array(buf.slice(body, end)) };
      }
      o = body + size + (size % 2);
    }
    return null;
  }

  /** 순수 함수 - 같은 모양의 wav 들을 줄 사이 gapMs 씩 띄워 이어 붙임 → {wav: ArrayBuffer, times: [[시작초, 끝초]]}. 모양이 다르면 null. */
  function joinWav(parts, gapMs) {
    if (!parts.length) return null;
    var f = parts[0];
    for (var i = 1; i < parts.length; i++) if (parts[i].rate !== f.rate || parts[i].channels !== f.channels || parts[i].bits !== f.bits) return null;
    var block = f.channels * f.bits / 8, perSec = f.rate * block;
    var gap = Math.round((gapMs || 0) / 1000 * f.rate) * block, total = 0, times = [], t = 0;
    parts.forEach(function (p, k) { total += p.pcm.length + (k < parts.length - 1 ? gap : 0); });
    var out = new ArrayBuffer(44 + total), v = new DataView(out), b = new Uint8Array(out), o = 44;
    function w4(at, s) { for (var j = 0; j < 4; j++) v.setUint8(at + j, s.charCodeAt(j)); }
    w4(0, 'RIFF'); v.setUint32(4, 36 + total, true); w4(8, 'WAVE'); w4(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, f.channels, true); v.setUint32(24, f.rate, true); v.setUint32(28, perSec, true); v.setUint16(32, block, true); v.setUint16(34, f.bits, true);
    w4(36, 'data'); v.setUint32(40, total, true);
    parts.forEach(function (p, k) {
      b.set(p.pcm, o);
      o += p.pcm.length;
      var d = p.pcm.length / perSec;
      times.push([t, t + d]);
      t += d;
      if (k < parts.length - 1) { o += gap; t += gap / perSec; }   // 사이는 0(조용함) 그대로
    });
    return { wav: out, times: times };
  }

  /** 순수 함수 - 초 → srt 시각 "00:01:02,345". */
  function srtTime(sec) {
    var ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
    function p(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
    return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + ',' + p(r, 3);
  }

  /** 순수 함수 - 줄 · 시각 → srt 글(한 줄 = 한 자막). */
  function srt(texts, times) {
    return texts.map(function (x, i) { return (i + 1) + '\n' + srtTime(times[i][0]) + ' --> ' + srtTime(times[i][1]) + '\n' + x + '\n'; }).join('\n');
  }

  /** 순수 함수 - 전체 듣기에서 t 초에 읽는 줄 번호(0부터, 줄 사이 쉼은 앞 줄) - times 는 joinWav 의 [시작, 끝]. 처음 줄 앞이면 0. */
  function lineAt(times, t) {
    var i = 0;
    while (i + 1 < times.length && times[i + 1][0] <= t) i++;
    return i;
  }
  /**
   * 순수 함수 - 글을 고친 뒤 이어 듣기는 멈춘 줄의 처음부터(2026-11-26 홍TV님 "1번을 수정하고 그것만 듣고 확인하고 이어 듣기를 했는데 다시 1번부터"):
   * 옛 줄 시각 oldTimes 에서 멈춘 t 가 몇 번 줄인지 보고, 새 줄 시각 newTimes 의 그 줄 시작 초. 줄이 줄었으면 마지막 줄.
   */
  function resumeFrom(oldTimes, t, newTimes) {
    if (!oldTimes || !oldTimes.length || !newTimes || !newTimes.length) return 0;
    return newTimes[Math.min(lineAt(oldTimes, t), newTimes.length - 1)][0];
  }

  /**
   * 순수 함수 - 한 달 무료 양 표시(2026-11-26 홍TV님 "50만자 중 기존 얼마를 사용했고 현재 작업은 얼마고").
   * before - 이번 작업 전까지 이번 달에 쓴 글자, job - 이번 작업에서 보낸 글자, jobTotal - 이번 작업 전체(만들 줄 글자 합), limit - 한 달 무료 양.
   */
  function usageText(before, job, jobTotal, limit) {
    var n = function (v) { return Math.round(v).toLocaleString('ko-KR'); }, left = Math.max(0, limit - before - job);
    return '이번 달 ' + n(limit / 10000) + '만 자 중 · 전에 쓴 것 ' + n(before) + '자 · 이번 작업 ' + n(job) + (jobTotal ? ' / ' + n(jobTotal) : '') + '자 · 남은 것 ' + n(left) + '자';
  }
  /**
   * 순수 함수 - 📂 열기(2026-11-27 홍TV님 "작업해줘"): 파일 이름 · 글 → {name, text, note}. 못 읽으면 text 가 ''.
   * 대본 md 는 "## 해설…" 아래 첫 ``` 블록(해설 제목이 없으면 맨 끝 ``` 블록), srt 는 번호 · 시각 줄을 빼고 자막 글만(한 자막 = 한 줄 - 읽는 말 { } 은 srt 에 없음), 그 밖(txt)은 그대로.
   * name - 파일 이름에서 확장자를 뺀 것(월악산.md → 월악산).
   */
  function fromFile(fname, text) {
    var f = String(fname || ''), t = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var name = f.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, ''), ext = (/\.([^.]+)$/.exec(f) || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    if (ext === 'srt') {
      var out = t.split(/\n\s*\n/).map(function (b) {
        return b.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x && !/^\d+$/.test(x) && !/-->/.test(x); }).join(' ');
      }).filter(Boolean);
      return { name: name, text: out.join('\n'), note: out.length ? 'srt 에는 읽는 말 { } 이 없습니다 - 발음을 고친 줄이 있으면 대본 md 를 여세요' : 'srt 에서 자막을 찾지 못했습니다' };
    }
    if (ext === 'md') {
      var ls = t.split('\n'), from = -1, blocks = [], open = -1;
      ls.forEach(function (x, i) { if (from < 0 && /^##\s*해설/.test(x)) from = i; });
      ls.forEach(function (x, i) {
        if (!/^```/.test(x.trim())) return;
        if (open < 0) open = i; else { blocks.push([open, i]); open = -1; }
      });
      var pick = from >= 0 ? blocks.filter(function (k) { return k[0] > from; })[0] : blocks[blocks.length - 1];
      if (!pick) return { name: name, text: '', note: '대본에서 해설 블록(``` … ```)을 찾지 못했습니다' };
      return { name: name, text: ls.slice(pick[0] + 1, pick[1]).join('\n').trim(), note: from >= 0 ? '' : '"## 해설" 제목이 없어 맨 끝 블록을 넣었습니다' };
    }
    return { name: name, text: t.trim(), note: '' };
  }
  /** 순수 함수 - 산마다 저장(2026-11-27): 저장한 산 이름 목록 - 방금 것을 맨 앞에, 같은 이름은 하나, MAX_SAVED 개까지. */
  var MAX_SAVED = 60;
  function savedNames(list, name) {
    var n = String(name || '').trim();
    var l = (Array.isArray(list) ? list : []).filter(function (x) { return typeof x === 'string' && x && x !== n; });
    if (n) l.unshift(n);
    return l.slice(0, MAX_SAVED);
  }
  /** 순수 함수 - 💾 저장할 소리 열쇠(2026-11-27 홍TV님 "저장하고 열면 소리까지"): 지금 글의 줄마다 읽는 말 · 목소리 · 빠르기 열쇠(같은 줄은 하나). */
  function projKeys(text, voice, rate) {
    var out = [];
    lines(text).forEach(function (x) { var k = cacheKey(voice, rate, spoken(x)); if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  var LIMIT = 500000;
  var api = { usageText: usageText, lineNumbers: lineNumbers, lines: lines, spoken: spoken, shown: shown, playSig: playSig, clock: clock, cacheKey: cacheKey, parseWav: parseWav, joinWav: joinWav, srtTime: srtTime, srt: srt, lineAt: lineAt, resumeFrom: resumeFrom, fromFile: fromFile, savedNames: savedNames, projKeys: projKeys };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.RFV = api;

  // ---------------- 화면 ----------------
  var $ = function (id) { return document.getElementById(id); };
  var cache = {}, sent = 0, monthChars = null, busy = false, jobSent = 0, jobTotal = 0;   // jobSent · jobTotal - 이번 작업(▶ 바뀐 줄만 만들기 한 번)
  function save(k, v) { try { localStorage.setItem('rf-voice-' + k, v); } catch (e) { /* 저장 못 해도 됨 */ } }
  function load(k) { try { return localStorage.getItem('rf-voice-' + k); } catch (e) { return null; } }
  function opts() { return { voice: $('vcVoice').value, rate: Math.max(-50, Math.min(50, parseInt($('vcRate').value, 10) || 0)), gap: Math.max(0, Math.min(2000, parseInt($('vcGap').value, 10) || 0)) }; }
  function info(msg) {
    // monthChars - 화면을 열 때 서버가 준 이번 달 글자(서버가 파일에 남김), sent - 이 창에서 보낸 것(이번 작업 포함)
    $('vcInfo').textContent = (msg ? msg + ' · ' : '') + (monthChars != null ? usageText(monthChars + sent - jobSent, jobSent, jobTotal, LIMIT) : '이 창에서 보낸 글자 ' + sent.toLocaleString() + '자');
  }

  function render() {
    var o = opts(), ul = $('vcLines');
    ul.innerHTML = '';
    var xs = lines($('vcText').value), done = 0, secs = 0, chars = 0;
    xs.forEach(function (x, i) {
      var li = document.createElement('li'), no = document.createElement('span'), sp = document.createElement('div'), sm = document.createElement('small'), bt = document.createElement('div'), play = document.createElement('button'), redo = document.createElement('button');
      var say = spoken(x), c = cache[cacheKey(o.voice, o.rate, say)];
      no.className = 'no'; no.textContent = i + 1;
      sp.className = 'tx'; sp.textContent = shown(x);
      if (say !== shown(x)) { var rd = document.createElement('span'); rd.className = 'rd'; rd.textContent = say; sp.appendChild(rd); }   // 읽는 말이 다르면 아래에 작게
      var d = c && !c.err ? c.wav.pcm.length / (c.wav.rate * c.wav.channels * c.wav.bits / 8) : 0;
      sm.className = 'st'; sm.textContent = c && c.err ? '실패 - ↻ 로 다시' : c ? d.toFixed(1) + '초 · 만듦' : say.length + '자 · 아직';
      li.className = c && c.err ? 'bad' : c ? 'ok' : '';
      if (c && !c.err) { done++; secs += d; }
      chars += say.length;
      bt.className = 'bt';
      play.textContent = '🔊'; play.title = '이 줄 듣기'; play.disabled = !c || !!c.err;
      play.onclick = function () { playParts([c.wav]); };
      redo.textContent = '↻'; redo.title = '이 줄 다시 만들기';
      redo.onclick = function () { delete cache[cacheKey(o.voice, o.rate, say)]; make([x]); };
      // 견줘 듣기(2026-11-25 홍TV님 "목소리를 바꿔서 한~두 줄만 들어 볼 수 있도록 … 기존 것은 그대로") - 고른 목소리 · 만든 소리는 그대로
      var tr = document.createElement('button');
      tr.textContent = '🎧'; tr.title = '견줄 목소리로 이 줄만 들어 보기';
      tr.disabled = !$('vcTry').value || $('vcTry').value === o.voice;
      tr.onclick = function () { tryLine(say); };
      bt.appendChild(play); bt.appendChild(redo); bt.appendChild(tr);
      li.appendChild(no); li.appendChild(sp); li.appendChild(bt); li.appendChild(sm);
      ul.appendChild(li);
    });
    if (nowLine >= 0 && ul.children[nowLine]) ul.children[nowLine].classList.add('now');   // 다시 그려도 읽는 줄 밝힘은 그대로
    // 줄 요약 - 만든 줄 · 글자 · 길이(만든 것은 실제, 남은 것은 1초 약 6.9글자로 어림)
    $('vcSum').innerHTML = '';
    [['줄', xs.length], ['만듦', done + ' / ' + xs.length], ['글자', chars.toLocaleString()], [done === xs.length && xs.length ? '길이' : '길이(어림)', clock(done === xs.length ? secs + (xs.length - 1) * o.gap / 1000 : chars / 6.9 + (xs.length - 1) * o.gap / 1000)]]
      .forEach(function (p) { var s2 = document.createElement('span'), b = document.createElement('b'); s2.textContent = p[0] + ' '; b.textContent = p[1]; s2.appendChild(b); $('vcSum').appendChild(s2); });
    $('vcProg').style.width = xs.length ? Math.round(done / xs.length * 100) + '%' : '0';
  }

  /** 한 줄을 서버에서 받아 cache 에 넣음(promise). */
  function fetchLine(x, voice, rate) {
    var k = cacheKey(voice, rate, x);
    return fetch('voice', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: x, voice: voice, rate: rate }) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'HTTP ' + r.status); }, function () { throw new Error('HTTP ' + r.status); });
        return r.arrayBuffer();
      })
      .then(function (buf) {
        var w = parseWav(buf);
        if (!w) throw new Error('wav 모양이 아닙니다');
        cache[k] = { wav: w };
        sent += x.length; jobSent += x.length;
        return w;
      });
  }

  /** 견줄 목소리로 한 줄 듣기 - 이미 만든 것이면 바로, 아니면 그 줄만 만들어 들음(빠르기는 같음). */
  function tryLine(say) {
    var o = opts(), v = $('vcTry').value;
    if (!v || busy) return;
    var c = cache[cacheKey(v, o.rate, say)];
    if (c && !c.err) { playParts([c.wav]); return; }
    busy = true;
    info('견줄 목소리로 만드는 중');
    fetchLine(say, v, o.rate).then(function (w) { busy = false; info('견줄 목소리 ' + $('vcTry').selectedOptions[0].textContent); playParts([w]); })
      .catch(function (e) { busy = false; info('멈춤: ' + e.message); });
  }

  function make(only) {
    if (busy) return;
    var o = opts();
    if (!o.voice) { info('목소리를 먼저 고르세요'); return; }
    var todo = (only || lines($('vcText').value)).map(spoken).filter(function (x, i, all) { var c = cache[cacheKey(o.voice, o.rate, x)]; return (!c || c.err) && all.indexOf(x) === i; });
    if (!todo.length) { render(); info('바뀐 줄이 없습니다'); return; }
    busy = true;
    jobSent = 0; jobTotal = todo.reduce(function (s, x) { return s + x.length; }, 0);
    var i = 0;
    (function next() {
      if (i >= todo.length) { busy = false; render(); info('다 만들었습니다'); return; }
      var x = todo[i++], k = cacheKey(o.voice, o.rate, x);
      info(i + ' / ' + todo.length + ' 줄 만드는 중');
      fetchLine(x, o.voice, o.rate)
        .then(function () { render(); next(); })
        .catch(function (e) { cache[k] = { err: true }; busy = false; render(); info('멈춤: ' + e.message); });
    })();
  }

  /** 지금 줄 차례대로, 다 만들어졌으면 이어 붙인 것. 아니면 null. */
  function joined() {
    var o = opts(), xs = lines($('vcText').value), parts = [];
    for (var i = 0; i < xs.length; i++) {
      var c = cache[cacheKey(o.voice, o.rate, spoken(xs[i]))];
      if (!c || c.err) { info((i + 1) + '번 줄이 아직입니다 - 먼저 만들기'); return null; }
      parts.push(c.wav);
    }
    var j = parts.length ? joinWav(parts, o.gap) : null;
    if (!j) { info(parts.length ? '줄마다 wav 모양이 다릅니다' : '줄이 없습니다'); return null; }
    j.texts = xs.map(shown);   // 자막은 { } 앞 낱말 그대로
    return j;
  }

  // 전체 듣기(audio)와 한 줄 듣기(one)는 따로 - 한 줄을 들어도 멈춘 전체 자리는 남음
  var audio = null, audioSig = null, audioTimes = null, one = null, nowLine = -1;
  /**
   * 전체 듣기 중 읽는 줄을 밝히고 화면 가운데로(2026-11-26 홍TV님 "6까지 읽었어. 그럼 스크롤을 올려서 다음 줄부터 볼 수 있도록") -
   * 줄이 바뀔 때만 옮김. i 가 -1 이면 밝힘만 지움.
   */
  function markLine(i) {
    if (i === nowLine) return;
    nowLine = i;
    var lis = $('vcLines').children;
    for (var k = 0; k < lis.length; k++) lis[k].classList.toggle('now', k === i);
    if (i >= 0 && lis[i]) lis[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  /** 전체 듣기를 끝냄(처음부터로) - 다 들었거나 글 · 목소리가 바뀌었을 때. */
  function stop() {
    if (audio) { audio.pause(); URL.revokeObjectURL(audio.src); audio = null; }
    audioTimes = null;
    audioSig = null;
    markLine(-1);
    $('vcPlay').textContent = '🔊 전체 듣기';
    $('vcRestart').hidden = true;
  }
  /** 멈춤 - 자리는 남겨 두고 단추는 "▶ 이어 듣기 (1:23)"(2026-11-25 홍TV님 "이어서 듣게"), 옆에 ⏮ 처음부터. */
  function pause() {
    audio.pause();
    $('vcPlay').textContent = '▶ 이어 듣기 (' + clock(audio.currentTime) + ')';
    $('vcRestart').hidden = false;
  }
  function resume() {
    if (one) one.pause();
    audio.play();
    $('vcPlay').textContent = '⏹ 멈춤';
    $('vcRestart').hidden = true;
  }
  function playAll(wav, sig, times, from) {
    stop();
    if (one) one.pause();
    audio = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    audioSig = sig; audioTimes = times;
    if (from > 0) audio.currentTime = from;
    audio.onended = stop;
    audio.ontimeupdate = function () { if (audio) markLine(lineAt(times, audio.currentTime)); };
    $('vcPlay').textContent = '⏹ 멈춤';
    audio.play();
  }
  function playParts(parts) {
    var j = joinWav(parts, 0);
    if (!j) return;
    if (audio && !audio.paused) pause();
    if (one) { one.pause(); URL.revokeObjectURL(one.src); }
    one = new Audio(URL.createObjectURL(new Blob([j.wav], { type: 'audio/wav' })));
    one.play();
  }

  function download(data, type, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  /**
   * 해설 칸 왼쪽 줄 번호 - 같은 넓이 · 모양의 숨은 textarea(ta 를 복제)에 앞 줄들만 넣어 높이를 재어, 꺾인 줄도 그 줄의 첫 줄에 번호.
   * 숨은 div 로 재면 textarea 와 줄 꺾임이 달라 번호가 밀렸음(2026-11-26 확인).
   */
  var gutterTa = null, gutterKey = '', gutterTops = [], gutterTimer = 0;
  /** 줄마다 위치(위에서 px) - 글 · 넓이가 바뀔 때만 다시 잼(값을 줄마다 넣어 재므로 무거움). */
  function gutterMeasure() {
    var ta = $('vcText');
    if (!gutterTa) {
      gutterTa = ta.cloneNode(false);
      gutterTa.removeAttribute('id');
      gutterTa.setAttribute('aria-hidden', 'true'); gutterTa.tabIndex = -1; gutterTa.spellcheck = false;
      gutterTa.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;height:0;min-height:0;overflow:hidden;resize:none';
      ta.parentNode.appendChild(gutterTa);
    }
    // 넓이는 스크롤 막대를 뺀 것(clientWidth + 테두리) - 숨은 칸은 막대가 없어, offsetWidth 로 재면 덜 꺾여 아래로 갈수록 번호가 위로 밀렸음(2026-11-26 PC: 94줄에서 52 가 54번째 줄 옆)
    var cs = getComputedStyle(ta), w = ta.clientWidth + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    var key = w + '|' + ta.value;   // 막대가 생기고 없어질 때도 다시 잼
    if (key === gutterKey) return;
    gutterKey = key;
    gutterTa.style.width = w + 'px';
    var padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    var raw = ta.value.split(/\r?\n/), nums = lineNumbers(ta.value);
    gutterTops = [];
    for (var i = 0; i < raw.length; i++) {
      if (nums[i] == null) continue;
      var y = padT;
      if (i > 0) { gutterTa.value = raw.slice(0, i).join('\n'); y = gutterTa.scrollHeight - padB; }
      gutterTops.push([nums[i], y]);
    }
  }
  /** 해설 칸 왼쪽 번호를 지금 스크롤에 맞춰 그림(잰 위치는 그대로 씀). */
  function gutterPaint() {
    var ta = $('vcText'), no = $('vcNo');
    no.innerHTML = '';
    gutterTops.forEach(function (g) {
      var y = g[1] - ta.scrollTop;
      if (y < -30 || y > ta.clientHeight) return;
      var sp = document.createElement('span'); sp.textContent = g[0]; sp.style.top = (y + 4) + 'px'; no.appendChild(sp);
    });
  }
  /** 글 · 크기가 바뀌면 잠깐 뒤(쳐 넣는 동안은 한 번만) 다시 재고 그림. 스크롤은 바로 그림. */
  function gutter(now) {
    if (!$('vcText') || !$('vcNo')) return;
    clearTimeout(gutterTimer);
    if (now === true) { gutterMeasure(); gutterPaint(); return; }
    gutterTimer = setTimeout(function () { gutterMeasure(); gutterPaint(); }, 150);
  }
  // 산마다 저장(2026-11-27 홍TV님) - 해설 글을 산 이름마다 이 브라우저 localStorage(rf-voice-text:<산>, 목록 rf-voice-names)에. 서버로 보내지 않음.
  function savedList() { try { var l = JSON.parse(load('names') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function fillSaved(l) {
    var sel = $('vcSaved');
    sel.innerHTML = '';
    sel.appendChild(new Option('📚 저장한 산 (' + l.length + ')', ''));
    l.forEach(function (n) { sel.appendChild(new Option(n, n)); });
  }
  /** 지금 해설 글을 지금 산 이름으로 저장 - 이름 · 글이 있을 때만(이름을 치는 중의 반쪽 이름은 change 뒤에만 와서 남지 않음). */
  function keepText() {
    var n = $('vcName').value.trim(), t = $('vcText').value;
    if (!n || !t.trim()) return;
    save('text:' + n, t);
    var l = savedNames(savedList(), n);
    save('names', JSON.stringify(l));
    fillSaved(l);
  }
  // 💾 저장(2026-11-27 홍TV님 "저장 기능을 둬서 현재 그대로 저장하고 열면 소리까지") - IndexedDB rf-voice / proj, 열쇠 = 산 이름.
  // {name, text, voice, rate, gap, t, snd: {소리 열쇠: {rate, channels, bits, pcm}}} - 이 브라우저에만(서버로 안 감)
  function idbDo(mode, fn) {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('이 브라우저는 저장소가 없습니다')); return; }
      var r = indexedDB.open('rf-voice', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('proj'); };
      r.onerror = function () { rej(r.error || new Error('저장소를 열지 못했습니다')); };
      r.onsuccess = function () {
        var db = r.result, tx, q;
        try { tx = db.transaction('proj', mode); q = fn(tx.objectStore('proj')); } catch (e) { db.close(); rej(e); return; }
        tx.oncomplete = function () { db.close(); res(q ? q.result : undefined); };
        tx.onerror = tx.onabort = function () { db.close(); rej(tx.error || new Error('저장하지 못했습니다')); };
      };
    });
  }
  function getProj(n) { return idbDo('readonly', function (st) { return st.get(n); }).catch(function () { return null; }); }
  /** 저장한 목소리 · 빠르기 · 줄 사이로 맞추고 소리를 cache 에 넣음(이미 만든 줄은 그대로) - 넣은 줄 수. */
  function applyProj(p) {
    if (!p) return 0;
    $('vcRate').value = p.rate; save('vcRate', String(p.rate));
    $('vcGap').value = p.gap; save('vcGap', String(p.gap));
    save('vcVoice', p.voice);   // 목록이 아직이면 받은 뒤 이 목소리로
    if ([].some.call($('vcVoice').options, function (op) { return op.value === p.voice; })) $('vcVoice').value = p.voice;
    var n = 0;
    Object.keys(p.snd || {}).forEach(function (k) { var w = p.snd[k]; if (w && w.pcm) { cache[k] = { wav: w }; n++; } });
    render();
    return n;
  }
  /** 해설 칸 · 산 이름을 바꿈(📂 열기 · 저장한 산 고르기) - 듣던 것은 멈춤. */
  function setText(name, text, msg) {
    stop();
    $('vcName').value = name; save('vcName', name);
    $('vcText').value = text; save('vcText', text);
    keepText();
    render();
    gutter(true);
    info(msg);
  }
  function fileName() { return ($('vcName').value.trim() || 'voice').replace(/[\\/:*?"<>|]/g, ''); }

  function start() {
    ['vcName', 'vcRate', 'vcGap', 'vcText'].forEach(function (id) {
      var v = load(id);
      if (v != null) $(id).value = v;
      $(id).addEventListener('input', function () { save(id, $(id).value); render(); if (id === 'vcText') { gutter(); keepText(); } });
    });
    $('vcName').addEventListener('change', keepText);   // 이름을 다 친 뒤(칸을 떠날 때)
    fillSaved(savedList());
    $('vcSaved').addEventListener('change', function () {
      var n = $('vcSaved').value;
      if (!n) return;
      keepText();   // 보던 글은 그 산 이름으로 남김
      $('vcSaved').value = '';
      getProj(n).then(function (p) {
        var t = load('text:' + n);   // 글은 칠 때마다 남긴 것(💾 뒤에 고친 글)이 먼저
        if (t == null && p) t = p.text;
        if (t == null) { info(n + ' - 저장한 글이 없습니다'); return; }
        setText(n, t, n + ' 해설을 불러왔습니다(' + lines(t).length + '줄)');
        var k = applyProj(p);
        if (p) info(n + ' 해설 ' + lines(t).length + '줄 · 저장한 소리 ' + k + '줄을 불러왔습니다' + (k ? ' - 글을 고친 줄만 ▶ 바뀐 줄만 만들기' : ''));
      });
    });
    $('vcSave').onclick = function () {
      var n = $('vcName').value.trim(), t = $('vcText').value, o = opts();
      if (!n) { info('산 이름을 먼저 적으세요(저장 이름)'); return; }
      if (!t.trim()) { info('해설이 비었습니다'); return; }
      var snd = {}, k = 0;
      projKeys(t, o.voice, o.rate).forEach(function (key) { var c = cache[key]; if (c && !c.err) { snd[key] = c.wav; k++; } });
      keepText();
      idbDo('readwrite', function (st) { return st.put({ name: n, text: t, voice: o.voice, rate: o.rate, gap: o.gap, t: Date.now(), snd: snd }, n); })
        .then(function () { info(n + ' 저장 - 글 ' + lines(t).length + '줄 · 소리 ' + k + '줄(이 브라우저에)'); })
        .catch(function (e) { info('저장하지 못했습니다: ' + (e && e.message || e)); });
    };
    $('vcForget').onclick = function () {
      var n = $('vcSaved').value || $('vcName').value.trim(), l = savedList();
      if (!n || l.indexOf(n) < 0) { info('지울 산을 📚 목록에서 고르세요'); return; }
      try { localStorage.removeItem('rf-voice-text:' + n); } catch (e) { /* 그대로 */ }
      idbDo('readwrite', function (st) { return st.delete(n); }).catch(function () { /* 저장한 소리가 없었음 */ });
      l = l.filter(function (x) { return x !== n; });
      save('names', JSON.stringify(l));
      fillSaved(l);
      info(n + ' 을(를) 저장한 목록에서 지웠습니다(저장한 소리도 - 해설 칸 글은 그대로)');
    };
    $('vcOpen').onclick = function () { $('vcFile').click(); };
    $('vcFile').addEventListener('change', function () {
      var f = this.files && this.files[0], input = this;
      if (!f) return;
      f.text().then(function (txt) {
        var r = fromFile(f.name, txt);
        input.value = '';
        if (!r.text) { info(r.note || '파일에서 글을 찾지 못했습니다'); return; }
        keepText();   // 보던 글은 그 산 이름으로 남김
        var msg = f.name + ' 을(를) 열었습니다(' + lines(r.text).length + '줄)' + (r.note ? ' · ' + r.note : '');
        setText(r.name, r.text, msg);
        getProj(r.name).then(function (p) { var k = applyProj(p); if (k) info(msg + ' · 저장한 소리 ' + k + '개를 넣었습니다(같은 줄만 쓰임)'); });
      }).catch(function () { input.value = ''; info('파일을 읽지 못했습니다'); });
    });
    $('vcText').addEventListener('scroll', function () { if ($('vcNo')) gutterPaint(); });
    window.addEventListener('resize', function () { gutter(); });
    if (window.ResizeObserver) new ResizeObserver(function () { gutter(); }).observe($('vcText'));   // 칸 크기를 끌어 바꿀 때
    gutter(true);
    $('vcVoice').addEventListener('change', function () { save('vcVoice', $('vcVoice').value); render(); });
    $('vcTry').addEventListener('change', function () { save('vcTry', $('vcTry').value); render(); });
    // 들어 보고 마음에 들면 바꿈 - 원래 목소리로 만든 소리는 이 창에 남아 다시 돌아가도 새로 안 만듦
    $('vcUse').onclick = function () {
      var v = $('vcTry').value;
      if (!v || v === $('vcVoice').value) return;
      $('vcTry').value = $('vcVoice').value;
      $('vcVoice').value = v;
      save('vcVoice', v); save('vcTry', $('vcTry').value);
      render();
      info('목소리를 바꿨습니다 - ▶ 바뀐 줄만 만들기를 누르세요(원래 목소리는 견줘 듣기 칸으로)');
    };
    $('vcMake').onclick = function () { make(); };
    $('vcPlay').onclick = function () {
      if (audio && !audio.paused) { pause(); return; }
      var o = opts(), sig = playSig(o.voice, o.rate, o.gap, lines($('vcText').value));
      if (audio && audioSig === sig) { resume(); return; }   // 멈춘 자리에서 이어 들음
      var j = joined();
      if (!j) return;
      if (audio && audio.paused && audioTimes) {   // 멈춘 뒤 글 · 목소리를 바꿈 → 새로 이어 붙이되 멈춘 줄의 처음부터(⏮ 처음부터는 audio 를 지운 뒤라 여기 안 옴)
        var from = resumeFrom(audioTimes, audio.currentTime, j.times);
        playAll(j.wav, sig, j.times, from);
        info('고친 글로 ' + (lineAt(j.times, from) + 1) + '번 줄부터 이어 들음');
        return;
      }
      playAll(j.wav, sig, j.times);
      info('전체 ' + j.times[j.times.length - 1][1].toFixed(1) + '초');
    };
    $('vcRestart').onclick = function () { stop(); $('vcPlay').onclick(); };
    $('vcWav').onclick = function () { var j = joined(); if (j) download(j.wav, 'audio/wav', fileName() + '.wav'); };
    $('vcSrt').onclick = function () { var j = joined(); if (j) download(srt(j.texts, j.times), 'application/x-subrip', fileName() + '.srt'); };
    fetch('voice?list=1', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      var sel = $('vcVoice'), tsel = $('vcTry');
      sel.innerHTML = '';
      tsel.innerHTML = '';
      tsel.appendChild(new Option('고르기', ''));
      if (j.error) { sel.appendChild(new Option('목소리 없음', '')); info(j.error); return; }
      (j.voices || []).forEach(function (x) { tsel.appendChild(new Option((x.local || x.name) + ' · ' + (x.gender === 'Female' ? '여' : x.gender === 'Male' ? '남' : x.gender || '') + ' (' + x.name + ')', x.name)); sel.appendChild(new Option((x.local || x.name) + ' · ' + (x.gender === 'Female' ? '여' : x.gender === 'Male' ? '남' : x.gender || '') + ' (' + x.name + ')', x.name)); });
      var want = load('vcVoice');
      if (want && [].some.call(sel.options, function (op) { return op.value === want; })) sel.value = want;
      var tw = load('vcTry');
      if (tw && [].some.call(tsel.options, function (op) { return op.value === tw; })) tsel.value = tw;
      monthChars = j.monthChars;
      render();
      info('');
    }).catch(function () { info('목소리 목록을 받지 못했습니다'); });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(this);
