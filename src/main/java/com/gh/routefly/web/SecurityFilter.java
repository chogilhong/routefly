package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 2026-10-09 보안 - 모든 응답에 보안 머리글, API · 공유 링크에는 요청 횟수 제한.
 * <ul>
 *   <li>X-Content-Type-Options nosniff - 글자 파일을 스크립트로 잘못 읽지 않게</li>
 *   <li>Referrer-Policy - 다른 사이트로 넘어갈 때 우리 주소(코스 · 위치가 든 #) 를 다 넘기지 않게</li>
 *   <li>X-Frame-Options · CSP frame-ancestors - 남의 사이트가 routefly 를 끼워 넣어 누르게 하는 것(클릭재킹) 막기</li>
 *   <li>CSP script-src 'self' · object-src · base-uri · form-action - 남의 스크립트 · 플러그인 · base 태그 · 폼 바꿔치기 막기({@link #CSP})</li>
 *   <li>/api/* · /s/* - 같은 곳에서 너무 잦은 요청은 429 ({@link RateLimiter})</li>
 * </ul>
 */
@WebFilter(urlPatterns = {"/*"})
public class SecurityFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;
    static final RateLimiter LIMITER = new RateLimiter(120, 20);   // 한 곳에서 한꺼번에 120번, 그 뒤 1초 20번
    /**
     * 2026-10-11 오픈 전 점검: 표 전체를 훑는 무거운 요청(이름 검색 q · 공원 전체 · 전국 범위 목록)은 따로 더 좁게 - 한 곳에서 1초 20번이면
     * DB 연결 10개가 계속 묶일 수 있었음. 사람이 쓰는 빠르기(글자 칠 때마다 · 지도 넘길 때마다)는 걸리지 않습니다.
     */
    static final RateLimiter HEAVY = new RateLimiter(20, 2);
    /** 이보다 넓은 bbox(도² - 위도 × 경도 폭)는 무거운 요청으로 셉니다(전국은 약 6 × 7 = 42). */
    static final double HEAVY_BBOX_DEG2 = 4;

    /**
     * 2026-10-11 오픈 전 점검: 스크립트는 우리 서버 파일만(script-src 'self') - 화면 안 스크립트 · javascript: 주소를 모두 js 파일로 옮겨,
     * 혹시 이름 등에 스크립트가 끼어들어도 돌지 않게. 지도(MapLibre)는 일꾼을 blob: 으로 띄우므로 worker-src 에 blob:.
     * 이미지 · 지도 타일 · 지형(connect) 출처는 설정마다 달라 막지 않습니다.
     */
    static final String CSP = "default-src 'self' https: data: blob:; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https:; "
            + "img-src 'self' https: http: data: blob:; connect-src 'self' https: http: data: blob:; frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'";

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Content-Security-Policy", CSP);
        res.setHeader("Permissions-Policy", "geolocation=(self), camera=(self), microphone=(), payment=()");
        // 2026-10-09 점검(totonian 과 같은 방식): HTTPS 로 받았을 때만 HSTS - 프록시가 TLS 를 푸는 구성에서는 붙지 않아 예전과 같음
        if (req.isSecure()) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        // 2026-10-10 점검: 서블릿 경로(디코딩 · ;매개변수 제거 뒤) - getRequestURI 로는 /%61pi/ · /api;x/ 가 제한 · noindex 를 피했음
        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        // JSON 은 검색 결과에 나와서 좋을 것이 없습니다(공유 링크 /s/ 와 화면은 그대로 색인)
        if (path.startsWith("/api/")) res.setHeader("X-Robots-Tag", "noindex");
        if (path.startsWith("/api/") || path.startsWith("/s/")) {
            String ip = clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            long now = System.currentTimeMillis();
            if (!LIMITER.allow(ip, now) || (heavy(path, req.getParameter("q"), req.getParameter("bbox")) && !HEAVY.allow(ip, now))) {
                res.setHeader("Retry-After", "5");
                Json.fail(res, 429, "요청이 너무 잦습니다. 잠시 뒤 다시 해 주세요.");
                return;
            }
        }
        chain.doFilter(req, res);
    }

    /** 순수 함수 - 무거운 요청인가: 공원 전체, 이름 검색(q), 넓은 bbox 목록. */
    static boolean heavy(String path, String q, String bbox) {
        if (path.startsWith("/api/park")) return true;
        if (!path.startsWith("/api/courses")) return false;
        if (q != null && !q.isBlank()) return true;
        if (bbox == null) return false;
        try {
            double[] b = CourseQueries.parseBbox(bbox);
            return b != null && (b[2] - b[0]) * (b[3] - b[1]) > HEAVY_BBOX_DEG2;
        } catch (IllegalArgumentException e) {
            return false;   // 잘못된 값은 서블릿이 400
        }
    }

    /**
     * 순수 함수 - 요청한 곳. 바로 앞이 이 컴퓨터(127.0.0.1 · Cloudflare 터널 · nginx)일 때만 전달 머리글을 믿습니다
     * (밖에서 온 요청이 머리글을 꾸며 제한을 피하지 못하게).
     */
    static String clientIp(String remote, String cfIp, String forwardedFor) {
        boolean local = remote == null || remote.equals("127.0.0.1") || remote.equals("0:0:0:0:0:0:0:1") || remote.equals("::1");
        if (!local) return remote;
        if (cfIp != null && !cfIp.isBlank()) return cfIp.trim();
        // 2026-10-09 점검: 맨 뒤 값 - 이 컴퓨터의 nginx 가 실제로 붙인 곳입니다. 맨 앞은 요청한 쪽이 마음대로 넣을 수 있어 제한을 피할 수 있었습니다.
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            String[] parts = forwardedFor.split(",");
            String last = parts[parts.length - 1].trim();
            if (!last.isEmpty()) return last;
        }
        return remote == null ? "?" : remote;
    }
}
