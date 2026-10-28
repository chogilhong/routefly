package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 구글 애드센스 광고 칸(2026-10-28 홍TV님 "만들어") - 설정 꼴이 맞을 때만, 산 · 코스 페이지에만 광고 스크립트 허용, 안전 화면은 그대로. */
public class AdsTest {

    @Test
    public void boxOnlyWithValidIds() {
        assertEquals("", Ads.box(null, null));
        assertEquals("", Ads.box("ca-pub-123", "1234567890"));   // 짧음
        assertEquals("", Ads.box("ca-pub-1234567890123456", "12a"));
        assertEquals("", Ads.box("ca-pub-1234567890123456\"><script>", "1234567890"));
        String h = Ads.box("ca-pub-1234567890123456", "1234567890");
        assertTrue(h.contains("class=\"adsbygoogle\"") && h.contains("data-ad-slot=\"1234567890\"") && h.contains(">광고<"));
        assertFalse("화면 안 스크립트 없음(우리 파일 ads.js 만)", h.replace("<script src=\"../js/ads.js\" defer></script>", "").contains("<script"));
    }

    @Test
    public void cspAllowsAdsOnlyOnContentPages() {
        assertTrue(SecurityFilter.cspFor("/m/설악산").contains("pagead2.googlesyndication.com"));
        assertTrue(SecurityFilter.cspFor("/c/knps-1").contains("pagead2.googlesyndication.com"));
        assertTrue(SecurityFilter.cspFor("/en/m/seoraksan").contains("googlesyndication"));
        for (String safe : new String[] {"/hike.html", "/party.html", "/party-office.html", "/index.html", "/api/party/view"})
            assertFalse(safe, SecurityFilter.cspFor(safe).contains("googlesyndication"));
        assertTrue("화면 안 스크립트는 그대로 막음", SecurityFilter.cspFor("/m/x").contains("script-src 'self' https:") && !SecurityFilter.cspFor("/m/x").contains("unsafe-inline' https://pagead"));
    }
}
