package com.gh.routefly.web;

import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonObject;

/**
 * 지도 설정. {@code GET /api/map-config}
 *
 * <ul>
 *   <li>{@code vworldKey} - 배경 위성사진(V-World) 인증키. 없으면 null - 화면은 지형 음영만 그립니다.
 *       타일을 브라우저가 직접 받으므로 키가 브라우저로 내려갑니다(V-World 키는 등록한 주소에서만 동작).</li>
 *   <li>{@code demUrl} - 3D 지형(Terrarium) 타일 주소. routefly-batch 의 dem.url 과 같아야 고도 그래프와 지형이 맞습니다.</li>
 * </ul>
 */
@WebServlet(urlPatterns = {"/api/map-config"})
public class MapConfigServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Json.write(resp, HttpServletResponse.SC_OK, body(RouteflyConfig.get("map.vworld.key"), RouteflyConfig.get("map.dem.url")), false);
    }

    /** 순수 함수 - 응답 본문. */
    static JsonObject body(String vworldKey, String demUrl) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.addProperty("vworldKey", vworldKey);
        out.addProperty("demUrl", demUrl != null ? demUrl : DEFAULT_DEM_URL);
        return out;
    }
}
