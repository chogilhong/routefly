/*
 * course-kit.js 순수 함수 테스트 - 브라우저 없이 node 로 돕니다(DOMParser 가 필요한 gpxToApi 는 HikeScreenTest 의 화면 테스트가 봅니다).
 * 실행: node src/test/js/course-kit.test.js  (CourseKitJsTest 가 node 가 있으면 함께 돌립니다)
 * 실패하면 무엇이 틀렸는지 찍고 종료 코드 1.
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");

var sandbox = { window: {}, console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../main/webapp/js/course-kit.js"), "utf8"), sandbox);
var RF = sandbox.window.RF;

var fails = 0, runs = 0;
function eq(name, got, want) {
    runs++;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        fails++;
        console.log("FAIL " + name + ": " + JSON.stringify(got) + " (기대 " + JSON.stringify(want) + ")");
    }
}
function near(name, got, want, tol) {
    runs++;
    if (!(Math.abs(got - want) <= tol)) {
        fails++;
        console.log("FAIL " + name + ": " + got + " (기대 " + want + " ± " + tol + ")");
    }
}

/** 북쪽으로 곧게 n 점(점 사이 약 111m), 고도는 0, 10, 20 … */
function line(n) {
    var j = { course: { name: "가 → 나", kind: "hike" }, points: [], pois: [] };
    for (var i = 0; i < n; i++) j.points.push([127, 37 + i * 0.001, i * 10, 0]);
    for (var k = 1; k < n; k++) j.points[k][3] = j.points[k - 1][3] + RF.distM(37 + (k - 1) * 0.001, 127, 37 + k * 0.001, 127);
    return j;
}

// distM - 위도 0.001° ≈ 111m
near("distM", RF.distM(37, 127, 37.001, 127), 111, 1);

// 비법정탐방로(공단 "비매칭코스")
eq("비매칭코스는 비법정", RF.isClosedTrail("북한산 · 비매칭코스"), true);
eq("보통 탐방로", RF.isClosedTrail("북한산 · 구기분소 → 대남문"), false);

// 학교 아이콘 - 목포대는 대학, 비선대 · 문장대는 바위
eq("목포대", RF.poiIcon("목포대"), "🏫");
eq("목포대학교", RF.poiIcon("목포대학교"), "🏫");
eq("비선대", RF.poiIcon("비선대"), "🗻");
eq("문장대", RF.poiIcon("문장대"), "🗻");

// 기계가 붙인 번호 이름(GPX-726)은 이름표가 아님(서해랑길 20코스)
(function () {
    var j = line(3);
    j.pois = [{ name: "GPX-726", lat: 37.001, lon: 127, dist_m: 100 }, { name: "WPT012", lat: 37.002, lon: 127, dist_m: 200 },
              { name: "대청봉", lat: 37.002, lon: 127, dist_m: 200 }];
    var c = RF.fromApi("drnb-1", j);
    eq("번호 이름 뺌", c.pois.map(function (q) { return q.name; }).filter(function (n) { return /GPX|WPT/.test(n); }).length, 0);
    eq("진짜 이름은 남음", c.pois.some(function (q) { return q.name === "대청봉"; }), true);
    var k = line(3);
    k.course = { name: "서해랑길 50코스 · 문화공원11(부안공원) → 동진대교" };
    k.pois = [{ name: "문화공원11(부안공원)", lat: 37, lon: 127, dist_m: 0 }, { name: "월출산(천황봉)", lat: 37.001, lon: 127, dist_m: 100 }];
    var c2 = RF.fromApi("drnb-50", k);
    eq("번호 붙은 공원 이름", c2.course.name, "서해랑길 50코스 · 부안공원 → 동진대교");
    var k3 = line(3);
    k3.pois = [{ name: "551계단 551 Stairs", lat: 37.001, lon: 127, dist_m: 100 }];
    eq("뒤에 또 붙은 번호", RF.fromApi("x", k3).pois.some(function (q) { return q.name === "551계단"; }), true);
    var k4 = line(3);
    k4.pois = [{ name: "안부1 (Anbu 1)", lat: 37.001, lon: 127, dist_m: 100 }];
    eq("안부 번호 뗌", RF.fromApi("x", k4).pois.some(function (q) { return q.name === "안부"; }), true);
    eq("공원 뒤 번호", RF.nameText("서해랑길 16코스 · 수변공원49까지"), "[서해랑길 16코스] 수변공원까지");
    eq("이름표도", c2.pois.map(function (q) { return q.name; }).join(","), "부안공원,월출산(천황봉),동진대교");
})();

// 국립공원 위치표지판 - 지금 자리에서 가장 가까운 것(500m 안)
(function () {
    var j = line(3);
    j.signs = [{ loc_no: "지리10-05", place_name: "백무동매표소 시발 2.5km (참샘)", lat: 37.001, lon: 127 },
               { loc_no: "지리10-06", place_name: null, lat: 37.004, lon: 127 }];
    var c = RF.fromApi("knps-1", j);
    var ns = RF.nearSign(c, 37.0012, 127);
    eq("가까운 표지", ns.sign.loc_no, "지리10-05");
    near("표지 거리", ns.m, 22, 1);
    eq("표지 글", RF.signText(ns), "지리10-05 · 22m (백무동매표소 시발 2.5km (참샘))");
    eq("바로 옆", RF.signText(RF.nearSign(c, 37.004, 127)), "지리10-06 · 바로 옆");
    eq("500m 넘으면 없음", RF.nearSign(c, 37.02, 127), null);
    eq("표지 없는 코스", RF.nearSign(RF.fromApi("x", line(2)), 37, 127), null);
    eq("빈 글", RF.signText(null), "");
})();

// 국립공원 위험지역 · 조망점 - 앞 120m 위험 알림 한 번, 조망점은 지날 때, SOS 는 가까운 구급함 · 헬기장
(function () {
    var j = line(11);   // 약 1.1km
    j.spots = [{ kind: "danger", name: "낙석주의", info: "낙석주의", lat: 37.005, lon: 127, dist_m: 555 },
               { kind: "danger", name: "미끄럼주의", info: "추락주의", lat: 37.008, lon: 127, dist_m: 888 },
               { kind: "view", name: "제석봉 조망점", view_az: 255, view_m: 706, lat: 37.003, lon: 127, dist_m: 333 },
               { kind: "aid", name: "산악구급함", lat: 37.002, lon: 127.001, dist_m: 222 },
               { kind: "heli", name: "헬기장", lat: 37.009, lon: 127.002, dist_m: 999 }];
    var c = RF.fromApi("knps-1", j), done = {};
    eq("멀면 없음", RF.dangerAhead(c, 300, 120, done), null);
    var s = RF.dangerAhead(c, 450, 120, done);
    eq("120m 앞 낙석", s && s.name, "낙석주의");
    done[RF.spotKey(s)] = true;
    eq("알린 뒤에는 다음 것 전까지 없음", RF.dangerAhead(c, 460, 120, done), null);
    eq("다음 위험", RF.dangerAhead(c, 800, 120, done).name, "미끄럼주의");
    eq("빨리 가서 지나쳤어도 남음(부르는 쪽이 넘김)", RF.dangerAhead(c, 1000, 120, {}, 0).name, "낙석주의");
    eq("걷기 시작한 곳 앞은 뺌", RF.dangerAhead(c, 1000, 120, {}, 700).name, "미끄럼주의");
    eq("위험 글 - 이름과 종류가 다르면 함께", RF.spotText(c.spots[1]), "미끄럼주의(추락주의)");
    eq("위험 글", RF.spotText(c.spots[0]), "낙석주의");
    eq("조망점 지날 때", RF.viewAt(c, 320, {}).name, "제석봉 조망점");
    eq("조망점 멀면 없음", RF.viewAt(c, 250, {}), null);
    eq("조망점 지나친 것", RF.viewAt(c, 900, {}, 0).name, "제석봉 조망점");
    eq("표지 거리 10m 단위", RF.signText({ sign: { loc_no: "송추44-05" }, m: 487 }), "송추44-05 · 490m");
    eq("조망 글", RF.spotText(c.spots[2]), "제석봉 조망점 · 서쪽 0.71km");
    eq("방위", [RF.azWord(0), RF.azWord(171), RF.azWord(359), RF.azWord(null)], ["북", "남", "북", ""]);
    eq("가까운 구급함", RF.nearSpot(c, "aid", 37.002, 127.001).spot.name, "산악구급함");
    eq("헬기장", RF.nearSpot(c, "heli", 37.0, 127.0).spot.name, "헬기장");
    eq("2km 넘으면 없음", RF.nearSpot(c, "heli", 37.05, 127.0), null);
    eq("아이콘", RF.spotIcon("danger"), "⚠️");
    eq("미리보기 요약", RF.spotSummary(c.spots), "⚠️ 위험 2곳 · 🔭 조망점 1곳");
    eq("요약 없음", RF.spotSummary(null), "");
    eq("공원 - 공단 코스", RF.parkOf("지리산 · 백무동 → 천왕봉"), "지리산");
    eq("공원 - 자락", RF.parkOf("지리산 자락 21코스 · 운리 → 무명폭포"), "지리산");
    eq("공원 - 괄호", RF.parkOf("지리산(천왕봉) 1코스"), "지리산");
    // 트립닷컴 들머리 근처 숙소 링크(2026-10-28) - 제휴 꼬리는 그대로, 검색 칸은 우리 것으로
    // 산악회 방 알림(2026-10-28) - 인솔자 SOS · 앱 회원 10분 소식 없음 · 하산 마감 60/30분 전, 회원 하산 마감
    (function () {
        var D = 1760000000000, E = D + 8 * 3600000;
        var lead = { role: "lead", now: D + 5 * 60000, departed: true, departedAt: D, endAt: E, members: [
            { id: 1, role: "hiker", nick: "철수", app: true, seen: 900 }, { id: 2, role: "hiker", nick: "영희", seen: 900 },
            { id: 3, role: "hiker", nick: "민수", sos: true }, { id: 4, role: "hiker", nick: "명단", app: true, listed: true }, { id: 5, role: "hiker", nick: "탄사람", aboard: true, sos: true }] };
        var r1 = RF.partyAlerts(lead, {});
        eq("알림 - SOS 만(산행 시작 5분 - 아직 소식 없음 안 셈, 하산 탑승한 SOS 는 빼고)", r1.msgs.join("|"), "🆘 SOS - 민수 님");
        lead.now = D + 20 * 60000;
        var r2 = RF.partyAlerts(lead, r1.fired);
        eq("알림 - 앱 회원만 10분 소식 없음(웹 · 폰 없는 명단 빼고), SOS 는 다시 안 울림", r2.msgs.join("|"), "📵 철수 님 10분 넘게 소식 없음");
        lead.members[2].sos = false; lead.members[0].seen = 30;
        var r3 = RF.partyAlerts(lead, r2.fired);
        eq("알림 - 풀리면 지움(다시 울릴 수 있게)", [r3.msgs.length, !!r3.fired.sos3, !!r3.fired.quiet1].join(), "0,false,false");
        lead.members[2].sos = true;
        eq("알림 - 다시 SOS 면 다시", RF.partyAlerts(lead, r3.fired).msgs.join("|"), "🆘 SOS - 민수 님");
        lead.now = E - 50 * 60000;
        eq("알림 - 하산 마감 60분 전 미하산 인원(사무실 자리 · 탄 사람 빼고)", RF.partyAlerts(lead, r3.fired).msgs.filter(function (m) { return m.indexOf("⏰") === 0; }).join("|"), "⏰ 하산 마감 01:53 (50분 남음) - 아직 4명 하산 전");
        eq("알림 - 사무실 자리는 울리지 않음", RF.partyAlerts({ role: "lead", officeMe: true, now: lead.now, departed: true, endAt: E, members: lead.members }, {}).msgs.length, 0);
        var me = { role: "hiker", now: E - 20 * 60000, departed: true, endAt: E };
        eq("알림 - 회원 하산 마감 30분 안에 처음 보면 하나 · 실제 남은 분", RF.partyAlerts(me, {}).msgs.join("|"), "⏰ 하산 마감 01:53 - 20분 남았습니다. 버스로 내려와 주세요.");
        me.now = E - 45 * 60000;
        var m1 = RF.partyAlerts(me, {});
        eq("알림 - 45분 남음(60분 칸)", m1.msgs.join("|"), "⏰ 하산 마감 01:53 - 45분 남았습니다. 버스로 내려와 주세요.");
        me.now = E - 25 * 60000;
        eq("알림 - 30분 칸은 따로 한 번 더", RF.partyAlerts(me, m1.fired).msgs.join("|"), "⏰ 하산 마감 01:53 - 25분 남았습니다. 버스로 내려와 주세요.");
        // 하산 탑승지마다(2026-10-28 일정표 - 설악동 17:00 · 남교리 17:35)
        var P1 = E - 35 * 60000, P2 = E;
        var pk = { role: "lead", now: P1 - 40 * 60000, departed: true, departedAt: D, endAt: E, pickupAt: { "설악동": P1, "남교리": P2 }, members: [
            { id: 1, role: "hiker", nick: "가", pickup: "설악동" }, { id: 2, role: "hiker", nick: "나", pickup: "설악동" }, { id: 3, role: "hiker", nick: "다", pickup: "남교리" }] };
        eq("알림 - 인솔자 하산 탑승지마다", RF.partyAlerts(pk, {}).msgs.join("|"), "⏰ 설악동 하산 탑승 01:18 (40분 남음) - 아직 2명 하산 전");   // 남교리는 75분 남아 아직
        eq("알림 - 회원 내 하산 탑승지 시각으로", RF.partyAlerts({ role: "hiker", now: P1 - 20 * 60000, departed: true, endAt: E, myEndAt: P1, pickup: "설악동", pickupAt: { "설악동": P1 } }, {}).msgs.join("|"), "⏰ 설악동 하산 탑승 01:18 - 20분 남았습니다. 하산 탑승지(설악동)로 내려와 주세요.");
        // 시각 없는 하산 탑승지 - 방 하산 마감을 그곳 시각으로 적지 않음(2026-10-28 버그 점검)
        eq("알림 - 시각 없는 하산 탑승지는 하산 마감", RF.partyAlerts({ role: "hiker", now: E - 20 * 60000, departed: true, endAt: E, myEndAt: E, pickup: "용대리", pickupAt: { "설악동": P1 } }, {}).msgs.join("|"), "⏰ 하산 마감 01:53 - 20분 남았습니다. 버스로 내려와 주세요.");
        var bus = { role: "hiker", now: D, arrive: { drop: "한계령", at: D } };
        var b1 = RF.partyAlerts(bus, {});
        eq("알림 - 하차 안내 한 번", [b1.msgs.join("|"), RF.partyAlerts(bus, b1.fired).msgs.length].join(), "⬇ 지금 한계령입니다. 여기서 내리시면 \"여기서 내려요\"를 눌러 주세요.,0");
        eq("알림 - 회원 하산 탑승하면 없음", RF.partyAlerts({ role: "hiker", now: me.now, departed: true, endAt: E, aboard: true }, {}).msgs.length, 0);
    })();
    // 국립공원 스탬프투어 인증지(2026-10-28)
    (function () {
        var st = [{ park: "시험", name: "가까운 센터", lat: 38.0010, lon: 128.0 }, { park: "시험", name: "먼센터", lat: 38.05, lon: 128.0 }, { park: "시험", name: "좌표없음" }];
        var c = { lat: [38.0, 38.0005, 38.002], lon: [128.001, 128.001, 128.001] };
        eq("스탬프 - 코스 300m 안만", RF.npStampsOn(st, c, 300).map(function (x) { return x.s.name; }).join(), "가까운 센터");
        eq("스탬프 - 키(빈칸 뺌)", RF.npStampKey(st[0]), "시험|가까운센터");
        eq("스탬프 - 100m 안 · 안 다녀간 것", RF.npStampsDue(st, 38.0011, 128.0, {}, 100).length, 1);
        eq("스탬프 - 다녀갔으면 없음", RF.npStampsDue(st, 38.0011, 128.0, { "시험|가까운센터": {} }, 100).length, 0);
    })();
    // 옛 기록 카드 바로잡기(2026-10-28 PC - 10-23 지리산 기록: 튄 점 직선 왕복 · 끊김 · 1,950m)
    (function () {
        var T0 = 1760000000000, tr = [];
        for (var i = 0; i < 10; i++) tr.push([35.30 + i * 0.0003, 127.70, T0 + i * 30000, 1000 + i * 10]);   // 30초에 33m - 걷기
        tr.splice(5, 0, [35.40, 127.80, T0 + 4 * 30000 + 5000, 1990], [35.4001, 127.8001, T0 + 4 * 30000 + 8000, 1995]);   // 5초 만에 14km 튄 점 둘(이어짐)
        var cl = RF.cleanTrack(tr, false);
        eq("튐 - 나갔다 돌아온 점 둘 뺌", [cl.length, cl.some(function (p) { return p[0] > 35.39; })].join(), "10,false");
        var gap = tr.filter(function (p) { return p[0] < 35.39; }).concat([[35.32, 127.70, T0 + 30 * 60000, 1300]]);   // 화면 꺼짐 - 27분 뒤 2km 너머
        eq("끊김 - 걸을 만한 빠르기면 남김", RF.cleanTrack(gap, false).length, 11);
        // 첫 점이 튐(옛 · 기지국 위치, 2026-10-28 버그 점검)
        var first = [[35.32, 127.70, T0 - 5000, 1000]].concat(tr.filter(function (p) { return p[0] < 35.39; }));
        eq("튐 - 첫 점도 뺌", RF.cleanTrack(first, false).length, 10);
        eq("튐 - 걸어 온 첫 점은 남김", RF.cleanTrack(tr.filter(function (p) { return p[0] < 35.39; }), false).length, 10);
        var rc = RF.recordCourse({ name: "x", kind: "hike", track: gap });
        eq("끊김 - 점선 표시(마지막 구간만)", rc.gap.filter(Boolean).length + ":" + rc.gap[rc.gap.length - 1], "1:true");
        var fc = RF.recordLines(rc);
        eq("지도 - 실선 하나 + 점선 하나(끊긴 구간)", fc.features.map(function (f) { return (f.properties.gap ? "점선" : "실선") + f.geometry.coordinates.length; }).join(","), "실선" + (rc.lat.length - 1) + ",점선2");
        eq("지도 - 끊김 없으면 실선 하나", RF.recordLines({ lat: [1, 2, 3], lon: [1, 2, 3], gap: [false, false, false] }).features.length, 1);
        var spikeEle = { lat: [35.33, 35.331, 35.332, 35.333, 35.334], lon: [127.7, 127.7, 127.7, 127.7, 127.7], ele: [1900, 1902, 1990, 1904, 1903] };
        eq("가장 높은 곳 - 한 점 튐(1,990)은 가운뎃값으로", RF.recordHighest(spikeEle, [], null), 1904);
        eq("가장 높은 곳 - 정상 200m 안이면 공식 높이", RF.recordHighest(spikeEle, [{ id: "지리산", lat: 35.3321, lon: 127.7 }], { "지리산": 1915 }), 1915);
    })();
    // 합계도 같은 거리(2026-10-28 PC): 걸은 거리와 코스 진행 가운데 큰 값, 옛 요약은 합칠 때 큰 값으로
    eq("거리 - 큰 값", RF.recDist({ walked: 3000, done: 5800 }), 5800);
    eq("합계 - 큰 값으로 더함", RF.recordStats([{ start: 1, end: 2, walked: 3000, done: 5800 }, { start: 3, end: 4, walked: 3000 }]).walked, 8800);
    eq("요약 - 옛 것(3000)을 새 것(5800)으로", RF.mergeLog([{ start: 1, courseId: "a", walked: 3000 }], [{ start: 1, courseId: "a", walked: 5800 }])[0].walked, 5800);
    eq("결산 - 직접 지운 산행만 뺌", RF.dropLog([{ start: 1, courseId: "a" }, { start: 2, courseId: "a" }, { start: 1, courseId: "b" }], { start: 1, courseId: "a" }).map(function (e) { return e.start + e.courseId; }).join(), "2a,1b");
    eq("트립 - 들머리", RF.tripLink("https://kr.trip.com/?Allianceid=1&SID=2&trip_sub1=routefly&curr=KRW&locale=ko-KR", 35.3070131, 127.6136087, "지리산 중산리"),
        "https://kr.trip.com/hotels/list?cityId=0&searchType=LM&searchWord=%EC%A7%80%EB%A6%AC%EC%82%B0%20%EC%A4%91%EC%82%B0%EB%A6%AC&searchValue=13%7C0*13*35.307013%7C127.613609%7C%EC%A7%80%EB%A6%AC%EC%82%B0%20%EC%A4%91%EC%82%B0%EB%A6%AC%7C0%7C1&listFilters=17~5*17*5&Allianceid=1&SID=2&trip_sub1=routefly&curr=KRW&locale=ko-KR");
    eq("트립 - 옛 검색 칸은 버림 · ? 앞 / 없어도", RF.tripLink("https://kr.trip.com?Allianceid=1&city=88097&checkIn=2026-10-28&lat=1&listFilters=x", 38.17, 128.49, "설악산|소공원").indexOf("city=88097") < 0 && RF.tripLink("https://kr.trip.com?listFilters=x", 1, 2, "a").indexOf("listFilters=x") < 0 && RF.tripLink("https://kr.trip.com?Allianceid=1", 38.17, 128.49, "a").indexOf("Allianceid=1") > 0, true);
    eq("트립 - 이름의 | 는 빈칸", RF.tripLink("https://kr.trip.com/?a=1", 38.17, 128.49, "설악산|소공원").indexOf("%7C%EC%84%A4%EC%95%85%EC%82%B0%20%EC%86%8C%EA%B3%B5%EC%9B%90%7C") > 0, true);
    eq("트립 - trip.com 이 아니면 null", [RF.tripLink("https://www.agoda.com/x", 1, 2, "a"), RF.tripLink("https://kr.trip.com.evil.kr/x", 1, 2, "a"), RF.tripLink("https://kr.trip.com/", NaN, 2, "a")], [null, null, null]);
    eq("공원 - 다른 산", RF.parkOf("지리봉 1코스"), null);
    eq("공원 - 한려해상", RF.parkOf("한려해상 · 금산 → 쌍홍문"), "한려해상");
    eq("공원 - 없음", RF.parkOf(null), null);
    eq("산 - 도립공원", RF.mountainOf("모악산 · 화율봉 → 모악산"), "모악산");
    eq("산 - 자락", RF.mountainOf("마이산 자락 2코스 · 마이산 북부주차장에서"), "마이산");
    eq("산 - 괄호", RF.mountainOf("대둔산(마천대) 1코스"), "대둔산");
    eq("산 - 아님", RF.mountainOf("한강 자전거길 · 여의도에서"), null);
    eq("산림청 - 시 · 군 앞말", RF.mountainOf("김제 모악산 · 금산사 → 모악산", "frst-123-4"), "모악산");
    eq("산림청 - 시 이름이 산으로 끝남", RF.mountainOf("논산 대둔산 마천대 · 수락 → 마천대", "frst-1-2"), "대둔산");
    eq("산림청 - 경산 팔공산", RF.mountainOf("경산 팔공산 비로봉 · 갓바위 → 비로봉", "frst-9-1"), "팔공산");
    eq("산림청 - 시 · 읍면 · 산", RF.mountainOf("서산 덕산 가야산 · 상가리 → 가야봉", "frst-5-1"), "가야산");
    eq("산림청 - 봉우리만", RF.mountainOf("양평 용문봉 · 용문사 → 용문봉", "frst-6-1"), "용문봉");
    eq("봉우리 코스는 앞 낱말 그대로", RF.mountainOf("백운산 박달봉 2코스 · 흥룡사 → 박달봉", "kmp-1311010219-2"), "백운산");
    eq("팔공산은 국립공원(2023)", RF.parkOf("팔공산 · 동화사 → 비로봉"), "팔공산");
    eq("영어 이름 뺌", [RF.cleanName("피아골 대피소 Piagol Shelter"), RF.cleanName("Seoraksan"), RF.cleanName("K2 봉"), RF.cleanName("안부1 (Anbu 1)"), RF.cleanName("두륜산 (가련봉)")],
        ["피아골대피소", "Seoraksan", "K2 봉", "안부1", "두륜산 (가련봉)"]);
    eq("시 · 구가 둘 이상 · 오름 · 고지", [RF.mountainOf("인천 영종 국사봉 · 서쪽 들머리 → 국사봉", "frst-281100501-707681"),
        RF.mountainOf("전남광주통합 동구 깃대봉 · 증심사지구탐방지원센터 → 깃대봉 정상", "frst-291100401-387bca"),
        RF.mountainOf("제주 민오름 · 주차장 → 민오름", "frst-491104904-044e90"), RF.mountainOf("100고지 · 가을 → 100고지 정상", "frst-287201304-c23fa6"),
        RF.mountainOf("금호남정맥 · 군하 → 숫마이산", "frst-457200104-4d6317"), RF.mountainOf("금강으로가는하늘숲길 · 배봉 → 정상", "frst-428204704-63cbc5"),
        RF.mountainOf("논산 대둔산 마천대 · 수락 → 마천대", "frst-1-a"), RF.mountainOf("서산 덕산 가야산 · 상가리 → 가야봉", "frst-5-1")],
        ["국사봉", "깃대봉", "민오름", "100고지", null, null, "대둔산", "가야산"]);
    eq("숫자로 시작하는 산", RF.mountainOf("157고지우송대뒷산 · 주차장 → 157고지우송대뒷산 정상", "frst-301105804-12cb69"), "157고지우송대뒷산");
    // 인증센터 도장 · 완주
    eq("도장 열쇠", [RF.stampKey("섬진강댐인증센터"), RF.stampKey("배알도 수변공원 인증센터"), RF.stampKey("장군목")], ["섬진강댐", "배알도수변공원", "장군목"]);
    var sc = { pois: [{ name: "섬진강댐인증센터", lat: 35.5207, lon: 127.1495 }, { name: "장군목인증센터", lat: 35.4605, lon: 127.2014 }, { name: "망월", lat: 35.52, lon: 127.15 }] };
    eq("100m 안 인증센터", RF.stampsDue(sc, 35.5210, 127.1497, {}).map(function (p) { return p.name; }), ["섬진강댐인증센터"]);
    eq("이미 찍음", RF.stampsDue(sc, 35.5210, 127.1497, { "섬진강댐": 1 }).length, 0);
    eq("멀면 없음", RF.stampsDue(sc, 35.50, 127.15, {}).length, 0);
    eq("완주 90%", [RF.isComplete(9000, 10000), RF.isComplete(8999, 10000), RF.isComplete(5, 0)], [true, false, false]);
    var sj = { prefix: "osmb-6374513-", centers: ["섬진강댐", "장군목", "향가유원지"] };
    eq("자전거길 진행", RF.seriesProgress(sj, { "섬진강댐": 1, "장군목": 1, "여의도": 1 }, {}), { got: 2, of: 3 });
    var jiri = ["가탄-송정", "금계-동강", "대축-원부춘", "덕산-위태", "동강-수철", "방광-산동", "산동-주천", "삼화실-대축", "성심원-운리", "송정-오미", "수철-성심원",
        "오미-난동", "오미-방광", "운리-덕산", "운봉-인월", "원부춘-가탄", "위태-하동호", "인월-금계", "주천-운봉", "하동읍-서당", "하동호-삼화실"]
        .map(function (n) { return { name: "지리산둘레길 " + n }; });
    eq("지리산둘레길 걷는 차례", RF.chainOrder(jiri, "주천").map(function (c) { return c.name.split(" ")[1]; }),
        ["주천-운봉", "운봉-인월", "인월-금계", "금계-동강", "동강-수철", "수철-성심원", "성심원-운리", "운리-덕산", "덕산-위태", "위태-하동호", "하동호-삼화실",
         "삼화실-대축", "대축-원부춘", "원부춘-가탄", "가탄-송정", "송정-오미", "오미-방광", "방광-산동", "산동-주천", "오미-난동", "하동읍-서당"]);
    // 동해안(강원): 1~4 는 남 → 북, 끊긴 묶음 5(고포 → 오분동)는 1 앞
    var seg = function (id, a, b) { return { course_id: id, start_lat: a, start_lon: 129.1, end_lat: b, end_lon: 129.1 }; };
    var gw = [seg("1", 37.55, 37.69), seg("2", 37.69, 38.07), seg("3", 38.07, 38.21), seg("4", 38.21, 38.55), seg("5", 37.12, 37.52)];
    eq("동해안 땅 위 차례", RF.geoOrder(gw).map(function (c) { return c.course_id; }), ["5", "1", "2", "3", "4"]);
    eq("한 바퀴면 그대로", RF.geoOrder([seg("a", 33.5, 33.3), seg("b", 33.3, 33.5)]).map(function (c) { return c.course_id; }), ["a", "b"]);
    eq("좌표가 없으면 그대로", RF.geoOrder([{ course_id: "x" }, { course_id: "y" }]).map(function (c) { return c.course_id; }), ["x", "y"]);
    eq("시작점이 없으면 그대로", RF.chainOrder(jiri.slice(0, 3), "없는곳").length, 3);
    var gwStamps = {};
    gwStamps[RF.stampKey("통일전망대(민통선내)인증센터")] = { t: 1 };
    gwStamps[RF.stampKey("삼척임원무인인증센터")] = { t: 2 };
    eq("긴 공식 이름도 맞음", RF.seriesProgress({ centers: ["통일전망대", "임원", "망상해변"] }, gwStamps, {}), { got: 2, of: 3 });
    eq("없으면 null", RF.stampOf(gwStamps, "망상해변"), null);
    // 위치를 서버로 보내지 않기 - 고정 격자 칸만
    eq("격자로 넓힘", RF.snapOut([127.731, 35.312, 127.821, 35.402]), [127.7, 35.3, 127.9, 35.5]);
    eq("이미 경계면 그대로", RF.snapOut([127.7, 35.3, 127.8, 35.4]), [127.7, 35.3, 127.8, 35.4]);
    eq("격자 칸 넷", RF.gridCells([127.731, 35.312, 127.821, 35.402]), [[127.7, 35.3, 127.8, 35.4], [127.7, 35.4, 127.8, 35.5], [127.8, 35.3, 127.9, 35.4], [127.8, 35.4, 127.9, 35.5]]);
    eq("같은 칸 안의 두 사람은 같은 요청", JSON.stringify(RF.gridCells([127.71, 35.31, 127.72, 35.32])) === JSON.stringify(RF.gridCells([127.78, 35.38, 127.79, 35.39])), true);
    eq("주소 풀기", RF.safeDecode("%EC%A7%80%EB%A6%AC%EC%82%B0"), "지리산");
    eq("깨진 주소는 null(화면이 멈추지 않게)", RF.safeDecode("%E0"), null);
    // 코리아둘레길 - 이름으로 찾은 코스를 길마다 · 번호 순으로, 완주는 받아 온 ID 로
    var hp = [{ course_id: "drnb-a", name: "해파랑길 10코스 · 가 → 나" }, { course_id: "drnb-b", name: "해파랑길 2코스 · 다 → 라" },
              { course_id: "drnb-c", name: "남파랑길 1코스" }, { course_id: "drnb-d", name: "해파랑길 1코스 · 오륙도해맞이공원 → 해운대해수욕장" }];
    eq("해파랑길만 번호 순", RF.trailCourses(hp, "해파랑길").map(function (c) { return c.course_id; }), ["drnb-d", "drnb-b", "drnb-a"]);
    eq("19-1코스는 19 와 20 사이", RF.trailCourses([{ course_id: "b", name: "DMZ 평화의 길 20코스" }, { course_id: "a", name: "DMZ 평화의 길 19-1코스(우회로) · 승라부대까지" },
        { course_id: "c", name: "DMZ 평화의 길 1코스" }, { course_id: "d", name: "DMZ 평화의 길 19코스" }], "DMZ평화의길").map(function (c) { return c.course_id; }), ["c", "d", "a", "b"]);
    eq("띄어쓰기 무시", RF.trailCourses([{ course_id: "x", name: "DMZ 평화의 길 3코스" }], "DMZ평화의길").length, 1);
    eq("받아 온 ID 로 완주 셈", RF.seriesProgress({ ids: ["drnb-a", "drnb-b", "drnb-d"] }, {}, { "drnb-b": 1, "drnb-c": 1 }), { got: 1, of: 3 });
    // 100대 명산 - 정상 도장(코스와 상관없이, 같은 이름 산은 id 로 가름)
    var pk = [{ id: "m-a", name: "백운산", lat: 35.1, lon: 127.6 }, { id: "m-b", name: "백운산", lat: 37.9, lon: 127.4 }, { name: "지리산", lat: 35.3369, lon: 127.7306 }, { name: "좌표 없음" }];
    eq("정상 열쇠", [RF.peakKey(pk[0]), RF.peakKey(pk[2]), RF.peakKey(null)], ["m-a", "지리산", ""]);
    eq("150m 안 정상", RF.peaksDue(pk, 35.3375, 127.7310, {}).map(RF.peakKey), ["지리산"]);
    eq("이미 찍은 정상", RF.peaksDue(pk, 35.3375, 127.7310, { "지리산": 1 }).length, 0);
    eq("같은 이름 다른 산", RF.peaksDue(pk, 35.1003, 127.6, { "m-b": 1 }).map(RF.peakKey), ["m-a"]);
    eq("멀면 없음 · 좌표 없음은 빼고", RF.peaksDue(pk, 36, 127, {}).length, 0);
    eq("명산 진행", RF.seriesProgress({ peaks: pk }, { "지리산": 1 }, {}, { "m-b": 1, "지리산": 1 }), { got: 2, of: 4 });
    var pc = [{ course_id: "far", end_lat: 37.9, end_lon: 127.4, start_lat: 37.85, start_lon: 127.4 },      // 포천 백운산
              { course_id: "b", end_lat: 35.1080, end_lon: 127.6, start_lat: 35.08, start_lon: 127.58 },    // 광양 백운산 정상 900m 앞
              { course_id: "a", end_lat: 35.1003, end_lon: 127.6, start_lat: 35.07, start_lon: 127.57 },
              { course_id: "down", start_lat: 35.1001, start_lon: 127.6 }, { course_id: "nocoord" }];
    eq("정상까지 가는 코스만 가까운 차례", RF.peakCourses(pc, pk[0]).map(function (c) { return c.course_id; }), ["down", "a", "b"]);
    eq("멀면 없음", RF.peakCourses(pc, { lat: 34, lon: 126 }).length, 0);
    // 인증센터마다 따라갈 구간 - 이름표(구간 시작에서 거리)로: 출발 · 구간 안이면 그 구간, 도착만이면(마지막 센터) 그 구간
    var nk = [{ course_id: "n8", name: "낙동강 자전거길 8구간 · 상주상풍교인증센터 → 구미보인증센터", distance_m: 50000 },
              { course_id: "n9", name: "낙동강 자전거길 9구간 · 상주보인증센터 → 섬마을", distance_m: 40000 },
              { course_id: "n10", name: "낙동강 자전거길 10구간 · 구미보인증센터 → 하구둑인증센터", distance_m: 60000 }];
    var mk = [{ course_id: "n8", name: "상주상풍교인증센터", dist_m: 0 }, { course_id: "n8", name: "낙단보인증센터", dist_m: 20000 },
              { course_id: "n8", name: "구미보인증센터", dist_m: 49900 }, { course_id: "n9", name: "상주보인증센터", dist_m: 0 },
              { course_id: "n10", name: "구미보인증센터", dist_m: 0 }, { course_id: "n10", name: "낙동강하구둑인증센터", dist_m: 59800 }];
    eq("센터마다 구간(이름표)", RF.centerCourses(nk, ["상주보", "상주상풍교", "낙단보", "구미보", "낙동강하구둑", "없는곳"], mk).map(function (c) { return c && c.course_id; }),
        ["n9", "n8", "n8", "n10", "n10", null]);
    // 이름표가 없으면 구간 이름의 출발 → 도착
    var sjc = [{ course_id: "s1", name: "섬진강 자전거길 1구간 · 섬진강댐인증센터 → 향가유원지인증센터" },
               { course_id: "s2", name: "섬진강 자전거길 2구간 · 향가유원지인증센터 → 배알도 수변공원 인증센터" }];
    eq("이름으로", RF.centerCourses(sjc, ["섬진강댐", "향가유원지", "배알도수변공원", "장군목"]).map(function (c) { return c && c.course_id; }), ["s1", "s2", "s2", null]);
    // 다른 이름(aka): 이름표 "영산하구둑인증센터" · OSM 오타 "망양휴계소인증센터"(2026-10-12 PC)
    eq("다른 이름으로 구간", RF.centerCourses([{ course_id: "y1", name: "영산강 자전거길 1구간 · 영산하구둑인증센터 → 느러지인증센터", distance_m: 30000 }],
        ["영산강하구둑"], [{ course_id: "y1", name: "영산하구둑인증센터", dist_m: 488 }], { "영산강하구둑": ["영산하구둑"] })[0].course_id, "y1");
    eq("다른 이름으로 도장", RF.seriesProgress({ centers: ["망양휴게소", "월송정"], aka: { "망양휴게소": ["망양휴계소"] } }, { "망양휴계소": { t: 1 } }, {}), { got: 1, of: 2 });
    eq("긴 공식 이름", RF.centerCourses([{ course_id: "g", name: "동해안 자전거길 1구간 · 통일전망대(민통선내)인증센터 → 북천철교인증센터" }], ["통일전망대"])[0].course_id, "g");
    eq("명산 자료가 비면 0", RF.seriesProgress({ peaks: [] }, {}, {}, {}), { got: 0, of: 0 });
    eq("숲길 진행", RF.seriesProgress({ prefix: "kmf-9900000006-", courses: 21 }, {}, { "kmf-9900000006-1": 1, "kmf-9900000006-2": 1, "kmf-9900000002-1": 1 }), { got: 2, of: 21 });
})();

