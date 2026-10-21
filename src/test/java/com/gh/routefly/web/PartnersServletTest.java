package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.Map;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 제휴 · 후원 링크(2026-10-15). 링크 값은 테스트 데이터. */
public class PartnersServletTest {

    @Test
    public void onlyAllowedLinks() {
        Map<String, String> c = Map.of(
                "partner.coupang.headlamp", "https://link.coupang.com/a/test1, https://evil.example/x,https://coupa.ng/b,https://coupa.ng/c,https://coupa.ng/d",
                "partner.coupang.glove", "https://link.coupang.com/a/g",
                "partner.coupang.stick", "https://evil.example/a",
                "partner.coupang.crampon", "https://coupa.ng/x\"><script>",
                "partner.agoda.url", "https://www.agoda.com/partners/partnersearch.aspx?cid=1&lat={lat}",
                "partner.trip.url", "https://kr.trip.com/hotels/list?Allianceid=1&lat={lat}",
                "donate.url", "https://toss.me/test",
                "donate.en.url", "https://www.paypal.com/ncp/payment/TEST");
        JsonObject o = PartnersServlet.body(c::get);
        assertEquals("쉼표로 여러 개 - 다른 곳은 빼고 3개까지", "[\"https://link.coupang.com/a/test1\",\"https://coupa.ng/b\",\"https://coupa.ng/c\"]",
                o.getAsJsonObject("coupang").get("headlamp").toString());
        assertEquals("[\"https://link.coupang.com/a/g\"]", o.getAsJsonObject("coupang").get("glove").toString());
        assertFalse("다른 곳 주소는 뺌", o.getAsJsonObject("coupang").has("stick"));
        assertFalse("따옴표 · 꺾쇠가 든 주소는 뺌", o.getAsJsonObject("coupang").has("crampon"));
        assertTrue(o.get("agoda").getAsString().startsWith("https://www.agoda.com/"));
        assertTrue(o.get("trip").getAsString().startsWith("https://kr.trip.com/"));
        assertFalse("트립닷컴 흉내 주소는 뺌", PartnersServlet.body(Map.of("partner.trip.url", "https://www.trip.com.evil.example/x")::get).has("trip"));
        assertEquals("https://toss.me/test", o.get("donate").getAsString());
        assertEquals("https://www.paypal.com/ncp/payment/TEST", o.get("donateEn").getAsString());
        assertFalse("영어 후원은 PayPal · Ko-fi 만", PartnersServlet.body(Map.of("donate.en.url", "https://toss.me/x")::get).has("donateEn"));
    }

    @Test
    public void emptyConfigGivesNothing() {
        JsonObject o = PartnersServlet.body(k -> null);
        assertEquals(0, o.getAsJsonObject("coupang").size());
        assertFalse(o.has("agoda") || o.has("trip") || o.has("donate") || o.has("donateEn"));
        assertFalse(PartnersServlet.allowed("http://toss.me/a", "https://"));
        assertFalse(PartnersServlet.allowed("https://", "https://"));
    }
}
