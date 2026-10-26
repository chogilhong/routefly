/* 위치기반서비스 이용약관(lbs-terms.html) - 화면 안 스크립트는 CSP 가 막아 파일로. */
(function () {
    // 상호 · 주소 · 전화는 서버 설정(biz.*)에서 - 저장소에 적지 않음(2026-10-26)
    fetch("api/partners").then(function (r) { return r.json(); }).then(function (j) {
        var b = (j && j.biz) || {};
        if (b.name) document.getElementById("bizName").textContent = b.name;
        if (b.address) document.getElementById("bizAddress").textContent = b.address;
        if (b.phone) document.getElementById("bizPhone").innerHTML = '<a href="tel:' + b.phone.replace(/[^0-9+]/g, "") + '">' + b.phone.replace(/[&<>"]/g, "") + '</a>';
    }).catch(function () { /* 준비 중 그대로 */ });
})();
