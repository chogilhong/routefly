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

  /**
   * 순수 함수 - 읽는 말 · 자막 말 나누기(2026-11-25 홍TV님 가야산 "대가야" 발음): "대가야{대 가야}" 처럼 낱말 바로 뒤 { } 에 읽는 말을 적으면
   * 소리는 { } 안(spoken), 자막 · srt 는 앞 낱말(shown). { } 가 없으면 둘 다 그대로.
   */
  function spoken(x) { return String(x).replace(/([^\s{}]+)\{([^{}]*)\}/g, function (m, w, r) { return r.trim() || w; }); }
  function shown(x) { return String(x).replace(/\{[^{}]*\}/g, ''); }

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

  var api = { lines: lines, spoken: spoken, shown: shown, cacheKey: cacheKey, parseWav: parseWav, joinWav: joinWav, srtTime: srtTime, srt: srt };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.RFV = api;

  // ---------------- 화면 ----------------
  var $ = function (id) { return document.getElementById(id); };
  var cache = {}, sent = 0, monthChars = null, busy = false;
  function save(k, v) { try { localStorage.setItem('rf-voice-' + k, v); } catch (e) { /* 저장 못 해도 됨 */ } }
  function load(k) { try { return localStorage.getItem('rf-voice-' + k); } catch (e) { return null; } }
  function opts() { return { voice: $('vcVoice').value, rate: Math.max(-50, Math.min(50, parseInt($('vcRate').value, 10) || 0)), gap: Math.max(0, Math.min(2000, parseInt($('vcGap').value, 10) || 0)) }; }
  function info(msg) {
    $('vcInfo').textContent = (msg ? msg + ' · ' : '') + '이번 창에서 보낸 글자 ' + sent.toLocaleString() + '자' + (monthChars != null ? ' · 서버 이번 달 ' + (monthChars + sent).toLocaleString() + '자(무료 50만 자)' : '');
  }

  function render() {
    var o = opts(), ul = $('vcLines');
    ul.innerHTML = '';
    lines($('vcText').value).forEach(function (x, i) {
      var li = document.createElement('li'), sp = document.createElement('span'), sm = document.createElement('small'), play = document.createElement('button'), redo = document.createElement('button');
      var say = spoken(x), c = cache[cacheKey(o.voice, o.rate, say)];
      sp.textContent = (i + 1) + '. ' + shown(x) + (say !== shown(x) ? '  (읽기: ' + say + ')' : '');
      sm.textContent = c && c.err ? '실패' : c ? (c.wav.pcm.length / (c.wav.rate * c.wav.channels * c.wav.bits / 8)).toFixed(1) + '초' : say.length + '자 · 아직';
      if (c && c.err) li.className = 'bad';
      play.textContent = '🔊'; play.title = '이 줄 듣기'; play.disabled = !c || !!c.err;
      play.onclick = function () { playParts([c.wav]); };
      redo.textContent = '↻'; redo.title = '이 줄 다시 만들기';
      redo.onclick = function () { delete cache[cacheKey(o.voice, o.rate, say)]; make([x]); };
      li.appendChild(sp); li.appendChild(sm); li.appendChild(play); li.appendChild(redo);
      ul.appendChild(li);
    });
  }

  function make(only) {
    if (busy) return;
    var o = opts();
    if (!o.voice) { info('목소리를 먼저 고르세요'); return; }
    var todo = (only || lines($('vcText').value)).map(spoken).filter(function (x, i, all) { var c = cache[cacheKey(o.voice, o.rate, x)]; return (!c || c.err) && all.indexOf(x) === i; });
    if (!todo.length) { render(); info('바뀐 줄이 없습니다'); return; }
    busy = true;
    var i = 0;
    (function next() {
      if (i >= todo.length) { busy = false; render(); info('다 만들었습니다'); return; }
      var x = todo[i++], k = cacheKey(o.voice, o.rate, x);
      info(i + ' / ' + todo.length + ' 줄 만드는 중');
      fetch('voice', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: x, voice: o.voice, rate: o.rate }) })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'HTTP ' + r.status); }, function () { throw new Error('HTTP ' + r.status); });
          return r.arrayBuffer();
        })
        .then(function (buf) {
          var w = parseWav(buf);
          if (!w) throw new Error('wav 모양이 아닙니다');
          cache[k] = { wav: w };
          sent += x.length;
          render();
          next();
        })
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

  var audio = null;
  /** 듣기 멈춤 - 전체 듣기 단추는 듣는 동안 "⏹ 멈춤"(2026-11-21 홍TV님 "전체 듣기 하다가 멈추려면?"). */
  function stop() {
    if (audio) { audio.pause(); URL.revokeObjectURL(audio.src); audio = null; }
    $('vcPlay').textContent = '🔊 전체 듣기';
  }
  function play(wav, all) {
    stop();
    audio = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    audio.onended = stop;
    if (all) $('vcPlay').textContent = '⏹ 멈춤';
    audio.play();
  }
  function playParts(parts) {
    var j = joinWav(parts, 0);
    if (j) play(j.wav, false);
  }

  function download(data, type, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function fileName() { return ($('vcName').value.trim() || 'voice').replace(/[\\/:*?"<>|]/g, ''); }

  function start() {
    ['vcName', 'vcRate', 'vcGap', 'vcText'].forEach(function (id) {
      var v = load(id);
      if (v != null) $(id).value = v;
      $(id).addEventListener('input', function () { save(id, $(id).value); render(); });
    });
    $('vcVoice').addEventListener('change', function () { save('vcVoice', $('vcVoice').value); render(); });
    $('vcMake').onclick = function () { make(); };
    $('vcPlay').onclick = function () {
      if (audio && $('vcPlay').textContent === '⏹ 멈춤') { stop(); return; }
      var j = joined();
      if (!j) return;
      play(j.wav, true);
      info('전체 ' + j.times[j.times.length - 1][1].toFixed(1) + '초');
    };
    $('vcWav').onclick = function () { var j = joined(); if (j) download(j.wav, 'audio/wav', fileName() + '.wav'); };
    $('vcSrt').onclick = function () { var j = joined(); if (j) download(srt(j.texts, j.times), 'application/x-subrip', fileName() + '.srt'); };
    fetch('voice?list=1', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      var sel = $('vcVoice');
      sel.innerHTML = '';
      if (j.error) { sel.appendChild(new Option('목소리 없음', '')); info(j.error); return; }
      (j.voices || []).forEach(function (x) { sel.appendChild(new Option((x.local || x.name) + ' · ' + (x.gender === 'Female' ? '여' : x.gender === 'Male' ? '남' : x.gender || '') + ' (' + x.name + ')', x.name)); });
      var want = load('vcVoice');
      if (want && [].some.call(sel.options, function (op) { return op.value === want; })) sel.value = want;
      monthChars = j.monthChars;
      render();
      info('');
    }).catch(function () { info('목소리 목록을 받지 못했습니다'); });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(this);
