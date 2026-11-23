package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * GPX 편집 화면(studio.html)은 운영자 기기만(2026-11-23 홍TV님 "코스번호를 알더라도 나만 접근하게 해" - 2026-11-02 "GPX 편집을 누구나" 를 거둠).
 * 운영자 기기 = /stats 를 연 브라우저 · 앱(PartyServlet.owner - 쿠키). 아니면 따라가기(hike.html)로 돌려보냄. 캐시에 남지 않게 no-store.
 */
@WebFilter(urlPatterns = {"/studio.html"})
public class StudioFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        res.setHeader("Cache-Control", "no-store");
        if (!PartyServlet.owner(req)) {
            res.sendRedirect("hike.html");
            return;
        }
        chain.doFilter(req, res);
    }
}
