package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 정적 화면의 광고 칸 설정(2026-11-01 홍TV님 - 도구 화면 맨 아래 · 도장 목록 아래 한 칸). ?where=tools|series → {client, slot} 또는 {}(광고 없음).
 * 광고 ID 는 운영 설정에만 있고(Ads), 이 응답으로 브라우저에 나가는 값은 애드센스 칸에 어차피 보이는 값입니다.
 */
@WebServlet(urlPatterns = {"/api/ad"})
public class AdServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Json.ok(req, resp, Ads.spot(req.getParameter("where"), RouteflyConfig::get));
    }
}
