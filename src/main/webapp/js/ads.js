/*
 * 구글 애드센스(2026-10-28 홍TV님) - 산 · 코스 소개 페이지에 서버가 광고 칸(.adBox, 설정이 있을 때만)을 넣었을 때만 애드센스를 부름.
 * 앱(Capacitor 웹뷰) 안에서는 광고 칸을 지움(애드센스는 웹용 - 앱 광고는 정책이 다름). 따라가기 · 산악회 방 화면에는 이 파일을 넣지 않음.
 */
(function () {
    var boxes = document.querySelectorAll(".adBox");
    if (!boxes.length) return;
    if (window.Capacitor) { Array.prototype.forEach.call(boxes, function (b) { b.parentNode.removeChild(b); }); return; }
    var ins = document.querySelector("ins.adsbygoogle"), client = ins && ins.getAttribute("data-ad-client");
    if (!client || !/^ca-pub-\d{10,20}$/.test(client)) return;
    var s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
    s.onerror = function () { Array.prototype.forEach.call(boxes, function (b) { b.style.display = "none"; }); };   // 광고 차단기 · 막힘 - 빈 칸 숨김
    document.head.appendChild(s);
    Array.prototype.forEach.call(document.querySelectorAll("ins.adsbygoogle"), function () {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 이번만 */ }
    });
})();
