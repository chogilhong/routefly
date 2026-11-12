package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 없는 주소(2026-11-12 점검 9차 - 톰캣 기본 "HTTP Status 404" 에 링크가 없어 길을 잃었음). WEB-INF/web.xml 의 error-page 404 가 부름.
 * 상태는 404 그대로, 산 모음 · 영어 · 따라가기 링크만. 받은 주소는 화면에 쓰지 않음(그대로 되비추지 않게).
 * 옛 주소 넘기기도 여기서: /subway.html(예전 지하철 화면 - 지금은 별거 별거) · /en · /en/(영어 산 모음).
 */
@WebServlet(urlPatterns = {"/notfound", "/subway.html", "/en", "/en/"})
public class NotFoundServlet extends HttpServlet {

    /** 순수 함수 - 옛 주소면 넘길 곳(앱 안 상대 주소), 아니면 null. */
    static String moved(String servletPath) {
        if ("/subway.html".equals(servletPath)) return "/tools.html";
        if ("/en".equals(servletPath) || "/en/".equals(servletPath)) return "/en/m/";
        return null;
    }

    /** 순수 함수 - 404 화면(ctx - 앱 경로, 예: /routefly). */
    static String page(String ctx) {
        return "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<meta name=\"robots\" content=\"noindex\"><title>없는 화면 - routefly</title>"
            + "<style>body{margin:0;background:#0b1016;color:#e9eef4;font:16px/1.6 system-ui,-apple-system,'Noto Sans KR',sans-serif;padding:32px 16px}"
            + "main{max-width:480px;margin:0 auto}a{display:block;margin:10px 0;padding:12px 14px;border-radius:12px;background:#1b222c;color:#38d9ea;text-decoration:none;font-weight:bold}</style></head>"
            + "<body><main><h1>찾는 화면이 없습니다</h1><p>주소가 바뀌었거나 없어진 화면입니다. 아래에서 다시 찾아 주세요.</p>"
            + "<a href=\"" + ctx + "/m/\">⛰ 100대 명산 · 코스 모음 ›</a>"
            + "<a href=\"" + ctx + "/hike.html\">🥾 따라가기 ›</a>"
            + "<a href=\"" + ctx + "/en/m/\" lang=\"en\" hreflang=\"en\">English ›</a>"
            + "</main></body></html>";
    }

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String to = moved(req.getServletPath());
        if (to != null && req.getAttribute("jakarta.servlet.error.status_code") == null) {
            resp.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);
            resp.setHeader("Location", req.getContextPath() + to);   // 앱 안 경로만 - Host 는 쓰지 않음(열린 넘기기 없음)
            return;
        }
        resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
        resp.setContentType("text/html;charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(page(req.getContextPath()));
    }
}
