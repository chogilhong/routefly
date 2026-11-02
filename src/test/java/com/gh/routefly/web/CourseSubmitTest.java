package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.BufferedReader;
import java.io.File;
import java.io.PrintWriter;
import java.io.StringReader;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** 코스 보내기(2026-11-01 홍TV님) - 받을지 · 한도 묶음 · 운영자만 · 번호 꼴 · 30일 지움 · 점검 끝 지움. 이름은 테스트 데이터(시험대장 · 시험산악회). */
public class CourseSubmitTest {

    private static List<double[]> pts(int n) {
        StringBuilder sb = new StringBuilder("<gpx><trk><trkseg>");
        for (int i = 0; i < n; i++) sb.append("<trkpt lat=\"").append(37.5 + i * 0.0005).append("\" lon=\"127.0\"><ele>").append(100 + i).append("</ele><time>2026-11-01T00:00:00Z</time></trkpt>");
        return CourseUploadServlet.points(sb.append("</trkseg></trk></gpx>").toString());
    }

    @Test
    public void cleanAndCheck() {
        assertEquals("시험대장 b 시험산악회", CourseSubmitServlet.clean("  시험대장<b>\n시험산악회 "));
        assertEquals("꺾쇠 · 따옴표 · 제어 글자는 빈칸으로", "a b c d", CourseSubmitServlet.clean("a<b>\"c\u0007d"));
        assertEquals("비우면 익명", "", CourseSubmitServlet.clean(null));
        assertNull(CourseSubmitServlet.check("시험대장", ""));
        assertNull(CourseSubmitServlet.check("", "메모"));
        assertNotNull("이름 20자 넘음", CourseSubmitServlet.check("가".repeat(21), ""));
        assertNull(CourseSubmitServlet.check("가".repeat(20), ""));
        assertNotNull("메모 200자 넘음", CourseSubmitServlet.check("", "가".repeat(201)));
        // 코스 이름 · 점은 올리기와 같은 점검
        assertNull(CourseUploadServlet.check("시험산 · 마을회관 → 정상", "hike", pts(20)));
        assertNotNull(CourseUploadServlet.check("시험산", "hike", pts(5)));
    }

    @Test
    public void idPattern() {
        assertTrue(CourseSubmitServlet.validId("s-20261101-093000-0a1b2c"));
        for (String bad : new String[] {null, "", "../s-20261101-093000-0a1b2c", "s-20261101-093000-0A1B2C", "s-20261101-093000-0a1b2c.json", "u-20261101-093000", "s-20261101-093000-0a1b2c/../x", "s-2026110-093000-0a1b2c"})
            assertFalse(bad, CourseSubmitServlet.validId(bad));
    }

    @Test
    public void quotaGroupsBy48AndGivesBack() {
        assertEquals("같은 /48 은 한 묶음", CourseSubmitServlet.quotaKey("2001:db8:1:1::5"), CourseSubmitServlet.quotaKey("2001:db8:1:ff::9"));
        assertNotEquals(CourseSubmitServlet.quotaKey("2001:db8:1:1::5"), CourseSubmitServlet.quotaKey("2001:db8:2:1::5"));
        assertEquals("203.0.113.7", CourseSubmitServlet.quotaKey("203.0.113.7"));
        long t = 9_000_000_000_000L;   // 다른 시험과 겹치지 않는 때
        String k = CourseSubmitServlet.quotaKey("2001:db8:77:1::1");
        for (int i = 0; i < 3; i++) assertTrue(PartyServlet.reserve(CourseSubmitServlet.SUBMITS, k, CourseSubmitServlet.SUBMITS_ALL, t));
        assertFalse("하루 3번(2026-11-02 홍TV님 점검)", PartyServlet.reserve(CourseSubmitServlet.SUBMITS, CourseSubmitServlet.quotaKey("2001:db8:77:2::1"), CourseSubmitServlet.SUBMITS_ALL, t));
        CourseSubmitServlet.SUBMITS.give(k, t);
        CourseSubmitServlet.SUBMITS_ALL.give("*", t);
        assertTrue("돌려주면 다시", PartyServlet.reserve(CourseSubmitServlet.SUBMITS, k, CourseSubmitServlet.SUBMITS_ALL, t));
        for (int i = 0; i < 3; i++) { CourseSubmitServlet.SUBMITS.give(k, t); CourseSubmitServlet.SUBMITS_ALL.give("*", t); }
    }

