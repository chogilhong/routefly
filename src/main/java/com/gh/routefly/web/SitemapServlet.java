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
        // 만든 글을 코스 목록과 함께 담아 둠(점검 11차 B6 - 요청마다 산 200 · 코스 수천 줄을 새로 이어 붙였음)
        Object[] pg = page, cs = cached;
        String xml;
        if (courses != null && pg != null && cs != null && pg[0] == cs[0] && base.equals(pg[1])) xml = (String) pg[2];
        else {
            xml = sitemap(base, names, courses == null ? List.of() : courses);
            if (courses != null && cs != null) page = new Object[] {cs[0], base, xml};
        }
        resp.getWriter().print(xml);
    }

    /** 검색에 내는 코스 [코스 ID, 넣은 날 YYYY-MM-DD] - 1시간 담아 둠(2만여 줄을 읽고 산마다 거리를 셈). */
    private static final long COURSES_TTL_MS = 60 * 60 * 1000;
    private static volatile Object[] cached;   // [시각, List<String[]>]
    private static volatile Object[] page;     // [cached 의 시각(같은 Long), base, 만든 xml]
    private static volatile long failedAt;     // DB 조회가 실패한 때 - 1분 동안 다시 묻지 않음(점검 11차 B6)

    /** 한 번에 하나만 DB 를 읽음(시간이 지난 순간 여러 요청이 함께 2만여 줄을 읽지 않게, 점검 11차 B6). */
    @SuppressWarnings("unchecked")
    private synchronized List<String[]> courses(JsonArray peaks) {
        Object[] c = cached;
        if (c != null && System.currentTimeMillis() - (Long) c[0] < COURSES_TTL_MS) return (List<String[]>) c[1];
        if (System.currentTimeMillis() - failedAt < 60_000L) return null;
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
            failedAt = System.currentTimeMillis();
            return null;
        }
        cached = new Object[] {Long.valueOf(System.currentTimeMillis()), out};
        return out;
    }

    /**
     * 다음(Daum) 웹마스터도구 소유 확인 줄 - robots.txt 맨 아래(2026-10-19 홍TV님 발급). 누구나 robots.txt 로 보는 값이라 비밀값이 아님.
     * 네이버(HTML 파일) · 구글(DNS TXT) · 빙(구글에서 가져오기)은 다른 방식 - docs/deploy-lightsail.md 6-3.
     */
    static final String DAUM_PIN = "#DaumWebMasterTool:e657a6d3b5a3bc76c259c18ecd78af8ae7d569dcaca333f0644af9989bc4ec56:1T0ZRs6bn/unEVfM5aXupg==";

    /**
     * 막는 로봇(robots.txt 를 지키는 것만 - 지키지 않으면 nginx). AhrefsBot - SEO 분석 업체 수집기, 2026-11-21 새벽부터 코스 페이지(/c/)를
     * 1,800곳에 1 ~ 2화면씩 나눠 하루 3천 번 가까이 긁음(/stats 로봇 브라우저 글로 이름 확인) - 검색 노출과 상관없고 DB 만 읽음 → 홍TV님 "막아".
     * SERankingBacklinksBot - SE Ranking(SEO 업체) 백링크 수집기, 2026-11-21 23:04 ~ 23:20 코스 모음(/m/)만 119번(한 곳) → 홍TV님 "막아".
     */
    static final List<String> BLOCKED_BOTS = List.of("AhrefsBot", "SERankingBacklinksBot");

    /** 순수 함수 - robots.txt(막는 로봇은 전부, 그 밖은 API 만 빼고, 사이트맵 주소, 다음 확인 줄). */
    static String robots(String base) {
        String path = base.replaceFirst("^https?://[^/]+", "");
        StringBuilder blocked = new StringBuilder();
        for (String bot : BLOCKED_BOTS) blocked.append("User-agent: ").append(bot).append("\nDisallow: /\n\n");
        return blocked + "User-agent: *\nDisallow: " + path + "/api/\nAllow: /\nSitemap: " + base + "/sitemap.xml\n\n" + DAUM_PIN + "\n";
    }

    /**
     * 산 · 코스 페이지 모양(서버가 그리는 글)을 마지막으로 바꾼 날 - 사이트맵 lastmod 는 이 날과 코스를 넣은 날 가운데 늦은 날.
     * 페이지 글을 크게 바꾸면 올림(2026-11-04 홍TV님: 예상 시간을 공단 기준으로 · 공식 시간 · 숙소 찾기 칸 - 구글이 10-14 의 옛 "341m · 341m · 약 56분" 을 보여 줬음).
     */
    static final String PAGE_CHANGED = "2026-11-04";

    /** 순수 함수 - 사이트맵(첫 화면 · 안내 · 도구 · 게임 · 안부(2026-11-01) · 100대 명산 목록 · 산마다, 영어 산 페이지도, 검색에 내는 코스 [ID, 넣은 날]). */
    static String sitemap(String base, List<String> mountains, List<String[]> courses) {
        StringBuilder b = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n");
        // 2026-11-07 애드센스 "가치가 별로 없는 콘텐츠": 내용이 화면 스크립트로만 생기는 도장(series) · 게임 · 안부는 빼고(noindex), 첫 주소는 코스 모음(m/)으로 넘기기만 해 뺌
        for (String p : new String[] {"/hike.html", "/tools.html", "/about.html", "/about-en.html", "/terms.html", "/privacy.html", "/lbs-terms.html", "/terms-en.html", "/privacy-en.html", "/lbs-terms-en.html", "/m/", "/en/m/",
            "/tidefly.html", "/dronefly.html",
            "/series.html", "/games.html", "/anbu.html"}) url(b, base + p);
        for (String q : DroneQuizServlet.IDS) url(b, base + "/drone-quiz/" + q);   // 드론 필기 문항 - 묶음마다 한 페이지(2026-11-18 홍TV님 "드론 문제들도 모두 sitemap 에 등록해줘")   // 2026-11-18 홍TV님 "도장 · 게임 · 안부 도 넣어줘" - 11-07 애드센스로 뺐던 것을 되돌림   // 2026-11-18 홍TV님 "새로 만든 것도 넣었어?" - 바다낚시 · 드론(noindex 풀고 넣음)
        // 한국어 · 영어 산 페이지는 서로 짝(hreflang)으로 - 페이지 머리의 짝과 같음, 검색 엔진이 100쌍을 빨리 묶게(2026-10-29 점검)
        for (String m : mountains) {
            String ko = base + "/m/" + URLEncoder.encode(m, StandardCharsets.UTF_8).replace("+", "%20"), en = base + "/en/m/" + Roman.slug(m);
            pair(b, ko, ko, en);
            pair(b, en, ko, en);
        }
        for (String[] c : courses) {   // 코스 소개 페이지(2026-10-19 CoursePageServlet) - 넣은 날 · 페이지를 바꾼 날 가운데 늦은 날을 lastmod 로
            b.append("  <url><loc>").append(ShareServlet.esc(base + "/c/" + c[0])).append("</loc>");
            b.append("<lastmod>").append(c[1] != null && c[1].compareTo(PAGE_CHANGED) > 0 ? c[1] : PAGE_CHANGED).append("</lastmod>");
            b.append("</url>\n");
        }
        return b.append("</urlset>\n").toString();
    }

    private static void pair(StringBuilder b, String loc, String ko, String en) {
        b.append("  <url><loc>").append(ShareServlet.esc(loc)).append("</loc><lastmod>").append(PAGE_CHANGED).append("</lastmod>")   // 산 페이지도 페이지를 바꾼 날
                .append("<xhtml:link rel=\"alternate\" hreflang=\"ko\" href=\"").append(ShareServlet.esc(ko)).append("\"/>")
                .append("<xhtml:link rel=\"alternate\" hreflang=\"en\" href=\"").append(ShareServlet.esc(en)).append("\"/>")
                .append("<xhtml:link rel=\"alternate\" hreflang=\"x-default\" href=\"").append(ShareServlet.esc(ko)).append("\"/></url>\n");
    }

    private static void url(StringBuilder b, String loc) {
        b.append("  <url><loc>").append(ShareServlet.esc(loc)).append("</loc></url>\n");
    }
}
