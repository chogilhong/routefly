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
        assertTrue("app.js getJson 이 보는 success", o.get("success").getAsBoolean());
    }

    @Test
    public void oneFailsOthersStay() {
        JsonObject o = WxServlet.all(() -> j("{\"hours\":[1]}"), () -> { throw new IllegalStateException("x"); }, () -> j("{\"unavailable\":true}"));
        assertTrue(o.getAsJsonObject("weather").has("hours"));
        assertTrue("실패는 unavailable", o.getAsJsonObject("mid").has("unavailable"));
        assertTrue("못 받은 것이 있으면 담아 두지 않음", WxServlet.partial(o));
    }

    /** 2026-11-02 홍TV님 속도 점검: 다 받은 답은 자리(약 1km)마다 5분 기억해 바로 답함(일꾼에 넘기지 않음), 못 받은 것이 있으면 기억하지 않음. */
    @Test
    public void remembersFullAnswer() {
        int[] calls = {0};
        java.util.function.Supplier<JsonObject> full = () -> { calls[0]++; return WxServlet.all(() -> j("{\"hours\":[1]}"), () -> j("{\"days\":{}}"), () -> j("{\"pm10\":30}")); };
        long t = 1_000_000L;
        WxServlet.answer(36.101, 128.101, t, full);
        WxServlet.answer(36.104, 128.099, t + 60_000L, full);
        assertEquals("같은 자리 5분 안 - 다시 묻지 않음", 1, calls[0]);
        WxServlet.answer(36.101, 128.101, t + 5 * 60_000L + 1, full);
        assertEquals("5분 지나면 다시", 2, calls[0]);
        java.util.function.Supplier<JsonObject> part = () -> { calls[0]++; return WxServlet.all(() -> j("{\"hours\":[1]}"), () -> j("{\"unavailable\":true}"), () -> j("{\"pm10\":30}")); };
        WxServlet.answer(35.501, 127.501, t, part);
        WxServlet.answer(35.501, 127.501, t + 1000, part);
        assertEquals("못 받은 것이 있으면 기억하지 않음", 4, calls[0]);
    }
}
