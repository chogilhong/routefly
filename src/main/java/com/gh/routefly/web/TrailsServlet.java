package com.gh.routefly.web;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 주변 등산로 선. {@code GET /api/trails?bbox=minLon,minLat,maxLon,maxLat}
 *
 * <p>산행 화면이 코스에서 벗어났을 때 "가장 가까운 등산로" 를 찾으려고 씁니다(지금 코스 말고 옆 코스 길까지).
 * 범위 안 코스 선을 솎아서(약 30m 간격) 돌려줍니다. 범위는 0.2°(약 20km) 안, 코스는 최대 {@link #LIMIT}개.
 * <pre>{success, trails:[{id, name, kind, coords:[[경도,위도],...]}]}</pre>
 */
@WebServlet(urlPatterns = {"/api/trails"})
public class TrailsServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(TrailsServlet.class);

    static final int LIMIT = 80;
    static final double MAX_SPAN = 0.2;

    /**
     * 2026-10-09 점검: MBRIntersects(공간 인덱스)는 선을 감싼 네모만 봐서, 국토종주처럼 긴 길이 범위를 지나지도 않는데 통째로 왔고
     * 정작 가까운 길이 80개 밖으로 밀렸습니다 - 인덱스로 고른 뒤 실제로 지나는 길만(ST_Intersects), 범위 가운데서 가까운 순으로.
     */
    static final String SQL = "SELECT course_id, name, kind, ST_AsText(path) FROM route_course"
            + " WHERE MBRIntersects(path, ST_GeomFromText(?, 4326)) AND ST_Intersects(path, ST_GeomFromText(?, 4326))"
            + " ORDER BY ST_Distance(path, ST_GeomFromText(?, 4326)) LIMIT " + LIMIT;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] b;
        try {
            b = CourseQueries.parseBbox(req.getParameter("bbox"));
        } catch (IllegalArgumentException e) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
            return;
        }
        if (b == null || b[2] - b[0] > MAX_SPAN || b[3] - b[1] > MAX_SPAN) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "bbox 는 꼭 주고, 가로 · 세로 " + MAX_SPAN + "° 안이어야 합니다.");
            return;
        }
        try (Connection c = Db.open();
             PreparedStatement ps = c.prepareStatement(SQL)) {
            String box = CourseQueries.bboxWkt(b);
            ps.setString(1, box);
            ps.setString(2, box);
            ps.setString(3, "POINT(" + (b[0] + b[2]) / 2 + " " + (b[1] + b[3]) / 2 + ")");
            JsonArray trails = new JsonArray();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    JsonObject t = new JsonObject();
                    t.addProperty("id", rs.getString(1));
                    t.addProperty("name", rs.getString(2));
                    t.addProperty("kind", rs.getString(3));
                    t.add("coords", thinWkt(rs.getString(4), 3));
                    trails.add(t);
                }
            }
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.add("trails", trails);
            Json.ok(req, resp, out);
        } catch (Exception e) {
            log.warn("[TRAILS] 조회 실패 - {}", e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "주변 등산로를 읽지 못했습니다.");
        }
    }

    /** 순수 함수 - "LINESTRING(x y,x y,...)" → [[x,y],...] 를 every 개마다 하나씩(처음 · 끝은 늘 넣음), 소수 5자리. */
    static JsonArray thinWkt(String wkt, int every) {
        JsonArray out = new JsonArray();
        if (wkt == null) return out;
        int a = wkt.indexOf('('), z = wkt.lastIndexOf(')');
        if (a < 0 || z <= a) return out;
        String[] pts = wkt.substring(a + 1, z).split(",");
        for (int i = 0; i < pts.length; i++) {
            if (i % every != 0 && i != pts.length - 1) continue;
            String[] xy = pts[i].replace("(", " ").replace(")", " ").trim().split("\\s+");   // MULTILINESTRING 이어도 500 이 나지 않게
            if (xy.length < 2) continue;
            JsonArray p = new JsonArray(2);
            p.add(Math.round(Double.parseDouble(xy[0]) * 1e5) / 1e5);
            p.add(Math.round(Double.parseDouble(xy[1]) * 1e5) / 1e5);
            out.add(p);
        }
        return out;
    }
}
