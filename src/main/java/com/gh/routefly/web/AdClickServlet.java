package com.gh.routefly.web;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 광고 카드 누름 수(2026-11-24 홍TV님 "광고 자리별 누름 수를 /stats 에") - js/ads.js 가 쿠팡 카드를 누를 때 한 번 보냄(sendBeacon).
 * 누른 화면(Referer 경로)으로 자리 이름만 정해(Stats.adArea) 그 날 숫자만 셈. 운영자 기기 · 확인용 · 로봇은 안 셈(SeenServlet.why 와 같은 거름). 아무것도 돌려주지 않음.
 * 애드센스 광고는 구글 칸 안이라 여기서 못 셈(애드센스 관리 화면에서 봄).
 */
@WebServlet(urlPatterns = {"/api/adclick"})
public class AdClickServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
        if (SeenServlet.why(req.getHeader("Cookie"), req.getHeader("User-Agent"), req.getHeader("Accept-Language")) == null)
            Stats.adClick(ip, Stats.adArea(req.getHeader("Referer")));
        resp.setHeader("Cache-Control", "no-store");
        resp.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }
}
