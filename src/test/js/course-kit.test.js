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

console.log((fails ? "FAILED " : "OK ") + (runs - fails) + "/" + runs);
process.exit(fails ? 1 : 0);