// fromApi · at · ascentLeft
var j = line(11);
j.pois = [{ name: "중간쉼터", dist_m: 555, off_route_m: 0, lat: 37.005, lon: 127 },
          { name: "갈림길", dist_m: 300, off_route_m: 0 },
          { name: "주차장", dist_m: 0, off_route_m: 300, lat: 37, lon: 127.003 }];
var c = RF.fromApi("t1", j);
eq("fromApi 갈림길은 이름표가 아님(출발 · 도착 이름표 가 · 나 는 이름에서)", c.pois.map(function (p) { return p.name; }).sort(), ["가", "나", "주차장", "중간쉼터"]);
eq("fromApi 갈림길 거리", c.junctions, [300]);
near("total", c.total, 1110, 5);
near("at 가운데 고도", RF.at(c, c.total / 2).ele, 50, 1);
near("ascentLeft 처음", RF.ascentLeft(c, 0), 100, 0.5);
eq("ascentLeft 끝", RF.ascentLeft(c, c.total), 0);

// isAccess · nextPoi (주차장은 코스 밖이라 다음 지점이 아님)
eq("isAccess 주차장", RF.isAccess(c.pois.filter(function (p) { return p.name === "주차장"; })[0]), true);
eq("nextPoi", RF.nextPoi(c, 100).name, "중간쉼터");

// snap - 코스 옆 20m 점
var s = RF.snap(c, 37.004, 127 + 20 / (111320 * Math.cos(37.004 * Math.PI / 180)), 0);
near("snap 거리", s.d, 444, 5);
near("snap 벗어남", s.off, 20, 1);

// reverseCourse - 거꾸로 걸으면 처음 고도가 100, 남은 오르막 0
var r = RF.reverseCourse(c);
eq("reverse 처음 고도", r.ele[0], 100);
eq("reverse 남은 오르막", RF.ascentLeft(r, 0), 0);
near("reverse 지점 거리", r.pois.filter(function (p) { return p.name === "중간쉼터"; })[0].dist_m, c.total - 555, 1);
eq("reverseName", RF.reverseName("가 → 나 → 다"), "다 → 나 → 가");
eq("nameParts 무리 · 길", JSON.stringify(RF.nameParts("무등산 서인봉 1코스 · 증심사 → 무등산")), JSON.stringify({ group: "무등산 서인봉 1코스", route: "증심사 → 무등산" }));
eq("nameText 넘어가기", RF.nameText("산청 지리산 천왕봉 · 중산리탐방지원센터 → 천왕봉 → 백무동탐방지원센터"), "[산청 지리산 천왕봉] 중산리탐방지원센터 → 천왕봉 → 백무동탐방지원센터");
eq("summitIndex 코스 이름의 정상", RF.summitIndex([{ name: "백무동탐방지원센터", ele_m: 535 }, { name: "제석봉", ele_m: 1783 }, { name: "천왕봉", ele_m: 1897 },
    { name: "중산리탐방지원센터", ele_m: 617 }], "함양 지리산 천왕봉 · 백무동탐방지원센터 → 천왕봉 → 중산리탐방지원센터"), 2);
eq("summitIndex 이름이 없으면 가장 높은 것", RF.summitIndex([{ name: "가", ele_m: 300 }, { name: "나", ele_m: 900 }], "둘레길 1코스"), 1);
eq("summitIndex 묶음 안 이름", RF.summitIndex([{ name: "장터목대피소", names: ["장터목대피소", "천왕봉"], ele_m: 1650 }, { name: "제석봉", ele_m: 1783 }], "지리산 · 백무동 → 천왕봉"), 0);
eq("flightMs 짧은 코스 20초", RF.flightMs(1000), 20000);
eq("flightMs 11km 27.5초", RF.flightMs(11000), 27500);
eq("flightMs 긴 코스 90초", RF.flightMs(100000), 90000);
eq("isAccess 봉우리는 160m 까지 경로 위", RF.isAccess({ name: "소지봉", off_route_m: 140 }), false);
eq("isAccess 주차장 120m 는 경로 밖", RF.isAccess({ name: "백무동주차장", off_route_m: 120 }), true);
eq("isTopName 괄호", RF.isTopName("도봉산(신선대)"), true);
eq("정상 줄이기", ["지리산 천왕봉 정상", "천왕봉정상", "공주향교뒷산 정상", "국사봉 정상", "백운산  정상", "정상", "천왕봉", "한라산 백록담", "도봉산 정상"].map(RF.summitName),
    ["천왕봉", "천왕봉", "정상", "국사봉", "정상", "정상", "천왕봉", "한라산 백록담", "정상"]);
eq("단 · 대 봉우리 이름", ["노고단정상", "백운대 정상", "전망대정상"].map(RF.summitName), ["노고단", "백운대", "정상"]);
eq("고개 정상은 고개 이름", ["진부령정상", "한계령 정상", "하늘재정상", "박달재 정상", "말티고개정상", "이화령정상", "육십령 덕유산 정상", "깃대봉 삼마치정상"].map(RF.summitName),
    ["진부령", "한계령", "하늘재", "박달재", "말티고개", "이화령", "정상", "깃대봉"]);
eq("고개가 아닌 치(제주 고수치오름)", RF.summitName("고수치 정상"), "정상");
eq("정맥 뒤 산 이름은 그 산 탐방 안내도", RF.guideMaps([{ course_id: "frst-1-a", name: "금남정맥안골산 · 가 → 안골산", start_lat: 36.2, start_lon: 127.3 },
    { course_id: "frst-1-b", name: "금남정맥안골산 · 나 → 안골산", start_lat: 36.2, start_lon: 127.31 }], 3).map(function (g) { return g.name + "|" + g.label + ":" + g.n; }), ["안골산|안골산:2"]);
eq("백두대간 구간 이름", RF.nameText("백두대간 1구간 · 진부령정상 → 황철봉 너덜지대"), "[백두대간 1구간] 진부령 → 황철봉 너덜지대");
eq("대간 · 정맥 무리는 탐방 안내도 아님", RF.guideMaps([{ course_id: "frst-422300704-x", name: "백두대간건의령고적대 · 건의령 → 고적대", start_lat: 37.3, start_lon: 129 },
    { course_id: "frst-457200104-4d6317", name: "금호남정맥 · 군하 → 숫마이산", start_lat: 35.7, start_lon: 127.4 }], 3).length, 0);
eq("코스 이름의 정상", RF.nameText("공주향교뒷산 · 송산리고분군모형관매표소 → 공주향교뒷산 정상"), "[공주향교뒷산] 송산리고분군모형관매표소 → 정상");
eq("이름표 정상", RF.cleanName("덕기봉 정상"), "덕기봉");
eq("isTopName 정상", RF.isTopName("정상"), true);
eq("탐방 안내도 카드", RF.guideMaps([{ course_id: "frst-1-a", name: "김제 모악산 · 금산사 → 모악산" }, { course_id: "knps-1-b", name: "지리산 · 중산리 → 천왕봉" },
    { course_id: "knps-2-c", name: "지리산 · 백무동 → 천왕봉" }, { course_id: "osmb-1-1", name: "섬진강 자전거길 1구간 · 섬진강댐인증센터 → 장군목인증센터" }]),
    [{ name: "지리산", label: "지리산", from: "knps-1-b", n: 2 }, { name: "모악산", label: "김제 모악산", from: "frst-1-a", n: 1 }]);
var bw3 = [{ course_id: "frst-431502201-a", name: "정선 백운산 · 오두재 → 백운산", start_lat: 37.27, start_lon: 128.59 },
    { course_id: "frst-462300201-b", name: "광양 백운산 · 진틀 → 백운산", start_lat: 35.10, start_lon: 127.62 },
    { course_id: "frst-462300202-c", name: "광양 백운산 · 동동 → 백운산", start_lat: 35.12, start_lon: 127.60 }, { course_id: "frst-9-d", name: "광양 갈미봉 · 매화마을 → 백운산", start_lat: 35.1, start_lon: 127.7 }];
eq("같은 이름 다른 산은 따로 · 검색어 든 산만", RF.guideMaps(bw3, 3, "백운산").map(function (g) { return g.label + ":" + g.n; }), ["광양 백운산:2", "정선 백운산:1"]);
eq("국립공원 코스 · 산림청 코스는 한 산, 멀리 같은 이름은 따로", RF.guideMaps([{ course_id: "knps-1-a", name: "지리산 · 중산리 → 천왕봉", start_lat: 35.27, start_lon: 127.73 },
    { course_id: "frst-488605302-b", name: "산청 지리산 천왕봉 · 거림 → 천왕봉", start_lat: 35.30, start_lon: 127.68 },
    { course_id: "frst-482202301-c", name: "통영 지리산 · 돈지 → 지리산", start_lat: 34.85, start_lon: 128.20 },
    { course_id: "knps-9-d", name: "지리산 · 성삼재 → 노고단", start_lat: 35.29, start_lon: 127.51 }], 3, "지리산").map(function (g) { return g.label + ":" + g.n; }),
    ["지리산:3", "통영 지리산:1"]);
eq("지역 없는 같은 이름은 들머리로 가름 · 사량도지리산은 통영 지리산과 한 산", RF.guideMaps([
    { course_id: "kmp-1-a", name: "백운산 · 흥룡사 → 백운산", start_lat: 38.07, start_lon: 127.44 }, { course_id: "kmp-1-b", name: "백운산 · 광덕고개 → 백운산", start_lat: 38.10, start_lon: 127.44 },
    { course_id: "frst-431502201-c", name: "백운산 · 오두재 → 백운산", start_lat: 37.27, start_lon: 128.59 },
    { course_id: "frst-482202301-d", name: "통영 지리산 · 돈지 → 지리산", start_lat: 34.85, start_lon: 128.20 },
    { course_id: "kmp-5383010368-1", name: "사량도지리산 · 내지 → 지리산", start_lat: 34.84, start_lon: 128.21 }], 5).map(function (g) { return g.label + ":" + g.n; }),
    ["백운산(흥룡사):2", "통영 지리산:2", "백운산(오두재):1"]);
eq("노선 안내도 카드", RF.routeGuides([{ course_id: "osmb-6374513-1", name: "국토종주 섬진강 자전거길 1구간 · 섬진강댐인증센터 → 향가유원지인증센터" },
    { course_id: "osmb-6374513-2", name: "국토종주 섬진강 자전거길 2구간 · 향가유원지인증센터 → 남도대교인증센터" },
    { course_id: "kmf-9900000006-1", name: "지리산둘레길 주천-운봉" }, { course_id: "frst-1-a", name: "김제 모악산 · 금산사 → 모악산" }]),
    [{ prefix: "osmb-6374513-", name: "섬진강 자전거길", kind: "bike", n: 2 }, { prefix: "kmf-9900000006-", name: "지리산둘레길", kind: "walk", n: 1 }]);
eq("백두대간 · 정맥 노선 안내도 카드", RF.routeGuides([{ course_id: "osmh-9439787-1", name: "백두대간 1구간 · 진부령정상 → 황철봉 너덜지대" },
    { course_id: "osmh-9439787-46", name: "백두대간 46구간 · 노고단대피소 → 천왕봉" }, { course_id: "osmh-19179556-7", name: "낙남정맥 7구간 · 진고개가든휴게소 → 삼각점" }]),
    [{ prefix: "osmh-9439787-", name: "백두대간", kind: "ridge", n: 2 }, { prefix: "osmh-19179556-", name: "낙남정맥", kind: "ridge", n: 1 }]);
eq("courseNo", ["해파랑길 21코스(영덕 블루로드 4코스) · 영덕해맞이공원 → 축산리", "서해랑길 64-3(지선3코스) · 시장순대 → 황태마을",
    "서해랑길 3코스 · 영터 → 산소", "DMZ 평화의 길 19-1코스(우회로) · 승라부대까지", "백두대간 46구간 · 노고단대피소 → 천왕봉", "지리산둘레길 주천-운봉"].map(RF.courseNo),
    ["21", "64-3", "3", "19-1", "46", null]);
eq("trailCourses 지선 번호 차례", RF.trailCourses([{ name: "서해랑길 64-3(지선3코스) · 시장순대 → 황태마을" }, { name: "서해랑길 3코스 · 영터 → 산소" },
    { name: "서해랑길 64코스 · 가 → 나" }], "서해랑길").map(function (c) { return RF.courseNo(c.name); }), ["3", "64", "64-3"]);
eq("다른 이름의 같은 노선", RF.routeGuides([{ course_id: "frst-457200104-4d6317", name: "금호남정맥 · 군하 → 숫마이산" },
    { course_id: "frst-1-a", name: "한북정맥 · 가 → 나" }, { course_id: "frst-2-b", name: "금남정맥안골산 · 가 → 안골산" }], 3,
    [{ name: "금남호남정맥", prefix: "osmh-18716489-", aka: ["금호남정맥"] }, { name: "한북정맥", prefix: "osmh-17461355-" }, { name: "해파랑길", q: "해파랑길" }]),
    [{ prefix: "osmh-18716489-", name: "금남호남정맥", kind: "ridge", n: 1 }, { prefix: "osmh-17461355-", name: "한북정맥", kind: "ridge", n: 1 }]);
eq("노선 안내도 지명", RF.routePlaces([{ course_id: "a", name: "금남호남정맥 1구간 · 주화산 → 군하리" }, { course_id: "b", name: "금남호남정맥 2구간 · 군하리 → 복지봉" },
    { course_id: "c", name: "금남호남정맥 4구간 · 두산리 → 무룡고개" }, { course_id: "d", name: "DMZ 평화의 길 19-1코스 · 승라부대까지" }],
    { a: [[127.30, 35.80], [127.35, 35.80]], b: [[127.3502, 35.8001], [127.40, 35.75]], c: [[127.45, 35.70], [127.50, 35.65]], d: [[128, 38], [128.1, 38]] })
    .map(function (p) { return p.name + ":" + p.start; }), ["주화산:0", "군하리:1", "복지봉:-1", "두산리:2", "무룡고개:-1", "승라부대:-1"]);
eq("노선 안내도 흔한 이름은 지명 아님", RF.routePlaces([{ course_id: "a", name: "백두대간 4구간 · 성국사 → 삼각점" }, { course_id: "b", name: "백두대간 5구간 · 삼각점 → 치밭골령" }],
    { a: [[128.4, 38.1], [128.45, 38.05]], b: [[128.4501, 38.0501], [128.5, 38]] }).map(function (p) { return p.name + ":" + p.start + (p.last ? ":끝" : ""); }),
    ["성국사:0", "치밭골령:-1:끝"]);
eq("노선 안내도 지명 다듬기", RF.routePlaces(["호미곶등대(경상북도기념물제39호)", "찬늘라면포항송도본점", "강구항소품샵", "씨유하조대해변점", "마을농기계보관창고",
    "죽령탐방지원센터", "제3관문휴게소", "솔잎공원267", "660 봉", "백암산(상왕봉)", "안전쉼터", "주문진해수욕장관리본부"].map(function (n, i) {
        return { course_id: "c" + i, name: "길 " + (i + 1) + "구간 · " + n + " → 끝" + i };
    }), (function () { var l = {}; for (var i = 0; i < 12; i++) l["c" + i] = [[127 + i * 0.1, 36], [127 + i * 0.1 + 0.05, 36]]; return l; })())
    .filter(function (p) { return p.start >= 0; }).map(function (p) { return p.name; }),
    ["호미곶등대", "죽령", "제3관문", "솔잎공원", "660봉", "백암산(상왕봉)"]);
eq("노선 안내도 에서 · 까지", RF.routePlaces([{ course_id: "a", name: "백두대간 16구간 · 창고 → 창옥봉" }, { course_id: "b", name: "백두대간 17구간 · 창옥봉에서" },
    { course_id: "c", name: "백두대간 18구간 · 삼각점까지" }, { course_id: "d", name: "DMZ 평화의 길 19-1코스 · 승라부대까지" }],
    { a: [[128, 36.9], [128.05, 36.9]], b: [[128.0501, 36.9001], [128.1, 36.85]], c: [[128.1, 36.85], [128.15, 36.8]], d: [[129, 38], [129.1, 38]] })
    .map(function (p) { return p.name + ":" + p.start + (p.last ? ":끝" : ""); }), ["창옥봉:1", "승라부대:-1:끝"]);
eq("cumAscent 5m 넘게 바뀔 때만(배치와 같게)", RF.cumAscent ? RF.cumAscent([100, 102, 104, 106, 103, 110, null, 120]) : null, [0, 0, 0, 6, 6, 6, 6, 20]);
eq("routeEnds", ["지리산둘레길 가탄-송정", "지리산둘레길 (가탄-송정) · 송정리 → 가탄마을민박", "백두대간 17구간 · 창옥봉에서", "DMZ 평화의 길 4코스 · 농업체험까지", "이름만"].map(function (n) {
    var e = RF.routeEnds(n); return e.from + "|" + e.to; }), ["가탄|송정", "송정리|가탄마을민박", "창옥봉|null", "null|농업체험", "null|null"]);
eq("마을 민박은 마을 이름", RF.routePlaces([{ course_id: "a", name: "지리산둘레길 (가탄-송정) · 송정리 → 가탄마을민박" }], { a: [[127.5, 35.2], [127.6, 35.2]] })
    .map(function (p) { return p.name; }), ["송정리", "가탄마을"]);
// 지리산둘레길(국가숲길) 실제 끝점 - 금계-동강 · 인월-금계 선은 이름과 거꾸로(2026-10-12 PC 자료)
var jr = [{ course_id: "k2", name: "지리산둘레길 금계-동강" }, { course_id: "k5", name: "지리산둘레길 동강-수철" }, { course_id: "k18", name: "지리산둘레길 인월-금계" },
    { course_id: "k15", name: "지리산둘레길 운봉-인월" }];
var jl = { k2: [[127.76405, 35.43666], [127.68559, 35.40358]], k5: [[127.76405, 35.43666], [127.82627, 35.40499]],
    k18: [[127.68572, 35.40364], [127.6019, 35.45919]], k15: [[127.52902, 35.44146], [127.60595, 35.45884]] };
