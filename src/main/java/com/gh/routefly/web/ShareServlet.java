package com.gh.routefly.web;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.Locale;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 공유 링크. {@code GET /s/<코스ID>} (산행 화면으로는 {@code /s/<코스ID>?to=hike})
 *
 * <p>카카오톡 · 문자 등에 붙이면 미리 보기 카드(코스 이름 · 거리 · 오르막)가 뜨도록 Open Graph 를 넣은 작은 페이지를
 * 돌려주고, 브라우저는 곧장 지도 화면(index.html#c=…)이나 산행 화면으로 넘어갑니다.
 */
@WebServlet(urlPatterns = {"/s/*"})
public class ShareServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(ShareServlet.class);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo();
        String id = path == null ? null : path.replaceFirst("^/", "");
        boolean hike = "hike".equals(req.getParameter("to"));
        if (!CourseQueries.validId(id)) {
            resp.sendRedirect(req.getContextPath() + "/");
            return;
        }
        String title = "routefly 코스", desc = "3D 지형 위에서 미리 날아 보고, 핸드폰으로 따라 걷는 코스";
        try (Connection c = Db.open()) {
            JsonArray rows = Json.rows(c, "SELECT name, kind, distance_m, ascent_m, ele_max_m FROM route_course WHERE course_id = ?", id);
            if (rows.size() > 0) {
                JsonObject r = rows.get(0).getAsJsonObject();
                title = r.get("name").getAsString();
                desc = describe(r.get("distance_m").getAsInt(), r.get("ascent_m").isJsonNull() ? null : r.get("ascent_m").getAsInt(),
                        r.get("ele_max_m").isJsonNull() ? null : r.get("ele_max_m").getAsDouble());
            }
        } catch (Exception e) {
            log.warn("[SHARE] 조회 실패 id={} - {}", id, e.toString());   // 미리 보기만 못 할 뿐 넘어가기는 됩니다
        }
        String base = req.getScheme() + "://" + req.getServerName()
                + (req.getServerPort() == 80 || req.getServerPort() == 443 ? "" : ":" + req.getServerPort()) + req.getContextPath();
        // nginx 뒤라면 X-Forwarded-Proto/Host 를 따릅니다(https 주소로 카드 이미지가 나오게)
        String fwdHost = req.getHeader("X-Forwarded-Host"), fwdProto = req.getHeader("X-Forwarded-Proto");
        if (fwdHost != null && !fwdHost.isBlank()) {
            base = (fwdProto != null && !fwdProto.isBlank() ? fwdProto : "https") + "://" + fwdHost.trim() + req.getContextPath();
        }
        String target = base + (hike ? "/hike.html#c=" : "/#c=") + id;
        resp.setStatus(HttpServletResponse.SC_OK);
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "public, max-age=300");
        PrintWriter w = resp.getWriter();
        w.print(page(title, desc, base + "/s/" + id, base + "/img/og.png", target));
    }

    /** 순수 함수 - "5.81km · 오르막 1,460m · 최고 1,700m · 3D 미리 보기". */
    static String describe(int distanceM, Integer ascentM, Double eleMaxM) {
        StringBuilder sb = new StringBuilder(String.format(Locale.ROOT, "%.2fkm", distanceM / 1000.0));
        if (ascentM != null) sb.append(String.format(Locale.KOREA, " · 오르막 %,dm", ascentM));
        if (eleMaxM != null) sb.append(String.format(Locale.KOREA, " · 최고 %,dm", Math.round(eleMaxM)));
        return sb.append(" · 3D 로 미리 날아 보고 핸드폰으로 따라 걷기").toString();
    }

    /** 순수 함수 - 미리 보기 카드 + 곧장 넘어가는 페이지. */
    static String page(String title, String desc, String url, String image, String target) {
        String t = esc(title), d = esc(desc), u = esc(url), i = esc(image), g = esc(target);
        return "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<title>" + t + " - routefly</title>"
                + "<meta name=\"description\" content=\"" + d + "\">"
                + "<meta property=\"og:type\" content=\"website\"><meta property=\"og:site_name\" content=\"routefly\">"
                + "<meta property=\"og:title\" content=\"" + t + "\"><meta property=\"og:description\" content=\"" + d + "\">"
                + "<meta property=\"og:url\" content=\"" + u + "\"><meta property=\"og:image\" content=\"" + i + "\">"
                + "<meta property=\"og:image:width\" content=\"1200\"><meta property=\"og:image:height\" content=\"630\">"
                + "<meta name=\"twitter:card\" content=\"summary_large_image\">"
                + "<meta http-equiv=\"refresh\" content=\"0;url=" + g + "\">"
                + "</head><body style=\"background:#11161d;color:#eee;font-family:sans-serif\">"
                + "<p><a style=\"color:#38d9ea\" href=\"" + g + "\">" + t + " 열기</a></p>"
                + "<script>location.replace(" + jsString(target) + ");</script></body></html>";
    }

    static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    static String jsString(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') sb.append('\\').append(ch);
            else if (ch == '<') sb.append("\\u003c");
            else if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
            else sb.append(ch);
        }
        return sb.append('"').toString();
    }
}
