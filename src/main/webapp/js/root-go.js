/* 사이트 첫 주소(…/routefly/)는 코스 모음(m/)으로(2026-11-01 홍TV님 - 예전엔 따라가기, 2026-10-13). 코스를 받은 주소(#c=…, 도장 · 완주 · 목록의 fly(3D) · 예전 공유 링크)만 이 3D 화면.
 * - 신호가 없으면 따라가기(폰에 저장된 화면 - 코스 모음은 서버가 만드는 화면이라 없을 수 있음)
 * - 따라가기용 꼬리(?q= · ?stillmin= 등 lang 말고)가 붙은 예전 링크는 따라가기 그대로
 * - 영어(?lang=en, 또는 이 기기의 rf-lang 이 en)는 영어 코스 모음(en/m/)
 * 화면을 그리기 전에 넘어가도록 head 맨 앞에서 부름(CSP script-src 'self' 라 따로 둔 파일). 앱 · 홈 화면 아이콘은 hike.html 로 바로 열어 여기를 거치지 않음. */
if (!/[#&]c=/.test(location.hash)) {
    var rfS = location.search, rfLs = "";
    try { rfLs = localStorage.getItem("rf-lang") || ""; } catch (e) { /* 없이 */ }
    var rfEn = /[?&]lang=en\b/.test(rfS) || !/[?&]lang=ko\b/.test(rfS) && rfLs === "en";
    var rfOther = rfS.replace(/[?&]lang=(en|ko)\b/g, "").replace(/^[?&]+/, "");
    if (navigator.onLine === false || rfOther) location.replace("hike.html" + rfS);
    else location.replace((rfEn ? "en/m/" : "m/") + location.hash);
}
