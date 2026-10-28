package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산 페이지 날씨 한 번에(api/wx, 2026-10-28) - 셋을 함께, 하나가 실패해도 나머지는 줌, 하나라도 못 받으면 담아 두지 않음. */
public class WxServletTest {

    private static JsonObject j(String s) { return JsonParser.parseString(s).getAsJsonObject(); }

    @Test
    public void combinesThree() {
        JsonObject o = WxServlet.all(() -> j("{\"hours\":[1]}"), () -> j("{\"days\":{}}"), () -> j("{\"pm10\":30}"));
        assertEquals(30, o.getAsJsonObject("air").get("pm10").getAsInt());
        assertTrue(o.getAsJsonObject("mid").has("days"));
        assertFalse("다 받음 - 담아 둠", WxServlet.partial(o));
    }

    @Test
    public void oneFailsOthersStay() {
        JsonObject o = WxServlet.all(() -> j("{\"hours\":[1]}"), () -> { throw new IllegalStateException("x"); }, () -> j("{\"unavailable\":true}"));
        assertTrue(o.getAsJsonObject("weather").has("hours"));
        assertTrue("실패는 unavailable", o.getAsJsonObject("mid").has("unavailable"));
        assertTrue("못 받은 것이 있으면 담아 두지 않음", WxServlet.partial(o));
    }
}