eq("routeFlips 이름과 거꾸로 그린 선", Object.keys(RF.routeFlips(jr, jl)).sort(), ["k18", "k2"]);
eq("거꾸로 그린 선은 지명도 바꿔", RF.routePlaces(jr, jl).map(function (p) { return p.name + ":" + p.start; }), ["동강:0", "금계:2", "수철:-1", "인월:-1", "운봉:3"]);
eq("reverseName 두 번 뒤집기", RF.reverseName(RF.reverseName("지리산탐방지원센터 원점회귀")), "지리산탐방지원센터 원점회귀");
eq("reverseName 국가숲길", RF.reverseName("지리산둘레길 가탄-송정"), "지리산둘레길 송정-가탄");
var kc = RF.fromApi("kmf-9900000006-1", { course: { name: "지리산둘레길 가탄-송정" }, points: [[127.634, 35.2005, 100, 0], [127.6, 35.203, 300, 5000], [127.573, 35.206, 120, 9960]], pois: [] });
eq("국가숲길 출발 · 도착 이름표", kc.pois.map(function (p) { return p.name + "@" + p.dist_m; }), ["가탄@0", "송정@9960"]);
eq("거꾸로 하면 이름표도", RF.reverseCourse(kc).pois.map(function (p) { return p.name + "@" + p.dist_m; }), ["송정@0", "가탄@9960"]);
eq("같은 길 한 구간 노선은 그 길 카드로", RF.routeGuides([{ course_id: "kmf-9900000006-1", name: "지리산둘레길 가탄-송정" }, { course_id: "kmf-9900000006-2", name: "지리산둘레길 금계-동강" },
    { course_id: "osmh-15635353-1", name: "지리산둘레길 (가탄-송정) · 송정리 → 가탄마을" }]), [{ prefix: "kmf-9900000006-", name: "지리산둘레길", kind: "walk", n: 2 }]);
eq("이름이 이어지는 다른 길은 따로", RF.routeGuides([{ course_id: "osmh-9439787-1", name: "백두대간 1구간 · 진부령 → 황철봉" },
    { course_id: "kmf-9900000009-1", name: "백두대간트레일 1코스" }]).map(function (g) { return g.name + ":" + g.kind; }), ["백두대간:ridge", "백두대간트레일:walk"]);
eq("검색어와 같은 이름 노선이 먼저", RF.routeGuides([{ course_id: "osmh-1-1", name: "호남정맥 1구간 · 가 → 나" },
    { course_id: "osmh-2-1", name: "금남호남정맥 1구간 · 다 → 라" }, { course_id: "osmh-2-2", name: "금남호남정맥 2구간 · 라 → 마" }], 2, null, "호남 정맥").map(function (g) { return g.name; }),
    ["호남정맥", "금남호남정맥"]);
// 여러 구간 이어 걷기 - 지리산둘레길 덕산-위태 · 위태-하동호 · 하동호-삼화실(실제 끝점)
var zl = { k4: [[127.8498, 35.27403], [127.82866, 35.21692]], k17: [[127.82864, 35.21691], [127.78512, 35.16266]],
    k21: [[127.78516, 35.16267], [127.77048, 35.11899]], k9: [[127.90022, 35.31553], [127.9092, 35.37977]] };
var zs = RF.chainPick([], "k17", zl);
zs = RF.chainPick(zs, "k21", zl);
zs = RF.chainPick(zs, "k4", zl);
eq("chainPick 앞 · 뒤로 이어 붙임", RF.joinId(zs), "k4,k17,k21");
eq("chainPick 이어지지 않으면 새로", RF.joinId(RF.chainPick(zs, "k9", zl)), "k9");
eq("chainPick 끝을 다시 누르면 뺌", RF.joinId(RF.chainPick(zs, "k21", zl)), "k4,k17");
eq("chainPick 가운데를 빼면 긴 쪽", RF.joinId(RF.chainPick(RF.chainPick(zs, "k21", zl), "k17", zl)), "k4");
eq("chainPick 거꾸로 그린 구간은 ~", RF.joinId(RF.chainPick([{ id: "k17", rev: false }], "kx", { k17: zl.k17, kx: [[127.77048, 35.11899], [127.78516, 35.16267]] })), "k17,kx~");
eq("reverseSel", RF.joinId(RF.reverseSel(zs)), "k21~,k17~,k4~");
eq("parseJoinId", RF.parseJoinId("a,b~").map(function (p) { return p.id + (p.rev ? "~" : ""); }), ["a", "b~"]);
var pj = RF.parseJoinId("knps-1011-c90a70e8@0.2500-0.5000:장터목>천왕봉~")[0];
eq("parseJoinId 자른 구간", [pj.base, pj.r0, pj.r1, pj.from, pj.to, pj.rev], ["knps-1011-c90a70e8", 0.25, 0.5, "장터목", "천왕봉", true]);
// 갈림길에서 자르기 - 능선 가-라(동서 3km)에 남쪽에서 올라오는 탐방로 끝 둘(1km · 2km 자리)
var ridge = { id: "r", name: "산 · 가 → 라", distance_m: 3000, coords: [[127.0, 35.0], [127.0055, 35.0], [127.011, 35.0], [127.0165, 35.0], [127.022, 35.0], [127.0275, 35.0], [127.033, 35.0]] };
var up1 = { id: "u1", name: "산 · 마을1 → 나", coords: [[127.011, 34.99], [127.011, 35.0003]] }, up2 = { id: "u2", name: "산 · 마을2 → 다", coords: [[127.022, 34.99], [127.022, 34.9998]] };
var sp = RF.splitTrails([ridge, up1, up2], {});
eq("splitTrails 갈림길에서 자름", sp.filter(function (s) { return s.base === "r"; }).map(function (s) { return s.name; }), ["산 · 가 → 나", "산 · 나 → 다", "산 · 다 → 라"]);
eq("splitTrails 안 자른 것은 그대로", sp.filter(function (s) { return !s.base; }).map(function (s) { return s.id; }), ["u1", "u2"]);
var up3 = { id: "u3", name: "산 · 동엽령코스", coords: [[127.011, 34.99], [127.011, 35.0003]] };
eq("splitTrails 이름 모르는 갈림길은 \"갈림길\", 끝은 원래 이름", RF.splitTrails([{ id: "r2", name: "산 · 종주코스", distance_m: 3000, coords: ridge.coords }, up3], {})
    .filter(function (s) { return s.base; }).map(function (s) { return s.name; }), ["산 · 종주코스 → 갈림길", "산 · 갈림길 → 종주코스"]);
eq("endsText", [RF.endsText("가", "나"), RF.endsText("가", "가"), RF.endsText(null, "나"), RF.endsText("가", null), RF.endsText(null, null)], ["가 → 나", "가 부근", "나까지", "가에서", ""]);
eq("dedupeSegs 같은 자리 · 같은 길이(거꾸로도)는 하나", RF.dedupeSegs([{ id: "a", distance_m: 1000, coords: [[127, 35], [127.01, 35]] },
    { id: "b", distance_m: 1050, coords: [[127.01, 35], [127, 35]] }, { id: "c", distance_m: 2000, coords: [[127, 35], [127.01, 35]] }]).map(function (s) { return s.id; }), ["a", "c"]);
// 한라산 성판악 탐방로 - 들머리는 이름에서, 끝 "정상" 은 산 정상, 가운데는 다른 탐방로 끝(사라오름입구)
var sp2 = RF.splitTrails([{ id: "h", name: "한라산 · 성판악 탐방로", distance_m: 3000, coords: ridge.coords },
    { id: "s", name: "한라산 · 사라오름입구 → 사라오름", coords: [[127.011, 35.0003], [127.011, 34.99]] }], {}, null,
    { h: { total: 3000, pois: [{ name: "한라산동능정상", dist_m: 3000 }] } });
eq("splitTrails 탐방로 들머리 · 정상 · 이름표", sp2.filter(function (x) { return x.base; }).map(function (x) { return x.name; }),
    ["한라산 · 성판악 → 사라오름입구", "한라산 · 사라오름입구 → 한라산 정상"]);
// 이름 없는 조각 잇기(무등산 knps-pg) - 가(끝) ─p1─ ● ─p2(거꾸로 그림)─ 나(갈림길: p3 · p4 가 만남)
var mb = RF.mergeBare([
    { id: "p1", name: "무등산", distance_m: 500, coords: [[127.0, 35.0], [127.0055, 35.0]] },
    { id: "p2", name: "무등산", distance_m: 500, coords: [[127.011, 35.0], [127.0055, 35.0]] },
    { id: "p3", name: "무등산", distance_m: 900, coords: [[127.011, 35.0], [127.011, 35.008]] },
    { id: "p4", name: "무등산", distance_m: 900, coords: [[127.011, 35.0], [127.021, 35.0]] },
    { id: "k", name: "무등산 · 증심사 → 중머리재", distance_m: 100, coords: [[127.1, 35.1], [127.101, 35.1]] }],
    [{ name: "큰암산", lon: 127.0001, lat: 35.0 }, { name: "장불재", lon: 127.0111, lat: 35.0 }]);
eq("mergeBare 두 조각만 만나는 점은 지나서 이음", mb.map(function (x) { return x.name; }), ["무등산 · 증심사 → 중머리재", "무등산 · 큰암산 → 장불재", "무등산 · 장불재 → 장불재 쪽 끝", "무등산 · 장불재 → 장불재 쪽 끝"]);
eq("mergeBare 이은 구간 id(이름은 조각 선 방향 - p2 는 장불재에서 그려짐)", mb[1].id, "p1@0.0000-1.0000:큰암산>,p2@0.0000-1.0000:장불재>~");
eq("flattenSel 이은 구간을 거꾸로 풀기", RF.joinId(RF.flattenSel([{ id: mb[1].id, rev: true }])), "p2@0.0000-1.0000:장불재>,p1@0.0000-1.0000:큰암산>~");
eq("reverseName 에서 ↔ 까지", [RF.reverseName("무등산 · 큰암산에서"), RF.reverseName("무등산 · 장불재까지")], ["무등산 · 큰암산까지", "무등산 · 장불재에서"]);
// 한라산 통제 시각(data/park-notes.json 그대로)
var halla = JSON.parse(require("fs").readFileSync(__dirname + "/../../main/webapp/data/park-notes.json", "utf8")).parks["한라산"];
var hr = RF.parkRules(halla, ["한라산 · 성판악 탐방로"], new Date(2026, 9, 12));
eq("parkRules 10월은 동절기 · 성판악", [hr.season, hr.course.label, hr.course.gates[0].time, hr.course.down[0].time], ["동절기", "성판악", "11:30", "13:30"]);
eq("parkRules 7월은 하절기 · 어리목", RF.parkRules(halla, ["한라산 · 어리목 → 윗세대피소"], new Date(2026, 6, 1)).course.gates.map(function (g) { return g.time; }), ["15:00", "14:00"]);
eq("parkRules 다른 산 코스면 course 없음", RF.parkRules(halla, ["지리산 · 백무동 → 천왕봉"], new Date(2026, 6, 1)).course, null);
eq("rulesText", RF.rulesText(hr), "성판악(동절기): 입산 05:00부터 · 성판악 입구 · 진달래밭통제소 11:30 입산 통제 · 동릉정상(백록담) 13:30 하산 · 진달래밭 ↔ 백록담 예약 필수");
var ga = RF.gateAlerts(hr, new Date(2026, 9, 12, 11, 0).getTime(), {});
eq("gateAlerts 30분 앞", ga.map(function (a) { return a.text; }), ["성판악 입구 · 진달래밭통제소 입산 통제까지 30분 남았습니다(11:30)."]);
eq("gateAlerts 이미 알린 것은 빼고", RF.gateAlerts(hr, new Date(2026, 9, 12, 11, 0).getTime(), { "in|성판악 입구 · 진달래밭통제소|30": 1 }).length, 0);
eq("gateAlerts 지난 때", RF.gateAlerts(hr, new Date(2026, 9, 12, 13, 31).getTime(), {}).map(function (a) { return a.key; }), ["down|동릉정상(백록담)|0"]);
eq("aliasName", RF.aliasName("지리산 · 중산리 → 천왕봉", { "중산리": "중산리탐방지원센터" }), "지리산 · 중산리탐방지원센터 → 천왕봉");
eq("mergeBare 는 이름이 산 이름뿐인 조각만", RF.mergeBare([{ id: "j", name: "덕유산 · 종주코스", distance_m: 1, coords: [[127, 35], [127.01, 35]] }], []).map(function (x) { return x.id; }), ["j"]);
// 원점회귀 모양 - 중산리(T) → 칼바위(J) → 로터리 → 천왕봉 → 장터목 → 칼바위(J)
var cl = { s: [[127.0, 35.0], [127.0, 35.01]], a: [[127.0, 35.01], [127.01, 35.02]], b: [[127.01, 35.02], [127.0, 35.03]], c: [[127.0, 35.03], [127.0, 35.01]] };
eq("chainShape 들머리 → 한 바퀴 → 갈림길", JSON.stringify(RF.chainShape([{ id: "s" }, { id: "a" }, { id: "b" }, { id: "c" }], cl)), JSON.stringify({ type: "lolli", k: 1 }));
eq("chainShape 원점회귀", RF.chainShape([{ id: "a" }, { id: "b" }, { id: "c" }], cl).type, "loop");
eq("chainShape 그냥 길", RF.chainShape([{ id: "s" }, { id: "a" }], cl).type, "path");
eq("chainShape 한 바퀴 뒤 더 감은 안 됨", RF.chainShape([{ id: "s" }, { id: "a" }, { id: "b" }, { id: "c" }, { id: "s", rev: true }, { id: "x" }], { s: cl.s, a: cl.a, b: cl.b, c: cl.c, x: [[127.0, 35.0], [126.99, 35.0]] }).type, "bad");
var lpA = RF.fromApi("a", { course: { name: "지리산 · 중산리탐방지원센터 → 칼바위" }, points: [[127, 35, 100, 0], [127, 35.01, 300, 1000]], pois: [] });
var lpB = RF.fromApi("b", { course: { name: "지리산 · 칼바위 → 중산리탐방지원센터" }, points: [[127, 35.01, 300, 0], [127, 35, 100, 1000]], pois: [] });
eq("joinCourses 원점회귀 이름", RF.joinCourses([lpA, lpB], "a,b").course.name, "지리산 2구간 이어 걷기 · 중산리탐방지원센터 원점회귀");
// 빈 곳 메우기 - 공단 탐방로 둘(가: 서쪽 · 나: 동쪽, 1.1km 떨어짐) 사이를 다른 코스가 이음
var kn = [{ id: "k1", name: "산 · 가 → 비선대", coords: [[127.0, 35.0], [127.005, 35.0]] }, { id: "k2", name: "산 · 양폭 → 희운각", coords: [[127.017, 35.0], [127.022, 35.0]] }];
var oth = [{ id: "o1", name: "산 다른 1코스 · 가 → 희운각", coords: [[127.0, 35.0], [127.005, 35.0], [127.008, 35.0005], [127.011, 35.0005], [127.014, 35.0005], [127.017, 35.0], [127.022, 35.0]] }];
var gf = RF.gapFill(kn, oth, [{ name: "비선대", lon: 127.005, lat: 35.0 }, { name: "양폭대피소", lon: 127.017, lat: 35.0 }], [], "산");
eq("gapFill 공단 탐방로 사이 빈 곳만", gf.map(function (x) { return x.name + ":" + x.base + ":" + x.extra; }), ["산 · 비선대 → 양폭대피소:o1:true"]);
// 2026-10-13 홍TV님: 정상 291m 아래 갈림길이 "천왕봉" 이 되어 깃발이 "도착 천왕봉" - 봉우리 · 문은 가까울 때만
eq("gapFill 먼 봉우리 이름은 안 붙임", RF.gapFill(kn, oth, [{ name: "천왕봉", lon: 127.005, lat: 35.0023 }, { name: "양폭대피소", lon: 127.017, lat: 35.0 }], [], "산")[0].name, "산 · 갈림길 → 양폭대피소");
eq("gapFill 가까운 봉우리는 붙임", RF.gapFill(kn, oth, [{ name: "천왕봉", lon: 127.005, lat: 35.0009 }, { name: "양폭대피소", lon: 127.017, lat: 35.0 }], [], "산")[0].name, "산 · 천왕봉 → 양폭대피소");
eq("peakNearM", [RF.peakNearM("천왕봉"), RF.peakNearM("남대봉 (망경봉)"), RF.peakNearM("통천문"), RF.peakNearM("세석대피소"), RF.peakNearM("전망대")].join(","), "120,120,150,Infinity,Infinity");
// 원점회귀 예시(2026-10-13 홍TV님) - 들머리 H(127, 35)에서 봉우리 P(127.02, 35.02)로 두 길(서쪽 A · 동쪽 B), 옅은 선은 쓰지 않음
var exSegs = [
    { id: "ha", name: "산 · H → A", coords: [[127.0, 35.0], [127.0, 35.02]], distance_m: 2200 },
    { id: "ap", name: "산 · A → P", coords: [[127.0, 35.02], [127.02, 35.02]], distance_m: 1800 },
    { id: "hb", name: "산 · H → B", coords: [[127.0, 35.0], [127.02, 35.0]], distance_m: 1800 },
    { id: "bp", name: "산 · B → P", coords: [[127.02, 35.0], [127.02, 35.02]], distance_m: 2200 },
    { id: "xx", name: "산 · H → P", coords: [[127.0, 35.0], [127.02, 35.02]], distance_m: 2900, extra: true }];   // 긴 옅은 선은 안 씀
var exH = [{ name: "H탐방지원센터", lon: 127.0, lat: 35.0 }], exP = [{ name: "P봉", lon: 127.02, lat: 35.02, ele_m: 900 }];
var ex1 = RF.loopExamples(exSegs, exH, exP);
eq("loopExamples 두 길로 원점회귀", ex1.map(function (x) { return x.loop + ":" + x.head + ":" + x.peak + ":" + x.m + ":" + x.ids.slice().sort().join(","); }), ["true:H탐방지원센터:P봉:8000:ap,bp,ha,hb"]);
var ex2 = RF.loopExamples(exSegs.slice(0, 2), exH, exP);
eq("loopExamples 고리가 없으면 왕복", ex2.map(function (x) { return x.loop + ":" + x.m + ":" + x.walk.length; }), ["false:8000:4"]);
var exL = {}; exSegs.forEach(function (x) { exL[x.id] = x.coords; });
eq("planWalk 출발을 정함(고리 위 들머리)", JSON.stringify(RF.planWalk(["ap", "bp", "ha", "hb"], exL, { first: "ap", start: [127.02, 35.0] }).start), JSON.stringify([127.02, 35.0]));
eq("planWalk 출발을 안 정하면 첫 탐방로 끝", JSON.stringify(RF.planWalk(["ap", "bp", "ha", "hb"], exL, { first: "ap" }).start), JSON.stringify([127.0, 35.02]));
var exS = exSegs.slice(0, 4).concat([{ id: "yy", name: "산 · H → P", coords: [[127.0, 35.0], [127.02, 35.02]], distance_m: 1400, extra: true }]);
eq("loopExamples 짧은 옅은 선은 이음으로", RF.loopExamples(exS, exH, exP)[0].ids.indexOf("yy") >= 0, true);
eq("loopExamples 지나갈 수 없는 곳 둘레 옅은 선은 안 씀", RF.loopExamples(exS, exH, exP, { block: [[127.02, 35.02]] })[0].ids.indexOf("yy"), -1);
eq("loopExamples 너무 짧으면 없음", RF.loopExamples(exSegs.slice(0, 2), exH, exP, { minM: 9000 }).length, 0);
eq("gapFill 겹치는 코스만 있으면 없음", RF.gapFill(kn, [{ id: "o2", name: "x", coords: kn[0].coords.concat([[127.0052, 35.0]]) }], [], [], "산").length, 0);
eq("headAlias 끝 500m 안 들머리 이름", RF.headAlias([{ id: "t", name: "지리산 · 중산리 → 천왕봉", coords: [[127.7491, 35.30393], [127.729, 35.3367]] }],
    [{ name: "중산리탐방지원센터", lat: 35.303, lon: 127.7498 }])[0].name, "지리산 · 중산리탐방지원센터 → 천왕봉");
eq("headAlias 멀면 그대로", RF.headAlias([{ id: "t", name: "지리산 · 중산리 → 천왕봉", coords: [[127.7491, 35.30393], [127.729, 35.3367]] }],
    [{ name: "중산리탐방지원센터", lat: 35.40, lon: 127.7498 }])[0].name, "지리산 · 중산리 → 천왕봉");
var tw1 = RF.fromApi("a", { course: { name: "지리산 · 법계사 → 천왕봉" }, points: [[127.74, 35.32, 1400, 0], [127.729, 35.3367, 1900, 2000]], pois: [{ name: "천왕봉", dist_m: 1877, off_route_m: 2, lat: 35.3368, lon: 127.7305 }] });
var tw2 = RF.fromApi("b", { course: { name: "지리산 · 천왕봉 → 장터목" }, points: [[127.7306, 35.3370, 1915, 0], [127.716, 35.3326, 1650, 1400]], pois: [{ name: "천왕봉", dist_m: 0, off_route_m: 0, lat: 35.337, lon: 127.7306 }] });
eq("joinCourses 이은 곳 둘레 같은 봉우리는 하나", RF.joinCourses([tw1, tw2], "a,b").pois.filter(function (p) { return p.name === "천왕봉"; }).length, 1);
// 걷는 순서 - 중산리(T) ─s─ 칼바위(K) ─w─ 로터리(R) ─p─ 천왕봉(S, 막다른 끝), R ─e─ 순두류 쪽으로 K 에 다시(동쪽 길)
var pw = { s: [[127.0, 35.0], [127.0, 35.01]], w: [[127.0, 35.01], [127.0, 35.03]], p: [[127.0, 35.03], [127.0, 35.04]], e: [[127.0, 35.03], [127.01, 35.02], [127.0, 35.0105]] };
var hd = [{ name: "중산리탐방지원센터", lat: 35.0, lon: 127.0 }];
var pl = RF.planWalk(["w", "p", "e", "s"], pw, { heads: hd, first: "w" });
eq("planWalk 들머리 → 고리 → 정상 갔다 옴 → 들머리", [pl.ok, pl.loop, pl.walk.length, pl.walk[0].id, pl.walk[pl.walk.length - 1].id], [true, true, 6, "s", "s"]);
eq("planWalk 정상은 두 번(올랐다 내려옴)", pl.walk.filter(function (x) { return x.id === "p"; }).map(function (x) { return x.rev; }).sort(), [false, true]);
var pl2 = RF.planWalk(["s", "w", "p"], pw, { heads: hd, first: "s" });
eq("planWalk 그냥 길(갈래 없음)은 한쪽으로 - 들머리 → 정상", [pl2.loop, pl2.walk.map(function (x) { return x.id + (x.rev ? "~" : ""); }).join(",")], [false, "s,w,p"]);
eq("planWalk 이어지지 않으면 안 됨", RF.planWalk(["s", "p"], pw, {}).ok, false);
var pw3 = { a: [[127.0, 35.0], [127.0, 35.02]], b: [[127.0, 35.02], [127.02, 35.0]] };
eq("planWalk 들머리 둘이면 한쪽으로", RF.planWalk(["a", "b"], pw3, { heads: [{ lat: 35.0, lon: 127.0 }, { lat: 35.0, lon: 127.02 }] }).loop, false);
// 정상 앞에서 두 조각으로 잘린 막다른 갈래(R ─c1─ C ─c2─ S) + 동쪽 길로 들머리 옆(B, T 에서 260m)
var pw4 = { s: [[127.0, 35.0], [127.0, 35.01]], w: [[127.0, 35.01], [127.0, 35.03]], c1: [[127.0, 35.03], [127.0, 35.036]], c2: [[127.0, 35.036], [127.0, 35.04]],
    e: [[127.0, 35.03], [127.01, 35.02], [127.0025, 35.001]] };
var pl4 = RF.planWalk(["s", "w", "c1", "c2", "e"], pw4, { heads: [{ lat: 35.0, lon: 127.0 }, { lat: 35.001, lon: 127.0025 }], first: "s" });
eq("planWalk 두 조각 막다른 갈래도 왕복", [pl4.ok, pl4.loop, pl4.walk.map(function (x) { return x.id + (x.rev ? "~" : ""); }).join(",")], [true, true, "s,w,c1,c2,c2~,c1~,e"]);
eq("planWalk 정상을 지나 조금 되돌아 끝나는 한 구간은 원점회귀 아님", RF.planWalk(["t"], { t: [[127.0, 35.0], [127.0, 35.004], [126.998, 35.0025]] }, {}).loop, false);
// 2026-10-13 홍TV님: 먼저 누른 탐방로 쪽 들머리가 출발(한계령 먼저 → 한계령 출발)
var hd3 = [{ lat: 35.0, lon: 127.0 }, { lat: 35.001, lon: 127.02 }];   // 둘째 들머리는 111m 떨어짐(예전 규칙이면 첫째가 출발)
eq("planWalk 먼저 누른 쪽이 출발", [RF.planWalk(["b", "a"], pw3, { heads: hd3, first: "b" }).start, RF.planWalk(["a", "b"], pw3, { heads: hd3, first: "a" }).start].map(JSON.stringify),
    [JSON.stringify([127.02, 35.0]), JSON.stringify([127.0, 35.0])]);
// 2026-10-13 홍TV님: 막다른 끝이 둘(무너미고개 · 양폭대피소 - 사이 탐방로가 빠짐)이면 원점회귀로 짜지 않음
var sp2 = { hj: [[127.0, 35.0], [127.0, 35.01]], ja: [[127.0, 35.01], [126.99, 35.03]], jb: [[127.0, 35.01], [127.01, 35.03]] };
eq("planWalk 막다른 갈래 둘이면 apart", RF.planWalk(["hj", "ja", "jb"], sp2, { heads: [{ lat: 35.0, lon: 127.0 }], first: "hj" }).reason, "apart");
eq("planWalk 막다른 갈래 하나는 왕복", RF.planWalk(["hj", "ja"], sp2, { heads: [{ lat: 35.0, lon: 127.0 }], first: "hj" }).ok, true);
eq("planWalk 이어지지 않음은 apart", RF.planWalk(["s", "c2"], pw4, {}).reason, "apart");
eq("trailHeads 막다른 끝 가운데 들머리만(봉우리 빼고, 탐방지원센터 이름 먼저)", RF.trailHeads([
    { id: "a", name: "지리산 · 중산리 → 칼바위", coords: [[127.0, 35.0], [127.0, 35.01]] }, { id: "b", name: "지리산 · 칼바위 → 천왕봉", coords: [[127.0, 35.01], [127.0, 35.02]] },
    { id: "c", name: "지리산 · 대원사 → 칼바위", coords: [[127.02, 35.01], [127.0, 35.01]] }], [{ name: "중산리탐방지원센터", lat: 35.0005, lon: 127.0 }], {})
    .map(function (h) { return h.name; }), ["중산리탐방지원센터", "대원사"]);
