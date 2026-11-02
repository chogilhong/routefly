package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 점검 6차(2026-11-02 홍TV님) - 속도: 사무실 끝난 산행 표시(베끼지 않고) · 안전 정보 같은 열쇠는 한 번만 묻기 ·
 * 화면 js 조각(지형 음영 한도 · 첫 위성 타일 · 산악회 방 GPS · 숫자 칸 · 높이 타일 64장 · QR 늦게 받기 - review6.test.js).
 */
public class ReviewRound6Test {

    /** 화면 조각은 node 로(없으면 건너뜀). */
    @Test
    public void screenPieces() throws Exception {
        ReviewRound5Test.node("src/test/js/review6.test.js");
    }

    @Test
    public void officeEndedSigWithoutCopy() {
        PartyOffice po = new PartyOffice(null);
        PartyOffice.Office o = po.create("시험산악회", "AAAAAA", 0);
        long now = PartyOffice.KEEP_MS + 10_000L;
        assertEquals("없으면 0:0", "0:0", po.endedSig(o, now));
        for (long at : new long[] {1_000L, 5_000L, PartyOffice.KEEP_MS + 2_000L, PartyOffice.KEEP_MS + 9_000L}) {
            JsonObject x = new JsonObject();
            x.addProperty("endedAt", at);
            po.ended("AAAAAA", x, at);
        }
        // ended 가 기한 지난 것(1000 · 5000)은 넣을 때 지움 - 남은 둘, 가장 새 것 먼저
        com.google.gson.JsonArray e = po.endedOf(o, now);
        assertEquals("endedOf 로 만들던 표시와 같음", e.size() + ":" + e.get(0).getAsJsonObject().get("endedAt").getAsLong(), po.endedSig(o, now));
        assertEquals("2:" + (PartyOffice.KEEP_MS + 9_000L), po.endedSig(o, now));
        assertEquals("기한이 지나면 빠짐", "1:" + (PartyOffice.KEEP_MS + 9_000L), po.endedSig(o, PartyOffice.KEEP_MS + 2_000L + PartyOffice.KEEP_MS + 1));
    }

    @Test
    public void safetySingleFlight() throws Exception {
        OpenApi.Cache<Object> cache = new OpenApi.Cache<>(10, 60_000L);
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch inside = new CountDownLatch(1), go = new CountDownLatch(1);
        SafetyServlet.Fetch slow = () -> {
            calls.incrementAndGet();
            inside.countDown();
            try { go.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            return "답";
        };
        String key = "test-flight-" + System.nanoTime();
        Object[] got = new Object[4];
        Thread[] ts = new Thread[4];
        ts[0] = new Thread(() -> got[0] = SafetyServlet.cached(key, cache, slow));
        ts[0].start();
        assertTrue(inside.await(5, java.util.concurrent.TimeUnit.SECONDS));
        for (int i = 1; i < 4; i++) { int k = i; ts[i] = new Thread(() -> got[k] = SafetyServlet.cached(key, cache, slow)); ts[i].start(); }
        Thread.sleep(200);   // 뒤 셋이 기다리기 시작
        go.countDown();
        for (Thread t : ts) t.join(5000);
        assertEquals("같은 열쇠는 한 번만 물음", 1, calls.get());
        assertArrayEquals(new Object[] {"답", "답", "답", "답"}, got);
        assertEquals("다음은 기억에서", "답", SafetyServlet.cached(key, cache, () -> { calls.incrementAndGet(); return "x"; }));
        assertEquals(1, calls.get());
    }
}
