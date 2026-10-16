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
    console.log((fails ? "FAILED " : "OK ") + (runs - fails) + "/" + runs);
    process.exit(fails ? 1 : 0);
});

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
    .map(function (n) { return n.day + " " + n.wsd + " " + n.text.slice(0, 8); }), ["2026-10-17 8.2 ⚠ 바람 강함 ", "2026-10-18 11 ⚠ 강풍 - 모"]);
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
    ["예상 시간(편도)", "5시간 24분", "3시간 25분"], ["난이도", "어려움", "어려움"], ["평균 경사", "10.1%", "26%"], ["가장 가파른 1km", "-", "-"]]);
eq("compareRows 영어 시간", RF.compareRows({ dist: 3000, asc: 0 }, { dist: 5000, asc: 1300 }, true)[2], ["Time (one way)", "45 min", "3 h 25 min"]);
// 가장 가파른 1km(2026-10-16) - Steep.steepest 와 같은 값(SteepTest)
(function () {
    var d = [], e = [];
    for (var i = 0; i <= 50; i++) { d.push(i * 100); e.push(i < 30 ? 300 + i * 5 : 445 + (i - 30) * 30); }   // 3km 완만(5%) 뒤 2km 가파름(30%)
    eq("steepest", [RF.steepest(d, e), RF.steepest([0, 500], [100, 200]), RF.steepest([0, 200], [0, 50]), RF.steepest([0, 2000], [null, null])], [30, 20, null, null]);
    // 내리막도 셈 - 거꾸로 해도 같음
    eq("steepest 내리막", RF.steepest(d, e.slice().reverse()), 30);
    eq("difficulty 가파름은 한 단계까지만 올림", [RF.difficulty(5000, 600), RF.difficulty(5000, 600, 45), RF.difficulty(5000, 600, 27), RF.difficulty(5000, 1300, 44.4), RF.difficulty(2000, 100, 50)], [1, 2, 1, 3, 1]);
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
