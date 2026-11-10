package com.gh.routefly.web;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 사람 확인 신호(2026-10-22 홍TV님 - 언어 설정까지 흉내 내는 수집 프로그램 가려내기). 화면의 js/seen.js 가 열릴 때 한 번 보냄 -
 * js 를 돌리지 않는 수집 프로그램은 안 보냄. 그 날 사람으로 센 방문자에서 온 것만 셈(Stats.js). 숫자만, 아무것도 돌려주지 않음.
 */
@WebServlet(urlPatterns = {"/api/seen"})
public class SeenServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        Access.js(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")), System.currentTimeMillis());   // 오늘 접속 분석 - js 가 돈 곳
        String ua = req.getHeader("User-Agent");
        if (counted(req.getHeader("Cookie"), ua, req.getHeader("Accept-Language")))
            Stats.js(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")), Stats.device(ua),
                    "1".equals(req.getParameter("app")));   // routefly 앱 안(js/seen.js 가 window.Capacitor 를 보고 ?app=1 - 2026-11-11)
        resp.setHeader("Cache-Control", "no-store");
        resp.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }

    /** 사람 방문으로 셀까 - 운영자 기기 · PC Claude 확인용 접속(routefly-check, StatsFilter 와 같게 - 2026-11-03 홍TV님 점검) · 로봇은 뺌. */
    static boolean counted(String cookie, String ua, String lang) {
        return !StatsFilter.owner(cookie) && !StatsFilter.selfCheck(ua) && Stats.botKind(ua, lang) == null;
    }
}
