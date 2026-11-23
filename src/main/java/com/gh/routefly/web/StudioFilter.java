package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * GPX 편집 화면(studio.html) - 캐시에 남지 않게 no-store.
 * 2026-11-23 홍TV님 "코스번호를 알더라도 나만" 으로 손님을 따라가기로 돌려보냈다가, 2026-11-24 홍TV님 "다른 사람들은 '등록 요청'" 으로 손님도 들어옴
 * (기록 보기의 📐 GPX 편집). 코스번호(#c=)로 여는 것만 운영자 기기 - 주소의 # 뒤는 서버로 오지 않아 화면(studio.js openGuideNow)이 막음.
 */
@WebFilter(urlPatterns = {"/studio.html"})
public class StudioFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        res.setHeader("Cache-Control", "no-store");
        chain.doFilter(req, res);
    }
}