// 2026-10-13 PC: 송추처럼 두 탐방로가 같이 시작하는 곳 · 원효분소(여러 탐방로가 만나도) · 관음사 탐방로 · 내려온 끝(운봉아래 → 운봉)은 들머리,
// 올라간 끝(천은제입구 → 제방)은 아님, "백무동" 과 1km 떨어진 서버 heads "백무동탐방지원센터" 는 하나
var th = RF.trailHeads([
    { id: "a", name: "산 · 송추 → 사패능선", coords: [[127.0, 35.0], [127.0, 35.02]] },
    { id: "b", name: "산 · 송추 → 오봉능선", coords: [[127.0005, 35.0], [127.01, 35.02]] },
    { id: "c", name: "산 · 원효분소 → 서석대", coords: [[127.1, 35.0], [127.1, 35.02]] },
    { id: "d", name: "산 · 원효분소까지", coords: [[127.12, 35.0], [127.1, 35.0]] },
    { id: "d2", name: "산 · 원효분소에서", coords: [[127.1, 35.0], [127.1, 34.98]] },
    { id: "e", name: "산 · 관음사 탐방로", coords: [[127.2, 35.0], [127.2, 35.02]] },
    { id: "e2", name: "산 · 백록담 → 윗세오름", coords: [[127.2, 35.02], [127.21, 35.03]] },
    { id: "e3", name: "산 · 백록담 → 사라오름", coords: [[127.2, 35.02], [127.19, 35.03]] },
    { id: "f", name: "산 · 만복대 → 운봉아래", coords: [[127.0, 35.02], [127.0, 35.05]] },
    { id: "g", name: "산 · 천은제입구 → 제방", coords: [[127.3, 35.0], [127.3, 35.02]] },
    { id: "h", name: "산 · 백무동 → 장터목", coords: [[127.4, 35.0], [127.4, 35.02]] }],
    [{ name: "백무동탐방지원센터", lat: 34.991, lon: 127.4 }], {}, []).map(function (h) { return h.name; }).sort();
eq("trailHeads 함께 시작 · 분소 · 탐방로 이름 · 내려온 끝, 서버 heads 합침", th,
    ["관음사", "백무동탐방지원센터", "송추", "운봉", "원효분소", "천은제입구"]);
var vt = RF.viaTrim([{ id: "v", name: "지리산 · 쟁기소 → 반야봉 → 삼도봉삼거리", coords: [[127.0, 35.0], [127.0, 35.01]] },
    { id: "w", name: "지리산 · 가 → 나 → 다", coords: [[127.0, 35.0], [127.0, 35.01]] }], [{ name: "반야봉", lat: 35.0005, lon: 127.0 }, { name: "삼도봉삼거리", lat: 35.01, lon: 127.0 }]);
eq("viaTrim 선이 거쳐 가는 곳에서 시작하면 이름도", vt.map(function (t) { return t.name; }), ["지리산 · 반야봉 → 삼도봉삼거리", "지리산 · 가 → 나 → 다"]);
// 2026-10-13 홍TV님: park-notes heads 에 적은 대원사(다른 자료 코스 "대원사석등 → 써리봉" 출발) · 도선사(이름표)만, 적지 않은 절은 빼고 · "강북구 우이동" → 우이동
var th2 = RF.trailHeads([
    { id: "a", name: "산 · 강북구 우이동 → 하루재", coords: [[127.0, 35.0], [127.0, 35.02]] },
    { id: "b", name: "산 · 유평마을 → 치밭목대피소", coords: [[127.1, 35.0], [127.1, 35.01], [127.1, 35.02]] }], [], {},
    [{ name: "산 써리봉 1코스 · 대원사석등 → 써리봉", coords: [[127.1, 35.01], [127.12, 35.03]] },
     { name: "산 장당봉 1코스 · 산청대원사부도 → 대웅전", coords: [[127.1005, 35.0102], [127.12, 35.03]] },
     { name: "산 1코스 · 선물의집&찻집휴게소 → 써리봉", coords: [[127.1, 35.015], [127.12, 35.03]] }],
    [{ name: "도선사", lat: 35.0025, lon: 127.0 }, { name: "법계사", lat: 35.015, lon: 127.1 }, { name: "작은절사", lat: 35.0026, lon: 127.0005 }], ["도선사", "대원사"]).map(function (h) { return h.name; }).sort();
var dw = RF.trailHeads([{ id: "b", name: "산 · 유평마을 → 치밭목대피소", coords: [[127.1, 35.0], [127.1, 35.01], [127.1, 35.02]] }], [], {},
    [{ name: "산 써리봉 1코스 · 대원사석등 → 써리봉", coords: [[127.1, 35.01], [127.12, 35.03]] }],
    [{ name: "대원사집단시설지구주차장", lat: 35.3, lon: 127.5 }], ["대원사"]).filter(function (h) { return h.name === "대원사"; })[0];
eq("trailHeads 적은 들머리는 낱말이 든 이름표보다 다른 자료 코스 출발 먼저", [dw.lat, dw.lon], [35.01, 127.1]);
eq("trailHeads 절 · 다른 자료 출발 · 구 이름 빼기", th2, ["대원사", "도선사", "우이동", "유평마을"]);
// 옅은 선 끝이 닿아도 함께 시작하는 곳(송추), 마을 · 리로 끝나는 막다른 끝(강선리)
eq("trailHeads 옅은 선은 빼고 · 끝이 마을", RF.trailHeads([
    { id: "a", name: "산 · 송추 → 사패능선", coords: [[127.0, 35.0], [127.0, 35.02]] },
    { id: "x", name: "산 · 갈림길 → 갈림길", coords: [[127.01, 35.01], [127.0005, 35.0]], extra: true },
    { id: "k", name: "산 · 곰배골입구 → 곰배령 → 강선리", coords: [[127.3, 35.0], [127.3, 35.02]] }], [], {}, [], []).map(function (h) { return h.name; }).sort(),
    ["강선리", "곰배골입구", "송추"]);
eq("groupPois 원점회귀 출발 · 도착 같은 이름은 한 줄", RF.groupPois([{ name: "윗새재마을", lat: 35.3, lon: 127.7, dist_m: 0, off_route_m: 0 },
    { name: "윗새재마을", lat: 35.3001, lon: 127.7, dist_m: 14970, off_route_m: 0 }], 80)[0].names, ["윗새재마을"]);
eq("headLoopName", [RF.headLoopName("지리산 5구간 이어 걷기 · 새재 원점회귀", "윗새재마을"), RF.headLoopName("지리산 · 가 → 나", "윗새재마을")],
    ["지리산 5구간 이어 걷기 · 윗새재마을 원점회귀", "지리산 · 가 → 나"]);
eq("headLoopName 이름에 출발 · 도착 없는 왕복", RF.headLoopName("설악산 2구간 이어 걷기", "남설악탐방지원센터", true), "설악산 2구간 이어 걷기 · 남설악탐방지원센터 원점회귀");
eq("headLoopName 왕복(가 → 나 → 가)", RF.headLoopName("산 2구간 이어 걷기 · 성판악 → 정상 → 성판악", "성판악", true), "산 2구간 이어 걷기 · 성판악 원점회귀");
var fz = RF.fromApi("z", { course: { name: "지리산 · 중산리탐방지원센터 → 칼바위" }, points: [[127.0, 35.0, 600, 0], [127.0, 35.01, 900, 1100]],
    pois: [{ name: "중산리탐방안내소", lat: 35.0, lon: 127.0, dist_m: 0, off_route_m: 5 }, { name: "중산리주차장", lat: 35.001, lon: 127.002, dist_m: 100, off_route_m: 180 },
           { name: "칼바위", lat: 35.01, lon: 127.0, dist_m: 1100, off_route_m: 3 }] });
eq("fromApi 코스 처음이 탐방지원센터면 둘레 다른 들머리 이름표는 빼고", fz.pois.map(function (q) { return q.name; }), ["중산리탐방지원센터", "칼바위"]);
// 2026-10-13 PC: 이름 없는 탐방로 끝 229m 앞 절 이름표(청봉사)가 끝 이름이 됐음 - 끝 이름은 200m 안, 봉우리 · 정상만 700m
var stA = [{ id: "nm", name: "북한산 · 비매칭코스", coords: [[127.0, 35.0], [127.0, 35.005], [127.0, 35.01]], distance_m: 1110 },
    { id: "x1", name: "북한산 · 가 → 나", coords: [[127.0, 35.005], [127.01, 35.005]] }];
var stN = { nm: { total: 1110, pois: [{ name: "청봉사", dist_m: 880 }, { name: "보현봉", dist_m: 5 }] } };
eq("splitTrails 끝 이름은 200m 안(봉우리는 700m)", RF.splitTrails(stA, {}, null, stN).filter(function (x) { return x.base === "nm"; }).map(function (x) { return x.name; }),
    ["북한산 · 보현봉 → 가", "북한산 · 가 → 비매칭코스"]);
// 2026-10-13 홍TV님: 넓게 볼 때 '낙석주의' 같은 아이콘은 숨기고 확대하면 보이게
var zcls = {}, zfn = null, zz = 12;
var zmap = { getContainer: function () { return { classList: { toggle: function (c, on) { zcls[c] = on; } } }; }, getZoom: function () { return zz; }, on: function (ev, f) { zfn = f; } };
RF.spotsByZoom(zmap);
var zFar = zcls.far;
zz = 15; zfn();
eq("spotsByZoom 넓게는 far, 확대하면 풀림", [zFar, zcls.far], [true, false]);
eq("noteTrailName 공단 이름을 park-notes trails 로", [RF.noteTrailName({ 설악산: { trails: { "knps-4016": "백담사 → 소청봉" } } }, "knps-4016-55eabbcc", "설악산 · 대청봉코스(백담)"),
    RF.noteTrailName({ 설악산: { trails: { "knps-4016": "백담사 → 소청봉" } } }, "knps-40161-aa", "설악산 · 다른 길")], ["설악산 · 백담사 → 소청봉", "설악산 · 다른 길"]);
var bd = RF.fromApi("bd", { course: { name: "설악산 · 백담사 → 소청봉" }, points: [[127.0, 35.0, 400, 0], [127.0, 35.01, 900, 1100]],
    pois: [{ name: "백담사", lat: 35.001, lon: 127.0013, dist_m: 103, off_route_m: 117 }] });
eq("fromApi 길에서 떨어진 같은 이름 이름표는 들머리 자리로", [bd.pois[0].name, bd.pois[0].dist_m, bd.pois[0].off_route_m, bd.pois[0].lat], ["백담사", 0, 0, 35.0]);
var en = RF.fromApi("en", { course: { name: "설악산 · 대청봉코스" }, points: [[127.0, 35.0, 400, 0], [127.0, 35.01, 900, 1100]], pois: [], ends: { start: "오색약수터", end: "대청봉" } });
eq("fromApi 이름에 출발 · 도착이 없으면 서버 ends 이름", en.pois.map(function (q) { return q.name + "@" + q.dist_m; }), ["오색약수터@0", "대청봉@1100"]);
eq("routeEnds 순환", RF.routeEnds("덕대산 1코스 · 덕전리 순환"), { from: "덕전리", to: "덕전리" });
eq("nameText 순환은 그대로", RF.nameText("덕대산 1코스 · 덕전리 순환", true), "덕전리 순환");
var hp = RF.fromApi("hp", { course: { name: "해파랑길 49코스" }, points: [[128.4, 38.4, 5, 0], [128.4, 38.5, 9, 12300]],
    pois: [{ name: "49코스 (거진항~통일안보 공원)_12.3km-0", lat: 38.4, lon: 128.4, dist_m: 0, off_route_m: 3 }, { name: "49코스 (거진항~통일안보 공원)_12.3km-12", lat: 38.5, lon: 128.4, dist_m: 12300, off_route_m: 3 }] });
eq("fromApi 두루누비 사진 지점 이름은 빼고 (가~나) 를 들머리 · 날머리로", hp.pois.map(function (q) { return q.name; }), ["거진항", "통일안보 공원"]);
eq("fromApi 사진 지점 (가~나) 가 서버 ends 보다 먼저", RF.fromApi("hp2", { course: { name: "해파랑길 49코스" }, points: [[128.4, 38.4, 5, 0], [128.4, 38.5, 9, 12300]],
    pois: [{ name: "49코스 (거진항~통일안보 공원)_12.3km-0", lat: 38.4, lon: 128.4, dist_m: 0, off_route_m: 3 }], ends: { end: "고성군관광안내소" } }).pois.map(function (q) { return q.name; }), ["거진항", "통일안보 공원"]);
var lp = RF.fromApi("lp", { course: { name: "탄금호 순환자전거길 · 충주탄금대인증센터 순환" }, points: [[127.9, 36.99, 60, 0], [127.95, 37.0, 60, 9000], [127.9001, 36.9901, 60, 18000]],
    pois: [{ name: "루암리", lat: 36.9902, lon: 127.9002, dist_m: 17980, off_route_m: 10 }] });
eq("fromApi 순환은 끝에도 들머리 이름", lp.pois.map(function (q) { return q.name; }), ["충주탄금대인증센터", "루암리", "충주탄금대인증센터"]);
eq("fromApi 순환 끝 이름표는 again(지도에서 뺌)", lp.pois.map(function (q) { return !!q.again; }), [false, false, true]);
var lp2 = RF.fromApi("lp2", { course: { name: "탄금호 순환자전거길 · 충주탄금대인증센터 순환" }, points: [[127.9, 36.99, 60, 0], [127.95, 37.0, 60, 9000], [127.9001, 36.9901, 60, 18000]],
    pois: [{ name: "충주탄금대인증센터", lat: 36.99, lon: 127.9, dist_m: 3, off_route_m: 5 }, { name: "충주탄금대인증센터", lat: 36.9905, lon: 127.9005, dist_m: 17800, off_route_m: 5 },
           { name: "루암리", lat: 36.9902, lon: 127.9002, dist_m: 17990, off_route_m: 10 }] });
eq("fromApi 순환 끝 근처에 같은 이름이 끝 60m 밖이면 끝에 또", lp2.pois.filter(function (q) { return q.again; }).map(function (q) { return q.name + "@" + q.dist_m; }), ["충주탄금대인증센터@18000"]);
var jz = RF.fromApi("jz", { course: { name: "지리산 · 중산리 → 천왕봉" }, points: [[127.0, 35.0, 600, 0], [127.0, 35.04, 1900, 5083]],
    pois: [{ name: "중산리주차장", lat: 35.0, lon: 127.0007, dist_m: 0, off_route_m: 60 }, { name: "대원사집단시설지구주차장", lat: 35.0, lon: 127.0008, dist_m: 0, off_route_m: 72 },
           { name: "중산리탐방안내소", lat: 35.0001, lon: 127.0002, dist_m: 12, off_route_m: 16 }, { name: "천왕봉", lat: 35.04, lon: 127.0, dist_m: 5083, off_route_m: 2 }] });
eq("fromApi 짧은 끝 이름이면 둘레 들머리 이름표는 그 낱말이 든 것 하나", jz.pois.map(function (q) { return q.name; }), ["중산리탐방안내소", "천왕봉"]);
eq("noteTrailName 코스 ID 그대로 · 이름 전체", RF.noteTrailName({ 설악산: { trails: { "kmp-2322010639-1": "설악산 · 비선대 → 마등령 → 공룡능선 → 천불동 → 비선대" } } }, "kmp-2322010639-1",
    "설악산 큰새봉 1코스 · 설악산비선대와천불동계곡 순환"), "설악산 · 비선대 → 마등령 → 공룡능선 → 천불동 → 비선대");
eq("fromApi 남벽분 기점 → 남벽분기점", RF.fromApi("nb", { course: { name: "한라산 · 어리목 → 남벽분기점" }, points: [[126.5, 33.39, 970, 0], [126.53, 33.35, 1600, 6614]],
    pois: [{ name: "남벽분 기점", lat: 33.35, lon: 126.53, dist_m: 6614, off_route_m: 3 }] }).pois.map(function (q) { return q.name; }), ["어리목", "남벽분기점"]);
eq("dedupePlaceNames 산 이름만 더 붙은 같은 자리 이름표", RF.dedupePlaceNames([{ name: "울산바위", lat: 38.2, lon: 128.48 }, { name: "설악산 울산바위", lat: 38.2001, lon: 128.4801 },
    { name: "대청봉", lat: 38.12, lon: 128.46 }, { name: "중청대청봉", lat: 38.1201, lon: 128.46 }]).map(function (p) { return p.name; }), ["울산바위", "대청봉", "중청대청봉"]);
var full = RF.fromApi("r", { course: { name: "산 · 가 → 라" }, points: [[127.0, 35.0, 100, 0], [127.011, 35.0, 200, 1000], [127.022, 35.0, 150, 2000], [127.033, 35.0, 300, 3000]], pois: [] });
var sl = RF.sliceCourse(full, 1 / 3, 2 / 3, "산 · 나 → 다", "r@0.3333-0.6667:나>다");
eq("sliceCourse 거리 · 이름표", [Math.round(sl.total), sl.pois.map(function (p) { return p.name; }).join(","), sl.course.ascent_m], [1000, "나,다", 0]);
eq("parseJoinId 한 구간은 null", RF.parseJoinId("a"), null);
var ja = RF.fromApi("k17", { course: { name: "지리산둘레길 위태-하동호", kind: "walk" }, points: [[127.82864, 35.21691, 300, 0], [127.78512, 35.16266, 200, 10880]], pois: [] });
var jb = RF.fromApi("k21", { course: { name: "지리산둘레길 하동호-삼화실", kind: "walk" }, points: [[127.78512, 35.16266, 200, 0], [127.77048, 35.11899, 260, 9000]], pois: [] });
var jc = RF.joinCourses([ja, jb], "k17,k21");
eq("joinCourses 이름(번호 없는 길)", jc.course.name, "지리산둘레길 2구간 이어 걷기 · 위태 → 삼화실");
var jd = RF.joinCourses([RF.fromApi("b6", { course: { name: "국토종주 낙동강 자전거길 6구간 · 달성보인증센터 → 칠곡보인증센터" }, points: [[128, 35.8, 20, 0], [128.1, 35.9, 25, 1000]], pois: [] }),
    RF.fromApi("b7", { course: { name: "국토종주 낙동강 자전거길 7구간 · 칠곡보인증센터 → 구미보인증센터" }, points: [[128.1, 35.9, 25, 0], [128.2, 36, 30, 1000]], pois: [] })], "b6,b7");
eq("joinCourses 이름(번호 있는 길)", jd.course.name, "국토종주 낙동강 자전거길 6~7구간 · 달성보 → 구미보");
eq("joinCourses 거리 · 이음매 이름표 하나", [jc.total, jc.pois.map(function (p) { return p.name + "@" + p.dist_m; }).join(" ")], [19880, "위태@0 하동호@10880 삼화실@19880"]);
eq("joinCourses 오르막", jc.course.ascent_m, 60);
eq("거꾸로 해도 위치표지 그대로", RF.reverseCourse({ id: "x", course: { name: "a" }, lon: [1, 2], lat: [1, 2], ele: [1, 2], dist: [0, 1], total: 1, pois: [], signs: [{ loc_no: "가-1" }] }).signs.length, 1);
eq("둘레길 노선 안내도 카드", RF.routeGuides([{ course_id: "drnb-1", name: "해파랑길 1코스 · 오륙도해맞이공원 → 해운대해수욕장" },
    { course_id: "drnb-2", name: "해파랑길 2코스 · 해운대 → 대변항" }, { course_id: "drnb-3", name: "DMZ 평화의 길 19-1코스(우회로) · 승라부대까지" }, { course_id: "drnb-9", name: "이름만" }]),
    [{ trail: "해파랑길", name: "해파랑길", kind: "walk", n: 2 }, { trail: "DMZ 평화의 길", name: "DMZ 평화의 길", kind: "walk", n: 1 }]);
eq("검색어 든 산이 없으면 모두", RF.guideMaps(bw3, 3, "공주").length, 3);
eq("안내도 많아야 3개", RF.guideMaps(["가산", "나산", "다산", "라산"].map(function (m, i) { return { course_id: "frst-" + i + "-x", name: "시 " + m + " · 들머리 → " + m }; })).length, 3);
eq("isTopName 대피소 아님", RF.isTopName("장터목대피소"), false);
eq("infoText", RF.infoText({ up_min: 240, down_min: 180, level: "2.27" }), "공단 기준 오름 " + RF.hm(240 * 60000) + " · 내림 " + RF.hm(180 * 60000) + " · 난이도 2.27");
eq("infoText 없음", RF.infoText(null), null);
eq("infoText 0 분은 뺌", RF.infoText({ up_min: 0, down_min: 0, level: "" }), null);
eq("summitIndex 없음", RF.summitIndex([], "x"), -1);
eq("nameText 길만", [RF.nameText("지리산 · 백무동 → 천왕봉", true), RF.nameText("지리산둘레길 가탄-송정", true), RF.nameText("백두대간 17구간 · 창옥봉에서", true)],
    ["백무동 → 천왕봉", "가탄 → 송정", "창옥봉에서"]);
eq("nameText · 없으면 그대로", RF.nameText("지리산 둘레길 3코스"), "지리산 둘레길 3코스");

// cleanName
eq("cleanName 공원사무소 떼기", RF.cleanName("설악산국립공원사무소남설악탐방지원센터"), "남설악탐방지원센터");

// kmStep
eq("kmStep 10km", RF.kmStep(10000), 1000);
eq("kmStep 100km", RF.kmStep(100000), 5000);

// recordSkip - 100m 안 걸음 · 코스와 먼 곳은 남기지 않음
var near0 = [[37.0001, 127.0001, 0], [37.001, 127.0001, 1]];
eq("recordSkip 짧음", RF.recordSkip(50, near0, c), true);
eq("recordSkip 코스 근처", RF.recordSkip(500, near0, c), false);
eq("recordSkip 먼 곳", RF.recordSkip(500, [[35, 129, 0], [35.01, 129, 1]], c), true);

// recordCourse - 10m 안 점은 솎고 끝점은 남김, 메모는 가장 가까운 점 거리
var rec = { name: "기록", kind: "hike", track: [[37, 127, 0, 100], [37.00002, 127, 1, 101], [37.001, 127, 2, 110], [37.002, 127, 3, 120]],
            notes: [{ lat: 37.001, lon: 127, t: 2, text: "여기 경치\n좋음", ele: 110 }] };
var rc = RF.recordCourse(rec);
eq("recordCourse 점 수", rc.lat.length, 3);
near("recordCourse 길이", rc.total, 222, 2);
eq("recordCourse 메모 이름", rc.pois[0].name, "📝 여기 경치 좋음");
near("recordCourse 메모 거리", rc.pois[0].dist_m, 111, 2);
near("recordCourse 오르막", RF.ascentLeft(rc, 0), 20, 0.5);

// 2026-10-09 점검: 시 · 분 반올림
eq("hm 3시간 59분 40초", RF.hm((3 * 3600 + 59 * 60 + 40) * 1000), "4시간 0분");
eq("hm 40분", RF.hm(40 * 60000), "40분");
eq("hm 0시간 붙임", RF.hm(40 * 60000, true), "0시간 40분");

// 2026-10-09 점검: 같은 이름이라도 멀면 둘 다 남김, 가까우면 하나
var dd = RF.dedupePois([{ name: "쉼터", lat: 37, lon: 127, dist_m: 100 }, { name: "쉼터", lat: 37.03, lon: 127, dist_m: 3400 },
                        { name: "쉼터", lat: 37.0005, lon: 127, dist_m: 160 }]);
eq("dedupePois 같은 이름 먼 곳", dd.length, 2);

