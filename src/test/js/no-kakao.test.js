// no-kakao.js - 크롬에서 ?rfh= 를 # 로 되돌리기(2026-11-22 산악회 점검: 사무실 여럿 #ks= 열쇠가 주소창에 남았고, 따라가기 #c=…&m=%… 는 버려졌음)
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/no-kakao.js"), "utf8");
var fail = 0, n = 0;
function eq(name, got, want) { n++; if (got !== want) { fail++; console.log("FAIL " + name + ": " + got + " (기대 " + want + ")"); } }
function run(search) {
    var out = null;
    new Function("location", "history", "navigator", src)({ search: search, pathname: "/routefly/p.html", hash: "", host: "routefly.kr" },
        { replaceState: function (a, b, u) { out = u; } }, { userAgent: "Mozilla/5.0 Chrome" });
    return out;
}
var ks = "#ks=" + "a".repeat(32) + "." + "b".repeat(32);
eq("사무실 여럿(점 든 열쇠)도 되돌림", run("?rfh=" + encodeURIComponent(ks)), "/routefly/p.html" + ks);
eq("따라가기 & · % 든 조각 · 다른 ? 값은 그대로", run("?lang=en&rfh=" + encodeURIComponent("#c=kmp-1&m=%EC%B2%9C")), "/routefly/p.html?lang=en#c=kmp-1&m=%EC%B2%9C");
eq("# 이 아닌 값은 되돌리지 않고 rfh 만 지움", run("?rfh=" + encodeURIComponent("/../evil")), "/routefly/p.html");
eq("rfh 가 없으면 손대지 않음", run("?lang=en"), null);
console.log(fail ? "FAILED " + (n - fail) + "/" + n : "OK " + n + "/" + n);
process.exit(fail ? 1 : 0);
