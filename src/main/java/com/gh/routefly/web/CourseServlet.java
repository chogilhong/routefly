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
 * 코스 하나. {@code GET /api/course?id=seorak-dinosaur-ridge}
 *
 * <p>요약 + 경로 점(경로 애니메이션 · 고도 그래프용) + 이름표. 모양은 {@link CourseQueries#detail}.
 */
@WebServlet(urlPatterns = {"/api/course"})
public class CourseServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(CourseServlet.class);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String id = req.getParameter("id");
        if (!CourseQueries.validId(id)) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "id 는 코스 ID 입니다(영문 소문자 · 숫자 · - · _).");
            return;
        }
        try (Connection c = Db.open()) {
            JsonObject detail = CourseQueries.detail(c, id);
            if (detail == null) {
                Json.fail(resp, HttpServletResponse.SC_NOT_FOUND, "코스가 없습니다: " + id);
                return;
            }
            detail.addProperty("success", true);
            Json.write(resp, HttpServletResponse.SC_OK, detail, true);
        } catch (Exception e) {
            log.warn("[COURSE] 조회 실패 id={} - {}", id, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                    "코스를 읽지 못했습니다. DB 접속 설정(db.url 등)과 표(routefly-batch sql/route_ddl.sql)를 확인하세요.");
        }
    }
}