// 2026-10-10 5차 점검: notifyDeploy - HEAD 하나라도 실패하면 처음 표시를 남기지 않음(반쪽 표시로 띠가 잘못 뜨던 것), ✕ 로 닫기
function deployEnv(okFirst) {
    var calls = 0, listeners = {}, appended = [], ver = "a";
    function el(tag) {
        return { tag: tag, children: [], style: {}, attrs: {}, parentNode: null,
                 appendChild: function (c) { c.parentNode = this; this.children.push(c); },
                 removeChild: function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; },
                 setAttribute: function (k, v) { this.attrs[k] = v; } };
    }
    var body = el("body");
    var doc = { visibilityState: "visible", body: body, createElement: el,
                addEventListener: function (n, f) { listeners[n] = f; } };
    var fetchFn = function (f) {
        calls++;
        var ok = okFirst || calls > 2 || f !== "b.js";
        return Promise.resolve({ ok: ok, headers: { get: function (h) { return h === "ETag" ? f + ver : null; } } });
    };
    var sb = { window: {}, console: console, fetch: fetchFn, document: doc, location: { reload: function () {} }, Date: Date };   // Date - 시계를 앞으로 돌리려고 밖의 것을 씀
    sb.window.fetch = fetchFn; sb.window.document = doc;
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../main/webapp/js/course-kit.js"), "utf8"), sb);
    sb.window.RF.notifyDeploy(["a.js", "b.js"], function () { return true; });
    return { body: body, setVer: function (v) { ver = v; },
             back: function () { var realNow = Date.now; doc.visibilityState = "hidden"; listeners.visibilitychange();
                                 Date.now = function () { return realNow() + 120000; }; doc.visibilityState = "visible"; listeners.visibilitychange();
                                 Date.now = realNow; } };
}
var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
var envBad = deployEnv(false), envOk = deployEnv(true);
tick().then(function () {
    envBad.back();   // 처음 표시가 반쪽(b.js 실패)이었으면 다 받아도 띠를 띄우지 않음
    envOk.setVer("b");   // 정상: 배포로 표시가 바뀜
    envOk.back();
    return tick();
}).then(function () {
    eq("notifyDeploy 처음 HEAD 실패면 띠 없음", envBad.body.children.length, 0);
    eq("notifyDeploy 바뀌면 띠", envOk.body.children.length, 1);
    var bar = envOk.body.children[0];
    eq("notifyDeploy 띠에 새로 고침 · ✕ 두 단추", bar.children.length, 2);
    eq("notifyDeploy ✕ 이름", bar.children[1].attrs["aria-label"], "새 버전 알림 닫기");
    bar.children[1].onclick();
    eq("notifyDeploy ✕ 로 닫힘", envOk.body.children.length, 0);
    // 예약 명단 파일 · 엑셀 붙여 넣기(2026-10-28) - 이름 · 좌석만, 전화번호 · 다른 칸은 버림
    var lines = function (ppl) { return [ppl.map(function (p) { return p.name + (p.seat ? " " + (p.bus > 1 ? p.bus + "-" : "") + p.seat : p.bus > 1 ? " " + p.bus + "호차" : ""); }).join("\n")]; };
    var rr = RF.rosterRead(["이름\t연락처\t탑승지\t좌석", "홍 길동\t010-1234-5678\t사당\t5", "김철수\t01098765432\t양재\t2-15", "박영희\t010-1111-2222\t사당\t"].join("\n"));
    eq("명단 - 엑셀 붙여 넣기(머리 줄)", JSON.stringify(rr), JSON.stringify({ people: [{ name: "홍길동", bus: 1, seat: 5 }, { name: "김철수", bus: 2, seat: 15 }, { name: "박영희", bus: 1, seat: null }], phones: 3, dropped: ["연락처", "탑승지"] }));
    var rc = RF.rosterRead("\uFEFF번호,성명,호차,좌석,금액\r\n1,홍길동,2,15,\"35,000\"\r\n2,김철수,1,3,35000");
    eq("명단 - CSV 호차 칸 · 따옴표 · BOM", [lines(rc.people), rc.dropped], [["홍길동 2-15\n김철수 3"], ["번호", "금액"]]);
    var rn = RF.rosterRead("1,홍길동,010-1234-5678,5\n2,김철수,010-2222-3333,6\n3,박영희,010-3333-4444,");
    eq("명단 - 머리 줄 없는 CSV(순번 칸은 좌석 아님)", lines(rn.people), ["홍길동 5\n김철수 6\n박영희"]);
    var rf = RF.rosterRead("일식이 5 이식이 6 삼식이 010-1234-5678 사식이 2-15");
    eq("명단 - 자유 글 · 전화번호 버림", [lines(rf.people), rf.phones], [["일식이 5\n이식이 6\n삼식이\n사식이 2-15"], 1]);
    var rd = RF.rosterRead("이름\t좌석\n시험일\t5\n시험이\t2월 15일\n시험삼\t3/7\n시험사\t");
    eq("명단 - 엑셀이 날짜로 바꾼 좌석(2월 15일 · 3/7)", lines(rd.people), ["시험일 5\n시험이 2-15\n시험삼 3-7\n시험사"]);
    eq("명단 - 머리 줄 없이 날짜 꼴 좌석", lines(RF.rosterRead("시험일\t5\n시험이\t2월 15일").people), ["시험일 5\n시험이 2-15"]);
    eq("명단 - 좌석 없이 호차만 남김", lines(RF.rosterRead("이름\t호차\t좌석\n시험사\t1\t7\n시험오\t2\t20\n시험육\t2\t").people), ["시험사 7\n시험오 2-20\n시험육 2호차"]);
    eq("명단 - 자유 글 호차만", JSON.stringify(RF.rosterRead("시험육 2호차 시험칠").people), JSON.stringify([{ name: "시험육", bus: 2, seat: null }, { name: "시험칠", bus: 1, seat: null }]));
    var rh = function (t) { return lines(RF.rosterRead(t).people)[0]; };
    eq("명단 - 머리 낱말은 회원이 아님(한 칸 · 자유 글)", [rh("이름\n홍길동\n김철수"), rh("이름 좌석\n홍길동 5")], ["홍길동\n김철수", "홍길동 5"]);
    eq("명단 - 모르는 머리 이름(고객명 · 예약자 이름 · 좌석번호)", [rh("고객명,연락처,좌석\n홍길동,010-1111-2222,5\n김철수,010-2222-3333,6"), rh("예약자 이름\t좌석번호\n홍길동\t5")], ["홍길동 5\n김철수 6", "홍길동 5"]);
    eq("명단 - 2호차 15번 · 이름 끝 숫자", [rh("홍길동 2호차 15번 김철수2 5"), rh("홍길동 2호차15번")], ["홍길동 2-15\n김철수2 5", "홍길동 2-15"]);
    // 산행을 마친 화면 "다음은?"(2026-10-28)
    var ah = RF.afterHikeLinks({ trip: "https://kr.trip.com/hotels/?Allianceid=1&SID=2", coupang: { knee: ["https://link.coupang.com/a/x"] } }, { lat: 38.1, lon: 128.5, name: "설악산 오색" }, false);
    eq("다음은 - 맛집 · 숙소 · 쿠팡 · 다음 산", ah.links.map(function (x) { return x.text + (x.sponsored ? "*" : ""); }), ["🍜 설악산 오색 맛집", "🏨 근처 숙소(트립닷컴)*", "🦵 무릎 보호대(쿠팡)*", "⛰️ 다음 산 고르기"]);
    eq("다음은 - 맛집은 카카오맵 검색", ah.links[0].href, "https://map.kakao.com/link/search/" + encodeURIComponent("설악산 오색 맛집"));
    eq("다음은 - 제휴 표시", [ah.affiliate, ah.coupang, ah.links[1].href.indexOf("Allianceid=1") > 0], [true, true, true]);
    var ae = RF.afterHikeLinks({ agoda: "https://www.agoda.com/search?lat={lat}&lon={lon}&cid=1" }, { lat: 38.1, lon: 128.5, name: "x" }, true);
    eq("다음은 - 영어 · 아고다 좌표 · 쿠팡 없음", [ae.links.length, ae.links[1].href, ae.links[2].href, ae.coupang], [3, "https://www.agoda.com/search?lat=38.10000&lon=128.50000&cid=1", "en/m/", false]);
    eq("다음은 - 영어는 이름도 영어(검색은 한글)", [RF.afterHikeLinks({}, { name: "설악산 대청봉" }, true).links[0].text, RF.afterHikeLinks({}, { name: "설악산 대청봉" }, true).links[0].href.indexOf(encodeURIComponent("설악산")) > 0], ["🍜 Food near Seoraksan Daecheongbong", true]);
    // 쿠팡 - 회복 용품 + 오늘 산행 · 계절에 맞는 것(2026-10-28 홍TV님 "a, b")
    var CP = { crampon: ["https://link.coupang.com/c"], knee: ["https://link.coupang.com/k"], warm: ["https://link.coupang.com/w"], sun: ["https://link.coupang.com/s"], stick: ["https://link.coupang.com/t"], recovery: ["https://link.coupang.com/r"] };
    var gk = function (up, mo, cp) { var g = RF.afterHikeGear(cp || CP, up, mo); return (g.recovery.length ? "r+" : "") + (g.gear ? g.gear.key : "-"); };
    eq("쿠팡 - 한겨울 아이젠 · 큰 오르막 무릎 · 11월 보온 · 여름 모자 · 400m 스틱 · 봄 낮은 산 무릎", [gk(900, 1), gk(900, 10), gk(300, 11), gk(300, 7), gk(500, 5), gk(100, 5)], ["r+crampon", "r+knee", "r+warm", "r+sun", "r+stick", "r+knee"]);
    eq("쿠팡 - 링크 없는 것은 건너뜀 · 회복 없으면 하나만", [gk(900, 1, { stick: ["https://link.coupang.com/t"] }), gk(0, 1, {})], ["stick", "-"]);
    var named = RF.afterHikeLinks({ coupang: { recovery: ["https://link.coupang.com/1", "https://link.coupang.com/2", "https://link.coupang.com/3"], knee: ["https://link.coupang.com/k"] }, coupangNames: { recovery: ["폼롤러", "마사지건", "콘드로이친"] } }, { name: "x", up: 100, month: 10 }, false);
    eq("쿠팡 - 회복 용품 이름마다(폼롤러 · 마사지건 · 콘드로이친)", named.links.map(function (x) { return x.text; }).slice(1, 5), ["🧴 폼롤러(쿠팡)", "🧴 마사지건(쿠팡)", "🧴 콘드로이친(쿠팡)", "🦵 무릎 보호대(쿠팡)"]);
    eq("쿠팡 - 화면에 둘(회복 · 그날 것)", RF.afterHikeLinks({ coupang: CP }, { name: "x", up: 900, month: 7 }, false).links.map(function (x) { return x.text; }).slice(1, 3), ["🧴 산행 뒤 회복 용품(쿠팡)", "🦵 무릎 보호대(쿠팡)"]);
    eq("다음은 - 제휴 설정 없으면 맛집 · 다음 산만", RF.afterHikeLinks({}, { name: "북한산" }, false).links.length, 2);
    // 인솔자 지금 할 일 · 회원 탑승 카드(2026-10-28 추천 2)
    var mem = function (n, o) { var m = { role: "hiker", nick: n }; for (var k in o) m[k] = o[k]; return m; };
    var b0 = RF.leadSteps({ role: "lead", chief: true, now: 0, seats: 28, members: [mem("가", { boarded: true }), mem("나", {}), mem("다", { cancelled: true })] });
    eq("할 일 - 출발 전", [b0.phase, b0.steps[1].text, b0.steps[2].act], ["before", "출발 탑승 확인 1 / 2 - 좌석표에서 탄 사람 누르기", "departBtn"]);
    eq("할 일 - 좌석 없는 방은 명단으로", RF.leadSteps({ role: "lead", chief: true, now: 0, seats: 0, members: [mem("나", {})] }).steps[1].act, "list");
    var b1 = RF.leadSteps({ role: "lead", chief: true, departed: true, now: 0, endAt: 9, drops: ["한계령"], members: [mem("가", { aboard: true }), mem("나", { sos: true })] });
    eq("할 일 - 산행 중 SOS · 하차 · 남은 사람", [b1.phase, b1.steps[0].text, b1.steps[1].act, b1.steps[2].text], ["hiking", "🆘 SOS 1명 - 바로 연락", "arriveRow", "하산 탑승 1 / 2 · 남은 사람 나"]);
    var b2 = RF.leadSteps({ role: "lead", chief: true, departed: true, now: 0, members: [mem("가", { aboard: true })] });
    eq("할 일 - 모두 탔으면 방 끝내기", [b2.phase, b2.steps[0].done, b2.steps[1].act], ["after", true, "endBtn"]);
    eq("할 일 - 보조 인솔자는 끝내기 단추 없음", RF.leadSteps({ role: "lead", departed: true, now: 0, members: [mem("가", { aboard: true })] }).steps[1].act, "");
    var P0 = Date.UTC(2026, 9, 29, 8, 0);
    eq("탑승 카드", RF.boardingCard({ name: "설악산", nick: "철수", buses: 2, bus: 2, plates: ["서울70사1111", "서울70사2222"], seat: 12, stop: "사당", stops: ["사당", "양재"], stopTimes: ["23:20", "23:40"],
        drop: "한계령", pickup: "설악동", pickupAt: { "설악동": P0 }, endAt: P0 + 3600000, leaderPhone: "010-0000-0000" }),
        ["🎫 설악산 · 철수", "🚌 2호차 · 서울70사2222", "💺 12번", "🚏 사당 23:20", "⬇ 한계령 하차", "🚌 하산 탑승 설악동 17:00", "📞 인솔자 010-0000-0000"]);
    eq("탑승 카드 - 시각 없는 하산 탑승지는 하산 마감", RF.boardingCard({ name: "x", pickup: "용대리", pickupAt: {}, endAt: P0 }).slice(-1)[0], "⏰ 하산 마감 17:00");
    // 사무실 끝난 산행 CSV(2026-10-28) - office-csv.js
    var cs = { window: {} };
    vm.createContext(cs);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../main/webapp/js/office-csv.js"), "utf8"), cs);
    var csv = cs.window.RFOfficeCsv.officeCsv([{ endedAt: Date.UTC(2026, 9, 28, 9, 5), departAt: Date.UTC(2026, 9, 27, 14, 20), name: "=설악산, \"공룡\"", by: "시험대장", hikers: 40, boarded: 38, notBoarded: 2, departed: true, aboard: 37, apart: 1, notDown: 1, sosEver: true },
        { endedAt: Date.UTC(2026, 9, 28, 0, 0), name: "취소 산행", cancelled: true, why: "태풍", by: "시험대장", hikers: 10 }]);
    var lines = csv.split("\r\n");
    eq("CSV - 엑셀용 BOM", csv.charCodeAt(0), 0xFEFF);
    eq("CSV - 머리 줄", lines[0].slice(1), "끝난 날,끝난 시각,산행,출발,취소,취소 사유,끝낸 사람,회원,출발 탑승,안 탐,하산 탑승,따로 귀가,하산 미확인,SOS");
    eq("CSV - 한국 시각 · 수식 막기 · 따옴표", lines[1], "2026-10-28,18:05,\"'=설악산, \"\"공룡\"\"\",2026-10-27 23:20,,,시험대장,40,38,2,37,1,1,있었음");
    eq("CSV - 취소는 하산 칸 비움", lines[2], "2026-10-28,09:00,취소 산행,,취소,태풍,시험대장,10,0,0,,,,");
    var csvEn = cs.window.RFOfficeCsv.officeCsv([{ endedAt: Date.UTC(2026, 9, 28, 0, 0), name: "취소 산행", cancelled: true, why: "태풍", by: "시험대장", hikers: 10, sosEver: true }], true).split("\r\n");
    eq("끝낸 사람 영어", ["주 인솔자", "사무실", "자동(하산 마감이 지남)", "모름"].map(function (b) { return cs.window.RFOfficeCsv.byText(b, true); }).concat([cs.window.RFOfficeCsv.byText("주 인솔자", false)]),
        ["Chief leader", "Office", "Auto (descent deadline passed)", "모름", "주 인솔자"]);
    eq("CSV 영어 - 머리 줄 · 취소 · SOS", [csvEn[0].slice(1).split(",")[0], csvEn[0].split(",").length, csvEn[1]], ["Ended date", 14, "2026-10-28,09:00,취소 산행,,Cancelled,태풍,시험대장,10,0,0,,,,Yes"]);
    console.log((fails ? "FAILED " : "OK ") + (runs - fails) + "/" + runs);
    process.exit(fails ? 1 : 0);
});

// 🏨 근처 숙소(2026-10-29) - 서버 Stays.tripLink(ReviewRound3Test)와 같은 주소
var STAY = RF.staysItem({ trip: "https://kr.trip.com/hotels/?cityId=1&Allianceid=1&SID=2" }, "한라산", 33.361667, 126.529167, false);
eq("staysItem 트립닷컴 - 제휴 꼬리 두고 좌표로", [STAY && STAY.text, STAY && STAY.href], ["🏨 근처 숙소(트립닷컴)", "https://kr.trip.com/hotels/list?cityId=0&searchType=LM&searchWord=%ED%95%9C%EB%9D%BC%EC%82%B0&searchValue=13%7C0*13*33.361667%7C126.529167%7C%ED%95%9C%EB%9D%BC%EC%82%B0%7C0%7C1&listFilters=17~5*17*5&Allianceid=1&SID=2"]);
eq("staysItem 아고다 · 없음", [RF.staysItem({ agoda: "https://www.agoda.com/x?lat={lat}&lon={lon}" }, "설악산", 38.1, 128.4, true).text, RF.staysItem({}, "x", 1, 2), RF.staysItem(null)], ["🏨 Stays nearby (Agoda)", null, null]);

var SL = RF.stayLinks({ trip: "https://kr.trip.com/hotels/?Allianceid=1", agoda: "https://www.agoda.com/x?lat={lat}&lon={lon}", yeogi: "https://www.yeogi.com/s?k={q}&a=7", yanolja: "https://yanolja.com/noplace" }, "산청군청", 35.415, 127.873, false);
eq("stayLinks 설정된 곳만 · 이름 · 좌표 넣기 · 카카오맵(제휴 아님)", SL.map(function (x) { return x.text + (x.sponsored ? "*" : ""); }), ["🏨 트립닷컴*", "🏨 아고다*", "🏨 여기어때*", "🏨 야놀자*", "🗺 카카오맵 숙소"]);
eq("stayLinks 아고다 파트너스 텍스트 링크(자리 없음) 그대로 제휴", RF.stayLinks({ agoda: "https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1&hl=ko-kr" }, "산청", 35.4, 127.8, false)[0], { text: "🏨 아고다", href: "https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1&hl=ko-kr", sponsored: true });
eq("stayLinks 여기어때 {q} · 아고다 좌표", [SL[2].href, SL[1].href], ["https://www.yeogi.com/s?k=%EC%82%B0%EC%B2%AD%EA%B5%B0%EC%B2%AD&a=7", "https://www.agoda.com/x?lat=35.41500&lon=127.87300"]);
eq("stayLinks 제휴 설정 없음 - 여기어때 · 야놀자는 지역(산청군) 검색 결과, 아고다는 첫 화면(제휴 아님) + 카카오맵", RF.stayLinks({}, "산청군청", 35.4, 127.8, false, "산청군").map(function (x) { return x.text + (x.sponsored ? "*" : "") + " " + x.href; }),
    ["🔎 아고다 https://www.agoda.com/ko-kr/", "🔎 여기어때 https://www.yeogi.com/domestic-accommodations?keyword=%EC%82%B0%EC%B2%AD%EA%B5%B0",
        "🔎 야놀자 https://nol.yanolja.com/discovery/list/search/PRODUCT_CATEGORY_KOREA_ACCOMMODATION?q=%EC%82%B0%EC%B2%AD%EA%B5%B0", "🗺 카카오맵 숙소 https://map.kakao.com/link/search/%EC%82%B0%EC%B2%AD%EA%B5%B0%EC%B2%AD%20%EC%88%99%EC%86%8C"]);

// 화면 js 검사(2026-10-29 PC: mountain.js 가 뒤쪽 "var … RF = window.RF" 보다 앞에서 RF. 를 써 undefined 로 멈췄음) - 그런 줄이 없어야 함(주석 빼고)
(function () {
    var dir = path.join(__dirname, "../../main/webapp/js"), bad = [];
    fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
        var lines = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/), decl = -1;   // PC(core.autocrlf)는 CRLF - \r 이 남으면 주석 지우기가 안 됐음(2026-10-29 PC)
        lines.forEach(function (l, i) { if (decl < 0 && /(var |, )RF = window\.RF\b/.test(l)) decl = i; });
        for (var i = 0; i < decl; i++) {
            var code = /^\s*(\/\*|\*)/.test(lines[i]) ? "" : lines[i].replace(/\/\/.*$/, "");   // 주석 줄(// · /* · *) 빼고
            if (/(^|[^.\w])RF\./.test(code)) bad.push(f + ":" + (i + 1));
        }
    });
    eq("var RF 보다 앞에서 RF. 를 쓰는 줄 없음(window.RF 로)", bad, []);
})();

// 아고다 도시 번호(2026-10-29) - 가까운 도시 · 링크에 city= 붙이기, 번호표 만들기 스크립트(시험 CSV)
var AC = [{ id: 180228, name: "Sancheong", n: 20, lat: 35.41, lon: 127.87 }, { id: 9999, name: "Far", n: 500, lat: 37.5, lon: 127.0 }];
eq("nearCity 40km 안 가까운 곳 · 없으면 null", [RF.nearCity(AC, 35.415, 127.873), RF.nearCity(AC, 33.3, 126.5), RF.nearCity(null, 1, 2)], [180228, null, null]);
eq("stayLinks 아고다 도시 번호 - 파트너 링크에 city · 지역, 없으면 아고다 검색(제휴 아님)", [
    RF.stayLinks({ agoda: "https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1&hl=ko-kr" }, "산청군청", 35.4, 127.8, false, "산청군", 180228)[0].href,
    RF.stayLinks({}, "산청군청", 35.4, 127.8, false, "산청군", 180228)[0].href],
    ["https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1&hl=ko-kr&city=180228&textToSearch=%EC%82%B0%EC%B2%AD%EA%B5%B0", "https://www.agoda.com/ko-kr/search?city=180228&textToSearch=%EC%82%B0%EC%B2%AD%EA%B5%B0"]);
(function () {
    var tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "agoda-")), csv = path.join(tmp, "h.csv"), outF = path.join(tmp, "c.json");
    fs.writeFileSync(csv, "\uFEFFhotel_id,hotel_name,city_id,city,countryisocode,latitude,longitude\n1,\"A, B\",180228,Sancheong,KR,35.41,127.87\n2,C,180228,Sancheong,KR,35.43,127.89\n3,D,5,Tokyo,JP,35.6,139.7\n");
    require("child_process").execFileSync(process.execPath, [path.join(__dirname, "../../../tools/agoda-cities/make.js"), csv, "--out=" + outF]);
    var j = JSON.parse(fs.readFileSync(outF, "utf8"));
    eq("agoda-cities make.js - 한국만, 도시마다 수 · 가운데, 숙소 이름은 넣지 않음", [j.cities, /hotel_name|A, B/.test(fs.readFileSync(outF, "utf8"))], [[{ id: 180228, name: "Sancheong", n: 2, lat: 35.42, lon: 127.88 }], false]);
})();

var OFN = { 가야산: { official: { "knps-7013": "가야산1코스", "knps-7012": "가야산2코스", "knps-7017": "만물상코스" } } };
eq("officialName 공단 공식 이름(ID 앞부분)", [RF.officialName(OFN, "knps-7013-3d5c7ede"), RF.officialName(OFN, "knps-70131-aa"), RF.officialName(null, "x")], ["가야산1코스", "", ""]);
eq("officialMatches 띄어쓰기 무시 · 두 글자부터", [RF.officialMatches(OFN, "가야산 1코스").map(function (m) { return m.key; }),
    RF.officialMatches(OFN, "가야산").length, RF.officialMatches(OFN, "만물상")[0].park, RF.officialMatches(OFN, "가").length], [["knps-7013"], 2, "가야산", 0]);
eq("isHiddenCourse park-notes hide(앞부분)", [RF.isHiddenCourse({ 가야산: { hide: ["knps-7014"] } }, "knps-7014-1d6f62a3"),
    RF.isHiddenCourse({ 가야산: { hide: ["knps-7014"] } }, "knps-70141-aa"), RF.isHiddenCourse(null, "knps-7014-1")], [true, false, false]);
var ACN = { 가야산: { access: { "knps-7013": { car: "치인대형주차장 → 토신골탐방지원센터(도보)", vcurs: "120700V002" }, "knps-7012": { vcurs: "bad" } } } };
eq("courseAccess 공단 교통편", [RF.courseAccess(ACN, "knps-7013-3d5c7ede"), RF.courseAccess(ACN, "knps-7012-ccb26052"), RF.courseAccess(ACN, "knps-70131-x")],
    [{ car: "치인대형주차장 → 토신골탐방지원센터(도보)", url: "https://www.knps.or.kr/front/portal/visit/visitCourseSubMain.do?parkId=120700&vcursId=120700V002&parkNavGb=traffic&menuNo=7020084" }, null, null]);
eq("guideMaps 국립공원 이름 코스가 다른 곳(광양 가야산 1코스)이면 국립공원 카드에 섞지 않음", RF.guideMaps([
    { course_id: "kmp-1-1", name: "가야산 1코스", start_lat: 34.94, start_lon: 127.70 },
    { course_id: "frst-462300101-aa", name: "광양 가야산 · 가야산 1코스", start_lat: 34.94, start_lon: 127.70 },
    { course_id: "knps-7018-d7139b32", name: "가야산 · 가야산 소리길", start_lat: 35.75, start_lon: 128.15 },
    { course_id: "knps-7013-3d5c7ede", name: "가야산 · 해인사 → 상왕봉(우두봉)", start_lat: 35.80, start_lon: 128.10 }], 3, "가야산").map(function (g) { return g.label + "|" + g.from; }),
    ["가야산|knps-7018-d7139b32", "광양 가야산|kmp-1-1"]);
var GMR = [];
for (var gi = 0; gi < 40; gi++) GMR.push({ course_id: "frst-448100301-" + gi, name: "서산 가야산 · " + gi + "코스", start_lat: 36.70, start_lon: 126.60 });
for (gi = 0; gi < 18; gi++) GMR.push({ course_id: "frst-461700101-" + gi, name: "나주 가야산 · " + gi + "코스", start_lat: 35.02, start_lon: 126.72 });
for (gi = 0; gi < 13; gi++) GMR.push({ course_id: "kmp-7366020018-" + gi, name: "가야산 " + gi + "코스", start_lat: 34.94, start_lon: 127.70 });
GMR.push({ course_id: "knps-7018-d7139b32", name: "가야산 · 가야산 소리길", start_lat: 35.75, start_lon: 128.15 });
eq("guideMaps 국립공원 카드는 맨 앞 · 장 수에 세지 않음", RF.guideMaps(GMR, 3, "가야산").map(function (g) { return g.from; }),
    ["knps-7018-d7139b32", "frst-448100301-0", "frst-461700101-0", "kmp-7366020018-0"]);
eq("weatherWord 하늘 · 비", [RF.weatherWord(1, 0), RF.weatherWord(4, 0), RF.weatherWord(1, 1), RF.weatherWord(null, null)], ["☀️ 맑음", "☁️ 흐림", "🌧 비", "-"]);
eq("summitTemp 100m 에 0.65도", [RF.summitTemp(18, 600, 1400), RF.summitTemp(18, null, 1400)], [12.8, null]);
eq("windChill 10도 이하 · 1.3m/s 이상만", [RF.windChill(0, 10), RF.windChill(-10, 5), RF.windChill(12, 10), RF.windChill(0, 1), RF.windChill(null, 5)], [-7, -17, null, null, null]);
eq("windNote 날마다 최대 - 7 이상 바람 강함, 10 이상 강풍", RF.windNote([{ t: "2026-10-16 09:00", wsd: 3 }, { t: "2026-10-16 15:00", wsd: 6.9 },
    { t: "2026-10-17 06:00", wsd: 8.2 }, { t: "2026-10-17 12:00", wsd: 7.5 }, { t: "2026-10-18 12:00", wsd: 11 }, { t: "2026-10-18 13:00", wsd: null }], "2026-10-16")
    .map(function (n) { return n.day + " " + n.wsd + " " + n.text.split(". ")[0].split(", ")[0]; }),
    ["2026-10-17 8.2 ⚠ 바람 강함 - 내일 10/17(토) 6시 무렵 들머리 8.2m/s", "2026-10-18 11 ⚠ 강풍 - 모레 10/18(일) 12시 무렵 들머리 11m/s"]);
eq("windNote 자리 말", RF.windNote([{ t: "2026-10-18 20:00", wsd: 8.3 }], "2026-10-16", "정상 둘레")[0].text.indexOf("20시 무렵 정상 둘레 8.3m/s") > 0, true);
(function () {
    var c = { dist: [0, 1000, 2000], asc: [0, 300, 600], total: 2000, pois: [{ name: "a", dist_m: 1000, ele_m: 900 }, { name: "끝", dist_m: 2000 }] };
    var r = RF.scheduleRows(c, 0, "hike");
    eq("scheduleRows 끝 이름표는 빼고 시각은 늘어남", [r.rows.length, r.rows[0].name, r.rows[0].at > 0, r.end > r.rows[0].at], [1, "a", true, true]);
})();
(function () {
    var a = RF.sunset(Date.UTC(2026, 9, 13, 23, 0), 35.8, 128.1), b = RF.sunset(Date.UTC(2026, 9, 14, 1, 30), 35.8, 128.1);   // 한국 10-14 08:00 · 10:30
    eq("sunset 한국 아침 9시 전도 그날 일몰", [a === b, a > Date.UTC(2026, 9, 14, 0, 0), new Date(a + 9 * 3600000).getUTCHours()], [true, true, 17]);
})();
(function () {
    var gaya = { id: "가야산", lat: 35.822544, lon: 128.122849, alt: [{ name: "상왕봉(우두봉)", lat: 35.823298, lon: 128.120373 }] };
    eq("peaksDue 정상 둘(가야산 칠불봉 · 상왕봉) - 상왕봉에서도 도장", [RF.peaksDue([gaya], 35.8233, 128.1204, {}).length, RF.peaksDue([{ id: "x", lat: 35.822544, lon: 128.122849 }], 35.8233, 128.1204, {}).length], [1, 0]);
    eq("peakCourses 끝이 상왕봉인 코스가 맨 앞", RF.peakCourses([{ course_id: "a", name: "서성재", end_lat: 35.8300, end_lon: 128.1300 }, { course_id: "b", name: "상왕봉", end_lat: 35.823298, end_lon: 128.120373 }], gaya, 2000).map(function (c) { return c.course_id; }), ["b", "a"]);
})();
eq("regionNames 같은 산 지역 붙이기(광양 가야산 자락), 공단 · 먼 곳은 그대로", RF.regionNames([
    { course_id: "kmp-7366020018-1", name: "광양 가야산 · 민방위대피소 → 가야산", start_lat: 34.94, start_lon: 127.70 },
    { course_id: "kmp-1-1", name: "가야산 자락 1코스 · 적벽 → 금강블루빌", start_lat: 34.95, start_lon: 127.71 },
    { course_id: "kmp-2-1", name: "가야산 1코스 · a → b", start_lat: 35.8, start_lon: 128.1 },
    { course_id: "knps-7013-x", name: "가야산 · 해인사 → 상왕봉(우두봉)", start_lat: 34.94, start_lon: 127.70 }]),
    { "kmp-1-1": "광양 가야산 자락 1코스 · 적벽 → 금강블루빌" });
eq("nameParts 무리의 산 이름이 끝 이름 앞에 붙은 봉우리는 뗌", [RF.nameParts("가야산 동성봉 자락 2코스 · 백운동탐방지원센터 → 가야산칠불봉").route,
    RF.nameParts("가야산 · 해인사 → 가야산소리길").route, RF.nameParts("남산 · 삼릉 → 남산제일봉").route, RF.nameParts("설악산 · 오색 → 설악산대청봉").route],
    ["백운동탐방지원센터 → 칠불봉", "해인사 → 가야산소리길", "삼릉 → 남산제일봉", "오색 → 대청봉"]);
eq("nameParts 고개 · 전망대는 산 이름을 떼지 않음", [RF.nameParts("어산 · 자창 → 어산이재").route, RF.nameParts("무등산 장원봉 1코스 · 무등산전망대 → 무등산장원봉").route],
    ["자창 → 어산이재", "무등산전망대 → 장원봉"]);
