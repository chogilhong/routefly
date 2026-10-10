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
            // 2026-10-10 점검: 넣은 시각(배치가 코스를 다시 만들 때만 바뀜)으로 먼저 ETag 를 정해, 바뀌지 않았으면 점 수천 개를 읽기 전에 304
            JsonArray at = Json.rows(c, "SELECT imported_at FROM route_course WHERE course_id = ?", id);
            String tag = at.size() == 0 ? null : versionTag(id, at.get(0).getAsJsonObject().get("imported_at").toString());
            if (tag != null && Json.notModified(req, resp, tag)) return;
            JsonObject detail = CourseQueries.detail(c, id);
            if (detail == null) {
                // 배치를 다시 돌려 번호가 바뀐 예전 링크 · 기록일 수 있어 같은 산 코스를 함께 줍니다(화면이 골라 보여 줌)
                JsonObject out = new JsonObject();
                out.addProperty("success", false);
                out.addProperty("message", "코스가 없습니다: " + id);
                out.add("similar", CourseQueries.sameGroup(c, id));
                Json.write(resp, HttpServletResponse.SC_NOT_FOUND, out, false);
                return;
            }
            detail.addProperty("success", true);
            if (tag == null) Json.ok(req, resp, detail);
            else Json.send(resp, detail.toString());
        } catch (Exception e) {
            log.warn("[COURSE] 조회 실패 id={} - {} (DB 접속 설정 db.url 등 · 표 routefly-batch sql/route_ddl.sql 확인)", id, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                    "코스를 읽지 못했습니다. 잠시 뒤 다시 해 주세요.");
        }
    }

    /** 웹앱이 올라온 시각 - 새로 배포하면(응답 모양이 바뀌었을 수 있음) ETag 가 모두 바뀝니다. */
    private static final long STARTED = System.currentTimeMillis();

    /** 순수 함수 - 코스 하나의 ETag(코스 ID · 넣은 시각 · 배포 시각). */
    static String versionTag(String id, String importedAt) {
        return Json.etag(id + "\n" + importedAt + "\n" + STARTED);
    }
}
