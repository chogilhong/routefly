package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 기기 사이 기록 옮기기 중계(2026-10-28 홍TV님 "qr 로 옮겨줘") - 자리 · 조각 · 한 번 가져가면 지움 · 10분 · 잘못된 값. */
public class XferServletTest {

    private static JsonObject j(String s) { return JsonParser.parseString(s).getAsJsonObject(); }

    @Test
    public void relay() {
        String id = "0123456789abcdef0123456789abcdef";
        long t = 1_760_000_000_000L;
        try { XferServlet.handle("/put", j("{\"id\":\"" + id + "\",\"i\":0,\"n\":1,\"part\":\"QUJD\"}"), t); fail("자리 없이"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        XferServlet.handle("/open", j("{\"id\":\"" + id + "\"}"), t);
        assertTrue(XferServlet.handle("/take", j("{\"id\":\"" + id + "\"}"), t).get("waiting").getAsBoolean());
        XferServlet.handle("/put", j("{\"id\":\"" + id + "\",\"i\":1,\"n\":2,\"part\":\"REVG\"}"), t);
        JsonObject w = XferServlet.handle("/take", j("{\"id\":\"" + id + "\"}"), t);
        assertEquals("1 / 2", w.get("got").getAsInt() + " / " + w.get("n").getAsInt());
        XferServlet.handle("/put", j("{\"id\":\"" + id + "\",\"i\":0,\"n\":2,\"part\":\"QUJD\"}"), t);
        assertEquals("조각을 차례대로 이음", "QUJDREVG", XferServlet.handle("/take", j("{\"id\":\"" + id + "\"}"), t).get("data").getAsString());
        try { XferServlet.handle("/take", j("{\"id\":\"" + id + "\"}"), t); fail("한 번 가져가면 지움"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        // 10분 지나면 없음
        XferServlet.handle("/open", j("{\"id\":\"" + id + "\"}"), t);
        try { XferServlet.handle("/take", j("{\"id\":\"" + id + "\"}"), t + XferServlet.TTL_MS + 1); fail("10분"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        // 잘못된 값
        try { XferServlet.handle("/open", j("{\"id\":\"../x\"}"), t); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        XferServlet.handle("/open", j("{\"id\":\"" + id + "\"}"), t);
        try { XferServlet.handle("/put", j("{\"id\":\"" + id + "\",\"i\":0,\"n\":1,\"part\":\"<script>\"}"), t); fail("base64 아님"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { XferServlet.handle("/put", j("{\"id\":\"" + id + "\",\"i\":0,\"n\":999,\"part\":\"QUJD\"}"), t); fail("조각 너무 많음"); } catch (IllegalArgumentException e) { /* 맞음 */ }
    }
}
