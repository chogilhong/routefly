/*
 * 회사 사무실 - 끝난 산행 엑셀(CSV) 내려받기(2026-10-28 홍TV님 추천 1). party-office.html 이 씀. 순수 함수(node 테스트 - course-kit.test.js).
 * 숫자만(이름 · 위치 없음 - 서버가 끝난 산행은 요약만 남김). 엑셀이 한글을 바로 읽게 BOM 을 붙이고,
 * "=" "+" "-" "@" 로 시작하는 칸은 앞에 ' 를 붙여 수식으로 돌지 않게 함(산행 이름 · 취소 사유는 인솔자가 적은 글).
 */
(function (g) {
    var HEAD = ["끝난 날", "끝난 시각", "산행", "출발", "취소", "취소 사유", "끝낸 사람", "회원", "출발 탑승", "안 탐", "하산 탑승", "따로 귀가", "하산 미확인", "SOS"];
    // 영어 사무실 화면(2026-10-29) - 머리 줄 · "취소" · "있었음" 만 영어로(산행 이름 · 사유는 적은 그대로)
    var HEAD_EN = ["Ended date", "Ended time", "Hike", "Departure", "Cancelled", "Cancel reason", "Ended by", "Members", "Boarded", "Not on bus", "Back on bus", "Home separately", "Descent unconfirmed", "SOS"];
    function kst(ms) {
        if (!ms) return ["", ""];
        var d = new Date(ms + 9 * 3600000), p = function (n) { return ("0" + n).slice(-2); };
        return [d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()), p(d.getUTCHours()) + ":" + p(d.getUTCMinutes())];
    }
    function cell(v) {
        var s = v == null ? "" : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\n\r]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
    }
    /** ended - office/rooms 의 ended, en - 영어 화면. → CSV 글(BOM · CRLF). */
    function officeCsv(ended, en) {
        var rows = [en ? HEAD_EN : HEAD];
        (ended || []).forEach(function (r) {
            var e = kst(r.endedAt), dep = kst(r.departAt);
            rows.push([e[0], e[1], r.name, dep[0] ? dep[0] + " " + dep[1] : "", r.cancelled ? (en ? "Cancelled" : "취소") : "", r.why || "", r.by || "",
                r.hikers || 0, r.boarded || 0, r.notBoarded || 0, r.departed ? r.aboard || 0 : "", r.departed ? r.apart || 0 : "",
                r.cancelled || !r.departed ? "" : r.notDown || 0, r.sosEver ? (en ? "Yes" : "있었음") : ""]);
        });
        return "﻿" + rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n") + "\r\n";
    }
    g.RFOfficeCsv = { officeCsv: officeCsv };
})(typeof window !== "undefined" ? window : this);
