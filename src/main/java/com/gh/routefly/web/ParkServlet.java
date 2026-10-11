package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.HashSet;
import java.util.List;
import java.util.Properties;
import java.util.Set;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

/**
 * 국립공원 전체 보기. {@code GET /api/park?name=지리산}
 *
 * <p>2026-10-10 홍TV님: 공원 안내도처럼 산 전체를 한눈에 - 그 공원의 공단 공식 탐방로(knps-*, routefly-batch knpsTrail) 전체 선 ·
 * 주요 지점 이름표(봉우리 · 대피소 …) · 위험지역 · 조망점 · 헬기장(route_park_spot, 표가 없으면 빼고) · 공식 안내도 바로가기 주소.
 * <pre>{success, park, map, bbox:[w,s,e,n], trails:[{id, name, distance_m, ascent_m, coords}], places:[{name, lat, lon, ele_m}],
 *  spots:[{kind, name, info, lat, lon}]}</pre>
 */
@WebServlet(urlPatterns = {"/api/park"})
public class ParkServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(ParkServlet.class);

    /** 국립공원 이름(코스 이름 앞부분 "지리산 · " 과 같은 말). */
    static final List<String> PARKS = List.of("지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산",
            "오대산", "주왕산", "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "월출산", "변산반도", "무등산", "태백산");

    /** 이름표 수 한도(겹치면 화면이 가립니다). */
    static final int PLACE_LIMIT = 300;

    private static final Properties MAPS = loadMaps();

    private static Properties loadMaps() {
        Properties p = new Properties();
        try (InputStream in = ParkServlet.class.getResourceAsStream("/knps-maps.properties")) {
            if (in != null) p.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        } catch (IOException e) {
            log.warn("[PARK] knps-maps.properties 를 읽지 못했습니다 - 안내도 바로가기 없이: {}", e.toString());
        }
        return p;
    }

    /** 공식 안내도 주소. 없으면 null. */
    static String officialMap(String park) {
        String u = MAPS.getProperty(park);
        return u == null || u.isBlank() ? null : u.trim();
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String park = req.getParameter("name");
        if (park == null || !PARKS.contains(park.trim())) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "name 은 국립공원 이름입니다(예: 지리산).");
            return;
        }
        park = park.trim();
        try (Connection c = Db.open()) {
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.addProperty("park", park);
            String map = officialMap(park);
            if (map == null) out.add("map", JsonNull.INSTANCE); else out.addProperty("map", map);

            double[] box = {180, 90, -180, -90};
            JsonArray trails = new JsonArray();
            try (PreparedStatement ps = c.prepareStatement("SELECT course_id, name, distance_m, ascent_m, min_lon, min_lat, max_lon, max_lat,"
                    + " ST_AsText(path) FROM route_course WHERE course_id LIKE 'knps-%' AND name LIKE ? ORDER BY name")) {
                ps.setString(1, park + " · %");
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        JsonObject t = new JsonObject();
                        t.addProperty("id", rs.getString(1));
                        t.addProperty("name", rs.getString(2));
                        t.addProperty("distance_m", rs.getInt(3));
                        t.addProperty("ascent_m", rs.getInt(4));
                        box[0] = Math.min(box[0], rs.getDouble(5));
                        box[1] = Math.min(box[1], rs.getDouble(6));
                        box[2] = Math.max(box[2], rs.getDouble(7));
                        box[3] = Math.max(box[3], rs.getDouble(8));
                        t.add("coords", TrailsServlet.thinWkt(rs.getString(9), 3));
                        trails.add(t);
                    }
                }
            }
            if (trails.size() == 0) {
                Json.fail(resp, HttpServletResponse.SC_NOT_FOUND, park + " 국립공원 탐방로가 아직 없습니다.");
                return;
            }
            out.add("trails", trails);
            JsonArray bbox = new JsonArray();
            for (double v : box) bbox.add(Math.round(v * 1e5) / 1e5);
            out.add("bbox", bbox);
            out.add("places", places(c, park));
            try {
                out.add("spots", Json.rows(c, "SELECT kind, name, info, lat, lon FROM route_park_spot"
                        + " WHERE kind IN ('danger', 'view', 'heli', 'aid', 'ranger') AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                        box[1], box[3], box[0], box[2]));
            } catch (java.sql.SQLException e) {
                out.add("spots", new JsonArray());   // 표 없음
            }
            Json.ok(req, resp, out);
        } catch (Exception e) {
            log.warn("[PARK] 조회 실패 name={} - {}", park, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "공원 탐방로를 읽지 못했습니다.");
        }
    }

    /** 그 공원 공식 탐방로의 이름표(같은 이름은 하나, 경로에서 100m 안). */
    static JsonArray places(Connection c, String park) throws Exception {
        JsonArray out = new JsonArray();
        Set<String> seen = new HashSet<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT p.name, p.lat, p.lon, p.ele_m FROM route_course_poi p"
                + " JOIN route_course r ON r.course_id = p.course_id WHERE r.course_id LIKE 'knps-%' AND r.name LIKE ? AND p.off_route_m <= 100")) {
            ps.setString(1, park + " · %");
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next() && out.size() < PLACE_LIMIT) {
                    String name = rs.getString(1);
                    if (name == null || !seen.add(name.replaceAll("\\s+", ""))) continue;
                    JsonObject o = new JsonObject();
                    o.addProperty("name", name);
                    o.add("lat", new com.google.gson.JsonPrimitive(rs.getBigDecimal(2)));
                    o.add("lon", new com.google.gson.JsonPrimitive(rs.getBigDecimal(3)));
                    java.math.BigDecimal ele = rs.getBigDecimal(4);
                    if (ele == null) o.add("ele_m", JsonNull.INSTANCE); else o.addProperty("ele_m", ele.intValue());
                    out.add(o);
                }
            }
        }
        return out;
    }
}
