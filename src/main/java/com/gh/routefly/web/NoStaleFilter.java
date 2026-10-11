package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 화면 파일(html · js · css · manifest)은 브라우저가 쓰기 전에 늘 서버에 바뀌었는지 묻게 합니다(Cache-Control: no-cache).
 * 캐시 시간을 정하지 않으면 브라우저가 예전 app.js 를 몇 시간씩 그대로 써서, 배포해도 화면이 안 바뀌었습니다.
 * 바뀌지 않았으면 304 로 짧게 답하므로 느려지지 않습니다. MapLibre(vendor/)는 바뀌지 않으니 그대로 둡니다.
 */
@WebFilter(urlPatterns = {"/", "*.html", "*.js", "*.css", "/manifest.json"})
public class NoStaleFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        // vendor/ 는 폴더 이름에 판(maplibre-gl-5.24.0)이 있어 바뀌지 않음 - 1년 그대로 써도 됨(2026-10-11 오픈 전 점검: 예전엔 머리글이 없어 브라우저가 짐작)
        if (req.getRequestURI().contains("/vendor/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "no-cache");
        chain.doFilter(req, res);
    }
}
