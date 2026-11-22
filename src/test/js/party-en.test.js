// 산악회 영어 화면 - 서버 오류 글이 "(Korean message)" 로 나오지 않는지(2026-11-22 산악회 점검)
var fs = require("fs"), path = require("path");
function table(file) {
    var src = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/" + file), "utf8");
    var a = src.indexOf("var EN_MSG = ["), b = src.indexOf("];", a);
    return new Function(src.slice(a, b + 2) + " return EN_MSG;")();
}
function en(t, m) {
    for (var i = 0; i < t.length; i++) {
        var mm = m.match(t[i][0]), e = t[i][1];
        if (mm) return typeof e === "function" ? e.apply(null, mm) : e.replace(/\$(\d)/g, function (x, k) { return mm[+k] || ""; });
    }
    return null;
}
var fail = 0, n = 0;
function eq(name, got, want) { n++; if (got !== want) { fail++; console.log("FAIL " + name + ": " + got + " (기대 " + want + ")"); } }
var room = table("party.js"), office = table("party-office.js");
eq("QR 1시간", en(room, "버스 탑승 QR 은 출발 1시간 전부터 됩니다. 버스에 타서 다시 찍어 주세요."), "The bus boarding QR works from 1 hour before departure. Scan it again on the bus.");
eq("회사 이름은 내 이름이 아님", en(room, "회사 이름을 적어 주세요."), "Please enter the company name.");
eq("보조 인솔자 자리", en(room, "보조 인솔자 자리가 다 찼습니다(차량 2대 - 2명). 주 인솔자에게 확인해 주세요."), "All assistant leader spots are taken (one per bus - 2). Please check with the main leader.");
eq("SOS 로 못 끝냄", /SOS on/.test(en(room, "SOS 를 켠 회원이 있어 방을 끝낼 수 없습니다. 그 회원을 찾거나 하산 탑승을 확인한 뒤 끝내 주세요.") || ""), true);
eq("주 인솔자만 끝냄", en(room, "방은 주 인솔자(또는 회사 사무실)만 끝냅니다."), "Only the main leader (or the company office) can end the room.");
eq("이 회사의 방이 아닙니다", en(room, "이 회사의 방이 아닙니다."), "This room isn't this company's, or it has already ended.");
eq("묶음 한도 숫자", en(office, "한 묶음에는 사무실을 20곳까지 넣습니다."), "A group holds up to 20 offices.");
eq("관리자 기기", en(office, "관리자 기기에서만 쓸 수 있습니다."), "Only the admin device can do this.");
eq("사무실 쪽 방 코드 틀림", en(office, "방 코드를 너무 많이 틀렸습니다. 10분 뒤 다시 해 주세요."), "Too many wrong codes or links. Please try again in 10 minutes.");
console.log(fail ? "FAILED " + (n - fail) + "/" + n : "OK " + n + "/" + n);
process.exit(fail ? 1 : 0);
