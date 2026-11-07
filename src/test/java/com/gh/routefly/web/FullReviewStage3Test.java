package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.Test;

/** 2026-11-07 홍TV님 전체 점검 3단계(속도 · API 호출 줄이기). */
public class FullReviewStage3Test {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    @Test
    public void flightAsksOnce() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1);
        String key = "test|" + System.nanoTime();
        String[] got = new String[4];
        Thread[] ts = new Thread[4];
        ts[0] = new Thread(() -> got[0] = Flight.once(key, () -> {
            calls.incrementAndGet();
            started.countDown();
            try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            return "답";
        }));
        ts[0].start();
        started.await();
        for (int i = 1; i < 4; i++) {
            int k = i;
            ts[i] = new Thread(() -> got[k] = Flight.once(key, () -> { calls.incrementAndGet(); return "따로"; }));
            ts[i].start();
        }
        Thread.sleep(200);   // 뒤 셋이 기다리기 시작할 때까지
        release.countDown();
        for (Thread t : ts) t.join(5000);
        assertEquals("같은 열쇠는 한 번만 물음", 1, calls.get());
        assertArrayEquals(new String[] {"답", "답", "답", "답"}, got);
        assertEquals("끝난 열쇠는 다시 물음", "새로", Flight.once(key, () -> "새로"));
    }

    @Test
    public void openApisShareFlight() throws Exception {
        String dir = "src/main/java/com/gh/routefly/web/";
        assertTrue(read(dir + "WeatherServlet.java").contains("Flight.once(\"weather|\" + key"));
        assertTrue(read(dir + "MidServlet.java").contains("Flight.once(\"mid|\" + ck"));
        assertTrue(read(dir + "AirServlet.java").contains("Flight.once(\"air|\" + station"));
        assertTrue(read(dir + "SafetyServlet.java").contains("Flight.once(\"safety|\" + key"));
        assertFalse("한 벌만", read(dir + "SafetyServlet.java").contains("CompletableFuture"));
    }

    @Test
    public void weatherRemembersNoData() throws Exception {
        String w = read("src/main/java/com/gh/routefly/web/WeatherServlet.java");
        assertTrue("자료 없음이면 10분", w.contains("else if (empty[0]) EMPTY.put(key, Boolean.TRUE, now);") && w.contains("if (EMPTY.get(key, now) != null) return unavailable();"));
        assertTrue("연결 실패가 섞이면 기억하지 않음", w.contains("empty[0] = !lost && noData(text);") && w.contains("if (t2 == null) lost = true;") && w.contains("if (t3 == null) lost = true;"));
    }

    @Test
    public void mapAsksGridCells() throws Exception {
        String app = read("src/main/webapp/js/app.js");
        assertTrue("지도 목록은 늘 고정 격자", app.contains("askBb = bb ? RF.snapOut(bb) : null;"));
        assertTrue("잘렸으면 내 주변이 아닐 때만 지금 화면 그대로 한 번 더", app.contains("if (j.truncated && askBb && !list.near && seq === list.seq"));
    }
}
