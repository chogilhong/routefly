package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.Test;

/** 2026-11-01 7차 점검(서버 보안 - 산악회 확인자료 파기 되풀이 · 한도 묶음 · 물통 넘침 · 잘못된 % 주소). */
public class CheckupStage7Test {

    private static long sosLines(Party p, int id) {
        return p.memberLog.lines().stream().filter(l -> l.contains(" sos room=") && l.matches(".* member=" + id + "( .*)?")).count();
    }

    @Test
    public void leaveLoopDoesNotPurgeAgainWithoutNewLines() {
        Party p = new Party();
        String code = j(create(p, T0)).get("code").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"agree\":true}", T0).get("token").getAsString();
        Party.Member m = p.who(a, DEPART);
        assertTrue("참가 줄을 썼음", m.logged);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98,\"sos\":true}", DEPART);
        call(p, "/leave", tok(a), DEPART);
        assertFalse("철회 - 이 회원의 줄은 바로 지움", p.memberLog.lines().stream().anyMatch(l -> l.matches(".* member=" + m.id + "( .*)?")));
        assertFalse(m.logged);
        // 열쇠가 살아 있어 위치 → 그만 보내기를 되풀이 - 새 줄이 없으면 파기(파일 다시 쓰기)를 하지 않음
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98}", DEPART + 1000);
        call(p, "/leave", tok(a), DEPART + 1000);
        assertFalse("지울 줄이 없음", m.logged);
        // 새 줄(SOS)이 생기면 다시 지움
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98,\"sos\":true}", DEPART + 120_000);
        assertTrue(m.logged);
        assertEquals(1, sosLines(p, m.id));
        call(p, "/leave", tok(a), DEPART + 120_000);
        assertEquals(0, sosLines(p, m.id));
        assertFalse(m.logged);
    }

    @Test
    public void sosToggleLogsOncePerMinute() {
        Party p = new Party();
        String code = j(create(p, T0)).get("code").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"agree\":true}", T0).get("token").getAsString();
        int id = p.who(a, DEPART).id;
        String on = "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98,\"sos\":true}", off = on.replace("true", "false");
        call(p, "/loc", on, DEPART);
        call(p, "/loc", off, DEPART + 1000);
        call(p, "/loc", on, DEPART + 2000);
        call(p, "/ping", "{\"token\":\"" + a + "\",\"sos\":false}", DEPART + 3000);
        call(p, "/ping", "{\"token\":\"" + a + "\",\"sos\":true}", DEPART + 4000);
        assertEquals("1분 안 켜기 · 끄기 되풀이는 한 줄", 1, sosLines(p, id));
        assertTrue("SOS 는 그대로 켜짐", p.who(a, DEPART + 4000).sos);
        call(p, "/loc", off, DEPART + 50_000);
        call(p, "/loc", on, DEPART + 61_000);
        assertEquals("1분 지나 다시 켜면 남김", 2, sosLines(p, id));
    }

    @Test
    public void limiterOverflowKeepsOldBuckets() {
        RateLimiter r = new RateLimiter(1, 1);
        assertTrue(r.allow("1.1.1.1", 0));
        assertFalse(r.allow("1.1.1.1", 0));
        for (int i = 1; r.size() < RateLimiter.MAX_KEYS; i++) r.allow("10." + (i >> 16 & 255) + "." + (i >> 8 & 255) + "." + (i & 255), 0);
        assertTrue("넘친 새 곳은 넘침 물통 하나", r.allow("9.9.9.9", 0));
        assertFalse("넘침 물통을 같이 씀", r.allow("9.9.9.8", 0));
        assertFalse("이미 막힌 곳은 넘쳐도 풀리지 않음(예전엔 모두 비웠음)", r.allow("1.1.1.1", 0));
        assertEquals(RateLimiter.MAX_KEYS + 1, r.size());
    }

    @Test
    public void quotaLookupDoesNotInsert() {
        PartyServlet.Quota q = new PartyServlet.Quota(1, 60_000);
        assertTrue(q.take("a", 0));
        for (int i = 0; i < 10_001; i++) assertFalse(q.over("k" + i, 0));   // 보기만 - 칸이 생기면 "a" 가 밀려남
        q.give("없는곳", 0);
        assertTrue("센 것이 그대로", q.over("a", 0));
        assertFalse(q.take("a", 0));
    }

    @Test
    public void makeAndOpenQuotasGroupBy48() {
        String a = PartyServlet.missKey(RateLimiter.group("2001:db8:7:100::1")), b = PartyServlet.missKey(RateLimiter.group("2001:db8:7:1ff::1"));
        assertEquals("/56 안의 다른 /64 도 한 묶음", a, b);
        PartyServlet.Quota creates = new PartyServlet.Quota(5, 24 * 3600_000L);
        for (int i = 0; i < 5; i++) assertTrue(creates.take(PartyServlet.missKey(RateLimiter.group("2001:db8:7:1" + i + "::1")), 0));
        assertFalse(creates.take(PartyServlet.missKey(RateLimiter.group("2001:db8:7:1ff::9")), 0));
    }

    @Test
    public void xferOpenCountsBy48AndGivesBackOnFailure() throws Exception {
        XferServlet s = new XferServlet();
        // 같은 /48 의 다른 /64 에서 20번(OPENS 한도) - 21번째는 막힘
        for (int i = 0; i < 20; i++) {
            Map<String, Object> out = post(s, "2001:db8:77:" + Integer.toHexString(i) + "::1", "/open", "{\"id\":\"" + String.format("%032x", i + 77_000) + "\"}");
            assertEquals("open " + i, 200, out.get("status"));
        }
        assertEquals(429, post(s, "2001:db8:77:ff::1", "/open", "{\"id\":\"" + String.format("%032x", 77_999) + "\"}").get("status"));
        // 실패(틀린 id)는 돌려줌 - 다른 /48 에서 21번 틀려도 막히지 않음
        for (int i = 0; i < 21; i++) assertEquals(400, post(s, "2001:db8:78::1", "/open", "{\"id\":\"x\"}").get("status"));
        assertEquals(200, post(s, "2001:db8:78::1", "/open", "{\"id\":\"" + String.format("%032x", 78_000) + "\"}").get("status"));
    }

    @Test
    public void badPercentIs404() throws Exception {
        assertNull(MountainServlet.decode("%zz"));
        assertEquals("설악산", MountainServlet.decode("%EC%84%A4%EC%95%85%EC%82%B0"));
        assertNull("세지 않음", Stats.pageKey("/m/%zz"));
        assertEquals("/m/설악산", Stats.pageKey("/m/설악산"));
        Map<String, Object> og = get(new OgServlet(), "/og", "/m/%zz.png");
        assertEquals(404, og.get("status"));
        Map<String, Object> mt = get(new MountainServlet(), "/m", "/%zz");
        assertEquals(404, mt.get("status"));
    }

    @Test
    public void limitedPaths() {
        assertTrue(SecurityFilter.limited("/en/m/seoraksan"));
        assertTrue(SecurityFilter.limited("/og/m/설악산.png"));
        assertTrue(SecurityFilter.limited("/api/party/join"));
        assertTrue(SecurityFilter.limited("/m/설악산"));
        assertFalse(SecurityFilter.limited("/index.html"));
        assertFalse(SecurityFilter.limited("/js/app.js"));
    }

    // ---------------------------------------------------------------- 가짜 요청 · 응답

    private static Map<String, Object> post(XferServlet s, String ip, String path, String body) throws Exception {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ByteArrayInputStream in = new ByteArrayInputStream(b);
        ServletInputStream sis = new ServletInputStream() {
            @Override public int read() { return in.read(); }
            @Override public int read(byte[] buf, int off, int len) { return in.read(buf, off, len); }
            @Override public boolean isFinished() { return in.available() == 0; }
            @Override public boolean isReady() { return true; }
            @Override public void setReadListener(ReadListener l) { /* 없음 */ }
        };
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(CheckupStage7Test.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (p, m, a) -> switch (m.getName()) {
                    case "getContentType" -> "application/json";
                    case "getPathInfo" -> path;
                    case "getRemoteAddr" -> ip;
                    case "getInputStream" -> sis;
                    case "getMethod" -> "POST";
                    default -> null;
                });
        Map<String, Object> out = new HashMap<>();
        s.doPost(req, resp(out));
        return out;
    }

    private static Map<String, Object> get(jakarta.servlet.http.HttpServlet s, String servletPath, String pathInfo) throws Exception {
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(CheckupStage7Test.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (p, m, a) -> switch (m.getName()) {
                    case "getServletPath" -> servletPath;
                    case "getPathInfo" -> pathInfo;
                    case "getContextPath" -> "";
                    case "getScheme" -> "http";
                    case "getServerName" -> "localhost";
                    case "getServerPort" -> 80;
                    case "getMethod" -> "GET";
                    default -> null;
                });
        Map<String, Object> out = new HashMap<>();
        if (s instanceof OgServlet o) o.doGet(req, resp(out));
        else if (s instanceof MountainServlet mt) mt.doGet(req, resp(out));
        return out;
    }

    private static HttpServletResponse resp(Map<String, Object> out) {
        StringWriter body = new StringWriter();
        PrintWriter pw = new PrintWriter(body, true);
        out.put("status", 200);
        return (HttpServletResponse) Proxy.newProxyInstance(CheckupStage7Test.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (p, m, a) -> {
                    switch (m.getName()) {
                        case "setStatus", "sendError" -> out.put("status", a[0]);
                        case "getWriter" -> { return pw; }
                        case "getStatus" -> { return out.get("status"); }
                        default -> { /* 없음 */ }
                    }
                    return null;
                });
    }
}
