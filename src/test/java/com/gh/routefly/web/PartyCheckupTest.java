package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.PrintWriter;
import java.io.Reader;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 산악회 점검(2026-11-22 홍TV님 "산악회 기능 점검해") - 서버 쪽 고친 것. */
public class PartyCheckupTest {

    @Test
    public void 위치_그만둔_뒤_늦은_위치는_받지_않음() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"seat\":21,\"stop\":\"사당\",\"onBus\":true,\"agree\":true}", DEPART).get("token").getAsString();
        departAll(p, lead, DEPART);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.1192,\"lon\":128.4656}", DEPART + H);
        assertTrue("그만두기 전에는 위치", member(call(p, "/view", tok(lead), DEPART + H), "철수").has("lat"));
        call(p, "/leave", tok(a), DEPART + H + 60_000);
        // 그만둔 직후 늦게 온 위치(보내던 중 · 다시 보낸 요청) - 저장 · 표시하지 않음
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.1193,\"lon\":128.4657}", DEPART + H + 70_000);
        call(p, "/ping", "{\"token\":\"" + a + "\",\"batt\":50}", DEPART + H + 80_000);
        JsonObject m = member(call(p, "/view", tok(lead), DEPART + H + 90_000), "철수");
        assertFalse("철회 뒤 위치가 되살아나지 않음", m.has("lat"));
    }

    /**
     * 없는 방 코드를 한꺼번에 보내도 10분 20번까지만 쳐 봄(점검: over 로 보고 틀린 뒤에 세어, 동시에 보낸 50개가 모두 쳐 보기를 했음).
     * 본문 읽기에서 잠시 붙잡아 50개가 모두 들어온 뒤 풀어 줌.
     */
    @Test
    public void 방_코드_한꺼번에_쳐_보기는_20번까지() throws Exception {
        RouteflyConfig.get("party.enabled");   // 설정을 한 번 읽힌 뒤 그 표에 켜기만 넣었다 뺌(ReviewRound5Test 와 같은 방법)
        java.lang.reflect.Field f = RouteflyConfig.class.getDeclaredField("props");
        f.setAccessible(true);
        java.util.Properties props = (java.util.Properties) f.get(null);
        Object before = props.setProperty("party.enabled", "true");
        try {
            int n = 50;
            CountDownLatch gate = new CountDownLatch(1);
            AtomicInteger arrived = new AtomicInteger(), tried = new AtomicInteger(), blocked = new AtomicInteger();
            PartyServlet s = new PartyServlet();
            Thread[] th = new Thread[n];
            for (int i = 0; i < n; i++) {
                th[i] = new Thread(() -> {
                    try {
                        int st = post(s, "203.0.113.77", "{\"code\":\"ZZZZ9\"}", gate, arrived);
                        if (st == 429) blocked.incrementAndGet(); else tried.incrementAndGet();
                    } catch (Exception e) { throw new RuntimeException(e); }
                    finally { arrived.incrementAndGet(); }
                });
                th[i].start();
            }
            long end = System.currentTimeMillis() + 10_000;
            while (arrived.get() < n && System.currentTimeMillis() < end) Thread.sleep(5);   // 본문까지 온 것 + 막혀 끝난 것
            gate.countDown();
            for (Thread t : th) t.join(10_000);
            assertEquals("쳐 본 것은 20번", 20, tried.get());
            assertEquals("나머지는 429", n - 20, blocked.get());
        } finally {
            if (before == null) props.remove("party.enabled"); else props.put("party.enabled", before);
        }
    }

    private static int post(PartyServlet s, String ip, String body, CountDownLatch gate, AtomicInteger arrived) throws Exception {
        Reader r = new Reader() {
            boolean waited;
            final java.io.StringReader in = new java.io.StringReader(body);
            @Override public int read(char[] b, int off, int len) throws java.io.IOException {
                if (!waited) {
                    waited = true;
                    arrived.incrementAndGet();
                    try { gate.await(10, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                    arrived.decrementAndGet();   // finally 에서 다시 셈
                }
                return in.read(b, off, len);
            }
            @Override public void close() { /* 없음 */ }
        };
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(PartyCheckupTest.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (pr, m, a) -> switch (m.getName()) {
                    case "getContentType" -> "application/json";
                    case "getPathInfo" -> "/info";
                    case "getRemoteAddr" -> ip;
                    case "getReader" -> new BufferedReader(r);
                    case "getMethod" -> "POST";
                    default -> null;
                });
        int[] st = {200};
        HttpServletResponse resp = (HttpServletResponse) Proxy.newProxyInstance(PartyCheckupTest.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (pr, m, a) -> {
                    if ("setStatus".equals(m.getName()) || "sendError".equals(m.getName())) st[0] = (Integer) a[0];
                    if ("getWriter".equals(m.getName())) return new PrintWriter(new StringWriter());
                    return null;
                });
        s.doPost(req, resp);
        return st[0];
    }
}
