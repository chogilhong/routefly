package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 없는 /api/… 주소는 JSON 404(2026-11-03 홍TV님 점검: 톰캣 HTML 404 가 나가 화면 · 앱이 json() 에서 깨졌고 톰캣 판이 보였음).
 * 서블릿 주소는 정확한 것 · 더 긴 /api/…/* 가 먼저라, 있는 API 는 그대로 그쪽으로 감.
 */
@WebServlet(urlPatterns = {"/api/*"})
public class ApiNotFoundServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Json.fail(resp, 404, "없는 주소입니다.");
    }
}
