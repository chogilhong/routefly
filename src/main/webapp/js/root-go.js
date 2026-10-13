/* 사이트 첫 주소(…/routefly/)는 따라가기 화면으로(2026-10-13 홍TV님). 코스를 받은 주소(#c=…, 도장 · 완주 · 목록의 fly(3D) · 예전 공유 링크)만 이 3D 화면.
 * 화면을 그리기 전에 넘어가도록 head 맨 앞에서 부름(CSP script-src 'self' 라 따로 둔 파일). */
if (!/[#&]c=/.test(location.hash)) location.replace("hike.html" + location.search);
