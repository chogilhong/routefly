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
        assertTrue("모르는 자리", Ads.spot("hike", cfg::get).entrySet().isEmpty());   // 따라가기 목록 양옆은 "side"
        assertTrue("설정 없음", Ads.spot("tools", k -> null).entrySet().isEmpty());
        assertTrue("꼴이 틀림", Ads.spot("tools", Map.of("adsense.client", "x", "adsense.slot.m", "1111111111")::get).entrySet().isEmpty());
    }

    @Test
    public void cspAllowsAdsOnToolsAndSeries() {
        assertTrue(SecurityFilter.cspFor("/series.html").contains("pagead2.googlesyndication.com"));
        String tools = SecurityFilter.cspFor("/tools.html");
        assertTrue(tools.contains("kakaocdn.net") && tools.contains("pagead2.googlesyndication.com"));
        assertEquals("산악회 방은 PC 양옆 광고에 좁은 곳만(2026-11-24 홍TV님)", SecurityFilter.CSP_ADS_HIKE, SecurityFilter.cspFor("/party.html"));   // 따라가기와 같게(AdsTest)
    }

    @Test
    public void sitemapHasToolsGamesAnbu() {
        String sm = SitemapServlet.sitemap("https://r.kr", List.of(), java.util.List.of(), List.of());
        assertTrue(sm.contains("<loc>https://r.kr/tools.html</loc>"));
        // 2026-11-18 홍TV님 "새로 만든 것도 넣었어?" - tidefly · dronefly 는 사이트맵에 넣고 noindex 없음
        for (String p : new String[] {"tidefly.html", "dronefly.html", "series.html", "games.html", "anbu.html"}) {   // 도장 · 게임 · 안부도 2026-11-18 "넣어줘"
            assertTrue(p, sm.contains("<loc>https://r.kr/" + p + "</loc>"));
            try {
                assertFalse(p, new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp", p)), java.nio.charset.StandardCharsets.UTF_8).contains("noindex"));
            } catch (java.io.IOException e) {
                throw new AssertionError(e);
            }
        }
        // 2026-11-07 애드센스 "가치가 별로 없는 콘텐츠": 스크립트로만 내용이 생기는 게임 · 안부 · 도장과 넘기기만 하는 첫 주소는 사이트맵에서 빼고 noindex
        // 2026-11-18 도장 · 게임 · 안부는 다시 넣음(위), 첫 주소는 nginx 가 m/ 로 넘기므로 계속 뺌
        assertFalse(sm.contains("<loc>https://r.kr/</loc>"));
        try {
            String root = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp/root.html")), java.nio.charset.StandardCharsets.UTF_8);
            String body = root.substring(root.indexOf("<body>")).replaceAll("(?s)<!--.*?-->", "").replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
            assertTrue("첫 주소는 스크립트 없이도 소개 글 · 링크가 보임: " + body.length(), body.length() > 400 && root.contains("<a href=\"m/\">코스 모음</a>"));
        } catch (java.io.IOException e) {
            throw new AssertionError(e);
        }
    }
}