    @Test
    public void saveListSweepDone() throws Exception {
        File dir = Files.createTempDirectory("rf-submit").toFile();
        try {
            long now = System.currentTimeMillis();
            JsonObject a = CourseSubmitServlet.save(dir, "시험산 · 마을회관 → 정상", "시험대장", "hike", "", pts(20), now - 60_000);
            JsonObject b = CourseSubmitServlet.save(dir, "시험산 둘레길", "", "walk", "시험산악회 메모", pts(30), now);
            assertTrue(CourseSubmitServlet.validId(a.get("id").getAsString()));
            assertEquals(20, a.get("points").getAsInt());
            assertTrue(a.get("distM").getAsLong() > 900 && a.get("distM").getAsLong() < 1200);
            String gpx = Files.readString(new File(dir, a.get("id").getAsString() + ".gpx").toPath(), StandardCharsets.UTF_8);
            assertFalse("시각은 남기지 않음", gpx.contains("<time>"));
            assertEquals(20, CourseUploadServlet.points(gpx).size());
            if (Files.getFileStore(dir.toPath()).supportsFileAttributeView("posix"))
                assertEquals("이 계정만", "rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(new File(dir, a.get("id").getAsString() + ".json").toPath())));
            JsonArray l = CourseSubmitServlet.list(dir, now);
            assertEquals(2, l.size());
            assertEquals("새것 먼저", "시험산 둘레길", l.get(0).getAsJsonObject().get("name").getAsString());
            // 30일 지난 것은 지움
            for (String ext : new String[] {".gpx", ".json"}) assertTrue(new File(dir, a.get("id").getAsString() + ext).setLastModified(now - CourseSubmitServlet.KEEP_MS - 1000));
            Files.writeString(Path.of(dir.getPath(), "keep.txt"), "x");
            assertTrue(new File(dir, "keep.txt").setLastModified(0));
            assertEquals(1, CourseSubmitServlet.list(dir, now).size());
            assertFalse(new File(dir, a.get("id").getAsString() + ".gpx").exists());
            assertTrue("받은 코스 꼴이 아닌 파일은 그대로", new File(dir, "keep.txt").exists());
            // 점검 끝 - 두 파일을 지움
            assertTrue(CourseSubmitServlet.remove(dir, b.get("id").getAsString()));
            assertFalse(CourseSubmitServlet.remove(dir, b.get("id").getAsString()));
            assertEquals(0, CourseSubmitServlet.list(dir, now).size());
        } finally {
            File[] fs = dir.listFiles();
            if (fs != null) for (File f : fs) f.delete();
            dir.delete();
        }
    }

    /** 2026-11-02 홍TV님 점검: 5만 점 기록은 모양을 지키며 1만 점 안으로, 받은 폴더 크기를 셈. */
    @Test
    public void simplifyKeepsShape() throws Exception {
        java.util.List<double[]> zig = new java.util.ArrayList<>();
        for (int i = 0; i < 50_000; i++) zig.add(new double[] {37.5 + i * 0.00001, 127.0 + ((i / 500) % 2 == 0 ? (i % 500) : 500 - (i % 500)) * 0.00001, i});
        java.util.List<double[]> s = CourseSubmitServlet.simplify(zig, CourseSubmitServlet.KEEP_POINTS);
        assertTrue(s.size() + "개", s.size() <= 10_000 && s.size() >= 100);
        assertSame("처음", zig.get(0), s.get(0));
        assertSame("끝", zig.get(zig.size() - 1), s.get(s.size() - 1));
        double worst = 0;   // 뺀 점마다 남은 선에서 떨어진 거리(m) - 모양을 지킴
        for (int i = 0, j = 0; i < zig.size(); i++) {
            while (j + 1 < s.size() && s.get(j + 1)[2] < i) j++;
            double[] a = s.get(j), b = s.get(Math.min(j + 1, s.size() - 1)), p = zig.get(i);
            double kx = 111_320 * Math.cos(Math.toRadians(37.5)), ax = a[1] * kx, ay = a[0] * 111_320, bx = b[1] * kx, by = b[0] * 111_320, px = p[1] * kx, py = p[0] * 111_320;
            double len = Math.hypot(bx - ax, by - ay), d = len == 0 ? Math.hypot(px - ax, py - ay) : Math.abs((by - ay) * (px - ax) - (bx - ax) * (py - ay)) / len;
            worst = Math.max(worst, d);
        }
        assertTrue("모양이 5m 넘게 어긋나지 않음 - " + worst, worst < 5);
        java.util.List<double[]> few = pts(20);
        assertSame("1만 점 안이면 그대로", few, CourseSubmitServlet.simplify(few, CourseSubmitServlet.KEEP_POINTS));
        File dir = Files.createTempDirectory("rf-submit-bytes").toFile();
        try {
            Files.write(Path.of(dir.getPath(), "a.gpx"), new byte[1234]);
            Files.write(Path.of(dir.getPath(), "b.json"), new byte[66]);
            assertEquals(1300, CourseSubmitServlet.bytes(dir));
        } finally {
            File[] fs = dir.listFiles();
            if (fs != null) for (File f : fs) f.delete();
            dir.delete();
        }
    }

    @Test
    public void ownerOnly() throws Exception {
        CourseSubmitServlet s = new CourseSubmitServlet();
        assertEquals(403, call(s, "GET", "/list", null, "application/json", ""));
        assertEquals(403, call(s, "GET", "/gpx", "s-20261101-093000-0a1b2c", "application/json", ""));
        assertEquals(403, call(s, "POST", "/done", null, "application/json", "{\"id\":\"s-20261101-093000-0a1b2c\"}"));
        assertEquals(404, call(s, "GET", "/x", null, null, ""));
        assertEquals("JSON 만", 415, call(s, "POST", null, null, "text/plain", "{}"));
    }

    @Test
    public void privacyAndScreens() throws Exception {
        String ko = Files.readString(Path.of("src/main/webapp/privacy.html"), StandardCharsets.UTF_8), en = Files.readString(Path.of("src/main/webapp/privacy-en.html"), StandardCharsets.UTF_8);
        assertTrue(ko.contains("id=\"course-submit\"") && ko.contains("늦어도 30일"));
        assertTrue(en.contains("id=\"course-submit\"") && en.contains("30 days"));
        assertEquals("방침의 30일 = 서버", 30L * 24 * 3600_000L, CourseSubmitServlet.KEEP_MS);
        // 2026-11-02 홍TV님 "GPX 편집을 누구나": 보내기 창은 course-kit 의 RF.submitSheet 하나(따라가기 · GPX 편집이 같이 씀)
        String kit = Files.readString(Path.of("src/main/webapp/js/course-kit.js"), StandardCharsets.UTF_8);
        assertTrue("시각을 빼고 보냄", kit.contains("trackGpx(name, kind, (track || []).map(function (p) { return [p[0], p[1], null, p[3]]; }))"));
        String studio = Files.readString(Path.of("src/main/webapp/js/studio.js"), StandardCharsets.UTF_8);
        assertTrue("관리자가 아니어도 편집기를 띄움(코스 모음으로 돌려보내지 않음)", !studio.contains("location.replace(") && !studio.contains("관리자 기기에서만"));
        String page = Files.readString(Path.of("src/main/webapp/studio.html"), StandardCharsets.UTF_8);
        assertTrue("검색에 안 나오게", page.contains("<meta name=\"robots\" content=\"noindex\">") && !page.contains("관리자 기기인지"));
        assertFalse("사이트맵에 없음", Files.readString(Path.of("src/main/java/com/gh/routefly/web/SitemapServlet.java"), StandardCharsets.UTF_8).contains("studio"));
    }

    private static int call(CourseSubmitServlet s, String method, String path, String id, String ct, String body) throws Exception {
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(CourseSubmitTest.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (p, m, a) -> switch (m.getName()) {
                    case "getContentType" -> ct;
                    case "getPathInfo" -> path;
                    case "getParameter" -> "id".equals(a[0]) ? id : null;
                    case "getRemoteAddr" -> "203.0.113.9";
                    case "getReader" -> new BufferedReader(new StringReader(body));
                    case "getMethod" -> method;
                    default -> null;
                });
        Map<String, Object> out = new HashMap<>();
        out.put("status", 200);
        PrintWriter pw = new PrintWriter(new StringWriter(), true);
        HttpServletResponse resp = (HttpServletResponse) Proxy.newProxyInstance(CourseSubmitTest.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (p, m, a) -> {
                    if ("setStatus".equals(m.getName())) out.put("status", a[0]);
                    if ("getWriter".equals(m.getName())) return pw;
                    return null;
                });
        if ("GET".equals(method)) s.doGet(req, resp); else s.doPost(req, resp);
        return (Integer) out.get("status");
    }
}
