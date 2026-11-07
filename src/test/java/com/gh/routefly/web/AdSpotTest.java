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
        assertTrue(sm.contains("<loc>https://r.kr/tools.html</loc>"));
        // 2026-11-07 애드센스 "가치가 별로 없는 콘텐츠": 스크립트로만 내용이 생기는 게임 · 안부 · 도장과 넘기기만 하는 첫 주소는 사이트맵에서 빼고 noindex
        for (String p : new String[] {"/games.html", "/anbu.html", "/series.html", "/"}) assertFalse(p, sm.contains("<loc>https://r.kr" + p + "</loc>"));
        try {
            String root = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp/root.html")), java.nio.charset.StandardCharsets.UTF_8);
            String body = root.substring(root.indexOf("<body>")).replaceAll("(?s)<!--.*?-->", "").replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
            assertTrue("첫 주소는 스크립트 없이도 소개 글 · 링크가 보임: " + body.length(), body.length() > 400 && root.contains("<a href=\"m/\">코스 모음</a>"));
        } catch (java.io.IOException e) {
            throw new AssertionError(e);
        }
        for (String p : new String[] {"games.html", "anbu.html", "series.html"}) {
            try {
                assertTrue(p, new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp", p)), java.nio.charset.StandardCharsets.UTF_8).contains("<meta name=\"robots\" content=\"noindex, follow\">"));
            } catch (java.io.IOException e) {
                throw new AssertionError(e);
            }
        }
    }
}
