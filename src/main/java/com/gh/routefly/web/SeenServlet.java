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
        String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
        Access.js(ip, System.currentTimeMillis());   // 오늘 접속 분석 - js 가 돈 곳
        String ua = req.getHeader("User-Agent");
        boolean app = "1".equals(req.getParameter("app"));   // routefly 앱 안(js/seen.js 가 window.Capacitor 를 보고 ?app=1 - 2026-11-11)
        if (app) Stats.appSignal();   // 걸러내기 전 앱 신호 수(2026-11-12 - "그중 앱" 이 0 일 때 어디서 빠지는지)
        String why = why(req.getHeader("Cookie"), ua, req.getHeader("Accept-Language"));
        if (why == null && !Stats.seenToday(ip)) why = "방문 없음";
        if (why == null) {
            boolean got = Stats.js(ip, Stats.device(ua), app);
            if (app) Stats.appWhy(got ? "셈" : "이미 셈");
        } else if (app) Stats.appWhy(why);
        resp.setHeader("Cache-Control", "no-store");
        resp.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }

    /** 사람 방문으로 셀까 - 운영자 기기 · PC Claude 확인용 접속(routefly-check, StatsFilter 와 같게 - 2026-11-03 홍TV님 점검) · 로봇은 뺌. */
    static boolean counted(String cookie, String ua, String lang) {
        return why(cookie, ua, lang) == null;
    }

    /** 순수 함수 - 세지 않는 까닭("관리자" · "확인용" · 로봇 종류), 셀 것이면 null(2026-11-12 - 앱 신호 까닭 숫자). */
    static String why(String cookie, String ua, String lang) {
        return StatsFilter.owner(cookie) ? "관리자" : StatsFilter.selfCheck(ua) ? "확인용" : Stats.botKind(ua, lang);
    }
}
