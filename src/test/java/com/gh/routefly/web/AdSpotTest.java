package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;
import java.util.Map;

import org.junit.Test;

/** 2026-11-01 홍TV님: 도구 · 도장 화면 광고 칸(api/ad), 사이트맵에 도구 · 게임 · 안부. */
public class AdSpotTest {

    @Test
    public void spotUsesOwnSlotOrMountainSlot() {
        Map<String, String> cfg = Map.of("adsense.client", "ca-pub-0000000000000000", "adsense.slot.m", "1111111111", "adsense.slot.tools", "2222222222");
        assertEquals("2222222222", Ads.spot("tools", cfg::get).get("slot").getAsString());
        assertEquals("산 페이지 칸을 같이 씀", "1111111111", Ads.spot("series", cfg::get).get("slot").getAsString());
        assertTrue("모르는 자리", Ads.spot("hike", cfg::get).entrySet().isEmpty());
        assertTrue("설정 없음", Ads.spot("tools", k -> null).entrySet().isEmpty());
        assertTrue("꼴이 틀림", Ads.spot("tools", Map.of("adsense.client", "x", "adsense.slot.m", "1111111111")::get).entrySet().isEmpty());
    }

    @Test
    public void cspAllowsAdsOnToolsAndSeries() {
        assertTrue(SecurityFilter.cspFor("/series.html").contains("pagead2.googlesyndication.com"));
        String tools = SecurityFilter.cspFor("/tools.html");
        assertTrue(tools.contains("daumcdn.net") && tools.contains("pagead2.googlesyndication.com"));
        assertFalse("따라가기 화면에는 광고 곳 없음", SecurityFilter.cspFor("/hike.html").contains("googlesyndication"));
    }

    @Test
    public void sitemapHasToolsGamesAnbu() {
        String sm = SitemapServlet.sitemap("https://r.kr", List.of(), List.of());
        for (String p : new String[] {"/tools.html", "/games.html", "/anbu.html"}) assertTrue(p, sm.contains("<loc>https://r.kr" + p + "</loc>"));
    }
}