eq("lateAt 1.5배 · 적어도 1시간 더", [RF.lateAt(0, 4 * 3600000) / 3600000, RF.lateAt(1000, 3600000) - 1000], [6, 2 * 3600000]);
(function () {
    var p = RF.fitPath([37, 37.01, 37], [127, 127, 127.01], 100, 100, 10);
    eq("fitPath 북쪽이 위 · 칸 안 · 비율 지킴", [p.length, p[1][1] < p[0][1], p.every(function (q) { return q[0] >= 9.99 && q[0] <= 90.01 && q[1] >= 9.99 && q[1] <= 90.01; }),
        Math.round((p[2][0] - p[0][0]) / (p[0][1] - p[1][1]) * 100) / 100], [3, true, true, 0.8]);
    eq("fitPath 빈 것 · 한 점", [RF.fitPath([], [], 10, 10, 1).length, RF.fitPath([37], [127], 10, 10, 1)[0]], [0, [5, 5]]);
})();
(function () {
    var r = RF.sunrise(Date.UTC(2026, 9, 14, 1, 0), 35.8, 128.1), h = new Date(r + 9 * 3600000);   // 한국 10-14 10:00
    eq("sunrise 10월 대구 근처 아침 6시대", [h.getUTCDate(), h.getUTCHours()], [14, 6]);
})();
eq("nextTextScale 100 → 120 → 140 → 100", [RF.nextTextScale(1), RF.nextTextScale(1.2), RF.nextTextScale(1.4), RF.nextTextScale(7)], [1.2, 1.4, 1, 1]);
eq("textLabel 가 · 가+ · 가++", [RF.textLabel(1), RF.textLabel(1.2), RF.textLabel(1.4)], ["가", "가+", "가++"]);
eq("textLabel 영어 화면(/en/m/ - html lang=en)은 A", [RF.textLabel(1, true), RF.textLabel(1.4, true), RF.textLabel(1.4, false)], ["A", "A++", "가++"]);
(function () {
    // 지리산 벽소령 V 자: A 는 벽소령에서 끝, B 는 벽소령 남쪽 120m 에서 시작해 벽소령을 지나 북쪽으로
    var lines = { a: [[127.640, 35.326], [127.6422, 35.3260]], b: [[127.6429, 35.3250], [127.6425, 35.3256], [127.6423, 35.3261], [127.6420, 35.3280], [127.6418, 35.3300]] };
    var j = RF.joinDraw([{ id: "a" }, { id: "b" }], lines);
    eq("joinDraw 지나쳐 그려진 시작은 잘라 V 자 없음", [j.lines[1][0], j.gaps.length], [[127.6423, 35.3261], 1]);
    var k = RF.joinDraw([{ id: "a" }, { id: "c" }], { a: lines.a, c: [[127.6425, 35.326], [127.645, 35.326]] });
    eq("joinDraw 그대로 이어지면 자르지 않음", [k.lines[1].length, k.gaps.length], [2, 1]);
})();
(function () {
    // 세석평전: 두 선이 갈림길을 지나쳐 15m 간격으로 나란히 - 둘 다 잘라 가장 가까운 두 점을 이음
    var lines = { a: [[127.680, 35.350], [127.685, 35.340], [127.690, 35.330], [127.6940, 35.3200], [127.6941, 35.3190], [127.6942, 35.3185]],
                  b: [[127.6939, 35.3181], [127.6939, 35.3186], [127.69375, 35.31995], [127.680, 35.300], [127.670, 35.290]] };
    var j = RF.joinDraw([{ id: "a" }, { id: "b" }], lines);
    eq("joinDraw 둘 다 지나쳐 나란히 - 둘 다 잘라 이음", [j.lines[0].length < 6, j.lines[1].length < 5, j.gaps.length], [true, true, 1]);
})();

// 찜 · 통계 · 백업(2026-10-15)
(function () {
    var l = RF.favToggle([], { id: "a", name: "가" });
    l = RF.favToggle(l, { id: "b", name: "나" });
    eq("favToggle 새로 찜하면 앞에", l.map(function (f) { return f.id; }), ["b", "a"]);
    eq("favToggle 다시 누르면 빠짐 · isFav", [RF.favToggle(l, { id: "a" }).map(function (f) { return f.id; }), RF.isFav(l, "a"), RF.isFav(l, "z"), RF.isFav(null, "a")], [["b"], true, false, false]);
    var many = [];
    for (var i = 0; i < 60; i++) many = RF.favToggle(many, { id: "c" + i });
    eq("favToggle 50개까지", [many.length, many[0].id], [50, "c59"]);
})();
(function () {
    var t25 = Date.UTC(2025, 11, 31, 16, 0), t26 = Date.UTC(2026, 4, 1, 0, 0);   // 2025-12-31 16:00 UTC = 한국 2026-01-01 01:00
    var recs = [{ courseId: "x", start: t25, end: t25 + 3600000, walked: 5000, up: 300 }, { courseId: "x", start: t26, end: t26 + 7200000, walked: 7000, up: 500 },
                { courseId: "y", start: Date.UTC(2025, 5, 1), end: Date.UTC(2025, 5, 1) + 1000, walked: 1000 }];
    eq("recordStats 그 해(한국 시각) · 같은 코스는 한 번", RF.recordStats(recs, 2026), { n: 2, walked: 12000, up: 800, ms: 3 * 3600000, courses: 1 });
    eq("recordStats 전체", [RF.recordStats(recs).n, RF.recordStats(recs).courses, RF.recordStats(null).n], [3, 2, 0]);
})();
eq("backupCheck", [RF.backupCheck({ app: "routefly", v: 1, records: [] }), !!RF.backupCheck({ app: "x" }), !!RF.backupCheck({ app: "routefly", v: 2, records: [] }),
    !!RF.backupCheck({ app: "routefly", v: 1 }), !!RF.backupCheck(null)], ["", true, true, true, true]);
(function () {
    var a = { start: 3, courseId: "k", track: [], name: "지금" }, b = { start: 3, courseId: "k", track: [], name: "백업" }, c = { start: 5, courseId: "k", track: [] }, d = { start: 1, track: [] };
    var m = RF.mergeRecords([a], [b, c, d, { start: 9 }], 2);
    eq("mergeRecords 같은 기록은 지금 것 · 최근부터 · 개수 · 길 없는 것 뺌", m.map(function (r) { return r.start + (r.name || ""); }), ["5", "3지금"]);
})();
eq("mergeStore 도장은 열쇠 합침(지금 것 남김)", RF.mergeStore({ a: { t: 1 } }, { a: { t: 9 }, b: { t: 2 } }), { a: { t: 1 }, b: { t: 2 } });
eq("mergeStore 찜은 없는 것만 뒤에", RF.mergeStore([{ id: "a" }], [{ id: "a" }, { id: "b" }]).map(function (f) { return f.id; }), ["a", "b"]);
eq("mergeStore 몸무게는 지금 것 · 없으면 백업", [RF.mergeStore({ kg: 60 }, { kg: 70 }).kg, RF.mergeStore(null, { kg: 70 }).kg, RF.mergeStore({ x: 1 }, null)], [60, 70, { x: 1 }]);
eq("photoIds 기록들에 든 사진(겹침 없이)", RF.photoIds([{ notes: [{ photo: "p1" }, { text: "t" }] }, { notes: [{ photo: "p1" }, { photo: "p2" }] }, {}]), ["p1", "p2"]);
eq("airText", [RF.airText({ pm10: 42, pm10Word: "보통", pm25: 14, pm25Word: "좋음", station: "가야면", time: "2026-10-15 09:00", dist_km: 1.4 }),
    RF.airText({ unavailable: true }), RF.airText(null), RF.airText({ pm25: 80, pm25Word: "매우나쁨", station: "가" })],
    ["미세먼지 보통(42) · 초미세먼지 좋음(14) - 가야면 측정소 9시(1.4km)", "", "", "초미세먼지 매우나쁨(80) - 가 측정소"]);
eq("gearList 겨울 등산 · 오르막 크면 스틱 · 아이젠", RF.gearList(1, 800, "hike").map(function (g) { return g.key; }),
    ["water", "rain", "headlamp", "battery", "firstaid", "shoes", "pack", "stick", "knee", "warm", "crampon", "glove"]);
eq("gearList 여름 걷기", RF.gearList(7, 100, "walk").map(function (g) { return g.key; }), ["water", "rain", "headlamp", "battery", "firstaid", "shoes", "pack", "sun"]);
eq("gearList 걷기는 신발 · 배낭 이름이 다름", RF.gearList(7, 100, "walk").filter(function (g) { return g.key === "shoes" || g.key === "pack"; }).map(function (g) { return g.label; }), ["걷기 편한 신발", "가벼운 배낭"]);
eq("gearList 오르막 600m 는 스틱만(무릎 보호대는 800m 부터)", RF.gearList(10, 600, "hike").map(function (g) { return g.key; }).filter(function (k) { return k === "stick" || k === "knee"; }), ["stick"]);
eq("gearList 자전거는 헤드랜턴 빼고", RF.gearList(5, 0, "bike").map(function (g) { return g.key; }), ["water", "rain", "battery", "firstaid", "pack", "sun"]);
eq("partnerLinks 하나 · 여럿 · 예전 글 · 빈 것", [RF.partnerLinks(["https://a"]).map(function (k) { return k.text; }), RF.partnerLinks(["https://a", "https://b"]).map(function (k) { return k.text; }),
    RF.partnerLinks("https://c")[0].href, RF.partnerLinks(null).length, RF.partnerLinks(["javascript:x"]).length], [["쿠팡 ›"], ["쿠팡 1 ›", "쿠팡 2 ›"], "https://c", 0, 0]);
eq("airForecastText 그 날 예보 · 없는 날", [RF.airForecastText({ region: "경남", forecast: { "2026-10-16": { pm10: "보통", pm25: "좋음" } } }, "2026-10-16"),
    RF.airForecastText({ region: "경남", forecast: {} }, "2026-10-16"), RF.airForecastText(null, "2026-10-16")], ["미세먼지 보통 · 초미세먼지 좋음(경남 예보)", "", ""]);
eq("dayLabel 오늘 · 내일 · 글피 · 그 뒤", [RF.dayLabel("2026-10-15", "2026-10-15"), RF.dayLabel("2026-10-16", "2026-10-15"), RF.dayLabel("2026-10-18", "2026-10-15"), RF.dayLabel("2026-11-01", "2026-10-31")],
    ["오늘 10/15(목)", "내일 10/16(금)", "글피 10/18(일)", "내일 11/1(일)"]);
eq("midLines 오전 · 오후 / 하루 한 값", [RF.midLines({ wfAm: "맑음", wfPm: "구름많음", popAm: 20, popPm: 30 }), RF.midLines({ wfAm: "흐리고 비", wfPm: "흐리고 비", popAm: 60, popPm: 60 }), RF.midLines(null)],
    [["오전 맑음 · 비 20%", "오후 구름많음 · 비 30%"], ["흐리고 비 · 비 60%"], []]);
eq("tempRange 둘 · 한쪽 · 없음", [RF.tempRange(7, 19), RF.tempRange(11, null), RF.tempRange(null, undefined)], ["최저 7℃ / 최고 19℃", "최저 11℃", ""]);
(function () {
    var clk = function (ms) { var d = new Date(ms + 9 * 3600000); return d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
    var t0 = Date.UTC(2026, 9, 16, 0, 0);   // 한국 09:00
    eq("planText", RF.planText("가야산 · 해인사 → 상왕봉", 3980, 779, t0, t0 + 3 * 3600000, "https://x/s/1", clk).split("\n"),
        ["[routefly 산행 계획] 가야산 · 해인사 → 상왕봉", "거리 4.0km · 오르막 779m", "출발 9:00 → 하산 예정 12:00(표준 시간으로 어림)",
         "예정보다 많이 늦고 연락이 안 되면 119 에 이 코스를 알려 주세요.", "https://x/s/1"]);
})();
eq("easyOk 2시간 · 4시간 · 모두", [RF.easyOk("2h", "hike", 3980, 779), RF.easyOk("4h", "hike", 3980, 779), RF.easyOk("2h", "hike", 3000, 100), RF.easyOk("", "hike", 99999, 9999), RF.easyOk("x", "hike", 99999, 0)],
    [false, true, true, true, true]);
(function () {
    var p = RF.dotMap([{ lat: 38, lon: 127 }, { lat: 34, lon: 127 }, { lat: 36, lon: 129 }], 100, 200, 10);
    eq("dotMap 북쪽이 위 · 칸 안", [p[0][1] < p[1][1], p[2][0] > p[0][0], p.every(function (q) { return q[0] >= 9.9 && q[0] <= 90.1 && q[1] >= 9.9 && q[1] <= 190.1; }), RF.dotMap([], 1, 1, 0).length], [true, true, true, 0]);
})();
eq("planText 일몰 뒤 하산이면 경고 한 줄", RF.planText("가", 4000, 0, 0, 10 * 3600000, "", function (ms) { return String(ms / 3600000); }, 9 * 3600000).split("\n")[3],
    "⚠ 하산 예정이 일몰(9) 뒤 - 헤드랜턴을 챙기고 일찍 내려오세요.");
eq("centerPoints 공식 이름 · 다른 이름 · 품은 이름 · 자리 없는 것 뺌", RF.centerPoints(["영산강하구둑", "죽산보", "없는곳"], { "영산강하구둑": ["영산하구둑"] },
    [{ name: "영산하구둑인증센터", lat: 34.8, lon: 126.4 }, { name: "죽산보 인증센터(나주)", lat: 35, lon: 126.6 }, { name: "덤인증센터", lat: 1, lon: 1 }]),
    [{ name: "영산강하구둑", lat: 34.8, lon: 126.4 }, { name: "죽산보", lat: 35, lon: 126.6 }]);
eq("fireNote 봄 · 가을 · 그 밖(한국 날짜)", [!!RF.fireNote(Date.UTC(2026, 1, 1, 0)), !!RF.fireNote(Date.UTC(2026, 4, 15, 14)), !!RF.fireNote(Date.UTC(2026, 4, 15, 15)),
    RF.fireNote(Date.UTC(2026, 10, 1, 0)).indexOf("가을철") >= 0, !!RF.fireNote(Date.UTC(2026, 9, 31, 14)), !!RF.fireNote(Date.UTC(2026, 11, 15, 14, 59))], [true, true, false, true, false, true]);
(function () {
    var c = { course: { kind: "hike" }, lat: [0, 0, 0], lon: [0, 0, 0], ele: [100, 700, 300], dist: [0, 4000, 8000], asc: [0, 600, 600] };
    eq("msToTop 가장 높은 점까지(4km · 600m = 2시간)", RF.msToTop(c), 2 * 3600000);
    eq("sunriseStart 일출 - 오름 - 15분", RF.sunriseStart(10 * 3600000, 2 * 3600000), 10 * 3600000 - 2 * 3600000 - 15 * 60000);
})();
(function () {
    var K = 9 * 3600000, t = function (y, m, d) { return Date.UTC(y, m - 1, d) - K + 10 * 3600000; };   // 한국 그 날 10시
    var log = RF.mergeLog([], [RF.logEntry({ start: t(2026, 1, 3), end: t(2026, 1, 3) + 3600000, walked: 5000, up: 300, courseId: "a" }),
        RF.logEntry({ start: t(2026, 3, 31), end: t(2026, 3, 31) + 7200000, walked: 7000, up: 500, courseId: "a" }),
        RF.logEntry({ start: t(2026, 4, 1), end: t(2026, 4, 1) + 3600000, walked: 3000, courseId: "b" }),
        RF.logEntry({ start: t(2025, 12, 31), end: t(2025, 12, 31) + 3600000, walked: 1000, courseId: "c" })]);
    eq("mergeLog 같은 것 하나 · 시작 차례", [RF.mergeLog(log, [log[0]]).length, log[0].courseId], [4, "c"]);
    var peaks = { p1: { t: t(2026, 2, 1) }, p2: { t: t(2025, 5, 5) } };
    var mo = RF.periodStats(log, peaks, "month", 2026, t(2026, 10, 15));
    eq("월별 12칸 · 1월 · 3월 · 4월", [mo.length, mo[0].n, mo[0].walked, mo[1].peaks, mo[2].n, mo[3].n, mo[11].label], [12, 1, 5000, 1, 1, 1, "2026년 12월"]);
    var qu = RF.periodStats(log, peaks, "quarter", 2026, t(2026, 10, 15));
    eq("분기별 1분기 2번 · 같은 코스 한 번", [qu.length, qu[0].n, qu[0].courses, qu[0].up, qu[1].n], [4, 2, 1, 800, 1]);
    var ytd = RF.periodStats(log, peaks, "ytd", 2026, t(2026, 10, 15));
    eq("올해 누적", [ytd.length, ytd[0].n, ytd[0].walked, ytd[0].peaks], [1, 3, 15000, 1]);
    var yr = RF.periodStats(log, peaks, "year", 2026, t(2026, 10, 15));
    eq("연도별", yr.map(function (r) { return [r.label, r.n, r.peaks]; }), [["2025년", 1, 1], ["2026년", 3, 1]]);
})();
eq("wfEn 중기예보 날씨 영어", ["맑음", "구름많음", "흐림", "구름많고 비", "흐리고 비/눈", "흐리고 소나기", "", "이상한 말"].map(RF.wfEn),
    ["☀️ Clear", "⛅ Mostly cloudy", "☁️ Overcast", "⛅ Mostly cloudy, rain", "☁️ Overcast, rain/snow", "☁️ Overcast, showers", "", "이상한 말"]);
(function () {
    var peaks = [], st = {};
    for (var i = 0; i < 98; i++) { peaks.push({ id: "산" + i }); if (i < 31) st["산" + i] = { t: 1000 + (30 - i) }; }
    var m = RF.peakMilestones(peaks, st);
    eq("peakMilestones 10 · 30 · 50 · 70 · 완등", m.map(function (x) { return [x.label, x.t]; }), [["10곳", 1009], ["30곳", 1029], ["50곳", null], ["70곳", null], ["완등", null]]);
    eq("peakMilestones 완등 날", RF.peakMilestones([{ id: "a" }, { id: "b" }], { a: { t: 5 }, b: { t: 3 } }).map(function (x) { return [x.label, x.t]; }), [["완등", 5]]);
})();
eq("difficulty 단계", [RF.difficulty(12900, 1300), RF.difficulty(5000, 1300), RF.difficulty(4000, 350), RF.difficulty(2000, 20), RF.difficulty(20000, 2500), RF.difficulty(0, 0)], [3, 3, 1, 0, 4, null]);
// 2026-10-16 홍TV님: 남설악 → 대청봉(4.71km · 1,273m) 어려움인데 → 가라피(10.45km · 1,480m) 가 보통이었음 - 길어지면 내려가지 않게
eq("difficulty 길어지면 내려가지 않음", [RF.difficulty(4710, 1273), RF.difficulty(10450, 1480)], [3, 3]);
(function () {
    var bad = [];
    for (var d = 1000; d <= 30000; d += 1000) for (var a = 0; a <= 2500; a += 100)
        if (RF.difficulty(d + 1000, a) < RF.difficulty(d, a) || RF.difficulty(d, a + 100) < RF.difficulty(d, a)) bad.push(d + "/" + a);
    eq("difficulty 거리 · 오르막이 늘면 같거나 높음(모든 칸)", bad, []);
})();
(function () {
    // 1km 마다 100 · 200 · 50m 오르는 길, 지점 둘
    var pts = [[0, 0, 300, 0], [0, 0, 400, 1000], [0, 0, 600, 2000], [0, 0, 650, 3000]];
    var b = RF.boardSegments(pts, [{ name: "약수터", dist_m: 1000 }, { name: "삼거리", dist_m: 2000 }], "들머리", "정상");
    eq("boardSegments 구간 경사 · 단계", b.segs.map(function (s) { return [s.pct, s.lv]; }), [[10, 2], [20, 3], [5, 1]]);
    eq("boardSegments 지점", b.cuts.map(function (c) { return c.name; }), ["들머리", "약수터", "삼거리", "정상"]);
    var r = RF.boardSegments([[0, 0, 650, 0], [0, 0, 300, 3000]], [{ name: "약수터", dist_m: 2000 }], "정상", "들머리");
    var named = r.cuts.filter(function (c) { return c.name; });
    eq("boardSegments 내려가는 코스는 뒤집음(지점이 적으면 다섯 토막 더함)", [r.flip, named.map(function (c) { return c.name; }).join(","), Math.round(named[1].d), r.cuts.length], [true, "들머리,약수터,정상", 1000, 7]);
    eq("boardSegments 고도 없음", RF.boardSegments([[0, 0, null, 0]], [], "a", "b"), null);
})();
eq("nameEnds", [RF.nameEnds("설악산 · 백담사 → 대청봉"), RF.nameEnds("오색탐방지원센터 - 대청봉"), RF.nameEnds("대청봉코스")], [["백담사", "대청봉"], ["오색탐방지원센터", "대청봉"], null]);
// 로마자 - MountainEnTest.romanization 과 같은 값(Roman.java 와 맞춤)
eq("roman", ["설악산", "한라산", "속리산", "북한산", "덕유산", "백록담", "강원", "중산리", "오색 - 대청봉", "두류봉 6봉", "DMZ펀치볼", ""].map(RF.roman),
    ["Seoraksan", "Hallasan", "Songnisan", "Bukhansan", "Deogyusan", "Baengnokdam", "Gangwon", "Jungsan-ri", "Osaek - Daecheongbong", "Duryubong 6bong", "DMZ Peonchibol", ""]);
eq("enName", [RF.enName("오색탐방지원센터 - 대청봉"), RF.enName("설악산 · 백담사코스(왕복)"), RF.enName("수렴동대피소")],
    ["Osaek visitor center - Daecheongbong", "Seoraksan · Baekdamsa course (round trip)", "Suryeomdong shelter"]);
(function () {
    var w = { dates: ["2026-10-17", "2026-10-18"], regions: [{ code: "11B00000", days: { "2026-10-17": { word: "맑음", pop: 10, good: true }, "2026-10-18": { word: "흐리고 비", pop: 60, good: false } } },
        { code: "11F20000", days: { "2026-10-17": { word: "비", pop: 70, good: false } } }] };
    eq("weekendText", [RF.weekendText(w, "11B00000"), RF.weekendText(w, "11F20000"), RF.weekendText(w, "x"), RF.weekendText(w, null)],
        ["☀️ 주말 토 맑음 · 일 흐리고 비 60%", "🌧 주말 토 비 70%", "", ""]);
})();
(function () {
    var pts = [[0, 0, 300, 0], [0, 0, 400, 1000], [0, 0, 600, 2000], [0, 0, 650, 3000]];
    var b = RF.boardSegments(pts, [{ name: "약수터", dist_m: 1000 }, { name: "삼거리", dist_m: 2000 }], "들머리", "정상");
    var h = RF.boardHere(b, 1500);
    eq("boardHere 오르는 코스", [h.d, Math.round(h.e), h.pct, h.next.name, h.next.m], [1500, 500, 20, "삼거리", 500]);
    var r = RF.boardSegments([[0, 0, 650, 0], [0, 0, 300, 3000]], [{ name: "약수터", dist_m: 2000 }], "정상", "들머리");
    var hr = RF.boardHere(r, 500);   // 정상에서 500m 내려옴 → 안내판 2500m, 다음은 약수터(안내판 1000m)
    eq("boardHere 내려가는 코스", [hr.d, hr.next.name, hr.next.m], [2500, "약수터", 1500]);
    eq("boardHere 끝", RF.boardHere(b, 3000).next, null);
})();
(function () {
    var k = RF.boardSegments([[0, 0, 650, 0], [0, 0, 300, 3000]], [{ name: "약수터", dist_m: 2000 }], "정상", "들머리", true);
    var h = RF.boardHere(k, 500);
    eq("boardSegments keepDir - 따라가기는 걷는 쪽 그대로", [k.flip, k.cuts[0].name, h.d, h.next.name, h.next.m], [false, "정상", 500, "약수터", 1500]);
})();
(function () {
    var c = { dist: [0, 1000, 2000, 3000], ele: [300, 400, 600, 650] };
    var a = RF.slopeBetween(c, 1000, 2000), b = RF.slopeBetween(c, 500, 1500), d = RF.slopeBetween({ dist: [0, 1000], ele: [700, 500] }, 0, 1000);
    eq("slopeBetween", [a.pct, a.lv, a.up, b.pct, d.pct, d.up, RF.slopeBetween(c, 5, 5), RF.slopeBetween({ dist: [0, 10], ele: [null, null] }, 0, 10)],
        [20, 3, true, 15, 20, false, null, null]);
})();
eq("recentAdd 같은 주소는 앞으로 · 8개까지", RF.recentAdd([{ href: "a" }, { href: "b" }], { href: "b", name: "B" }).map(function (x) { return x.href; }), ["b", "a"]);
eq("recentAdd 넘치면 뒤를 버림", RF.recentAdd([1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return { href: "p" + i }; }), { href: "n" }).map(function (x) { return x.href; }).join(","), "n,p1,p2,p3,p4,p5,p6,p7");
eq("compareRows", RF.compareRows({ dist: 12900, asc: 1300 }, { dist: 5000, asc: 1300 }), [["거리", "12.90 km", "5.00 km"], ["오르막", "1,300 m", "1,300 m"],
    ["예상 시간(편도)", "5시간 24분", "3시간 25분"], ["난이도", "어려움", "어려움"], ["각도", "5.8°", "14.6°"], ["경사", "10.1%", "26.0%"], ["가파른 1km", "-", "-"]]);
eq("compareRows 각도 · 경사 · 가파른 1km - 순위 · 코스 줄과 같은 기준(1km 미만 · 오르막 없음은 -)", RF.compareRows({ dist: 1000, asc: 300, steep: 45.04 }, { dist: 999, asc: 300, steep: 40 }).slice(4),
    [["각도", "16.7°", "-"], ["경사", "30.0%", "-"], ["가파른 1km", "45.0%", "40.0%"]]);
eq("compareRows 영어 시간", RF.compareRows({ dist: 3000, asc: 0 }, { dist: 5000, asc: 1300 }, true)[2], ["Time (one way)", "45 min", "3 h 25 min"]);
// 가장 가파른 1km(2026-10-16) - Steep.steepest 와 같은 값(SteepTest)
(function () {
    var d = [], e = [];
    for (var i = 0; i <= 50; i++) { d.push(i * 100); e.push(i < 30 ? 300 + i * 5 : 445 + (i - 30) * 30); }   // 3km 완만(5%) 뒤 2km 가파름(30%)
    eq("steepest", [RF.steepest(d, e), RF.steepest([0, 500], [100, 200]), RF.steepest([0, 200], [0, 50]), RF.steepest([0, 2000], [null, null])], [30, 20, null, null]);
    // 내리막도 셈 - 거꾸로 해도 같음
    eq("steepest 내리막", RF.steepest(d, e.slice().reverse()), 30);
    eq("difficulty 가파름은 한 단계, 36% 이상은 적어도 어려움", [RF.difficulty(5000, 600), RF.difficulty(5000, 600, 30), RF.difficulty(5000, 600, 27), RF.difficulty(5000, 1300, 44.4), RF.difficulty(2000, 100, 50),
        RF.difficulty(5000, 600, 45), RF.difficulty(2000, 20, 35.9), RF.difficulty(5000, 1300, 50), RF.difficulty(12000, 1300, 50)], [1, 2, 1, 3, 3, 3, 1, 4, 4]);
    eq("difficulty 내장산(2026-10-18 홍TV님 화면)", [RF.difficulty(2180, 485, 41), RF.difficulty(4770, 618, 39), RF.difficulty(3420, 739, 35), RF.difficulty(1410, 442, 33), RF.difficulty(5510, 631)], [3, 3, 2, 2, 1]);
    eq("difficulty 한계령 → 대청봉 → 남설악(급한 내리막 - PC)", RF.difficulty(12330, 1068, 40), 3);
    var bad = [];
    for (var d = 1000; d <= 20000; d += 1000) for (var a = 0; a <= 2000; a += 200) for (var s = 0; s <= 60; s += 5)
        if (RF.difficulty(d + 1000, a, s) < RF.difficulty(d, a, s) || RF.difficulty(d, a + 200, s) < RF.difficulty(d, a, s) || RF.difficulty(d, a, s + 5) < RF.difficulty(d, a, s)) bad.push([d, a, s].join("/"));
    eq("difficulty 가파름까지 - 늘면 같거나 높음", bad, []);
})();
eq("officialEleAt 정상 50m 안만", [RF.officialEleAt({ pois: [{ name: "대청봉", dist_m: 4780, ele_m: 1708, ele_official: true }, { name: "중청", dist_m: 4000, ele_m: 1650 }] }, 4770),
    RF.officialEleAt({ pois: [{ name: "대청봉", dist_m: 4780, ele_m: 1708, ele_official: true }] }, 4600), RF.officialEleAt({ pois: [{ name: "중청", dist_m: 4000, ele_m: 1650 }] }, 4000)], [1708, null, null]);
