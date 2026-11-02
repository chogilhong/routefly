package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 점검 5차(2026-11-02 홍TV님 "작업해") - 보안 · 버그 · 속도 · 화면. */
public class ReviewRound5Test {

    /** 고치기 전 정규식(견줌용) - 보통 GPX 에서 새 훑기와 같은 점이 나와야 함. */
    private static final Pattern OLD = Pattern.compile("<trkpt\\b([^>]*)>(.*?)</trkpt>|<trkpt\\b([^>]*)/>", Pattern.DOTALL);
    private static final Pattern LAT = Pattern.compile("\\blat\\s*=\\s*\"(-?\\d{1,3}(?:\\.\\d+)?)\""), LON = Pattern.compile("\\blon\\s*=\\s*\"(-?\\d{1,3}(?:\\.\\d+)?)\"");
    private static final Pattern ELE = Pattern.compile("<ele>\\s*(-?\\d{1,5}(?:\\.\\d+)?)\\s*</ele>");

    private static List<double[]> old(String gpx) {
        List<double[]> out = new ArrayList<>();
        Matcher m = OLD.matcher(gpx);
        while (m.find()) {
            String attrs = m.group(1) != null ? m.group(1) : m.group(3), body = m.group(2) == null ? "" : m.group(2);
            Matcher la = LAT.matcher(attrs), lo = LON.matcher(attrs);
            if (!la.find() || !lo.find()) continue;
            Matcher e = ELE.matcher(body);
            out.add(new double[] {Double.parseDouble(la.group(1)), Double.parseDouble(lo.group(1)), e.find() ? Double.parseDouble(e.group(1)) : Double.NaN});
        }
        return out;
    }

    private static void same(String gpx) {
        List<double[]> a = old(gpx), b = CourseUploadServlet.points(gpx);
        assertEquals(gpx.length() > 200 ? gpx.substring(0, 200) : gpx, a.size(), b.size());
        for (int i = 0; i < a.size(); i++) assertArrayEquals(a.get(i), b.get(i), 0);
    }

    @Test
    public void gpxScanIsLinear() {
        StringBuilder g = new StringBuilder("<?xml version=\"1.0\"?><gpx><trk><name>x</name><trkseg>\n");
        for (int i = 0; i < 200; i++)
            g.append("  <trkpt lat=\"37.").append(5000 + i).append("\" lon=\"127.").append(1000 + i).append("\">\n    <ele>").append(100 + i)
                    .append(".5</ele>\n    <time>2026-11-02T01:02:03Z</time><extensions><hr>90</hr></extensions>\n  </trkpt>\n");
        g.append("</trkseg></trk></gpx>");
        same(g.toString());
        same("<trkpt lon=\"127.1\" lat=\"37.2\"/>");
        same("<trkpt lat=\"37.2\" lon=\"127.1\"></trkpt><trkpt lat=\"37.3\" lon=\"127.2\"><ele> -3 </ele></trkpt>");
        same("<trkptx lat=\"1\" lon=\"2\"></trkptx><trkpt lat=\"37.2\" lon=\"127.1\"><ele>5</ele></trkpt><trkpt lat=\"37.4\">x</trkpt>");
        same("<trkpt lat=\"37.2\" lon=\"127.1\">");   // 닫히지 않음 - 둘 다 0
        assertEquals("빈 태그 뒤에 닫는 태그가 없어도", 2, CourseUploadServlet.points("<trkpt lat=\"37.2\" lon=\"127.1\"><trkpt lat=\"37.3\" lon=\"127.2\"/><trkpt lat=\"37.4\" lon=\"127.3\"/>").size());

        // 2026-11-02 점검: 닫히지 않은 "<trkpt " 8만 자에 7.8초(누구나 부르는 /api/course-submit) - 3MB 도 1초 안
        String bad = "<trkpt ".repeat(CourseUploadServlet.MAX_BODY / 7);
        long t = System.nanoTime();
        assertEquals(0, CourseUploadServlet.points(bad).size());
        assertEquals(0, CourseUploadServlet.points("<trkpt lat=\"37.2\" lon=\"127.1\">" + "<ele>".repeat(CourseUploadServlet.MAX_BODY / 6)).size());
        assertEquals(0, CourseUploadServlet.points("<trkpt " + "a".repeat(CourseUploadServlet.MAX_BODY - 10)).size());
        assertTrue("느림 " + (System.nanoTime() - t) / 1_000_000 + "ms", System.nanoTime() - t < 1_000_000_000L);
        assertEquals("너무 큰 글은 읽지 않음", 0, CourseUploadServlet.points(g + " ".repeat(CourseUploadServlet.MAX_BODY)).size());
    }

