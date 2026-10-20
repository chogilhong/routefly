package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 2026-10-11 개인정보처리방침(privacy.html)에 적은 약속이 코드 · 배포 설정과 맞는지.
 * 방침을 고치거나 아래 코드를 바꾸면 둘을 함께 맞춥니다.
 */
public class PrivacyPolicyTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void policyMatchesCode() throws Exception {
        String policy = read("src/main/webapp/privacy.html");
        // 위치를 서버로 보내지 않음(위치기반서비스 비신고 요건 ②) - "내 주변 코스" 도 고정 격자 칸만
        assertTrue(policy.contains("<b>고정된 지도 칸</b>(모든 사용자에게 같음)"));
        assertTrue(policy.contains("운영자의 서버로 보내거나 저장하지 않습니다"));
        String hike = read("src/main/webapp/js/hike.js"), app = read("src/main/webapp/js/app.js");
        assertTrue(hike.contains("var cells = RF.gridCells([lon - rl, lat - r, lon + rl, lat + r]);"));
        assertTrue(hike.contains("return getJson(\"api/courses?bbox=\" + bb.map(function (v) { return v.toFixed(1); })"));
        assertTrue(app.contains("askBb = bb && list.near ? RF.snapOut(bb) : bb;"));
        // 그 밖에 GPS 위치(pos.coords · co.latitude 등)를 서버 주소에 넣는 곳이 없어야 함 - api/ 주소를 만드는 줄에 위도 · 경도 변수가 없는지
        for (String line : hike.split("\n")) {
            // 코스 들머리(c.lat[0] · c.lon[0] - 공개된 코스 자료)는 괜찮음: 방침 "날씨 · 안전 … 코스 들머리 좌표로"(2026-10-18 오늘의 산행 안전)
            if (line.contains("\"api/") && line.matches(".*\\b(lat|lon|coords|latitude|longitude)\\b.*") && !line.contains("bb.map")
                    && !line.contains("(+c.lat[0]).toFixed(4) + \"&lon=\" + (+c.lon[0]).toFixed(4)")) {
                fail("hike.js 가 위치를 api 주소에 넣는 것 같음: " + line.trim());
            }
        }
        // 별거 별거 "내 위치로"(날씨 · 산행 안전)는 GPS 대신 고정 5km 칸 가운데만 서버로(2026-10-18 점검 - 전에는 GPS 그대로였음)
        String tools = read("src/main/webapp/js/tools.js");
        assertTrue(tools.contains("var cc = RF.cellCenter(p.coords.latitude, p.coords.longitude);") && tools.contains("loc = { lat: cc[0], lon: cc[1],"));
        assertFalse("tools.js 가 GPS 를 그대로 loc 에", tools.matches("(?s).*lat: p\\.coords\\.latitude.*"));
        assertTrue(policy.contains("별거 별거") && policy.contains("약 5km"));
        // 산악회 방(2026-10-20): 참가(동의)한 때만 보냄 - party-kit 이 열쇠가 있을 때만, 서버는 설정을 켰을 때만, 확인자료는 좌표 없이 200일
        String kit = read("src/main/webapp/js/party-kit.js");
        assertTrue(kit.contains("if (!p || lat == null || lon == null) return null;"));
        assertTrue(hike.contains("if (!hike.sim && window.RFParty) RFParty.fix(co.latitude, co.longitude, acc);"));
        assertTrue(read("src/main/java/com/gh/routefly/web/PartyServlet.java").contains("return \"true\".equalsIgnoreCase(RouteflyConfig.get(\"party.enabled\"));"));
        assertTrue(read("src/main/java/com/gh/routefly/web/PartyServlet.java").contains("위치 제공에 동의해야 참가할 수 있습니다."));
        assertTrue(policy.contains("<b>참가할 때 동의한 사람의 위치만</b>") && policy.contains("6개월 넘게(200일)"));
        String log4j = read("src/main/resources/log4j2.xml");
        assertTrue(log4j.contains("<IfFileName glob=\"party-*.log.gz\"/>") && log4j.contains("<IfLastModified age=\"200d\"/>"));
        // 접속 기록에 ?뒤를 남기지 않고 14 · 30일
        String deploy = read("docs/deploy-lightsail.md");
        assertTrue(deploy.contains("access_log /var/log/nginx/access.log routefly_noargs;"));
        assertTrue(deploy.contains("pattern=\"%h %t &quot;%m %U&quot; %s %b\" maxDays=\"30\""));
        assertTrue(policy.contains("14일 뒤 자동 삭제") && policy.contains("30일 뒤 자동 삭제"));
        // 요청 횟수는 2분 쉬면 지움(RateLimiter.sweep idle 120초)
        assertTrue(policy.contains("2분 동안 요청이 없으면"));
        assertTrue(read("src/main/java/com/gh/routefly/web/RateLimiter.java").contains("long idle = full ? 10_000 : 120_000;"));
        // 앱 백업에 기록을 넣지 않음
        assertTrue(policy.contains("앱은 핸드폰 백업에 이 정보를 넣지 않습니다"));
        assertTrue(read("app/android/app/src/main/AndroidManifest.xml").contains("android:allowBackup=\"false\""));
    }

    @Test
    public void policyIsLinked() throws Exception {
        assertTrue(read("src/main/webapp/about.html").contains("href=\"privacy.html\""));
        assertTrue(read("src/main/webapp/hike.html").contains("href=\"privacy.html\""));
        assertTrue("오프라인에서도", read("src/main/webapp/sw.js").contains("\"privacy.html\""));
    }
}
