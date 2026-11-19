// 영상 스크립트(tools/drone-quiz/video.js · tools/youtube/endcard.js)가 같이 쓰는 브라우저 띄우기(2026-11-19 PC 부탁).
// playwright 가 없으면 playwright-core(브라우저를 받지 않는 작은 판)로, PW_CHANNEL 이 있으면 그 설치된 브라우저로(예: PW_CHANNEL=msedge - PC 의 Edge).
'use strict';
function launch() {
  let pw;
  try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
  const ch = process.env.PW_CHANNEL;
  return pw.chromium.launch(ch ? { channel: ch } : {});
}
module.exports = { launch };