    @Test
    public void meCodeIsLong() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String lead = room.get("token").getAsString();
        String c = call(p, "/mecode", tok(lead), T0).get("code").getAsString();
        assertEquals("주 인솔자 내 폰 코드도 보조 인솔자 코드처럼 10글자", Party.LEAD_CODE_LEN, c.length());
        assertTrue("이 코드로 들어오면 주 인솔자", call(p, "/info", "{\"code\":\"" + c + "\"}", T0 + 1000).get("meInvite").getAsBoolean());
    }

    @Test
    public void battKeptWhenMissing() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"onBus\":true,\"agree\":true}", T0).get("token").getAsString();
        departAll(p, lead, DEPART);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.12,\"lon\":128.46,\"batt\":55}", DEPART + H);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.121,\"lon\":128.461}", DEPART + H + 60_000);
        assertEquals("배터리를 못 읽은 한 번에 지워지지 않음", 55, member(call(p, "/view", tok(lead), DEPART + H + 61_000), "철수").get("batt").getAsInt());
    }

    private static int see(String key, Cookie[] cookies, String ip, Map<String, List<String>> headers) throws Exception {
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(ReviewRound5Test.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (pr, m, a) -> switch (m.getName()) {
                    case "getParameter" -> "key".equals(a[0]) ? key : null;
                    case "getCookies" -> cookies;
                    case "getRemoteAddr" -> ip;
                    case "getContextPath" -> "/routefly";
                    case "isSecure" -> false;
                    default -> null;
                });
        int[] st = {200};
        HttpServletResponse resp = (HttpServletResponse) Proxy.newProxyInstance(ReviewRound5Test.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (pr, m, a) -> {
                    if ("sendError".equals(m.getName())) st[0] = (Integer) a[0];
                    if ("addHeader".equals(m.getName())) headers.computeIfAbsent((String) a[0], k -> new ArrayList<>()).add((String) a[1]);
                    if ("getWriter".equals(m.getName())) return new PrintWriter(new StringWriter());
                    return null;
                });
        return StatsServlet.seeOk(req, resp) ? 200 : st[0];
    }

    @Test
    public void statsKeyMissesAndCookie() throws Exception {
        String key = "test-key-0123456789";
        RouteflyConfig.get("stats.key");   // 설정을 한 번 읽힌 뒤 그 표에 시험 열쇠만 넣었다 뺌
        java.lang.reflect.Field f = RouteflyConfig.class.getDeclaredField("props");
        f.setAccessible(true);
        java.util.Properties props = (java.util.Properties) f.get(null);
        Object before = props.setProperty("stats.key", key);
        try {
            Map<String, List<String>> h = new HashMap<>();
            Cookie good = new Cookie(StatsServlet.SEE_COOKIE, StatsServlet.seeToken(key)), wrong = new Cookie(StatsServlet.SEE_COOKIE, "x");
            assertEquals("보기 쿠키로 열림(/check/heights 도 같은 seeOk)", 200, see(null, new Cookie[] {good}, "198.51.100.7", h));
            assertEquals(200, see(key, null, "198.51.100.7", h));
            assertEquals("열쇠 없음은 404", 404, see(null, null, "198.51.100.8", h));
            for (int i = 0; i < 20; i++) assertEquals(404, see(i % 2 == 0 ? "wrong-key-" + i : null, i % 2 == 0 ? null : new Cookie[] {wrong}, "198.51.100.9", h));
            assertEquals("10분에 20번 틀리면 맞는 열쇠도 429", 429, see(key, null, "198.51.100.9", h));
            assertEquals("다른 곳은 그대로", 200, see(key, null, "198.51.100.10", h));
            for (int i = 0; i < 30; i++) see(null, null, "198.51.100.11", h);
            assertEquals("열쇠 없이 연 것은 세지 않음", 200, see(key, null, "198.51.100.11", h));

            Map<String, List<String>> cookies = new HashMap<>();
            new StatsServlet().doGet(req(key, cookies), resp(cookies));
            String all = String.join("\n", cookies.getOrDefault("Set-Cookie", List.of()));
            assertTrue(all, all.contains("rf-stats=" + StatsServlet.seeToken(key) + "; Max-Age=2592000; Path=/routefly/check; HttpOnly; SameSite=Strict"));
            assertTrue(all, all.contains("Path=/routefly/stats; HttpOnly; SameSite=Strict"));
        } finally {
            if (before == null) props.remove("stats.key"); else props.put("stats.key", before);
        }
    }

    private static HttpServletRequest req(String key, Map<String, List<String>> h) {
        return (HttpServletRequest) Proxy.newProxyInstance(ReviewRound5Test.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (pr, m, a) -> switch (m.getName()) {
                    case "getParameter" -> "key".equals(a[0]) ? key : null;
                    case "getRemoteAddr" -> "198.51.100.20";
                    case "getContextPath" -> "/routefly";
                    case "isSecure" -> false;
                    default -> null;
                });
    }

    private static HttpServletResponse resp(Map<String, List<String>> h) {
        return (HttpServletResponse) Proxy.newProxyInstance(ReviewRound5Test.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (pr, m, a) -> {
                    if ("addHeader".equals(m.getName())) h.computeIfAbsent((String) a[0], k -> new ArrayList<>()).add((String) a[1]);
                    if ("getWriter".equals(m.getName())) return new PrintWriter(new StringWriter());
                    return null;
                });
    }
}