eq("stampRadius GPS 오차 + 20, 40 ~ max", [RF.stampRadius(5, 150), RF.stampRadius(20, 150), RF.stampRadius(60, 150), RF.stampRadius(300, 150), RF.stampRadius(null, 150), RF.stampRadius(90, 100)], [40, 40, 80, 150, 150, 100]);
(function () {   // 움직임 없음 - 40m(+ 오차) 안에 20분이면 due, 움직이면 다시 잼
    var M = 20 * 60000, t0 = 1000000;
    var a = RF.stillCheck(null, { lat: 37.5, lon: 127, acc: 10, t: t0 }, t0, 40, M);
    var b = RF.stillCheck(a.anchor, { lat: 37.5002, lon: 127, acc: 10, t: t0 + M }, t0 + M, 40, M);   // 22m - 그 자리
    var c2 = RF.stillCheck(b.anchor, { lat: 37.501, lon: 127, acc: 10, t: t0 + M }, t0 + M, 40, M);   // 111m 움직임
    var d = RF.stillCheck(a.anchor, null, t0 + M - 1, 40, M);   // 위치가 안 와도 시간은 감
    var e = RF.stillCheck(a.anchor, { lat: 37.5007, lon: 127, acc: 50, t: t0 + M }, t0 + M, 40, M);   // 78m 지만 오차 50m - 그 자리로 봄
    eq("stillCheck", [a.due, b.due, b.anchor.t, c2.due, c2.anchor.t, d.due, e.due], [false, true, t0, false, t0 + M, false, true]);
})();
(function () {   // 지난 기록과 비교 - 동쪽으로 곧은 2km 코스, 지난번은 1km 를 10분, 되돌아간 점 · 코스 밖 점은 뺌
    var n = 21, lat = 37.5, c = { lat: [], lon: [], dist: [], ele: [], total: 0 };
    for (var i = 0; i < n; i++) { c.lat.push(lat); c.lon.push(127 + i * 0.00113); c.ele.push(100); }
    for (var j = 0; j < n; j++) c.dist.push(j === 0 ? 0 : c.dist[j - 1] + RF.distM(lat, c.lon[j - 1], lat, c.lon[j]));
    c.total = c.dist[n - 1];
    var t0 = 1000000, tr = [];
    for (var k = 0; k <= 10; k++) tr.push([lat, 127 + k * 0.00113, t0 + k * 60000]);   // 100m 마다 1분
    tr.splice(5, 0, [lat, 127 + 2 * 0.00113, t0 + 4.5 * 60000]);   // 되돌아간 점
    tr.push([lat + 0.001, 127 + 12 * 0.00113, t0 + 11 * 60000]);   // 코스 밖 110m(앞쪽이지만 뺌)
    var prof = RF.paceProfile(c, tr, t0);
    eq("paceProfile 앞으로 간 점만", [prof.length, Math.round(prof[prof.length - 1][0] / 10) * 10, prof[prof.length - 1][1]], [11, 1000, 600000]);
    eq("paceAt · paceDistAt", [Math.round(RF.paceAt(prof, prof[5][0]) / 1000), RF.paceAt(prof, 1500), Math.round(RF.paceDistAt(prof, 150000) / 10) * 10, Math.round(RF.paceDistAt(prof, 9e9))],
        [300, null, 250, Math.round(prof[10][0])]);
    eq("paceText", [RF.paceText(-185000), RF.paceText(30000), RF.paceText(4000000), RF.paceText(null)], ["지난번보다 3분 빠름", "지난번과 비슷", "지난번보다 1시간 7분 늦음", ""]);
})();
(function () {   // 재미로 보는 한마디 - 같은 씨앗이면 같고, 안전 · 날씨 말은 없음
    var a = RF.fortune("2026-10-17|설악산"), b = RF.fortune("2026-10-17|설악산"), en = RF.fortune("x", "en");
    var c = RF.summitCard("설악산", "대청봉", "2026-10-17"), d = RF.summitCard("가리산", "가리산", "2026-10-17");
    var all = [], i;
    for (i = 0; i < 400; i++) all.push(RF.fortune("s" + i), RF.fortune("s" + i, "en"));
    eq("fortune", [a === b, typeof en, /[a-z]/.test(en), c.title, d.title, c.line === RF.fortune("2026-10-17|설악산"), /재미로/.test(c.share),
        all.some(function (x) { return /날씨|비|바람이 세|안전|위험|가도 좋|weather|safe|rain/.test(x) && !/바람이 시원/.test(x); })],
        [true, "string", true, "⛰️ 설악산 대청봉", "⛰️ 가리산", true, true, false]);
})();
(function () {   // 오늘의 한마디 - 섞은 순서로 돌아 한 바퀴 안에서는 겹치지 않음(한국어 60 · 영어 30)
    function run(lang, days, len) {   // 바퀴 처음 날(1970-01-01 부터 센 날이 len 의 배수)부터
        var seen = {}, n0 = Math.ceil(Date.UTC(2026, 9, 17) / 86400000 / len) * len, i, dt;
        for (i = 0; i < days; i++) { dt = new Date((n0 + i) * 86400000); seen[RF.fortuneDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), lang)] = 1; }
        return Object.keys(seen).length;
    }
    function inOrder() {   // 섞였는지 - 바퀴 처음부터 목록 순서 그대로면 안 됨
        var n0 = Math.ceil(Date.UTC(2026, 9, 17) / 86400000 / 60) * 60, a = new Date(n0 * 86400000), b = new Date((n0 + 1) * 86400000);
        return RF.fortuneDay(a.getUTCFullYear(), a.getUTCMonth() + 1, a.getUTCDate(), "ko") === "끝까지 오른 사람에게 바람이 시원하게 분다."
            && RF.fortuneDay(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), "ko") === "오늘 만난 풍경이 한 주의 힘이 된다.";
    }
    eq("fortuneDay 한 바퀴 · 섞임", [run("ko", 60, 60), run("ko", 61, 60), run("en", 30, 30), inOrder(), RF.fortuneDay(2026, 12, 31, "ko") !== RF.fortuneDay(2027, 1, 1, "ko"),
        RF.fortuneDay(2026, 10, 17, "ko") === RF.fortuneDay(2026, 10, 17, "ko")], [60, 60, 30, false, true, true]);
})();
eq("regionEn · weekendWordEn", [RF.regionEn("강원 영동"), RF.regionEn("제주"), RF.regionEn("새권역"), RF.weekendWordEn("맑음"), RF.weekendWordEn("구름많고 비"),
    RF.weekendWordEn("맑음 → 흐림"), RF.weekendWordEn("비")],
    ["Gangwon (east coast)", "Jeju", "Saegwonyeok", "☀️ Clear", "⛅ Mostly cloudy, rain", "☀️ Clear → ☁️ Overcast", "🌧 Rain"]);
(function () {   // 따라가기 영어(2026-10-17) - setLang("en") 일 때만, 끝나면 ko 로 되돌림
    RF.setLang("en");
    var r = [RF.hm(3900000), RF.paceText(-185000), RF.paceText(30000), RF.KINDS.bike.act, RF.tr("출발", "Start"), RF.nameIn("설악산대청봉"), RF.isEn()];
    RF.setLang("ko");
    eq("setLang en", r.concat([RF.hm(3900000), RF.KINDS.bike.act, RF.nameIn("설악산")]),
        ["1 h 5 min", "3 min faster than last time", "same pace as last time", "Ride", "Start", "Seoraksan Daecheongbong", true, "1시간 5분", "라이딩", "설악산"]);
    eq("pageLang", [RF.pageLang("?lang=en", null), RF.pageLang("?x=1&lang=ko", "en"), RF.pageLang("", "en"), RF.pageLang("", null), RF.pageLang("?language=en", null)], ["en", "ko", "en", "ko", "ko"]);
})();
(function () {   // 영어 이름 낱말 · 위치표지(2026-10-17 PC 확인 - 자전거길 · 관광안내소 · 해수욕장 · 아래 · "설악 06-01")
    RF.setLang("en");
    var sg = RF.signText({ sign: { loc_no: "설악 06-01", place_name: "구대청대피소아래" }, m: 420 }), cp = RF.partnerLinks(["https://link.coupang.com/a/x"])[0].text;
    RF.setLang("ko");
    eq("영어 낱말 · 표지", [RF.enName("한강자전거길(서울)"), RF.enName("해파랑길관광안내소"), RF.enName("고래불해수욕장"), RF.enName("(1)독주골 갈림길 위 250m"), RF.enName("위봉산"), RF.enName("백운계곡"), RF.enName("[동두천 소요산] 남동쪽 들머리 → 정상"), RF.enName("송산 · 남서쪽 들머리 → 덕기봉 → 동쪽 들머리"), sg, cp, RF.partnerLinks(["https://link.coupang.com/a/x"])[0].text],
        ["Hangang bike path (Seoul)", "Haeparanggil tourist info center", "Goraebul beach", "(1)Dokjugol junction above 250m", "Wibongsan", "Baegun valley", "[Dongducheon Soyosan] southeast trailhead → summit", "Songsan · southwest trailhead → Deokgibong → east trailhead", "Seorak 06-01 · 420 m (Gudaecheong shelter below)", "Coupang ›", "쿠팡 ›"]);
})();
eq("핸드폰에서만 열리는 송금 링크", [RF.mobileOnlyUrl("https://qr.kakaopay.com/abc"), RF.mobileOnlyUrl("https://toss.me/abc"), RF.mobileOnlyUrl(null)], [true, false, false]);
(function () {   // 🏠 오늘의 안부 - 알림 일정(2026-10-17)
    var now = new Date(2026, 9, 17, 9, 0).getTime(), today = RF.dayKey(now);
    var p = RF.anbuPlan(now, "10:00", null, 2), p2 = RF.anbuPlan(now, "10:00", today, 2), late = RF.anbuPlan(new Date(2026, 9, 17, 13, 0).getTime(), "10:00", null, 1);
    eq("anbuPlan", [today, p.length, p[0].id, new Date(p[0].at).getHours(), new Date(p[2].at).getHours(), p2.length, p2[0].day !== today, late.length, late[0].k,
        RF.anbuPlan(now, "10시", null, 2).length, RF.telClean("010-1234-5678"), RF.telClean("119"), RF.anbuSms("10:05"), RF.anbuText(1)[0]],
        ["2026-10-17", 6, 7100, 10, 14, 3, true, 1, 2, 0, "01012345678", "", "[routefly 안부] 오늘도 잘 지내요 😊(10:05)", "아직 오늘 안부 확인이 없어요"]);
    var r5 = RF.anbuPlan(now, "10:00", null, 1, true);   // 5분마다 다시 울림 - 1시간 동안 12번 + 2 · 4시간 뒤
    eq("anbuPlan 5분마다", [r5.length, new Date(r5[1].at).getMinutes(), r5.map(function (x) { return x.k; }).join(""), r5[13].id, new Set(r5.map(function (x) { return x.id; })).size],
        [14, 5, "01111111111112", 7113, 14]);
})();
eq("telFormat", ["01012345678", "010-1234-5678", "010-", "010", "0101", "0101234", "01012345", "0101234567", "0212345678", "021234567", "0311234567", "010123456789"].map(RF.telFormat),
    ["010-1234-5678", "010-1234-5678", "010", "010", "010-1", "010-123-4", "010-123-45", "010-123-4567", "02-1234-5678", "02-123-4567", "031-123-4567", "010-1234-5678"]);
eq("trackClimb 10m 넘게 바뀐 것만", [RF.trackClimb([[0, 0, 0, 5], [0, 0, 1, 9], [0, 0, 2, 3], [0, 0, 3, 20], [0, 0, 4, 18], [0, 0, 5, 40], [0, 0, 6, null], [0, 0, 7, 25], [0, 0, 8, 37]]),
    RF.trackClimb([]), RF.trackClimb([[0, 0, 0, null]])], [15 + 20 + 12, 0, 0]);

eq("unitConv 별거 별거", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) {
    return RF.unitFmt([null, RF.unitConv("length", "1", "in", "cm"), RF.unitConv("length", 100, "cm", "in"), RF.unitConv("area", 1, "평", "㎡"), RF.unitConv("area", 84, "㎡", "평"),
        RF.unitConv("temp", 100, "°C", "°F"), RF.unitConv("temp", -40, "°F", "°C"), RF.unitConv("freq", 1, "Hz", "kHz"), RF.unitConv("weight", 1, "근", "kg"), RF.unitConv("length", 1, "mi", "m"), RF.unitConv("data", 1, "GB", "MB")][i]);
}), ["2.54", "39.37007874", "3.305785124", "25.41", "212", "-40", "0.001", "0.6", "1,609.344", "1,024"]);
eq("unitConv 못 바꿈 · 아주 작음", [RF.unitConv("length", "", "m", "cm"), RF.unitConv("length", "abc", "m", "cm"), RF.unitConv("x", 1, "m", "cm"), RF.unitConv("length", 1, "m", "kg"),
    RF.unitFmt(RF.unitConv("freq", 1, "Hz", "GHz")), RF.unitFmt(0), RF.unitFmt(1234567.5), RF.unitFmt(RF.unitConv("temp", 0, "°C", "K"))],
    [null, null, null, null, "1e-9", "0", "1,234,567.5", "273.15"]);
(function () {   // 🧰 별거 별거 계산(2026-10-18)
    RF.setLang("ko");
    var a = RF.ageInfo([1960, 10, 19], [2026, 10, 18]), b = RF.ageInfo([1960, 10, 18], [2026, 10, 18]), c = RF.ageInfo([2000, 2, 29], [2026, 2, 28]);
    eq("ageInfo 만 나이 · 띠", [a.man, a.year, a.ddi, a.nextDays, b.man, b.nextDays, c.man, c.nextDays, c.ddi, RF.ageInfo([2030, 1, 1], [2026, 1, 1]), RF.ageInfo([2026, 2, 30], [2026, 3, 1])],
        [65, 66, "쥐", 1, 66, 0, 25, 1, "용", null, null]);
    RF.setLang("en"); var e = RF.ageInfo([1984, 5, 5], [2026, 10, 18]).ddi; RF.setLang("ko");
    eq("dDay · dateAdd · dateDiff", [RF.dDay([2026, 10, 18], [2026, 10, 30]), RF.dDay([2026, 10, 18], [2026, 10, 15]), RF.dDay([2026, 10, 18], [2026, 10, 18]), e,
        RF.dateAdd([2026, 10, 18], 100, true).join("-"), RF.dateAdd([2026, 10, 18], 100).join("-"), RF.dateAdd([2026, 3, 1], -1).join("-"), RF.dateAdd([2026, 2, 30], 1),
        RF.dateDiff([2026, 1, 1], [2026, 12, 31]), RF.dateDiff([2026, 1, 1], [2026, 1, 1], true), RF.dateDiff([2026, 3, 29], [2026, 3, 30])],
        ["D-12", "D+3", "D-day", "Rat", "2027-1-25", "2027-1-26", "2026-2-28", null, 364, 1, 1]);
    eq("pctCalc", [RF.pctCalc("of", 15, 20000), RF.pctCalc("is", 30, 120), RF.pctCalc("change", 200, 150), RF.pctCalc("sale", 39000, 20), RF.pctCalc("is", 1, 0), RF.pctCalc("x", 1, 1), RF.pctCalc("of", "a", 1)],
        [3000, 25, -25, 31200, null, null, null]);
    var d = RF.dutchPay(50000, 3, 100), d2 = RF.dutchPay(10000, 4, 1000), d3 = RF.dutchPay(1000, 3, 1000);
    eq("dutchPay", [d.per, d.last, d2.per, d2.last, d3.per, d3.last, RF.dutchPay(0, 3, 100), RF.dutchPay(1000, 0, 100)], [16700, 16600, 3000, 1000, 333, 334, null, null]);
    var t = RF.textCount("안녕 routefly 😊\n두 줄");
    eq("textCount · smsKind", [t.chars, t.noSpace, t.bytes, t.words, t.lines, RF.textCount("").lines, RF.smsKind(90), RF.smsKind(91), RF.smsKind(2001)], [17, 13, 22, 5, 2, 0, "SMS", "LMS", null]);
    eq("compassHeading", [RF.compassHeading(90, true, null, 0), RF.compassHeading(null, false, 45, 0), RF.compassHeading(90, false, null, 0), RF.compassHeading(10, true, null, 90), RF.compassHeading(0, true, null, 0)],
        [270, 45, null, 80, 0]);
    eq("fxConv", [RF.fxConv(1, "USD", "KRW", "USD", { KRW: 1400 }), RF.fxConv(1400, "KRW", "USD", "USD", { KRW: 1400 }), Math.round(RF.fxConv(100, "JPY", "KRW", "USD", { KRW: 1400, JPY: 150 })),
        RF.fxConv(1, "USD", "XXX", "USD", { KRW: 1 }), RF.fxConv("a", "USD", "KRW", "USD", { KRW: 1 })], [1400, 1, 933, null, null]);
    eq("SOS 박자 9번", RF.SOS_PATTERN.length, 9);
})();
(function () {   // 🧰 별거 별거 2차(2026-10-18)
    RF.setLang("ko");
    var l = RF.toLunar([2026, 2, 17]), l2 = RF.toLunar([2023, 3, 22]);
    eq("음력 ↔ 양력(설 · 추석 · 윤달)", [l.y, l.m, l.d, l.leap, l.cal, l2.m, l2.leap, RF.fromLunar(2026, 8, 15).join("-"), RF.fromLunar(2023, 2, 1, true).join("-"), RF.fromLunar(2026, 2, 1, true), RF.fromLunar(2025, 1, 1).join("-"), RF.toLunar([2026, 2, 30])],
        [2026, 1, 1, false, "dangi", 2, true, "2026-9-25", "2023-3-22", null, "2025-1-29", null]);
    var m = RF.moonPhase(Date.UTC(2026, 9, 26, 0, 0)), nw = RF.moonPhase(Date.UTC(2000, 0, 6, 18, 14));
    eq("moonPhase", [m.i, m.illum > 0.99, new Date(m.nextFull).toISOString().slice(0, 10), nw.i, nw.illum < 0.001, RF.MOON_NAMES[4][1]], [4, true, "2026-10-26", 0, true, "보름달"]);
    var ic = [RF.interestCalc("deposit", 10000000, 3.5, 12), RF.interestCalc("saving", 100000, 4, 12), RF.interestCalc("loanEq", 100000000, 4, 360), RF.interestCalc("loanPr", 12000000, 6, 12),
        RF.interestCalc("loanBullet", 10000000, 6, 12), RF.interestCalc("deposit", 10000000, 3.5, 12, true)];
    eq("interestCalc", [ic[0].interest, ic[0].tax, ic[0].net, ic[1].interest, ic[1].tax, ic[2].first, ic[2].interest, ic[3].first, ic[3].last, ic[3].interest, ic[4].first, ic[4].interest, ic[5].interest,
        RF.interestCalc("deposit", 0, 3, 12), RF.interestCalc("loanEq", 1200, 0, 12).first],
        [350000, 53900, 10296100, 26000, 4000, 477415, 71869506, 1060000, 1005000, 390000, 50000, 600000, 355669, null, 100]);
    eq("vatCalc · bmiInfo · discomfort", [RF.vatCalc(10000, "supply").total, RF.vatCalc(11000, "total").supply, RF.vatCalc(10001, "total").vat, RF.bmiInfo(170, 65).bmi, RF.bmiInfo(170, 65).word, RF.bmiInfo(170, 65).lo,
        RF.bmiInfo(170, 65).hi, RF.bmiInfo(160, 70).k, RF.bmiInfo(10, 65), RF.discomfort(30, 70).di, RF.discomfort(30, 70).k, RF.discomfort(20, 50).k, RF.discomfort(20, 120)],
        [11000, 10000, 909, 22.5, "정상", 53.5, 66.2, 3, null, 81.4, 3, 0, null]);
    var h = RF.nameRoman("홍길동"), i = RF.nameRoman("이복남"), n = RF.nameRoman("남궁민수"), g = RF.nameRoman("남궁");
    eq("nameRoman", [h.sur + " " + h.given, i.sur, i.surStd, i.given, i.alt, n.sur, n.given, g.sur, RF.nameRoman("abc"), RF.nameRoman("김")], ["HONG GILDONG", "LEE", "I", "BOKNAM", "BOK-NAM", "NAMGOONG", "MINSU", "NAM", null, null]);
    eq("tzOffsetMin", [RF.tzOffsetMin("Asia/Seoul", Date.UTC(2026, 0, 1)), RF.tzOffsetMin("America/New_York", Date.UTC(2026, 6, 1)), RF.tzOffsetMin("America/New_York", Date.UTC(2026, 0, 1)),
        RF.tzOffsetMin("Asia/Kolkata", 0), RF.tzOffsetMin("X/Y", 0)], [540, -240, -300, 330, null]);
    var seed = 1, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var L = RF.ladderMake(4, 8, rnd), ends = [0, 1, 2, 3].map(function (k) { return RF.ladderTrace(L, k).end; });
    var adj = L.some(function (r) { return r.some(function (b, k) { return b && r[k + 1]; }); });
    eq("사다리 - 모두 다른 곳 · 붙은 가로줄 없음", [ends.slice().sort().join(""), adj, L.length, RF.ladderTrace([[true], [false]], 0).end, RF.ladderMake(3, 2, function () { return 0.99; }).map(function (r) { return r.join(); }).join("|")],
        ["0123", false, 8, 1, "true,false|false,true"]);
})();
eq("holidayRuns 연휴", [JSON.stringify(RF.holidayRuns(["2026-10-03", "2026-10-05", "2026-10-09"])), JSON.stringify(RF.holidayRuns(["2026-10-21"])), JSON.stringify(RF.holidayRuns([])),
    JSON.stringify(RF.holidayRuns(["2026-09-24", "2026-09-25", "2026-09-26"]))],
    ['[{"from":"2026-10-03","to":"2026-10-05","days":3},{"from":"2026-10-09","to":"2026-10-11","days":3}]', "[]", "[]", '[{"from":"2026-09-24","to":"2026-09-27","days":4}]']);
eq("nextLunarBirthday 음력 생일", [RF.nextLunarBirthday(8, 15, [2026, 9, 1]).join("-"), RF.nextLunarBirthday(8, 15, [2026, 9, 25]).join("-"), RF.nextLunarBirthday(1, 1, [2026, 10, 18]).join("-"),
    RF.nextLunarBirthday(8, 15, [2026, 9, 26]).join("-")], ["2026-9-25", "2026-9-25", "2027-2-7", "2027-9-15"]);
eq("leapMonth 윤달", [1969, 2020, 2023, 2025, 2026, 2028].map(RF.leapMonth), [0, 4, 2, 6, 0, 5]);
eq("calcEval 계산기", ["12+3×4", "10−4−3", "-3÷2", "50%", "200×15%", "0.1+0.2", "7÷0", "1+", "×3", "1..2", "", "2×-3", "100-5"].map(RF.calcEval),
    [24, 3, -1.5, 0.5, 30, 0.3, null, 1, null, null, null, -6, 95]);
// ⛑️ 오늘의 산행 안전(api/safety) - 별거 별거 · 산 페이지 · 따라가기가 함께 쓰는 줄(2026-10-18)
(function () {
    var noon = Date.UTC(2026, 9, 18, 3), eve = Date.UTC(2026, 9, 18, 10);   // KST 12시 · 19시
    var j = { sido: "강원특별자치도", warn: { tm: "x", lines: [{ type: "강풍주의보", areas: "강원도", mine: true }, { type: "건조경보", areas: "경상북도", mine: false }] },
        fire: { level: 2, meanavg: 61.4 }, uv: { date: "2026101806", hours: [{ h: 0, v: 0 }, { h: 3, v: 2 }, { h: 6, v: 5 }, { h: 9, v: 8 }, { h: 12, v: 0 }, { h: 15, v: 0 }, { h: 27, v: 6 }, { h: 30, v: 4 }] } };
    var r = RF.safetyRows(j, noon, false);
    eq("safetyRows 줄", r.map(function (x) { return x.icon + x.label + "=" + x.val + "/" + x.cls; }),
        ["⚠강풍주의보=내 지역 발효 중/bad", "🗺전국 특보=강풍주의보 · 건조경보/", "🔥산불위험=높음 (61)/bad", "☀자외선(오늘 가장 높을 때)=8 매우 높음 · 지금 5/bad"]);
    eq("safetyRows 저녁은 내일 자외선", RF.safetyRows(j, eve, false).pop().label + " " + RF.safetyRows(j, eve, false).pop().val, "자외선(내일 가장 높을 때) 6 높음");
    eq("safetyRows 영어", RF.safetyRows(j, noon, true).slice(0, 3).map(function (x) { return x.label + "=" + x.val; }),
        ["Strong wind advisory=in effect here", "Nationwide=Strong wind advisory · Dry air warning", "Wildfire risk=High (61)"]);
    eq("safetyAlert 따라가기 알림", RF.safetyAlert(j, noon, false), "⛑️ 오늘의 산행 안전: 강풍주의보 · 산불위험 높음 (61) · 자외선(오늘 가장 높을 때) 8 매우 높음 · 지금 5");
    eq("safetyAlert 저녁 자외선은 알리지 않음", RF.safetyAlert(j, eve, false), "⛑️ 오늘의 산행 안전: 강풍주의보 · 산불위험 높음 (61)");
    var calm = { warn: { lines: [{ type: "건조경보", mine: false }] }, fire: { level: 1 }, uv: { date: "2026101806", hours: [{ h: 6, v: 4 }] } };
    eq("safetyAlert 별일 없으면 빈 글", [RF.safetyAlert(calm, noon, false), RF.safetyAlert(null, noon, false), RF.safetyAlert({ unavailable: true }, noon, false)], ["", "", ""]);
    eq("safetyRows 내 지역 특보 없음 · 산불 다소 높음", RF.safetyRows(calm, noon, false).slice(0, 3).map(function (x) { return x.label + "=" + x.val + "/" + x.cls; }),
        ["기상특보=내 지역 없음/", "전국 특보=건조경보/", "산불위험=다소 높음/mid"]);
    eq("warnName", [RF.warnName("호우경보", true), RF.warnName("호우경보", false), RF.warnName("이상한주의보", true)], ["Heavy rain warning", "호우경보", "이상한주의보"]);
})();
eq("cellCenter 고정 5km 칸 가운데(서버에 내 위치 대신)", [RF.cellCenter(37.5663, 126.9779), RF.cellCenter(37.5501, 126.9999), RF.cellCenter(35.0, 129.0), RF.cellCenter(33.4999, 126.53)],
    [[37.575, 126.975], [37.575, 126.975], [35.025, 129.025], [33.475, 126.525]]);
eq("stayMapLink 숙소 이름 → 카카오맵 자리(쉼표는 빈칸, 나라 밖 좌표는 없음)", [RF.stayMapLink("주황집", 38.1, 128.5), RF.stayMapLink("A,B/C", "38.2", "128.6"), RF.stayMapLink("x", 0, 0), RF.stayMapLink("", 38, 128)],
    ["https://map.kakao.com/link/map/%EC%A3%BC%ED%99%A9%EC%A7%91,38.100000,128.500000", "https://map.kakao.com/link/map/A%20B%20C,38.200000,128.600000", null, "https://map.kakao.com/link/map/%EC%88%99%EC%86%8C,38.000000,128.000000"]);
