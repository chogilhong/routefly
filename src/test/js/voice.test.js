// js/voice.js 의 순수 함수(목소리 만들기, /check/voice) - VoiceJsTest 가 node 로 돌림(node 가 없으면 건너뜀)
'use strict';
const assert = require('assert');
const V = require('../../main/webapp/js/voice.js');

// 줄 나누기 - 대본 문서의 ``` 블록째 붙여도 됨
assert.deepStrictEqual(V.lines('```\n  첫 줄 \n\n둘째 줄\r\n```\n'), ['첫 줄', '둘째 줄']);
assert.strictEqual(V.cacheKey('ko-KR-ANeural', -10, '가'), 'ko-KR-ANeural|-10|가');

// wav 만들기(테스트용 - 24kHz 16bit 모노, Azure riff-24khz-16bit-mono-pcm 과 같은 모양). extra 는 fmt 와 data 사이에 끼울 덩어리
function wav(samples, extra) {
  const ex = extra || Buffer.alloc(0), n = samples.length * 2, b = Buffer.alloc(44 + ex.length + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + ex.length + n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  ex.copy(b, 36);
  b.write('data', 36 + ex.length); b.writeUInt32LE(n, 40 + ex.length);
  samples.forEach((s, i) => b.writeInt16LE(s, 44 + ex.length + i * 2));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}
const a = V.parseWav(wav(new Array(24000).fill(100)));   // 1초
assert.deepStrictEqual([a.rate, a.channels, a.bits, a.pcm.length], [24000, 1, 16, 48000]);
// 다른 덩어리(LIST)가 끼어 있어도 data 를 찾음 · 홀수 크기 덩어리는 한 바이트 채움
const list = Buffer.alloc(8 + 3); list.write('LIST', 0); list.writeUInt32LE(3, 4);
const withList = Buffer.concat([list, Buffer.alloc(1)]);
assert.strictEqual(V.parseWav(wav([1, 2, 3], withList)).pcm.length, 6);
assert.strictEqual(V.parseWav(new ArrayBuffer(8)), null);
// PCM 이 아니면(형식 3 - float) null
const fl = Buffer.from(wav([1])); fl.writeUInt16LE(3, 20);
assert.strictEqual(V.parseWav(fl.buffer.slice(fl.byteOffset, fl.byteOffset + fl.length)), null);
// data 크기가 실제보다 크게 적혀도(스트림 응답) 남은 만큼
const big = Buffer.from(wav([5, 6])); big.writeUInt32LE(0xFFFFFFFF, 40);
assert.strictEqual(V.parseWav(big.buffer.slice(big.byteOffset, big.byteOffset + big.length)).pcm.length, 4);

// 이어 붙이기 - 1초 + 0.5초, 줄 사이 300ms
const b = V.parseWav(wav(new Array(12000).fill(-7)));
const j = V.joinWav([a, b], 300);
assert.deepStrictEqual(j.times.map(t => t.map(x => +x.toFixed(3))), [[0, 1], [1.3, 1.8]]);
const back = V.parseWav(j.wav);
assert.strictEqual(back.pcm.length, 48000 + 300 * 48 + 24000);
const dv = new DataView(j.wav);
assert.strictEqual(dv.getInt16(44, true), 100);                       // 첫 줄
assert.strictEqual(dv.getInt16(44 + 48000 + 10, true), 0);            // 사이는 조용함
assert.strictEqual(dv.getInt16(44 + 48000 + 14400, true), -7);        // 둘째 줄
assert.strictEqual(dv.getUint32(4, true), 36 + back.pcm.length);      // RIFF 크기
assert.strictEqual(V.joinWav([], 300), null);
const other = Buffer.from(wav([1])); other.writeUInt32LE(16000, 24);
assert.strictEqual(V.joinWav([a, V.parseWav(other.buffer.slice(other.byteOffset, other.byteOffset + other.length))], 0), null);   // 모양이 다르면 null

// srt
assert.strictEqual(V.srtTime(3725.4567), '01:02:05,457');
assert.strictEqual(V.srt(['가', '나'], j.times), '1\n00:00:00,000 --> 00:00:01,000\n가\n\n2\n00:00:01,300 --> 00:00:01,800\n나\n');
console.log('voice ok');
