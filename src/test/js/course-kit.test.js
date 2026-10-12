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
eq("fromApi 갈림길은 이름표가 아님", c.pois.map(function (p) { return p.name; }).sort(), ["주차장", "중간쉼터"]);
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
    .map(function (p) { return p.name + ":" + p.start; }), ["주화산:0", "군하리:1", "복지봉:-1", "두산리:2", "무룡고개:-1"]);
eq("노선 안내도 흔한 이름은 지명 아님", RF.routePlaces([{ course_id: "a", name: "백두대간 4구간 · 성국사 → 삼각점" }, { course_id: "b", name: "백두대간 5구간 · 삼각점 → 치밭골령" }],
    { a: [[128.4, 38.1], [128.45, 38.05]], b: [[128.4501, 38.0501], [128.5, 38]] }).map(function (p) { return p.name + ":" + p.start + (p.last ? ":끝" : ""); }),
    ["성국사:0", "치밭골령:-1:끝"]);
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
