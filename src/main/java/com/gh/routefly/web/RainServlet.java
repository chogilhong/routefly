package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonObject;

/**
 * 🌧 걷는 중 비구름 확인(2026-11-14 홍TV님 "작업해줘") {@code GET /api/rain?lat=37.56&lon=126.97} → {@code {success, rain:{…}}}(Radar.near 와 같은 모양, 모르면 rain 없음).
 * 따라가기가 기록하는 동안 10분마다 지금 자리로 부름 - 응급실 · 산불 · 자외선까지 묻는 /api/safety 대신 가벼운 것. 서버는 미리 받아 둔 것만 씀(기상청을 부르지 않음).
 */
@WebServlet(urlPatterns = {"/api/rain"})
public class RainServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        JsonObject rain = Radar.at(at[0], at[1]);
        if (rain != null) out.add("rain", rain);
        Json.ok(req, resp, out);
    }
}
