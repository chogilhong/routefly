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
@WebFilter(urlPatterns = {"/", "*.html", "/m/*", "/en/m/*", "/s/*"})
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

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        chain.doFilter(req, res);
        if (!"GET".equals(req.getMethod()) || res.getStatus() >= 400) return;
        String page = Stats.pageKey(req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo()));
        if (page == null) return;
        String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
        Stats.hit(page, ip, Stats.isBot(req.getHeader("User-Agent")));
    }
}
