package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 높이 점검(2026-10-16 홍TV님 - "높이를 전체적으로 재점검"). {@code GET /check/heights?key=…} - 운영 통계와 같은 열쇠(stats.key), 아니면 404.
 *
 * <p>100대 명산마다 한 줄: 공식 높이(data/peak-elev.json - 산림청) · GPS 높이(mountains100.json height) ·
 * 정상에서 가장 가까운 코스 점의 높이(DB route_course_point - 배치의 지형 자료 dem 또는 GPX 의 gpx) · 정상 300m 안 지점(이름표) 높이.
 * 공식 높이와 30m 넘게 다르면 칠함. 화면이 어떤 높이를 쓰는지(공식으로 바꾸는 곳 · 그대로 두는 곳)도 함께 적음. DB 는 읽기만, 10분 담아 둠.</p>
 */
@WebServlet(urlPatterns = {"/check/heights"})
public class HeightCheckServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    /** 정상 둘레 이 안의 코스 · 지점을 봄(m). */
    static final double NEAR_M = 300;
    /** 공식 높이와 이만큼 넘게 다르면 칠함(m). */
    static final double WARN_M = 30;

    private volatile String cached;
    private volatile long cachedAt;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!StatsServlet.allowed(RouteflyConfig.get("stats.key"), req.getParameter("key"))) {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        resp.setHeader("X-Robots-Tag", "noindex");
        String html = cached;
        if (html == null || System.currentTimeMillis() - cachedAt > 10 * 60 * 1000) {
            List<Row> rows = new ArrayList<>();
            JsonArray peaks = peaks();
            try (Connection c = Db.open()) {
                for (JsonElement e : peaks) rows.add(row(c, e.getAsJsonObject()));
            } catch (Exception e) {
                resp.getWriter().print("<p>DB 를 읽지 못했습니다 - " + ShareServlet.esc(e.getClass().getSimpleName()) + "</p>");
                return;
            }
            html = page(rows);
            cached = html;
            cachedAt = System.currentTimeMillis();
        }
        resp.getWriter().print(html);
    }

    /** 산 한 줄. */
    static final class Row {
        String id, summit;
        Integer official, gps;
        Double courseEle, courseGap;
        String courseId, courseSrc;
        int courses;
        final List<String> pois = new ArrayList<>();
        Integer poiWorst;   // 정상 근처 지점 가운데 공식과 가장 많이 다른 값(바꾸기 전 DB 값)
    }

    private JsonArray peaks() {
        JsonArray p = new JsonArray();
        try (InputStream in = getServletContext().getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            if (e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks")) p = e.getAsJsonObject().getAsJsonArray("peaks");
        } catch (Exception e) {
            // 빈 표
        }
        MountainServlet.withElev(p, MountainServlet.readElev(getServletContext()));
        return p;
    }

    private static Row row(Connection c, JsonObject peak) throws Exception {
        Row r = new Row();
        r.id = MountainEn.id(peak);
        r.summit = peak.has("summit") && !peak.get("summit").isJsonNull() ? peak.get("summit").getAsString() : null;
        r.official = MountainServlet.elev(peak);
        r.gps = peak.has("height") && !peak.get("height").isJsonNull() ? peak.get("height").getAsInt() : null;
        double lat = peak.get("lat").getAsDouble(), lon = peak.get("lon").getAsDouble(), dLat = 0.003, dLon = 0.003 / Math.cos(Math.toRadians(lat));
        JsonArray list = CourseQueries.list(c, new double[] {lon - dLon, lat - dLat, lon + dLon, lat + dLat}, null, null);
        List<String> ids = new ArrayList<>();
        for (JsonElement e : list) if (ids.size() < 30) ids.add(e.getAsJsonObject().get("course_id").getAsString());
        r.courses = ids.size();
        if (ids.isEmpty()) return r;
        String in = String.join(",", Collections.nCopies(ids.size(), "?"));
        double best = NEAR_M;
        try (PreparedStatement ps = c.prepareStatement("SELECT p.course_id, p.lat, p.lon, p.ele_m, r.ele_source FROM route_course_point p JOIN route_course r ON r.course_id = p.course_id"
                + " WHERE p.course_id IN (" + in + ") AND p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?")) {
            int i = 1;
            for (String id : ids) ps.setString(i++, id);
            ps.setDouble(i++, lat - dLat);
            ps.setDouble(i++, lat + dLat);
            ps.setDouble(i++, lon - dLon);
            ps.setDouble(i, lon + dLon);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double ele = rs.getDouble(4);
                    if (rs.wasNull()) continue;
                    double d = MountainServlet.distM(lat, lon, rs.getDouble(2), rs.getDouble(3));
                    if (d < best) {
                        best = d;
                        r.courseEle = ele;
                        r.courseGap = d;
                        r.courseId = rs.getString(1);
                        r.courseSrc = rs.getString(5);
                    }
                }
            }
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT DISTINCT name, ele_m, lat, lon FROM route_course_poi WHERE course_id IN (" + in + ") AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?")) {
            int i = 1;
            for (String id : ids) ps.setString(i++, id);
            ps.setDouble(i++, lat - dLat);
            ps.setDouble(i++, lat + dLat);
            ps.setDouble(i++, lon - dLon);
            ps.setDouble(i, lon + dLon);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double d = MountainServlet.distM(lat, lon, rs.getDouble(3), rs.getDouble(4));
                    if (d > NEAR_M) continue;
                    double ele = rs.getDouble(2);
                    boolean none = rs.wasNull();
                    String t = rs.getString(1) + " " + (none ? "-" : Math.round(ele) + "m") + " (" + Math.round(d) + "m)";
                    if (r.pois.size() < 6 && !r.pois.contains(t)) r.pois.add(t);
                    if (!none && r.official != null && (r.poiWorst == null || Math.abs(ele - r.official) > Math.abs(r.poiWorst - r.official))) r.poiWorst = (int) Math.round(ele);
                }
            }
        }
        return r;
    }

    /** 순수 함수 - 점검 화면. */
    static String page(List<Row> rows) {
        int noOfficial = 0, courseWarn = 0, gpsWarn = 0, noCourse = 0;
        StringBuilder t = new StringBuilder();
        for (Row r : rows) {
            if (r.official == null) noOfficial++;
            if (r.courseEle == null) noCourse++;
            boolean cw = r.official != null && r.courseEle != null && Math.abs(r.courseEle - r.official) > WARN_M;
            boolean gw = r.official != null && r.gps != null && Math.abs(r.gps - r.official) > WARN_M;
            if (cw) courseWarn++;
            if (gw) gpsWarn++;
            t.append("<tr><td>").append(ShareServlet.esc(r.id)).append(r.summit != null ? "<br><small>" + ShareServlet.esc(r.summit) + "</small>" : "").append("</td><td>")
                    .append(r.official != null ? String.format(Locale.KOREA, "%,d", r.official) : "<b class=\"bad\">없음</b>").append("</td><td").append(gw ? " class=\"bad\"" : "").append(">")
                    .append(r.gps != null ? r.gps + diff(r.gps, r.official) : "-").append("</td><td").append(cw ? " class=\"bad\"" : "").append(">")
                    .append(r.courseEle != null ? Math.round(r.courseEle) + diff(r.courseEle, r.official) + "<br><small>" + ShareServlet.esc(r.courseSrc) + " · " + Math.round(r.courseGap) + "m · "
                            + ShareServlet.esc(r.courseId) + "</small>" : "코스 없음").append("</td><td>").append(r.courses).append("</td><td><small>")
                    .append(ShareServlet.esc(String.join(" / ", r.pois))).append("</small></td></tr>");
        }
        return "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<meta name=\"robots\" content=\"noindex\"><title>높이 점검 - routefly</title><link rel=\"stylesheet\" href=\"../css/mountain.css\">"
                + "<style>.st td,.st th{font-size:12.5px;vertical-align:top}.bad{color:#ff8a8a;font-weight:bold}</style></head><body><main><h1>높이 점검</h1>"
                + "<p class=\"lead\">100대 명산 " + rows.size() + "곳 · 공식 높이 없음 " + noOfficial + " · 코스 높이가 공식과 " + (int) WARN_M + "m 넘게 다름 " + courseWarn
                + " · GPS 높이가 " + (int) WARN_M + "m 넘게 다름 " + gpsWarn + " · 정상 " + (int) NEAR_M + "m 안 코스 없음 " + noCourse + "</p>"
                + "<section><h2>화면이 쓰는 높이</h2><ul class=\"tips\">"
                + "<li>산 페이지 머리글 · 문답 · 공유 그림 · 영어 페이지 · 검색 정보 - <b>공식 높이</b>(산림청, data/peak-elev.json)만</li>"
                + "<li>정상 " + (int) Peaks.POI_M + "m 안 지점 이름표 · 음성 \"해발\" · 정상을 지나는 코스의 \"최고\" - 공식 높이로 바꿔 보냄(Peaks, 지형과 " + (int) Peaks.MAX_DIFF_M + "m 넘게 다르면 그대로)</li>"
                + "<li>그 밖의 지점(대피소 · 봉우리 · 갈림길) 높이, 코스 \"최고\"(정상을 안 지나면), 고도 그래프 · 📋 안내판 · 경사 · 오르막 - 코스 자료 그대로"
                + "(배치: AWS Terrain Tiles 지형 자료 dem, 일부는 GPX 의 GPS 높이 gpx)</li>"
                + "<li>따라가기 · 3D 의 \"고도\"(지금 자리) - 코스 자료의 그 자리 높이</li>"
                + "<li>GPS 높이(mountains100.json height) - 정상 도장 자리 맞추기에만, 화면에는 안 씀</li></ul></section>"
                + "<section><h2>산마다</h2><table class=\"st\"><tr><th>산 · 정상</th><th>공식</th><th>GPS(차이)</th><th>가까운 코스 점(차이)<br><small>출처 · 정상까지 · 코스</small></th>"
                + "<th>코스 수</th><th>정상 " + (int) NEAR_M + "m 안 지점(바꾸기 전 DB 값)</th></tr>" + t + "</table></section>"
                + "<p class=\"dim\">빨간 칸 = 공식 높이와 " + (int) WARN_M + "m 넘게 다름. 코스 점은 솎아져 있어 정상에서 떨어진 점은 정상보다 낮은 것이 정상입니다(정상까지 거리를 함께 보세요).</p>"
                + "</main></body></html>";
    }

    private static String diff(double v, Integer official) {
        if (official == null) return "";
        long d = Math.round(v - official);
        return " <small>(" + (d > 0 ? "+" : "") + d + ")</small>";
    }
}
