package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.BufferedReader;
import java.io.PrintWriter;
import java.io.StringReader;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.Test;

/**
 * GPX 편집을 누구나(2026-11-02 홍TV님) - 손님은 📮 보내기(올리기 아님) · 운영자 전용 주소는 손님을 막음 · 동의 글 · 지도 출처 · 공용 타일은 운영자만 · 통계 이름 · 코스 모음 입구.
 */
public class StudioPublicTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void guestSeesSendNotUpload() throws Exception {
        String page = read("src/main/webapp/studio.html"), js = read("src/main/webapp/js/studio.js");
        // 처음 모양은 손님 화면 - 올리기 · 받은 GPX 는 숨김, 보내기와 그 안내가 보임
        assertTrue(page.contains("id=\"upBtn\" type=\"button\" hidden>⬆ 코스로 올리기"));
        assertTrue(page.contains("id=\"sendBtn\" type=\"button\">📮 routefly 에 코스 보내기"));
        assertTrue(page.contains("<p class=\"tip\" id=\"sendTip\">📮 보내면 운영자가 확인한 뒤 코스 목록에 넣습니다. 집 근처는 먼저 자르세요.</p>"));
        assertTrue(page.contains("<p class=\"tip\" id=\"upTip\" hidden>⬆ 코스로:"));
        assertTrue(page.contains("<section id=\"subSec\" hidden>"));
        assertTrue("지도 도구 줄도 보내기", page.contains("id=\"upTool\" data-go=\"#sendBtn\""));
        // 운영자인지는 서버에 물어 바꿈 - 받은 GPX 는 운영자일 때만 읽음
        assertTrue(js.contains("$(\"upBtn\").hidden = $(\"upTip\").hidden = !owner;"));
        assertTrue(js.contains("$(\"sendBtn\").hidden = $(\"sendTip\").hidden = owner;"));
        assertTrue(js.contains("if (owner) loadSubs();"));
        assertFalse("손님을 돌려보내지 않음", js.contains("location.replace("));
        assertTrue("보내기는 따라가기와 같은 창", js.contains("RF.submitSheet({ name: c.name, kind: $(\"kind\").value, track: c.track"));
        assertTrue("GPX 편집용 작은 course-kit 에 보내기 창이 있음", read("src/main/webapp/js/kit-studio.js").contains("submitSheet: submitSheet"));
        assertTrue(js.contains("function pcHint()") && js.contains("PC 에서 쓰기 좋아요") && js.contains("(max-width: 860px)"));
    }

    @Test
    public void ownerEndpointsRejectGuest() throws Exception {
        assertEquals("⬆ 코스로 올리기", 403, call(new CourseUploadServlet(), "POST", null, null, "{\"name\":\"시험산\",\"kind\":\"hike\",\"gpx\":\"\"}"));
        CourseSubmitServlet s = new CourseSubmitServlet();
        assertEquals("받은 GPX 목록", 403, call(s, "GET", "/list", null, ""));
        assertEquals("받은 GPX 열기", 403, call(s, "GET", "/gpx", "s-20261101-093000-0a1b2c", ""));
        assertEquals("받은 GPX 버리기", 403, call(s, "POST", "/done", null, "{\"id\":\"s-20261101-093000-0a1b2c\"}"));
        Map<String, Object> out = new HashMap<>();
        StringWriter sw = new StringWriter();
        new CourseUploadServlet().doGet(req("GET", null, null, ""), resp(out, sw));
        assertTrue("손님은 owner false", sw.toString().contains("\"owner\":false"));
    }

    @Test
    public void consentShared() throws Exception {
        String kit = read("src/main/webapp/js/course-kit.js"), hike = read("src/main/webapp/js/hike.js");
        assertTrue(kit.contains("내가 직접 걸은 기록입니다(다른 앱 · 사이트에서 받은 남의 기록은 보내지 마세요). 위 내용을 읽었고 보내는 데 동의합니다"));
        assertTrue("서버 동의 뜻은 그대로", kit.contains("agree: true"));
        assertTrue("따라가기도 같은 창", hike.contains("RF.submitSheet({ name: r.name"));
        assertFalse("동의 글을 따로 두지 않음", hike.contains("보내는 데 동의합니다"));
        assertTrue("방침에 GPX 편집 보내기", read("src/main/webapp/privacy.html").contains("📐 GPX 편집 → \"📮 routefly 에 코스 보내기\""));
        assertTrue(read("src/main/webapp/privacy-en.html").contains("📐 GPX editor → \"📮 Send a course to routefly\""));
    }

    @Test
    public void tilesAndAttribution() throws Exception {
        String js = read("src/main/webapp/js/studio.js");
        assertTrue("OSM 출처는 늘", js.contains("customAttribution: \"© OpenStreetMap contributors\""));
        assertTrue(js.contains("attribution: b.id === \"sat\" ? \"위성사진: 국토교통부 V-World\" : \"지도: 국토교통부 V-World\""));
        assertTrue(js.contains("attribution: \"지형: Terrain Tiles (AWS Open Data)\""));
        // 남의 공용 타일(OSM · OpenTopoMap · Waymarked)은 pub 없이 - 손님 화면에는 소스를 넣지 않음
        Matcher m = Pattern.compile("\\{ id: \"(\\w+)\", name: [^\\n]*").matcher(js);
        int n = 0;
        while (m.find()) {
            String row = m.group();
            boolean shared = row.contains("openstreetmap.org") || row.contains("opentopomap.org") || row.contains("waymarkedtrails.org");
            assertEquals(m.group(1), !shared, row.contains("pub: true"));
            if (row.contains("tiles: [")) assertTrue(m.group(1) + " 출처", row.contains("attr: \"") && row.contains("© OpenStreetMap contributors"));
            n++;
        }
        assertEquals("바탕 5 · 겹침 3", 8, n);
        assertTrue(js.contains("function usable(x) { return owner || !!x.pub; }"));
        assertTrue("지도 글 · 고르기 칸 모두 거름", js.contains("if (!usable(b)) return;") && js.contains("if (!o.tiles || !usable(o)) return;") && js.contains("|| !usable(b)) return;") && js.contains("if (usable(o)) h +="));
    }

    @Test
    public void statsNameAndEntry() throws Exception {
        assertEquals("GPX 편집", StatsServlet.pageName("/studio.html"));
        String ms = read("src/main/java/com/gh/routefly/web/MountainServlet.java");
        assertTrue("코스 모음 입구는 누구나", ms.contains("id=\\\"studioLink\\\" href=") && !ms.contains("id=\\\"studioLink\\\" style=\\\"display:none\\\""));
        assertFalse("숨긴 입구를 보이던 스크립트는 뺌", read("src/main/webapp/js/mountain.js").contains("studioLink"));
    }

    private static HttpServletRequest req(String method, String path, String id, String body) {
        return (HttpServletRequest) Proxy.newProxyInstance(StudioPublicTest.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (p, m, a) -> switch (m.getName()) {
                    case "getContentType" -> "application/json";
                    case "getPathInfo" -> path;
                    case "getParameter" -> "id".equals(a[0]) ? id : null;
                    case "getRemoteAddr" -> "203.0.113.10";
                    case "getReader" -> new BufferedReader(new StringReader(body));
                    case "getMethod" -> method;
                    case "getCookies" -> new Cookie[] {new Cookie(StatsServlet.OWNER_COOKIE, "guess")};   // 꾸민 쿠키도 손님
                    default -> null;
                });
    }

    private static HttpServletResponse resp(Map<String, Object> out, StringWriter sw) {
        out.put("status", 200);
        PrintWriter pw = new PrintWriter(sw, true);
        return (HttpServletResponse) Proxy.newProxyInstance(StudioPublicTest.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (p, m, a) -> {
                    if ("setStatus".equals(m.getName())) out.put("status", a[0]);
                    if ("getWriter".equals(m.getName())) return pw;
                    return null;
                });
    }

    private static int call(HttpServlet s, String method, String path, String id, String body) throws Exception {
        Map<String, Object> out = new HashMap<>();
        HttpServletRequest rq = req(method, path, id, body);
        HttpServletResponse rs = resp(out, new StringWriter());
        if (s instanceof CourseUploadServlet u) { if ("GET".equals(method)) u.doGet(rq, rs); else u.doPost(rq, rs); }
        else if ("GET".equals(method)) ((CourseSubmitServlet) s).doGet(rq, rs); else ((CourseSubmitServlet) s).doPost(rq, rs);
        return (Integer) out.get("status");
    }
}
