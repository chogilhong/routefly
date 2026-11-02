package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 사이트 첫 주소(…/routefly/ - 빈 매핑 "" 은 이 주소 하나만)는 작은 넘김 화면 root.html 로(2026-11-02 홍TV님 속도 점검).
 * 예전엔 3D 화면(index.html)이 첫 주소라, root-go.js 가 코스 모음(m/)으로 넘기기 전에 브라우저가 그 화면의 MapLibre · app.js 를
 * 미리 받기 시작해 느린 망에서 넘김이 1초 가까이 늦었음. 주소 · # 은 그대로라(forward) root-go.js 가 예전처럼 고름.
 * index.html 을 직접 연 주소는 그대로 3D 화면. 캐시 머리글은 NoStaleFilter("/" - no-cache)가 그대로 붙임.
 */
@WebServlet(urlPatterns = {""})
public class RootPageServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String PAGE = "/root.html";

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        req.getRequestDispatcher(PAGE).forward(req, resp);
    }
}
