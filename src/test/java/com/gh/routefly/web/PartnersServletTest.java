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
                "partner.coupang.headlamp", "https://link.coupang.com/a/test1",
                "partner.coupang.stick", "https://evil.example/a",
                "partner.coupang.crampon", "https://coupa.ng/x\"><script>",
                "partner.agoda.url", "https://www.agoda.com/partners/partnersearch.aspx?cid=1&lat={lat}",
                "donate.url", "https://toss.me/test");
        JsonObject o = PartnersServlet.body(c::get);
        assertEquals("https://link.coupang.com/a/test1", o.getAsJsonObject("coupang").get("headlamp").getAsString());
        assertFalse("다른 곳 주소는 뺌", o.getAsJsonObject("coupang").has("stick"));
        assertFalse("따옴표 · 꺾쇠가 든 주소는 뺌", o.getAsJsonObject("coupang").has("crampon"));
        assertTrue(o.get("agoda").getAsString().startsWith("https://www.agoda.com/"));
        assertEquals("https://toss.me/test", o.get("donate").getAsString());
    }

    @Test
    public void emptyConfigGivesNothing() {
        JsonObject o = PartnersServlet.body(k -> null);
        assertEquals(0, o.getAsJsonObject("coupang").size());
        assertFalse(o.has("agoda") || o.has("donate"));
        assertFalse(PartnersServlet.allowed("http://toss.me/a", "https://"));
        assertFalse(PartnersServlet.allowed("https://", "https://"));
    }
}
