package com.gh.routefly.web;

import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 화면 · 산 페이지 방문 수 세기(Stats - 숫자만). 2026-10-15 홍TV님. 10분마다 파일로. */
@WebFilter(urlPatterns = {"/", "*.html", "/m/*", "/en/m/*", "/s/*", "/c/*"})
public class StatsFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;
    private transient ScheduledExecutorService saver;

    @Override
    public void init() {
        saver = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "stats-save"); t.setDaemon(true); return t; });
        saver.scheduleAtFixedRate(Stats::save, 10, 10, TimeUnit.MINUTES);
    }

    @Override
    public void destroy() {
        if (saver != null) saver.shutdownNow();
        Stats.save();
    }

    /**
     * 순수 함수 - PC Claude 가 배포 뒤 운영 화면을 확인할 때 쓰는 이름표(User-Agent 에 "routefly-check")인가(2026-10-31 홍TV님 "이것도 통계에서 빼줘").
     * 비밀이 아니라 누가 붙여도 자기 방문만 빠질 뿐이라 괜찮음(권한은 주지 않음 - 통계 · 관리 기능은 쿠키로).
     */
    static boolean selfCheck(String ua) {
        return ua != null && ua.contains("routefly-check");
    }

    /** 운영자 기기인가(/stats 를 연 브라우저 - StatsServlet.OWNER_COOKIE). 설정 stats.key 에서 만든 값과 같아야 함. */
    static boolean owner(String cookieHeader) {
        return owner(cookieHeader, RouteflyConfig.get("stats.key"));
    }

    /**
     * 순수 함수 - 쿠키 값이 열쇠에서 만든 값(StatsServlet.ownerToken)과 같을 때만(시각이 새지 않게 MessageDigest.isEqual).
     * 2026-10-29 점검: 예전엔 "1" 이나 아무 64자리 16진수도 받아, 수집 프로그램이 "rf-owner=1" 만 보내면 방문 수 · 접속 분석(수집기 의심)에서 빠졌음.
     * 옛 "1" 쿠키는 이제 운영자로 안 봄 - 운영자는 /stats 를 한 번 열면 새 값을 받음.
     */
    static boolean owner(String cookieHeader, String key) {
        if (cookieHeader == null || key == null || key.length() < 12) return false;
        byte[] want = StatsServlet.ownerToken(key).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        for (String c : cookieHeader.split(";")) {
            String t = c.trim();
            if (t.startsWith(StatsServlet.OWNER_COOKIE + "=")
                    && java.security.MessageDigest.isEqual(want, t.substring(StatsServlet.OWNER_COOKIE.length() + 1).getBytes(java.nio.charset.StandardCharsets.UTF_8))) return true;
        }
        return false;
    }

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        chain.doFilter(req, res);
        if (!"GET".equals(req.getMethod()) || res.getStatus() >= 400 || !Stats.isPageView(req.getHeader("X-RF-Prefetch"))) return;
        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        String page = Stats.pageKey(path);
        if (page == null) return;
        String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
        String ua = req.getHeader("User-Agent");
        boolean own = owner(req.getHeader("Cookie")) || selfCheck(ua);   // 운영자 기기 · PC Claude 확인용 접속(이름표 routefly-check)은 방문 수에서 뺌
        Access.page(page, ip, ua, req.getHeader("Accept-Language"), own, System.currentTimeMillis());   // 오늘 접속 분석 - 로봇 · 운영자도 종류별로(2026-10-29)
        if (own) return;
        String bot = Stats.botKind(ua, req.getHeader("Accept-Language"));
        Stats.hit(page, Stats.courseKey(path), ip, bot, "검색".equals(bot) ? Stats.searchEngine(ua) : null, Stats.source(req.getHeader("Referer"), req.getServerName()), Stats.device(ua),
                bot == null ? Stats.suspect(ua, req.getHeader("Sec-Fetch-Mode"), req.getHeader("sec-ch-ua")) : null);
    }
}
