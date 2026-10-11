/*
 * 따라가기(hike.html) <head> 에서 먼저 - 코스 없이 열면 첫 그림부터 코스 고르기(html.picking, 2026-10-11 잔상).
 * 화면 안 스크립트(inline)를 없애 CSP script-src 'self' 로 막을 수 있게 따로 둡니다(2026-10-11 오픈 전 점검).
 */
if (!/[#&]c=/.test(location.hash)) document.documentElement.className += " picking";
