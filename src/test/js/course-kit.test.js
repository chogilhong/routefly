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
eq("isTopName 대피소 아님", RF.isTopName("장터목대피소"), false);
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
