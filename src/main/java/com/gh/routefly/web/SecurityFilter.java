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
 *   <li>CSP object-src · base-uri · form-action - 플러그인 · base 태그 · 폼 바꿔치기 막기. 스크립트 출처는 제한하지 않습니다
 *       (지도 타일 · 지형 · 지도 일꾼(blob) 주소가 설정마다 달라 화면이 깨질 수 있음 - README)</li>
 *   <li>/api/* · /s/* - 같은 곳에서 너무 잦은 요청은 429 ({@link RateLimiter})</li>
 * </ul>
 */
@WebFilter(urlPatterns = {"/*"})
public class SecurityFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;
    static final RateLimiter LIMITER = new RateLimiter(120, 20);   // 한 곳에서 한꺼번에 120번, 그 뒤 1초 20번

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'");
        res.setHeader("Permissions-Policy", "geolocation=(self), camera=(self), microphone=(), payment=()");
        String path = req.getRequestURI().substring(req.getContextPath().length());
        if (path.startsWith("/api/") || path.startsWith("/s/")) {
            String ip = clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            if (!LIMITER.allow(ip, System.currentTimeMillis())) {
                res.setHeader("Retry-After", "5");
                Json.fail(res, 429, "요청이 너무 잦습니다. 잠시 뒤 다시 해 주세요.");
                return;
            }
        }
        chain.doFilter(req, res);
    }

    /**
     * 순수 함수 - 요청한 곳. 바로 앞이 이 컴퓨터(127.0.0.1 · Cloudflare 터널 · nginx)일 때만 전달 머리글을 믿습니다
     * (밖에서 온 요청이 머리글을 꾸며 제한을 피하지 못하게).
     */
    static String clientIp(String remote, String cfIp, String forwardedFor) {
        boolean local = remote == null || remote.equals("127.0.0.1") || remote.equals("0:0:0:0:0:0:0:1") || remote.equals("::1");
        if (!local) return remote;
        if (cfIp != null && !cfIp.isBlank()) return cfIp.trim();
        if (forwardedFor != null && !forwardedFor.isBlank()) return forwardedFor.split(",")[0].trim();
        return remote == null ? "?" : remote;
    }
}
