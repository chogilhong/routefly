package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * 검색 엔진용 {@code /sitemap.xml} · {@code /robots.txt} (2026-10-14 홍TV님 - 산 소개 페이지가 검색에 잡히게).
 * 운영 서버는 앱이 /routefly 아래라 Nginx 에서 /robots.txt · /sitemap.xml 을 이리로 넘깁니다(docs/deploy-lightsail.md).
 */
@WebServlet(urlPatterns = {"/sitemap.xml", "/robots.txt"})
public class SitemapServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(SitemapServlet.class);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String base = ShareServlet.baseUrl(RouteflyConfig.get("site.baseUrl"), req.getScheme(), req.getServerName(), req.getServerPort(),
                req.getContextPath(), req.getHeader("X-Forwarded-Proto"));
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "public, max-age=3600");
        if ("/robots.txt".equals(req.getServletPath())) {
            resp.setContentType("text/plain");
            resp.getWriter().print(robots(base));
            return;
        }
        JsonArray peaks = CoursePageServlet.readPeaks(getServletContext());   // 못 읽으면 빈 것 - 산 목록 없이 기본 화면만
        List<String> names = new ArrayList<>();
        for (JsonElement p : peaks) {
            JsonObject o = p.getAsJsonObject();
            if (o.has("id") && !o.get("id").isJsonNull()) names.add(o.get("id").getAsString());   // 지역 붙은 id(백운산(광양))
        }
        List<String[]> courses = courses(peaks);
        if (courses == null) resp.setHeader("Cache-Control", "no-store");   // DB 가 안 되면 코스 없이 - 담아 두지 않음
        resp.setContentType("application/xml");
        resp.getWriter().print(sitemap(base, names, courses == null ? List.of() : courses));
    }

    /** 검색에 내는 코스 [코스 ID, 넣은 날 YYYY-MM-DD] - 1시간 담아 둠(2만여 줄을 읽고 산마다 거리를 셈). */
    private static final long COURSES_TTL_MS = 60 * 60 * 1000;
    private static volatile Object[] cached;   // [시각, List<String[]>]

    @SuppressWarnings("unchecked")
    private List<String[]> courses(JsonArray peaks) {
        Object[] c = cached;
        if (c != null && System.currentTimeMillis() - (Long) c[0] < COURSES_TTL_MS) return (List<String[]>) c[1];
        JsonObject parks = CoursePageServlet.readParks(getServletContext());
        List<String[]> out = new ArrayList<>();
        try (Connection con = Db.open()) {
            for (JsonElement e : Json.rows(con, "SELECT course_id, name, kind, start_lat, start_lon, end_lat, end_lon, DATE_FORMAT(imported_at, '%Y-%m-%d') AS d FROM route_course ORDER BY course_id")) {
                JsonObject r = e.getAsJsonObject();
                String id = r.get("course_id").getAsString();
                if (CoursePageServlet.indexable(id, r.get("name").getAsString(), r.get("kind").getAsString(), CoursePageServlet.peakOf(peaks, r), parks))
                    out.add(new String[] {id, r.get("d").isJsonNull() ? null : r.get("d").getAsString()});
            }
        } catch (Exception e) {
            log.warn("[SITEMAP] 코스 조회 실패 - {}", e.toString());
            return null;
        }
        cached = new Object[] {System.currentTimeMillis(), out};
        return out;
    }

    /**
     * 다음(Daum) 웹마스터도구 소유 확인 줄 - robots.txt 맨 아래(2026-10-19 홍TV님 발급). 누구나 robots.txt 로 보는 값이라 비밀값이 아님.
     * 네이버(HTML 파일) · 구글(DNS TXT) · 빙(구글에서 가져오기)은 다른 방식 - docs/deploy-lightsail.md 6-3.
     */
    static final String DAUM_PIN = "#DaumWebMasterTool:e657a6d3b5a3bc76c259c18ecd78af8ae7d569dcaca333f0644af9989bc4ec56:1T0ZRs6bn/unEVfM5aXupg==";

    /** 순수 함수 - robots.txt(API 는 빼고, 사이트맵 주소, 다음 확인 줄). */
    static String robots(String base) {
        String path = base.replaceFirst("^https?://[^/]+", "");
        return "User-agent: *\nDisallow: " + path + "/api/\nAllow: /\nSitemap: " + base + "/sitemap.xml\n\n" + DAUM_PIN + "\n";
    }

    /** 순수 함수 - 사이트맵(첫 화면 · 안내 · 100대 명산 목록 · 산마다, 영어 산 페이지도, 검색에 내는 코스 [ID, 넣은 날]). */
    static String sitemap(String base, List<String> mountains, List<String[]> courses) {
        StringBuilder b = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        for (String p : new String[] {"/", "/hike.html", "/series.html", "/about.html", "/privacy.html", "/m/", "/en/m/"}) url(b, base + p);
        for (String m : mountains) url(b, base + "/m/" + URLEncoder.encode(m, StandardCharsets.UTF_8).replace("+", "%20"));
        for (String m : mountains) url(b, base + "/en/m/" + Roman.slug(m));   // 영어 산 페이지(2026-10-15)
        for (String[] c : courses) {   // 코스 소개 페이지(2026-10-19 CoursePageServlet) - 넣은 날을 lastmod 로
            b.append("  <url><loc>").append(ShareServlet.esc(base + "/c/" + c[0])).append("</loc>");
            if (c[1] != null) b.append("<lastmod>").append(c[1]).append("</lastmod>");
            b.append("</url>\n");
        }
        return b.append("</urlset>\n").toString();
    }

    private static void url(StringBuilder b, String loc) {
        b.append("  <url><loc>").append(ShareServlet.esc(loc)).append("</loc></url>\n");
    }
}
