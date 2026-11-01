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
 * data/(series.json · mountains100.json)도 - 2026-10-12 PC: 머리글이 없어 브라우저가 짐작으로 예전 것을 써서 점봉산 안내가 안 보였음.
 * 2026-11-01: war 의 js · css 는 주소에 내용 판(?v=)이 붙어 그 판이면 1년 캐시(AssetVersion) - html 은 그대로 no-cache 라 새 판 주소가 바로 퍼짐.
 */
@WebFilter(urlPatterns = {"/", "*.html", "*.js", "*.css", "/manifest.json", "/data/*", "/img/*"})
public class NoStaleFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        // ?v= 는 받기(GET · HEAD)만 읽음 - 다른 요청에서 getParameter 가 본문을 먼저 읽어 버리지 않게
        String v = req.getQueryString() != null && ("GET".equals(req.getMethod()) || "HEAD".equals(req.getMethod())) ? req.getParameter("v") : null;
        res.setHeader("Cache-Control", cacheControl(req.getRequestURI().substring(req.getContextPath().length()), v));
        chain.doFilter(req, res);
    }

    /** 웹앱 안 주소("/js/x.js") · ?v= 값 → Cache-Control. */
    static String cacheControl(String path, String v) {
        // vendor/ 는 폴더 이름에 판(maplibre-gl-5.24.0)이 있어 바뀌지 않음 - 1년 그대로 써도 됨(2026-10-11 오픈 전 점검: 예전엔 머리글이 없어 브라우저가 짐작)
        if (path.contains("/vendor/")) return "public, max-age=31536000, immutable";
        // 지금 판(?v=내용 해시 - AssetVersion)이 붙은 js · css 도 1년 - 내용이 바뀌면 주소가 바뀜(2026-11-01 점검: 화면마다 20여 개를 304 로 물었음).
        // 예전 판 주소(배포 직후 옛 화면이 부름)는 지금 내용과 달라 no-cache 그대로
        if (v != null && path.startsWith("/") && AssetVersion.current(path.substring(1), v)) return "public, max-age=31536000, immutable";
        // img/(아이콘 · 로고 · og)는 하루 - 예전엔 머리글이 없어 화면마다 다시 물었음(2026-10-21 원스토어 전 점검). 바꾸면 하루 안에 퍼짐
        if (path.contains("/img/")) return "public, max-age=86400";
        return "no-cache";
    }
}
