package com.gh.routefly.web;

import java.io.IOException;
import java.sql.Connection;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 코스 목록. {@code GET /api/courses[?bbox=minLon,minLat,maxLon,maxLat][&kind=hike]}
 *
 * <p>bbox 를 주면 그 화면 범위에 걸치는 코스만(공간 인덱스), 없으면 전부(최대 {@value CourseQueries#LIST_LIMIT}개).
 * 경로 점은 빼고 요약만 보냅니다 - 코스를 고르면 화면이 {@code /api/course} 로 한 코스를 받습니다.
 */
@WebServlet(urlPatterns = {"/api/courses"})
public class CoursesServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(CoursesServlet.class);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] bbox;
        String kind;
        try {
            bbox = CourseQueries.parseBbox(req.getParameter("bbox"));
            kind = CourseQueries.parseKind(req.getParameter("kind"));
        } catch (IllegalArgumentException e) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
            return;
        }
        try (Connection c = Db.open()) {
            JsonArray courses = CourseQueries.list(c, bbox, kind);
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.add("courses", courses);
            out.addProperty("truncated", courses.size() >= CourseQueries.LIST_LIMIT);
            Json.write(resp, HttpServletResponse.SC_OK, out, true);
        } catch (Exception e) {
            log.warn("[COURSES] 조회 실패 - {}", e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                    "코스를 읽지 못했습니다. DB 접속 설정(db.url 등)과 표(routefly-batch sql/route_ddl.sql)를 확인하세요.");
        }
    }
}
