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

/** GPX 편집 화면은 운영자 기기만(2026-11-23 홍TV님 "코스번호를 알더라도 나만 접근하게 해") - 손님은 따라가기로 돌려보냄. */
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
        assertEquals(List.of("Cache-Control: no-store", "redirect hike.html"), did);
        assertArrayEquals("studio.html 만 거름", new String[] {"/studio.html"}, StudioFilter.class.getAnnotation(jakarta.servlet.annotation.WebFilter.class).urlPatterns());
    }
}
