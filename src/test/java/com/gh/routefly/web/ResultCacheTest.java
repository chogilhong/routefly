package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 2026-10-11 속도: 목록 응답 서버 캐시(ResultCache) · 목록 칸 줄이기 · 경로 점 소수 5자리. */
public class ResultCacheTest {

    private final AtomicLong now = new AtomicLong(1_000);
    private final AtomicReference<String> ver = new AtomicReference<>("v1");

    private ResultCache cache(int max, long maxChars) {
        return new ResultCache(max, maxChars, 10_000, ver::get, now::get);
    }

    @Test
    public void keySeparatesNullAndValues() {
        assertEquals(ResultCache.key("courses", new double[] {126.5, 37.0, 127.0, 38.0}, "hike", null),
                ResultCache.key("courses", new double[] {126.5, 37.0, 127.0, 38.0}, "hike", null));
        assertNotEquals(ResultCache.key("courses", null, "null"), ResultCache.key("courses", null, null));
        assertNotEquals(ResultCache.key("park", "지리산", null), ResultCache.key("park", "지리산", "knps-1"));
        assertNotEquals(ResultCache.key("courses", new double[] {1, 2, 3, 4}), ResultCache.key("courses", new double[] {1, 2, 3, 5}));
    }

    @Test
    public void hitAndTtl() {
        ResultCache c = cache(10, 1_000_000);
        String v = c.version();
        assertNull("처음엔 없음", c.get("a", v));
        c.put("a", v, "{\"x\":1}", Json.etag("{\"x\":1}"));
        assertEquals("{\"x\":1}", c.get("a", v).body());
        assertEquals(Json.etag("{\"x\":1}"), c.get("a", v).tag());
        now.addAndGet(9_999);
        assertNotNull(c.get("a", v));
        now.addAndGet(1);
        assertNull("10초(TTL) 지나면 다시 읽음", c.get("a", v));
    }

    @Test
    public void versionChangeDropsAll() {
        ResultCache c = cache(10, 1_000_000);
        c.get("a", "v1");
        c.put("a", "v1", "A", "ta");
        c.put("b", "v1", "B", "tb");
        assertNotNull(c.get("a", "v1"));
        assertNull("배치가 자료를 바꿈", c.get("a", "v2"));
        assertNull(c.get("b", "v2"));
        c.put("a", "v1", "old", "t");
        assertNull("옛 회차로 읽은 응답은 담지 않음", c.get("a", "v2"));
        assertNull("회차를 모르면(DB 실패) 캐시 없이", c.get("a", null));
        c.put("a", null, "X", "t");
        assertNull(c.get("a", "v2"));
    }

    @Test
    public void boundedByCountAndChars() {
        ResultCache c = cache(3, 1_000);
        c.get("-", "v1");
        c.put("a", "v1", "A", "t");
        c.put("b", "v1", "B", "t");
        c.put("c", "v1", "C", "t");
        assertNotNull(c.get("a", "v1"));   // a 를 최근에 씀 - 밀려나는 것은 b
        c.put("d", "v1", "D", "t");
        assertNull(c.get("b", "v1"));
        assertNotNull(c.get("a", "v1"));
        assertNotNull(c.get("c", "v1"));
        assertNotNull(c.get("d", "v1"));

        ResultCache s = cache(100, 800);
        s.get("-", "v1");
        s.put("big", "v1", "x".repeat(101), "t");
        assertNull("한 응답이 한도의 1/8 을 넘으면 담지 않음", s.get("big", "v1"));
        for (int i = 0; i < 9; i++) s.put("k" + i, "v1", "y".repeat(100), "t");
        assertNull("글자 합이 넘으면 오래된 것부터", s.get("k0", "v1"));
        assertNotNull(s.get("k8", "v1"));
        assertNotNull(s.get("k1", "v1"));
    }

    /** 캐시에서 보낸 응답도 Json.ok 와 같은 본문 · ETag · Cache-Control, 같은 ETag 로 물으면 304. */
    @Test
    public void hitGoesThroughJsonPath() throws Exception {
        ResultCache c = cache(10, 1_000_000);
        JsonObject body = new JsonObject();
        body.addProperty("success", true);
        body.addProperty("n", 3);
        String v = c.version();
        Map<String, String> h1 = new HashMap<>();
        StringWriter w1 = new StringWriter();
        assertFalse(c.send(req(null), resp(h1, w1), "k", v));
        c.ok(req(null), resp(h1, w1), "k", v, body);

        Map<String, String> h2 = new HashMap<>();
        StringWriter w2 = new StringWriter();
        assertTrue(c.send(req(null), resp(h2, w2), "k", v));
        assertEquals(body.toString(), w2.toString());
        assertEquals(w1.toString(), w2.toString());
        assertEquals(Json.etag(body.toString()), h2.get("ETag"));
        assertEquals(h1.get("ETag"), h2.get("ETag"));
        assertEquals("public, max-age=300", h2.get("Cache-Control"));
        assertEquals("200", h2.get("status"));

        Map<String, String> h3 = new HashMap<>();
        StringWriter w3 = new StringWriter();
        assertTrue(c.send(req(h2.get("ETag")), resp(h3, w3), "k", v));
        assertEquals("304", h3.get("status"));
        assertEquals("", w3.toString());
    }

    @Test
    public void listRowsOnlyFieldsScreensRead() {
        for (String f : new String[] {"course_id", "name", "kind", "distance_m", "ascent_m", "ele_max_m", "start_lat", "start_lon", "end_lat", "end_lon"}) {
            assertTrue(f, CourseQueries.LIST_COLUMNS.contains(f));
        }
        for (String f : new String[] {"descent_m", "ele_min_m", "ele_source", "point_cnt", "min_lat", "max_lon"}) {
            assertFalse(f + " 는 목록 화면이 읽지 않음", CourseQueries.LIST_COLUMNS.contains(f));
            assertTrue(f + " 는 코스 하나에 그대로", CourseQueries.COURSE_COLUMNS.contains(f));
        }
        assertTrue(CourseQueries.listSql(null, null, null).sql().startsWith("SELECT " + CourseQueries.LIST_COLUMNS + " FROM"));
    }

    @Test
    public void round5() {
        assertEquals(127.69648, CourseQueries.round5(127.696481), 0);
        assertEquals(35.34826, CourseQueries.round5(35.348264), 0);
        assertEquals("[127.69648,35.3]", "[" + CourseQueries.round5(127.696480) + "," + CourseQueries.round5(35.300000) + "]");
    }

    private static HttpServletRequest req(String ifNoneMatch) {
        return (HttpServletRequest) Proxy.newProxyInstance(ResultCacheTest.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (p, m, a) -> "getHeader".equals(m.getName()) && "If-None-Match".equals(a[0]) ? ifNoneMatch : null);
    }

    private static HttpServletResponse resp(Map<String, String> headers, StringWriter body) {
        PrintWriter pw = new PrintWriter(body, true);
        return (HttpServletResponse) Proxy.newProxyInstance(ResultCacheTest.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (p, m, a) -> {
                    switch (m.getName()) {
                        case "setHeader": headers.put((String) a[0], (String) a[1]); return null;
                        case "setStatus": headers.put("status", String.valueOf(a[0])); return null;
                        case "getWriter": return pw;
                        default: return null;
                    }
                });
    }
}
