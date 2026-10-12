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
 * 공원 · 산 전체 보기. {@code GET /api/park?name=지리산[&from=코스ID]}
 *
 * <p>2026-10-10 홍TV님: 공원 안내도처럼 산 전체를 한눈에.
 * <ul>
 *   <li>국립공원(PARKS, 공단 탐방로가 있을 때): 그 공원의 공단 공식 탐방로(knps-*) 전체 선 · 이름표 · 공식 지도 바로가기 주소.</li>
 *   <li>도립 · 군립공원과 다른 산(2026-10-11 홍TV님 "도립공원, 군립공원도"): 이름이 그 산으로 시작하는 등산 · 걷기 코스 가운데
 *       from 코스 둘레(약 15km) 것 - 같은 이름 산이 여러 곳(백운산 …)이라 from 이 꼭 있어야 함.</li>
 * </ul>
 * 둘 다 위험지역 · 조망점 · 헬기장(route_park_spot, 표가 없으면 빼고).
 * <pre>{success, park, national, map, bbox:[w,s,e,n], trails:[{id, name, distance_m, ascent_m, coords}], places:[{name, lat, lon, ele_m}],
 *  spots:[{kind, name, info, lat, lon}]}</pre>
 */
@WebServlet(urlPatterns = {"/api/park"})
public class ParkServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(ParkServlet.class);

    /** 국립공원 이름(코스 이름 앞부분 "지리산 · " 과 같은 말). */
    static final List<String> PARKS = List.of("지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산",
            "오대산", "주왕산", "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "월출산", "변산반도", "무등산", "태백산", "팔공산");

    /**
     * 산 이름(도립 · 군립공원 · 다른 산) - (숫자 0~4자) + 한글 1~12자 + 산 · 봉 · 악 · 령 · 대.
     * 화면 RF.mountainOf 와 같은 규칙(2026-10-12 PC: "157고지우송대뒷산" 전체 보기가 400 - 화면만 고쳤었음). 오름(제주) · 고지(100고지)도.
     */
    static final java.util.regex.Pattern MOUNTAIN = java.util.regex.Pattern.compile("^(?:[0-9]{1,4}[가-힣]{0,12}|[가-힣]{1,12})(?:산|봉|악|령|대|오름|고지)$");

    /** 산 모드에서 from 코스 둘레로 볼 범위(도, 위도 · 경도 반쪽 폭) - 약 15km. */
    static final double AROUND_DEG = 0.14;

    /** 산 모드 코스 수 한도. */
    static final int MOUNTAIN_LIMIT = 150;

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
        String park = req.getParameter("name"), from = req.getParameter("from");
        park = park == null ? "" : park.trim();
        boolean known = PARKS.contains(park);
        if (!known && !MOUNTAIN.matcher(park).matches()) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "name 은 공원 · 산 이름입니다(예: 지리산 · 모악산).");
            return;
        }
        if (from != null && !CourseQueries.validId(from)) from = null;
        String key = ResultCache.key("park", park, from), ver = ResultCache.LISTS.version();
        if (ResultCache.LISTS.send(req, resp, key, ver)) return;
        try (Connection c = Db.open()) {
            double[] box = {180, 90, -180, -90};
            JsonArray trails = new JsonArray();
            List<String> ids = new java.util.ArrayList<>();
            double[] at = from == null ? null : center(c, from);
            boolean national = known && collect(c, "SELECT course_id, name, distance_m, ascent_m, min_lon, min_lat, max_lon, max_lat, ST_AsText(path)"
                    + " FROM route_course WHERE course_id LIKE 'knps-%' AND name LIKE ? ORDER BY name", new Object[] {park + " · %"}, trails, ids, box) > 0;
            // 같은 이름의 다른 산(서산 가야산 · 진안 팔공산 …)이면 국립공원 화면이 아님 - from 코스가 그 공원 탐방로 범위(+약 10km) 밖
            if (national && at != null && !inside(at, box, NEAR_PARK_DEG)) {
                national = false;
                trails = new JsonArray();
                ids.clear();
                box = new double[] {180, 90, -180, -90};
            }
            boolean officialHere = national || known && at != null && nearCenter(park, at);
            if (!national) {
                // 도립 · 군립공원 · 다른 산 - from 코스 둘레의 같은 산 이름 코스(국립공원인데 공단 탐방로가 없을 때도 - 팔공산은 2023년 지정)
                if (at == null) {
                    Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "from 은 그 산의 코스 ID 입니다(같은 이름 산이 여러 곳이라).");
                    return;
                }
                double lonPad = AROUND_DEG / Math.max(0.2, Math.cos(Math.toRadians(at[1])));
                final String mountain = park;
                collect(c, "SELECT course_id, name, distance_m, ascent_m, min_lon, min_lat, max_lon, max_lat, ST_AsText(path) FROM route_course"
                        + " WHERE name LIKE ? AND kind IN ('hike', 'trek', 'walk')"
                        + " AND max_lat >= ? AND min_lat <= ? AND max_lon >= ? AND min_lon <= ? ORDER BY name LIMIT " + MOUNTAIN_LIMIT * 3,
                        // 이름 어디에 있어도(산림청 코스는 앞에 시 · 군 - "김제 모악산 · …", "논산 대둔산 마천대 · …" - 2026-10-11 PC)
                        new Object[] {"%" + park + "%", at[1] - AROUND_DEG, at[1] + AROUND_DEG, at[0] - lonPad, at[0] + lonPad}, trails, ids, box,
                        nm -> namedFor(nm, mountain));
            }
            if (trails.size() == 0) {
                Json.fail(resp, HttpServletResponse.SC_NOT_FOUND, park + " 코스가 아직 없습니다.");
                return;
            }
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.addProperty("park", park);
            out.addProperty("national", national);
            String map = officialHere ? officialMap(park) : null;
            if (map == null) out.add("map", JsonNull.INSTANCE); else out.addProperty("map", map);
            out.add("trails", trails);
            JsonArray bbox = new JsonArray();
            for (double v : box) bbox.add(CourseQueries.round5(v));
            out.add("bbox", bbox);
            out.add("places", places(c, ids));
            try {
                out.add("spots", Json.rows(c, "SELECT kind, name, info, lat, lon FROM route_park_spot"
                        + " WHERE kind IN ('danger', 'view', 'heli', 'aid', 'ranger') AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                        box[1], box[3], box[0], box[2]));
            } catch (java.sql.SQLException e) {
                out.add("spots", new JsonArray());   // 표 없음
            }
            ResultCache.LISTS.ok(req, resp, key, ver, out);
        } catch (Exception e) {
            log.warn("[PARK] 조회 실패 name={} - {}", park, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "공원 탐방로를 읽지 못했습니다.");
        }
    }

    /** 코스 줄들을 trails · ids 에 담고 범위(box)를 넓힘. 담은 수. */
    private static int collect(Connection c, String sql, Object[] params, JsonArray trails, List<String> ids, double[] box) throws Exception {
        return collect(c, sql, params, trails, ids, box, null);
    }

    /**
     * 순수 함수 - 산 모드에서 쓸 코스 이름인가: 코스 이름의 앞부분(" · " 앞, 노선 이름 · 시 · 군 · 산 이름)에 그 산이 한 낱말로 있을 때만.
     * 끝점 이름에만 든 다른 노선은 뺌(2026-10-11 PC: 마이산에 "금호남정맥 · … → 마이산" 9개, 팔공산에 가산 5, 대둔산에 인대산 4).
     */
    static boolean namedFor(String courseName, String mountain) {
        if (courseName == null) return false;
        String head = courseName.split(" · ", 2)[0];
        for (String w : head.split("\\s+")) {
            if (w.equals(mountain) || w.startsWith(mountain + "(")) return true;
        }
        return false;
    }

    private static int collect(Connection c, String sql, Object[] params, JsonArray trails, List<String> ids, double[] box,
            java.util.function.Predicate<String> keepName) throws Exception {
        int n = 0;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    if (keepName != null && !keepName.test(rs.getString(2))) continue;
                    if (keepName != null && n >= MOUNTAIN_LIMIT) break;
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
                    ids.add(rs.getString(1));
                    n++;
                }
            }
        }
        return n;
    }

    /** 국립공원 탐방로 범위 밖으로 이만큼(도, 약 10km)까지는 그 공원으로 봄. */
    static final double NEAR_PARK_DEG = 0.1;

    /**
     * 공단 2017 탐방로 자료에 없는 국립공원의 가운데 {경도, 위도} - 같은 이름 다른 산에 공식 지도 단추가 나오지 않게(2026-10-11 PC: 진안 팔공산).
     * 팔공산 비로봉 · 태백산 천제단 둘레.
     */
    static final java.util.Map<String, double[]> PARK_CENTER = java.util.Map.of("팔공산", new double[] {128.695, 36.016}, "태백산", new double[] {128.916, 37.096});

    /** 이 반경(도, 약 20km) 안이면 PARK_CENTER 의 공원. */
    static final double PARK_CENTER_DEG = 0.2;

    /** 순수 함수 - {경도, 위도} 가 범위(+pad 도) 안인가. */
    static boolean inside(double[] at, double[] box, double pad) {
        return at[0] >= box[0] - pad && at[0] <= box[2] + pad && at[1] >= box[1] - pad && at[1] <= box[3] + pad;
    }

    /** 순수 함수 - 공단 탐방로가 없는 국립공원의 가운데 둘레인가. */
    static boolean nearCenter(String park, double[] at) {
        double[] c = PARK_CENTER.get(park);
        return c != null && Math.abs(at[0] - c[0]) <= PARK_CENTER_DEG && Math.abs(at[1] - c[1]) <= PARK_CENTER_DEG;
    }

    /** 코스 범위 가운데 {경도, 위도}. 없으면 null. */
    private static double[] center(Connection c, String id) throws Exception {
        try (PreparedStatement ps = c.prepareStatement("SELECT min_lon, min_lat, max_lon, max_lat FROM route_course WHERE course_id = ?")) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next() || rs.getObject(1) == null) return null;
                return new double[] {(rs.getDouble(1) + rs.getDouble(3)) / 2, (rs.getDouble(2) + rs.getDouble(4)) / 2};
            }
        }
    }

    /** 그 코스들의 이름표(같은 이름은 하나, 경로에서 100m 안, PLACE_LIMIT 까지). */
    static JsonArray places(Connection c, List<String> ids) throws Exception {
        JsonArray out = new JsonArray();
        if (ids.isEmpty()) return out;
        Set<String> seen = new HashSet<>();
        String marks = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        try (PreparedStatement ps = c.prepareStatement("SELECT name, lat, lon, ele_m FROM route_course_poi WHERE course_id IN (" + marks + ")"
                + " AND off_route_m <= 100")) {
            for (int i = 0; i < ids.size(); i++) ps.setString(i + 1, ids.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next() && out.size() < PLACE_LIMIT) {
                    String name = rs.getString(1);
                    if (name == null || !seen.add(name.replaceAll("\\s+", ""))) continue;
                    JsonObject o = new JsonObject();
                    o.addProperty("name", name.replaceAll("\\s+", " ").trim());
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
