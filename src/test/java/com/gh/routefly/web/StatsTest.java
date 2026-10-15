package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.TreeMap;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 운영 통계(2026-10-15) - 셀 화면 · 로봇 · 열쇠 · 보기 화면. */
public class StatsTest {

    @Test
    public void pageKeys() {
        assertEquals("/m/가야산", Stats.pageKey("/m/%EA%B0%80%EC%95%BC%EC%82%B0"));
        assertEquals("/m/", Stats.pageKey("/m/"));
        assertEquals("/index.html", Stats.pageKey("/"));
        assertEquals("/hike.html", Stats.pageKey("/hike.html"));
        assertEquals("/s/", Stats.pageKey("/s/knps-7013"));
        assertNull(Stats.pageKey("/api/courses"));
        assertNull(Stats.pageKey("/js/app.js"));
        assertNull("긴 이름(꾸민 주소)은 안 셈", Stats.pageKey("/m/" + "가".repeat(50)));
    }

    @Test
    public void bots() {
        assertTrue(Stats.isBot("Mozilla/5.0 (compatible; Googlebot/2.1)"));
        assertTrue(Stats.isBot("facebookexternalhit/1.1"));
        assertTrue(Stats.isBot("Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"));
        assertTrue(Stats.isBot(null));
        assertFalse(Stats.isBot("Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"));
    }

    @Test
    public void keyAndPage() {
        assertFalse("설정이 없으면 닫힘", StatsServlet.allowed(null, "x"));
        assertFalse("짧은 열쇠는 안 받음", StatsServlet.allowed("short", "short"));
        assertTrue(StatsServlet.allowed("abcdefghijkl", "abcdefghijkl"));
        assertFalse(StatsServlet.allowed("abcdefghijkl", "abcdefghijkx"));
        TreeMap<String, JsonObject> days = new TreeMap<>();
        days.put("2026-10-14", JsonParser.parseString("{\"pages\":{\"/m/가야산\":3,\"/hike.html\":5},\"uniq\":4,\"bots\":2}").getAsJsonObject());
        days.put("2026-10-15", JsonParser.parseString("{\"pages\":{\"/m/가야산\":2,\"/m/<b>\":1},\"uniq\":2,\"bots\":0}").getAsJsonObject());
        String h = StatsServlet.page(days, 30);
        assertTrue(h.contains("방문자(하루마다 센 수의 합) 6 · 화면 11"));
        assertTrue("인기 산 합", h.contains("<td>가야산</td><td>5</td>"));
        assertTrue("이름은 이스케이프", h.contains("&lt;b&gt;") && !h.contains("<td><b></td>"));
    }
}
