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
        JsonObject biz = PartnersServlet.body(java.util.Map.of("biz.name", "시험상호", "biz.phone", "<b>010-0000-0000")::get).getAsJsonObject("biz");
        assertEquals("시험상호", biz.get("name").getAsString());
        assertEquals("꺾쇠는 뺌", "b010-0000-0000", biz.get("phone").getAsString());
        assertFalse("없으면 안 보냄", biz.has("address"));
        assertFalse("영어 후원은 PayPal · Ko-fi 만", PartnersServlet.body(Map.of("donate.en.url", "https://toss.me/x")::get).has("donateEn"));
    }

    @Test
    public void emptyConfigGivesNothing() {
        JsonObject o = PartnersServlet.body(k -> null);
        assertEquals(0, o.getAsJsonObject("coupang").size());
        assertFalse(o.has("agoda") || o.has("trip") || o.has("donate") || o.has("donateEn"));
        assertFalse(PartnersServlet.allowed("http://toss.me/a", "https://"));
        assertFalse(PartnersServlet.allowed("https://", "https://"));
        // 2026-10-28: 트립닷컴 검색 결과 링크는 500자를 넘음 - 2000자까지, 까닭은 why 로
        String longTrip = "https://kr.trip.com/hotels/list?" + "a=1&".repeat(200);
        assertTrue(longTrip.length() > 500 && PartnersServlet.allowed(longTrip, "https://kr.trip.com/"));
        assertTrue(PartnersServlet.why("https://kr.trip.com/x " , "https://kr.trip.com/").startsWith("빈칸"));
        assertTrue(PartnersServlet.why("https://kr.trip.com", "https://kr.trip.com/").startsWith("주소 시작"));
        assertTrue(PartnersServlet.why("https://kr.trip.com/" + "x".repeat(2000), "https://kr.trip.com/").startsWith("길이"));
        // 트립닷컴 · 아고다는 주소 이름으로(2026-10-28 - "https://kr.trip.com?Allianceid=…" 처럼 / 없이 ? 가 붙은 링크가 걸러졌음)
        assertNull(PartnersServlet.whyHost("https://kr.trip.com?Allianceid=1&SID=2", "trip.com"));
        assertNull(PartnersServlet.whyHost("https://trip.com/t/abc", "trip.com"));
        assertNull(PartnersServlet.whyHost("https://www.agoda.com/partners/x?cid=1", "agoda.com"));
        assertTrue(PartnersServlet.whyHost("http://kr.trip.com/x", "trip.com").startsWith("https"));
        assertTrue(PartnersServlet.whyHost("https://kr.trip.com.evil.kr/x", "trip.com").startsWith("주소 이름"));
        assertTrue(PartnersServlet.whyHost("https://eviltrip.com/x", "trip.com").startsWith("주소 이름"));
        assertNotNull(PartnersServlet.whyHost("https://trip.com@evil.kr/x", "trip.com"));
    }
}
