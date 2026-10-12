package com.gh.routefly.web;

import java.io.IOException;
import java.sql.Connection;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 한 노선 · 길의 코스들. {@code GET /api/group?prefix=osmb-6374513-}
 *
 * <p>2026-10-11 홍TV님: 국토종주 자전거길(노선마다 osmb-<OSM 노선>-n 구간) · 국가숲길(kmf-<숲길>-n 코스)을 묶어 보고 도장 · 완주를 셉니다
 * (series.html). 앞부분은 코스 ID 묶음 규칙(CourseQueries.groupPrefix)과 같은 모양만 받습니다.
 * <pre>{success, prefix, courses:[목록과 같은 칸], centers:[{course_id, name, dist_m, lat, lon}] (osmb- 만), lines:{코스ID:[[경도, 위도]…]} (lines=1)}</pre>
 * 둘레길(두루누비): {@code GET /api/group?trail=해파랑길} - {success, trail, courses, lines}.
 */
@WebServlet(urlPatterns = {"/api/group"})
public class GroupServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(GroupServlet.class);

    /** 한 묶음 코스 수 한도(국가숲길 대관령 16 · 지리산둘레길 21 - 넉넉히). */
    static final int LIMIT = 80;

    /** 한 노선 인증센터 이름표 수 한도(동해안(강원) 12곳 × 구간 양 끝 - 넉넉히). */
    static final int CENTER_LIMIT = 200;

    /** 순수 함수 - 둘레길 이름(trail=해파랑길 · DMZ 평화의 길)을 띄어쓰기 뺀 찾을 말로. 받을 수 없는 이름이면 null. */
    static String trailKey(String t) {
        if (t == null || !t.matches("[가-힣A-Za-z0-9 ]{2,20}")) return null;
        String k = t.replace(" ", "");
        return k.length() >= 2 ? k : null;
    }

    /** 둘레길 한 노선 - 코리아둘레길(두루누비 drnb-)은 코스 ID 에 노선 묶음이 없어 이름으로("해파랑길 1코스 · …"). 노선 안내도용 선도 함께. */
    private void trail(HttpServletRequest req, HttpServletResponse resp, String t) throws IOException {
        String k = trailKey(t);
        if (k == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "trail 은 둘레길 이름입니다(예: 해파랑길).");
            return;
        }
        String key = ResultCache.key("trail", k), ver = ResultCache.LISTS.version();
        if (ResultCache.LISTS.send(req, resp, key, ver)) return;
        String where = " WHERE course_id LIKE 'drnb-%' AND REPLACE(name, ' ', '') LIKE ?";
        try (Connection c = Db.open()) {
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.addProperty("trail", t);
            out.add("courses", Json.rows(c, "SELECT " + CourseQueries.LIST_COLUMNS + " FROM route_course" + where + " ORDER BY name LIMIT " + TRAIL_LIMIT, k + "%"));
            out.add("lines", lines(c, "SELECT p.course_id, p.lon, p.lat, p.dist_m FROM route_course_point p JOIN route_course r ON r.course_id = p.course_id"
                    + " WHERE r.course_id LIKE 'drnb-%' AND REPLACE(r.name, ' ', '') LIKE ? ORDER BY p.course_id, p.seq", k + "%"));
            ResultCache.LISTS.ok(req, resp, key, ver, out);
        } catch (Exception e) {
            log.warn("[GROUP] 둘레길 조회 실패 trail={} - {}", k, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "코스를 읽지 못했습니다.");
        }
    }

    /** 둘레길 한 노선 코스 수 한도(서해랑길 공식 109). */
    static final int TRAIL_LIMIT = 150;

    /** 노선 안내도 선: 구간마다 이만큼(m) 간격으로만 점을 남김(국토종주 낙동강 389km 도 가볍게). */
    static final double LINE_STEP_M = 80;

    /** 구간마다 줄인 선 {코스ID: [[경도, 위도], …]} - 소수 5자리. */
    private static JsonObject lines(Connection c, String sql, String param) throws Exception {
        JsonObject out = new JsonObject();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, param);
            try (ResultSet rs = ps.executeQuery()) {
                String cur = null;
                List<double[]> pts = new ArrayList<>();
                while (rs.next()) {
                    String id = rs.getString(1);
                    if (!id.equals(cur)) {
                        if (cur != null) out.add(cur, toJson(thin(pts, LINE_STEP_M)));
                        cur = id;
                        pts = new ArrayList<>();
                    }
                    pts.add(new double[] {rs.getDouble(2), rs.getDouble(3), rs.getDouble(4)});
                }
                if (cur != null) out.add(cur, toJson(thin(pts, LINE_STEP_M)));
            }
        }
        return out;
    }

    /** 순수 함수 - {경도, 위도, 진행 거리} 점에서 앞 남긴 점보다 stepM 넘게 간 점만(처음 · 끝은 늘). */
    static List<double[]> thin(List<double[]> pts, double stepM) {
        List<double[]> out = new ArrayList<>();
        double last = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < pts.size(); i++) {
            double[] q = pts.get(i);
            if (i == 0 || i == pts.size() - 1 || q[2] - last >= stepM) {
                out.add(q);
                last = q[2];
            }
        }
        return out;
    }

    private static JsonArray toJson(List<double[]> pts) {
        JsonArray a = new JsonArray(pts.size());
        for (double[] q : pts) {
            JsonArray x = new JsonArray(2);
            x.add(CourseQueries.round5(q[0]));
            x.add(CourseQueries.round5(q[1]));
            a.add(x);
        }
        return a;
    }

    /** 순수 함수 - 받을 수 있는 앞부분인가("osmb-6374513-" · "kmf-9900000006-"). */
    static boolean validPrefix(String p) {
        return p != null && p.equals(CourseQueries.groupPrefix(p + "x"));
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String trail = req.getParameter("trail");
        if (trail != null) {
            trail(req, resp, trail);
            return;
        }
        String p = req.getParameter("prefix");
        if (!validPrefix(p)) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "prefix 는 코스 ID 앞부분입니다(예: osmb-6374513-).");
            return;
        }
        boolean lines = "1".equals(req.getParameter("lines"));   // 노선 안내도(route.html) - 구간 선도 함께
        String key = ResultCache.key("group", p + (lines ? "|lines" : "")), ver = ResultCache.LISTS.version();
        if (ResultCache.LISTS.send(req, resp, key, ver)) return;
        try (Connection c = Db.open()) {
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.addProperty("prefix", p);
            out.add("courses", Json.rows(c, "SELECT " + CourseQueries.LIST_COLUMNS + " FROM route_course WHERE course_id LIKE ? ORDER BY CHAR_LENGTH(course_id), course_id LIMIT " + LIMIT,
                    p + "%"));
            // 자전거길: 구간마다 지나는 인증센터(이름표 - 출발 · 구간 안 · 도착, dist_m 은 구간 시작에서 거리) - 센터마다 따라갈 구간을 고름(2026-10-12 PC:
            // 이름만으로 고르면 구간 안 센터가 다음 구간에 붙음 - 낙단보 → 9구간 "상주보 → 섬마을")
            if (p.startsWith("osmb-")) {
                out.add("centers", Json.rows(c, "SELECT course_id, name, dist_m, lat, lon FROM route_course_poi WHERE course_id LIKE ? AND name LIKE ? ORDER BY course_id, seq LIMIT "
                        + CENTER_LIMIT, p + "%", "%인증센터%"));
            }
            if (lines) out.add("lines", lines(c, "SELECT course_id, lon, lat, dist_m FROM route_course_point WHERE course_id LIKE ? ORDER BY course_id, seq", p + "%"));
            ResultCache.LISTS.ok(req, resp, key, ver, out);
        } catch (Exception e) {
            log.warn("[GROUP] 조회 실패 prefix={} - {}", p, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "코스를 읽지 못했습니다.");
        }
    }
}
