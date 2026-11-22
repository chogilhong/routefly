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
 *   <li>{@code basemapUrl} - 우리 바탕 지도 파일(OSM → Planetiler 벡터 PMTiles, docs/basemap/README.md) 주소. 설정 map.basemap.url 이 있을 때만,
 *       같은 사이트 경로(tiles/korea.pmtiles · /routefly/tiles/korea.pmtiles) 또는 https 이고 .pmtiles 로 끝날 때만(그 밖은 null). 지금은 기록 보기(trip.html)만 씀(2026-11-22 2단계).</li>
 * </ul>
 */
@WebServlet(urlPatterns = {"/api/map-config"})
public class MapConfigServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Json.ok(req, resp, body(RouteflyConfig.get("map.vworld.key"), RouteflyConfig.get("map.dem.url"), RouteflyConfig.get("map.basemap.url")));   // 바뀌지 않는 설정 - ETag · 5분 캐시
    }

    /** 순수 함수 - 응답 본문. */
    static JsonObject body(String vworldKey, String demUrl, String basemapUrl) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.addProperty("vworldKey", vworldKey);
        out.addProperty("demUrl", demUrl != null ? demUrl : DEFAULT_DEM_URL);
        out.addProperty("basemapUrl", basemap(basemapUrl));
        return out;
    }

    /** 순수 함수 - 바탕 지도 파일 주소가 쓸 만하면 그대로(앞뒤 빈칸만 뗌), 아니면 null. */
    static String basemap(String u) {
        if (u == null) return null;
        String t = u.trim();
        return t.matches("(https://[A-Za-z0-9.-]+(?::\\d+)?)?/?[A-Za-z0-9/_.-]*[A-Za-z0-9_-]\\.pmtiles") && !t.contains("..") ? t : null;
    }
}
