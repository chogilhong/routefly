package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 바깥 API 새로 묻는 횟수 상한(2026-10-30) - 주소마다 한 시간, 서버 전체 하루(한국 시각 자정에 새로). */
public class OutQuotaTest {

    @Test
    public void perIpHourAndPerDay() {
        long t = java.time.ZonedDateTime.of(2026, 10, 30, 10, 0, 0, 0, WeatherServlet.KST).toInstant().toEpochMilli();
        OutQuota q = new OutQuota("시험", 2, 5);
        assertTrue(q.allow("1.2.3.4", t));
        assertTrue(q.allow("1.2.3.4", t + 1));
        assertFalse("한 주소 한 시간 2번까지", q.allow("1.2.3.4", t + 2));
        assertTrue("다른 주소는 따로", q.allow("5.6.7.8", t + 3));
        assertTrue("다음 시간이면 다시", q.allow("1.2.3.4", t + 3_600_000L));
        assertTrue(q.allow("9.9.9.9", t + 3_600_001L));
        assertFalse("하루 5번 다 씀 - 새 주소도 막힘", q.allow("8.8.8.8", t + 3_600_002L));
        long nextDay = java.time.ZonedDateTime.of(2026, 10, 31, 0, 0, 1, 0, WeatherServlet.KST).toInstant().toEpochMilli();
        assertTrue("한국 시각 자정에 새로", q.allow("8.8.8.8", nextDay));
        assertTrue("IPv6 는 /64 로 묶음", RateLimiter.group("2001:db8:1:2:aaaa::1").equals(RateLimiter.group("2001:db8:1:2:bbbb::2")));
    }

    @Test
    public void staysWithinCopies() {
        com.google.gson.JsonArray a = com.google.gson.JsonParser.parseString("[{\"name\":\"가\",\"dist_m\":800},{\"name\":\"나\",\"dist_m\":7000},{\"name\":\"다\"}]").getAsJsonArray();
        com.google.gson.JsonArray w = StaysServlet.within(a, 5000);
        assertEquals("5km 안만, 거리 모르면 뺌", 1, w.size());
        w.get(0).getAsJsonObject().addProperty("photo", "x");
        assertFalse("원래 것은 그대로(넓혀 볼 때 다시 씀)", a.get(0).getAsJsonObject().has("photo"));
        assertEquals(2, StaysServlet.within(a, 20000).size());
        assertTrue("카카오는 20km 로 한 번", StaysServlet.kakaoUrl(38.1, 128.5, StaysServlet.PET_WIDE_M).contains("radius=20000"));
    }
}
