package com.gh.routefly.web;

import java.io.IOException;
import java.sql.Connection;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonObject;

/**
 * 한 노선 · 길의 코스들. {@code GET /api/group?prefix=osmb-6374513-}
 *
 * <p>2026-10-11 홍TV님: 국토종주 자전거길(노선마다 osmb-<OSM 노선>-n 구간) · 국가숲길(kmf-<숲길>-n 코스)을 묶어 보고 도장 · 완주를 셉니다
 * (series.html). 앞부분은 코스 ID 묶음 규칙(CourseQueries.groupPrefix)과 같은 모양만 받습니다.
 * <pre>{success, prefix, courses:[목록과 같은 칸], centers:[{course_id, name, dist_m}] (osmb- 만)}</pre>
 */
@WebServlet(urlPatterns = {"/api/group"})
public class GroupServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(GroupServlet.class);

    /** 한 묶음 코스 수 한도(국가숲길 대관령 16 · 지리산둘레길 21 - 넉넉히). */
    static final int LIMIT = 80;

    /** 한 노선 인증센터 이름표 수 한도(동해안(강원) 12곳 × 구간 양 끝 - 넉넉히). */
    static final int CENTER_LIMIT = 200;

    /** 순수 함수 - 받을 수 있는 앞부분인가("osmb-6374513-" · "kmf-9900000006-"). */
    static boolean validPrefix(String p) {
        return p != null && p.equals(CourseQueries.groupPrefix(p + "x"));
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String p = req.getParameter("prefix");
        if (!validPrefix(p)) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "prefix 는 코스 ID 앞부분입니다(예: osmb-6374513-).");
            return;
        }
        String key = ResultCache.key("group", p), ver = ResultCache.LISTS.version();
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
                out.add("centers", Json.rows(c, "SELECT course_id, name, dist_m FROM route_course_poi WHERE course_id LIKE ? AND name LIKE ? ORDER BY course_id, seq LIMIT "
                        + CENTER_LIMIT, p + "%", "%인증센터%"));
            }
            ResultCache.LISTS.ok(req, resp, key, ver, out);
        } catch (Exception e) {
            log.warn("[GROUP] 조회 실패 prefix={} - {}", p, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "코스를 읽지 못했습니다.");
        }
    }
}
