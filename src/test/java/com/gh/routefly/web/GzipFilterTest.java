package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.GZIPInputStream;

import org.junit.Test;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;

/** 2026-10-09 API 응답 gzip. */
public class GzipFilterTest {

    @Test
    public void acceptsGzip() {
        assertTrue(GzipFilter.acceptsGzip("gzip, deflate, br"));
        assertTrue(GzipFilter.acceptsGzip("br;q=1.0, gzip;q=0.8"));
        assertFalse(GzipFilter.acceptsGzip("gzip;q=0"));
        assertFalse(GzipFilter.acceptsGzip("identity"));
        assertFalse(GzipFilter.acceptsGzip(null));
    }

    /** 가짜 응답(보낸 바이트 · 머리글만 모음). */
    static HttpServletResponse fake(ByteArrayOutputStream sent, Map<String, String> headers) {
        ServletOutputStream out = new ServletOutputStream() {
            @Override public void write(int b) { sent.write(b); }
            @Override public boolean isReady() { return true; }
            @Override public void setWriteListener(WriteListener l) { }
        };
        return (HttpServletResponse) Proxy.newProxyInstance(GzipFilterTest.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (p, m, a) -> {
                    switch (m.getName()) {
                        case "getOutputStream": return out;
                        case "setHeader": headers.put((String) a[0], (String) a[1]); return null;
                        case "getCharacterEncoding": return "UTF-8";
                        default: return m.getReturnType() == boolean.class ? false : m.getReturnType() == int.class ? 0 : null;
                    }
                });
    }

    @Test
    public void bigJsonIsGzippedSmallIsNot() throws Exception {
        String json = "{\"points\":[" + "[127.12345,37.12345,512.3,1234],".repeat(300) + "[0,0,0,0]]}";
        ByteArrayOutputStream sent = new ByteArrayOutputStream();
        Map<String, String> h = new HashMap<>();
        GzipFilter.Buffered w = new GzipFilter.Buffered(fake(sent, h));
        w.getWriter().write(json);
        w.finish();
        assertEquals("gzip", h.get("Content-Encoding"));
        assertTrue("줄었음 " + sent.size() + " / " + json.length(), sent.size() < json.length() / 4);
        assertEquals(json, new String(new GZIPInputStream(new ByteArrayInputStream(sent.toByteArray())).readAllBytes(), StandardCharsets.UTF_8));

        ByteArrayOutputStream small = new ByteArrayOutputStream();
        Map<String, String> h2 = new HashMap<>();
        GzipFilter.Buffered w2 = new GzipFilter.Buffered(fake(small, h2));
        w2.getWriter().write("{\"success\":true}");
        w2.finish();
        assertNull(h2.get("Content-Encoding"));
        assertEquals("{\"success\":true}", small.toString(StandardCharsets.UTF_8));
    }
}