(function () {
    var lay = RF.stayTiles({ lat: 38.173, lon: 128.4925 }, [{ lat: 38.1745, lon: 128.497 }, { lat: 38.19, lon: 128.58 }], 320, 220);
    eq("stayTiles 모든 점이 칸 안(가장 큰 줌)", lay.pins.concat([lay.at]).every(function (q) { return q[0] >= 0 && q[0] <= 320 && q[1] >= 0 && q[1] <= 220; }) && lay.z >= 6 && lay.z <= 16, true);
    eq("stayTiles 조각이 칸을 다 덮음", lay.tiles.some(function (t) { return t.left <= 0 && t.top <= 0; }) && lay.tiles.some(function (t) { return t.left + 256 >= 320 && t.top + 256 >= 220; }), true);
    var near = RF.stayTiles({ lat: 38.173, lon: 128.4925 }, [{ lat: 38.1735, lon: 128.493 }], 320, 220);
    eq("stayTiles 가까우면 줌 16, 멀면 낮게", [near.z, lay.z < near.z], [16, true]);
    eq("stayTiles 점 없음 · 칸 없음은 null", [RF.stayTiles({ lat: NaN, lon: 1 }, [], 320, 220), RF.stayTiles({ lat: 38, lon: 128 }, [], 0, 220)], [null, null]);
})();
(function () {
    eq("nearCity 번호를 못 채운 곳(id null)은 건너뜀", RF.nearCity([{ id: null, lat: 35.415, lon: 127.873, n: 1 }, { id: 77, lat: 35.5, lon: 127.9, n: 1 }], 35.415, 127.873), 77);
    var doc = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../../main/webapp/data/agoda-cities.json"), "utf8"));
    var names = {};
    eq("agoda-cities.json 번호는 숫자나 null, 좌표는 우리나라, 이름은 하나씩", doc.cities.every(function (c) {
        var ok = (c.id === null || /^\d{1,9}$/.test(String(c.id))) && c.lat > 33 && c.lat < 39 && c.lon > 124 && c.lon < 132 && !names[c.name];
        names[c.name] = 1; return ok;
    }) && doc.cities.length >= 70, true);
})();
eq("stayKindEn 카카오 숙소 종류 → 영어", ["호텔", "여관,모텔", "콘도,리조트", "게스트하우스", "펜션", "민박", "캠핑,야영장", "", null].map(RF.stayKindEn),
    ["Hotel", "Motel", "Resort", "Guesthouse", "Pension", "Homestay", "Campground", "Lodging", "Lodging"]);
// 화면별 작은 course-kit(js/kit-*.js - tools/kit-split, 2026-10-30): 원본과 맞는지, 불러지는지, 그 화면이 쓰는 RF 이름이 다 같은 함수로 있는지
(function () {
    var split = require(path.join(__dirname, "../../../tools/kit-split/split.js"));
    split.all().forEach(function (b) {
        var file = path.join(split.WEB, b.out), now = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
        eq(b.out + " 가 course-kit.js 와 맞음(틀리면 node tools/kit-split/split.js)", now === b.text, true);
        var sb = { window: {}, console: console };
        vm.createContext(sb);
        vm.runInContext(b.text, sb);
        var K = sb.window.RF || {}, used = split.usedNames(b.users.map(function (u) { return fs.readFileSync(path.join(split.WEB, u), "utf8"); }));
        var miss = Object.keys(used).filter(function (n) { return n in RF && !(n in K); });
        var diff = Object.keys(K).filter(function (n) { return typeof K[n] === "function" && String(K[n]).replace(/\r/g, "") !== String(RF[n]).replace(/\r/g, ""); });   // PC 는 원본이 CRLF(autocrlf), 만든 글은 LF
        eq(b.out + " 에 화면이 쓰는 이름이 다 있고 원본과 같은 함수", [miss, diff], [[], []]);
    });
    var m = sandboxOf("js/kit-m.js");
    eq("kit-m 으로도 같은 답(오늘의 한마디 · 해 뜨는 때 · 숙소 찾기 칸 있음)", [m.fortuneDay(2026, 10, 30, "ko"), String(m.sunrise(38.1, 128.5, new Date(Date.UTC(2026, 9, 30)))), typeof m.staySearch],
        [RF.fortuneDay(2026, 10, 30, "ko"), String(RF.sunrise(38.1, 128.5, new Date(Date.UTC(2026, 9, 30)))), "function"]);
    function sandboxOf(f) { var sb = { window: {}, console: console }; vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(split.WEB, f), "utf8"), sb); return sb.window.RF; }
})();
// 시간별 날씨 표 · 기상청 날씨누리 링크(2026-10-30 홍TV님 "참고해")
eq("pcpText 강수량 글", ["강수없음", "1mm 미만", "1.0mm", "30.0~50.0mm", null].map(function (p) { return RF.pcpText(p, false); }).concat([RF.pcpText("1mm 미만", true)]),
    ["-", "1mm 미만", "1mm", "30~50mm", "-", "<1mm"]);
(function () {
    var hs = [{ t: "2026-10-30 05:00", sky: 1, pty: 0, tmp: 3, pop: 0, pcp: "강수없음", wsd: 2.1, vec: 315, reh: 80 }, { t: "2026-10-30 06:00", sky: 4, pty: 1, tmp: 4, pop: 70, pcp: "1.0mm", wsd: 9.5, vec: 90, reh: 95 },
        { t: "2026-10-31 00:00", sky: 1, pty: 0, tmp: 1 }];
    var c = RF.wxCols(hs, "2026-10-30", false);
    eq("wxCols 그 날 시간마다 - 북서풍은 남동쪽으로 부는 화살표", [c.length, c[0].h, c[0].icon, c[0].word, c[0].arrow, c[0].dir, c[1].word, c[1].arrow, c[1].dir, c[1].pcp],
        [2, "05", "☀️", "맑음", "↘", "북서", "비", "←", "동", "1mm"]);
    eq("wxCols 영어 · 풍향 없으면 빈칸", [RF.wxCols(hs, "2026-10-30", true)[0].word, RF.wxCols(hs, "2026-10-30", true)[0].dir, RF.wxCols(hs, "2026-10-31", false)[0].arrow], ["Clear", "NW", ""]);
})();
eq("kmaLink 행정동이 있으면 동네예보, 없으면 첫 화면", [RF.kmaLink({ code: "2815552000", name: "인천광역시 영종구 영종1동" }, 37.48441, 126.56), RF.kmaLink(null, 37.4, 126.5), RF.kmaLink({ code: "x", name: "a" }, 37.4, 126.5)],
    ["https://www.weather.go.kr/w/index.do#dong/2815552000/37.4844/126.5600/" + encodeURIComponent("인천광역시 영종구 영종1동") + "/LOC/" + encodeURIComponent("위경도(37.48,126.56)").replace("%2C", ","),
        "https://www.weather.go.kr/w/index.do", "https://www.weather.go.kr/w/index.do"]);
// 탐방 안내도 빈 구간 - OpenStreetMap 길에서 가장 짧은 길(tools/park-gaps, 2026-10-30 숨은벽 → 백운대). 노드 · 길은 테스트 데이터
(function () {
    var pg = require(path.join(__dirname, "../../../tools/park-gaps/fetch.js"));
    var el = [{ type: "node", id: 1, lat: 37.6618, lon: 126.9775 }, { type: "node", id: 2, lat: 37.6605, lon: 126.9779 }, { type: "node", id: 3, lat: 37.6587, lon: 126.9781 },
        { type: "node", id: 4, lat: 37.6610, lon: 126.9800 }, { type: "node", id: 9, lat: 37.70, lon: 127.0 },
        { type: "way", id: 10, nodes: [1, 2], tags: { highway: "path", sac_scale: "demanding_mountain_hiking" } }, { type: "way", id: 11, nodes: [2, 3], tags: { highway: "path" } },
        { type: "way", id: 12, nodes: [1, 3], tags: { highway: "path", access: "no" } }];   // 12 가 더 짧지만 출입금지
    var r = pg.route(el, [37.6618, 126.9775], [37.6587, 126.9781]);
    eq("park-gaps 가장 짧은 열린 길 · 지난 길 · 출입금지 빼기", [r.coords.length, r.ways, r.tags[0].sac_scale, pg.closedWays(r.tags).length, pg.closedWays([{ access: "private" }]).length],
        [3, [10, 11], "demanding_mountain_hiking", 0, 1]);
    eq("park-gaps 처음 · 끝 둘레에 길이 없으면 알림", !!pg.route(el, [37.60, 126.90], [37.6587, 126.9781]).error, true);
})();
// 탐방 안내도 구간 고르기(park.js addTrail) - 고리를 닫는 길 · 고리에 붙은 정상 갈래(2026-10-30 홍TV님: 밤골 → 숨은벽 → 백운대 → 숨은벽 → 계곡 → 밤골). 좌표는 테스트 데이터
(function () {
    var src = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/park.js"), "utf8");
    var code = src.slice(src.indexOf("    function chainCut(t) {"), src.indexOf("    function pick(t) {"));
    var H = [126.960, 37.675], J = [126.977, 37.661], T = [126.978, 37.6587];
    var line = function (a, b, n) { var o = []; for (var i = 0; i <= n; i++) o.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return o; };
    var mid = [126.966, 37.664];
    var lines = { ridge: line(H, J, 20), valley: line(J, mid, 10).concat(line(mid, H, 10).slice(1)), top: line(J, T, 8) };
    var segs = Object.keys(lines).map(function (k) { return { id: k, coords: lines[k] }; });
    var heads = [{ name: "밤골입구", lat: H[1], lon: H[0] }];
    var run = new Function("RF", "lines", "segs", "heads", code + "\nvar chosen = [];\nfunction planOf(ids) { return RF.planWalk(ids, lines, { heads: heads, first: ids[0] }); }\n"
        + "return { add: function (id) { chosen = addTrail({ id: id }); return chosen.slice().sort().join(','); }, reset: function () { chosen = []; }, plan: function () { var p = planOf(chosen); return p.walk.map(function (w) { return w.id + (w.rev ? '~' : ''); }).join(' '); } };");
    var k = run(RF, lines, segs, heads);
    k.add("ridge"); k.add("top"); var a = k.add("valley"), wa = k.plan();
    k.reset(); k.add("ridge"); k.add("valley"); var b = k.add("top"), wb = k.plan();
    eq("안내도 고르기: 편도 + 고리 닫는 길 · 고리 + 정상 갈래 → 정상은 왕복(고리 방향은 어느 쪽이든)", [a, b, / top top~ /.test(" " + wa + " "), / top top~ /.test(" " + wb + " ")], ["ridge,top,valley", "ridge,top,valley", true, true]);
})();
// park-gaps 높이 - terrarium PNG 풀기(2026-10-30). 2 × 2 그림을 직접 만들어(줄 거르기 0 · 1 · 2) 높이 = R × 256 + G + B / 256 - 32768
(function () {
    var pg = require(path.join(__dirname, "../../../tools/park-gaps/fetch.js")), zlib = require("zlib");
    var chunk = function (k, d) { var b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(k, 4, "ascii"); d.copy(b, 8); return b; };
    var ih = Buffer.alloc(13); ih.writeUInt32BE(2, 0); ih.writeUInt32BE(2, 4); ih[8] = 8; ih[9] = 2;
    // 픽셀: (0,0)=836m [131,68,0] (1,0)=837m [131,69,0] / (0,1)=500m [129,244,0] (1,1)=500.5m [129,244,128]
    var row0 = [1, 131, 68, 0, 0, 1, 0], row1 = [2, 129 - 131, 244 - 68, 0, 129 - 131, 244 - 69, 128];   // 1 = 왼쪽 더하기, 2 = 위 더하기
    var raw = Buffer.from(row0.concat(row1).map(function (v) { return v & 255; }));
    var png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    var img = pg.pngDecode(png);
    eq("park-gaps 높이: PNG 풀기 · terrarium 높이", [img.w, img.ch, pg.eleAt(img, 0.5, 0.5), pg.eleAt(img, 1.5, 0.5), pg.eleAt(img, 0.5, 1.5), pg.eleAt(img, 1.5, 1.5)], [2, 3, 836, 837, 500, 500.5]);
    var t = pg.tileOf(37.658722, 126.978088, 15);
    var la = 37.658722 * Math.PI / 180, n15 = Math.pow(2, 15);   // 표준 식(tan + sec)으로 따로 셈
    eq("park-gaps 높이: 타일 번호(백운대 15단계)", [t.x, t.y, t.px >= 0 && t.px < 256 && t.py >= 0 && t.py < 256],
        [Math.floor((126.978088 + 180) / 360 * n15), Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n15), true]);
})();
// 이은 코스 최고 - 지나는 정상의 공식 높이(ele_official)도(2026-10-30 PC: 숨은벽 · 백운대 대표 코스 그래프 최고 808m, 백운대 836m)
(function () {
    var a = RF.fromApi("a", { course: { name: "북한산 · 밤골 → 숨은벽 안부" }, points: [[126.962, 37.675, 200, 0], [126.977, 37.661, 586, 2400]], pois: [] });
    var b = RF.fromApi("b", { course: { name: "북한산 · 숨은벽 안부 → 백운대" }, points: [[126.977, 37.661, 586, 0], [126.978, 37.6587, 808, 600]],
        pois: [{ name: "백운대", dist_m: 600, off_route_m: 0, lat: 37.6587, lon: 126.978, ele_m: 836, ele_official: true }] });
    var plain = RF.fromApi("c", { course: { name: "x · p → q" }, points: [[126.977, 37.661, 586, 0], [126.978, 37.6587, 808, 600]], pois: [{ name: "q", dist_m: 600, off_route_m: 0, ele_m: 900 }] });
    eq("joinCourses 최고는 공식 정상 높이까지(공식 표시 없는 이름표 높이는 안 씀)", [RF.joinCourses([a, b], "a,b").course.ele_max_m, RF.joinCourses([a, plain], "a,c").course.ele_max_m], [836, 808]);
})();
// 명산 이름으로 찾으면 정상까지 가는 코스 먼저(2026-10-30 홍TV님: 북한산 → 백운대 코스가 121번째부터)
(function () {
    var peaks = [{ id: "북한산", name: "북한산", summit: "북한산백운대", height: 856 }, { id: "가리산", name: "가리산", summit: "가리산", height: 1060 }, { id: "백운산(광양)", name: "백운산", summit: "상봉", height: 1240 }];
    var rows = [{ name: "북한산 · 거북골 → 보문능선", ele_max_m: 492 }, { name: "북한산 · 광륜사 → 은석암", ele_max_m: 284 }, { name: "고양 북한산 백운대 · 원효암 → 북한산(백운대)", ele_max_m: 836 },
        { name: "북한산 · 사기막골입구 → 백운대", ele_max_m: 594 }];
    eq("summitFirst 높이로 닿는 코스 · 이름만 정상인 코스 · 나머지(같은 쪽은 원래 차례)", RF.summitFirst(rows, "북한산", peaks).map(function (r) { return r.ele_max_m; }), [836, 594, 492, 284]);
    eq("summitFirst 이름만 정상인 것은 높이로 닿는 것 뒤", RF.summitFirst([rows[3], rows[0], rows[2]], "북한산", peaks).map(function (r) { return r.ele_max_m; }), [836, 594, 492]);
    eq("summitFirst 정상 이름이 산 이름이면 높이로", RF.summitFirst([{ name: "가리산 · a → b", ele_max_m: 600 }, { name: "가리산 · c → 가리산", ele_max_m: 1050 }], "가리산", peaks).map(function (r) { return r.ele_max_m; }), [1050, 600]);
    eq("summitFirst 명산이 아니면 그대로", RF.summitFirst(rows, "보문능선", peaks), rows);
})();
// 대표 코스를 따라가기 목록에도(park-notes best 의 list, 2026-10-30 홍TV님 "일반 코스에도")
(function () {
    var notes = { "북한산": { best: [{ course: "a@0.0000-0.5203:가>나,b,b~,a@0.5203-1.0000:나>다", label: "숨은벽 · 백운대(밤골)", name: "밤골입구 → 숨은벽 → 백운대 → 밤골입구",
        list: { distance_m: 6250, ascent_m: 776, ele_max_m: 836 } }, { course: "knps-1", label: "우이령길", name: "우이동 → 교현리" }] } };
    var r = RF.listBest(notes, "북한산");
    eq("listBest 목록에 둘 대표 코스만 · 검색 줄 꼴", [r.length, r[0].name, r[0].distance_m, r[0].head, r[0].best], [1, "북한산 · 밤골입구 → 숨은벽 → 백운대 → 밤골입구", 6250, "밤골입구", "숨은벽 · 백운대(밤골)"]);
    eq("listBest 코스 이름 · 이름표로도, 다른 말은 없음", [RF.listBest(notes, "숨은벽").length, RF.listBest(notes, "북한산 백운대").length, RF.listBest(notes, "설악산").length, RF.listBest(notes, "북").length], [1, 1, 0, 0]);
})();
// 실제 park-notes: 북한산 숨은벽 대표 코스가 목록에 나오고 그 이은 ID 가 읽힘
(function () {
    var pn = JSON.parse(fs.readFileSync(path.join(__dirname, "../../main/webapp/data/park-notes.json"), "utf8")).parks;
    var r = RF.listBest(pn, "북한산");
    eq("park-notes 북한산 목록 대표 코스", [r.length >= 1, RF.parseJoinId(r[0].course_id).length, r[0].ele_max_m], [true, 4, 836]);
    // 목록 난이도 = 따라가기 난이도(그 화면은 거리 · 오르막 · 가장 가파른 1km 로 셈) - 운영 자료 계산값 6,253m · 776m · 40%
    eq("park-notes 대표 코스 목록 난이도가 따라가기와 같음(어려움)", [RF.difficulty(r[0].distance_m, r[0].ascent_m, r[0].steep_pct), RF.difficulty(6253, 776, 40)], [3, 3]);
})();
// 정상 먼저 줄 세우기는 바로잡은 이름으로(2026-10-30 PC: 공단 "백운대매표소 → … → 백운대" 는 인수대피소까지 - 0.96km · 최고 494m)
(function () {
    var pn = JSON.parse(fs.readFileSync(path.join(__dirname, "../../main/webapp/data/park-notes.json"), "utf8")).parks;
    var peaks = [{ id: "북한산", name: "북한산", summit: "북한산백운대", height: 856 }];
    var rows = [{ course_id: "knps-1501xx-a", name: "북한산 · 거북골 → 보문능선", ele_max_m: 492 }, { course_id: "knps-150120-897d2158", name: "북한산 · 백운대매표소 → 하루재 → 위문 → 백운대", ele_max_m: 494 }];
    var nm = function (x) { return RF.noteTrailName(pn, x.course_id, x.name); };
    eq("summitFirst 바로잡은 이름이면 이름만 정상 쪽에서 빠짐", [RF.summitFirst(rows, "북한산", peaks)[0].ele_max_m, RF.summitFirst(rows, "북한산", peaks, nm)[0].ele_max_m, nm(rows[1])],
        [494, 492, "북한산 · 백운대탐방지원센터 → 하루재 → 인수대피소"]);
})();
// 코스 정확도 점검(tools/course-audit, 2026-10-30 홍TV님 "코스가 끊어짐 없이"). 좌표 · 높이는 테스트 데이터
(function () {
    var au = require(path.join(__dirname, "../../../tools/course-audit/audit.js"));
    var pts = function (list) { var cum = 0, o = []; list.forEach(function (p, i) { if (i) cum += RF.distM(list[i - 1][1], list[i - 1][0], p[1], p[0]); o.push([p[0], p[1], p[2] == null ? 500 : p[2], Math.round(cum)]); }); return o; };
    var line = []; for (var i = 0; i <= 20; i++) line.push([127.0 + i * 0.0002, 37.6, 500 + i * 5]);
    var ok = { course: { name: "산 · 가 → 나", distance_m: null }, points: pts(line), pois: [{ name: "가", dist_m: 0, off_route_m: 0 }, { name: "나", dist_m: 350, off_route_m: 0 }] };
    ok.course.distance_m = ok.points[ok.points.length - 1][3];
    eq("checkCourse 멀쩡한 코스는 문제 없음", au.checkCourse(ok, {}), []);
    var gap = JSON.parse(JSON.stringify(line)); gap.splice(10, 0, [127.0 + 9 * 0.0002, 37.6 + 0.004, 545]);   // 9 번 뒤 440m 북쪽으로 튀었다 돌아옴
    var kinds = function (j, ctx) { return au.checkCourse(j, ctx).map(function (x) { return x.kind; }).filter(function (k, n, a) { return a.indexOf(k) === n; }).sort(); };
    eq("checkCourse 점 사이 250m 넘게 뛰면 끊김", kinds({ course: { name: "산 · 가 → 나" }, points: pts(gap), pois: [] }), ["gap"]);
    var flip = JSON.parse(JSON.stringify(ok)); flip.pois = [{ name: "가", dist_m: ok.course.distance_m, off_route_m: 0 }, { name: "나", dist_m: 0, off_route_m: 0 }];
    eq("checkCourse 이름과 거꾸로 그린 선", kinds(flip), ["flip"]);
    var mid = JSON.parse(JSON.stringify(ok)); mid.course.distance_m = null; mid.pois = [{ name: "가", dist_m: 0, off_route_m: 0 }, { name: "나", dist_m: 1, off_route_m: 0 }]; mid.points = pts(line.concat(line.slice().reverse().map(function (p) { return [p[0], p[1] + 0.006, p[2]]; })));
    eq("checkCourse 끝 이름이 끝이 아니라 처음 둘레(+ 선이 이어지지 않아 끊김)", kinds(mid), ["end", "gap"]);
    var peaks = [{ id: "북한산", summit: "북한산백운대", lat: 37.60, lon: 127.01 }];
    eq("checkCourse 정상 이름인데 정상 200m 안을 안 지남", kinds({ course: { name: "북한산 · 가 → 백운대" }, points: pts(line), pois: [] }, { peaks: peaks }), ["summit"]);
    eq("checkCourse 정상을 지나면 괜찮음", kinds({ course: { name: "북한산 · 가 → 백운대" }, points: pts(line), pois: [] }, { peaks: [{ id: "북한산", summit: "북한산백운대", lat: 37.6, lon: 127.002 }] }), []);
    // 안내도: 두 선이 이어지고 세 번째는 떨어져 있음(막다른 끝 · 따로 떨어진 조각)
    var T = function (id, name, a, b) { return { id: id, name: name, coords: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], distance_m: Math.round(RF.distM(a[1], a[0], b[1], b[0])) }; };
    var park = { trails: [T("t1", "산 · 가센터 → 나봉", [127.0, 37.6], [127.01, 37.6]), T("t2", "산 · 나봉 → 다고개", [127.01, 37.6], [127.02, 37.61]), T("t3", "산 · 라 → 마", [127.05, 37.65], [127.06, 37.65])],
        places: [{ name: "나봉", lat: 37.6, lon: 127.01, ele_m: 500 }], heads: [{ name: "가센터", lat: 37.6, lon: 127.0 }], others: [] };
    var r = au.checkPark(park, "산", {});
    // 다고개 끝은 막다른 끝, 떨어진 라 → 마 는 조각(그 양 끝은 안내도가 들머리로 봄)
    eq("checkPark 묶음 · 막다른 끝 · 떨어진 조각", [r.groups, r.issues.filter(function (x) { return x.kind === "dead"; }).map(function (x) { return x.seg; }), r.issues.filter(function (x) { return x.kind === "island"; }).length], [2, ["t2"], 1]);
})();
// 따라가기 - 자료가 끊긴 구간 알림(2026-10-30 코스 점검). 좌표는 테스트 데이터
eq("courseGaps 250m 넘게 뛰는 곳", [RF.courseGaps({ lat: [37.6, 37.6001, 37.605, 37.6051], lon: [127, 127, 127, 127], dist: [0, 11, 555, 566] }),
    RF.courseGaps({ lat: [37.6, 37.6001], lon: [127, 127], dist: [0, 11] })], [[{ at: 11, m: 545 }], []]);
// fly(3D) 도 이은 코스(대표 코스)를 받음 - joinedCourse → toApi → fromApi 가 같은 선(2026-10-30 홍TV님). 좌표는 테스트 데이터
(function () {
    var ja = { course: { name: "북한산 · 가 → 나", kind: "hike", distance_m: 1000 }, points: [[127, 37.60, 100, 0], [127, 37.609, 300, 1000]],
               pois: [{ name: "가", lat: 37.60, lon: 127, ele_m: 100, dist_m: 0, off_route_m: 0 }, { name: "갈림길", lat: 37.609, lon: 127, ele_m: 300, dist_m: 1000, off_route_m: 0 }] };
    var jb = { course: { name: "북한산 · 다 → 나", kind: "hike", distance_m: 1000 }, points: [[127.01, 37.609, 200, 0], [127, 37.609, 300, 900]], pois: [] };
    var parts = RF.parseJoinId("a,b~");
    var c = RF.joinedCourse("a,b~", parts, [ja, jb]);
    var api = RF.toApi(c), back = RF.fromApi("a,b~", api);
    eq("joinedCourse → toApi 점 · 거리 그대로", [api.points.length, back.lon.length === c.lon.length, Math.round(back.total) === Math.round(c.total), api.course === c.course], [c.lon.length, true, true, true]);
    eq("joinedCourse 거꾸로 이음 - 끝이 다", [c.lon[c.lon.length - 1], c.lat[c.lat.length - 1]], [127.01, 37.609]);
})();
// 탐방 안내도 떨어진 조각 잇기(tools/park-gaps/islands.js, 2026-10-30) - 받을 길 거르기
(function () {
    var I = require("../../../tools/park-gaps/islands.js");
    var ok = { distance_m: 900, tags: [{ access: null }] };
    eq("islands rejectReason", [I.rejectReason(ok, 700), !!I.rejectReason({ distance_m: 900, tags: [{ access: "no" }] }, 700), !!I.rejectReason({ distance_m: 4100, tags: [] }, 2000),
        !!I.rejectReason({ distance_m: 3000, tags: [] }, 500), I.rejectReason({ error: "길 없음" }, 500), I.placeName("등천리 757m")], [null, true, true, true, "길 없음", "등천리"]);
})();
// 떨어진 조각 ↔ 큰 묶음 - 어느 점끼리든 가장 짧은 길(routeSets, 2026-10-30 PC: 가장 가까운 두 점만 이으면 거의 다 "잇는 길이 없음"). 좌표는 테스트 데이터
(function () {
    var F = require("../../../tools/park-gaps/fetch.js");
    var el = [{ type: "node", id: 1, lat: 37.600, lon: 127.000 }, { type: "node", id: 2, lat: 37.605, lon: 127.000 }, { type: "node", id: 3, lat: 37.610, lon: 127.000 },
        { type: "node", id: 4, lat: 37.600, lon: 127.010 }, { type: "node", id: 5, lat: 37.610, lon: 127.010 },
        { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "path" } }, { type: "way", id: 11, nodes: [4, 1], tags: { highway: "residential", access: "private" } },
        { type: "way", id: 12, nodes: [3, 5], tags: { highway: "track" } }];
    var r = F.routeSets(el, [[37.6, 127.0]], [[37.6, 127.01], [37.61, 127.01]], 150);
    eq("routeSets 출입금지 길을 피해 돌아 이음", [r.ways, r.coords.length, r.distance_m > 1800 && r.distance_m < 2100], [[10, 12], 4, true]);
    eq("routeSets 길 없음", F.routeSets(el, [[37.7, 127.0]], [[37.6, 127.01]], 150).error, "조각 · 큰 묶음에서 150m 안에 길이 없음");
})();
eq("islands roadNote", (function (I) { return [I.roadNote([{ highway: "path" }, { highway: "tertiary" }]), I.roadNote([{ highway: "service" }, { highway: "path" }]), I.roadNote([{ highway: "path" }])]; })(require("../../../tools/park-gaps/islands.js")),
    [" (차도 포함)", " (마을길 포함)", ""]);
