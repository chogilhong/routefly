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

    /** 순수 함수 - 운영자 기기인가(/stats 를 연 브라우저 - StatsServlet.OWNER_COOKIE). */
    static boolean owner(String cookieHeader) {
        if (cookieHeader == null) return false;
        for (String c : cookieHeader.split(";")) if (c.trim().equals(StatsServlet.OWNER_COOKIE + "=1")) return true;
        return false;
    }

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        chain.doFilter(req, res);
        if (!"GET".equals(req.getMethod()) || res.getStatus() >= 400 || !Stats.isPageView(req.getHeader("X-RF-Prefetch")) || owner(req.getHeader("Cookie"))) return;
        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        String page = Stats.pageKey(path);
        if (page == null) return;
        String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
        String ua = req.getHeader("User-Agent");
        Stats.hit(page, Stats.courseKey(path), ip, Stats.botKind(ua, req.getHeader("Accept-Language")), Stats.source(req.getHeader("Referer"), req.getServerName()), Stats.device(ua));
    }
}
