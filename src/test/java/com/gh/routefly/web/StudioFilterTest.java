package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** GPX 편집 화면 - 2026-11-23 운영자 기기만이었다가 2026-11-24 홍TV님 "다른 사람들은 '등록 요청'" 으로 손님도 들어옴(no-store 만). 코스번호(#c=)로 열기만 운영자(studio.js openGuideNow). */
public class StudioFilterTest {

    @Test
    public void 손님은_따라가기로() throws Exception {
        List<String> did = new ArrayList<>();
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (p, m, a) -> "getCookies".equals(m.getName()) ? new Cookie[] {new Cookie(StatsServlet.OWNER_COOKIE, "guess")} : null);   // 꾸민 쿠키도 손님
        HttpServletResponse res = (HttpServletResponse) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (p, m, a) -> {
                    if ("sendRedirect".equals(m.getName())) did.add("redirect " + a[0]);
                    if ("setHeader".equals(m.getName())) did.add(a[0] + ": " + a[1]);
                    return null;
                });
        FilterChain chain = (rq, rs) -> did.add("chain");
        new StudioFilter().doFilter(req, res, chain);
        assertEquals("손님도 들어옴(돌려보내지 않음)", List.of("Cache-Control: no-store", "chain"), did);
        String js = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp/js/studio.js")), java.nio.charset.StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC(core.autocrlf)는 CRLF
        assertTrue("#c= 코스 열기는 운영자 기기만", js.contains("function openFromGuide() { return ownerP.then(openGuideNow); }") && js.contains("        if (!owner) {\n            try { history.replaceState(null, \"\", location.pathname + location.search); } catch (e) { /* 주소는 그대로 */ }\n")
                && js.contains("msg(\"코스 번호로 바로 여는 것은 운영자 기기만 됩니다."));   // 손님에게 한 줄(점검 14차 C9)
        assertArrayEquals("studio.html 만 거름", new String[] {"/studio.html"}, StudioFilter.class.getAnnotation(jakarta.servlet.annotation.WebFilter.class).urlPatterns());
    }
}
