package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 검색 엔진용 {@code /sitemap.xml} · {@code /robots.txt} (2026-10-14 홍TV님 - 산 소개 페이지가 검색에 잡히게).
 * 운영 서버는 앱이 /routefly 아래라 Nginx 에서 /robots.txt · /sitemap.xml 을 이리로 넘깁니다(docs/deploy-lightsail.md).
 */
@WebServlet(urlPatterns = {"/sitemap.xml", "/robots.txt"})
public class SitemapServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

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
        List<String> names = new ArrayList<>();
        try (InputStream in = getServletContext().getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            if (e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks")) {
                for (JsonElement p : e.getAsJsonObject().getAsJsonArray("peaks")) {
                    JsonObject o = p.getAsJsonObject();
                    if (o.has("name") && !o.get("name").isJsonNull()) names.add(o.get("name").getAsString());
                }
            }
        } catch (Exception e) {
            // 산 목록 없이 기본 화면만
        }
        resp.setContentType("application/xml");
        resp.getWriter().print(sitemap(base, names));
    }

    /** 순수 함수 - robots.txt(API 는 빼고, 사이트맵 주소). */
    static String robots(String base) {
        String path = base.replaceFirst("^https?://[^/]+", "");
        return "User-agent: *\nDisallow: " + path + "/api/\nAllow: /\nSitemap: " + base + "/sitemap.xml\n";
    }

    /** 순수 함수 - 사이트맵(첫 화면 · 안내 · 100대 명산 목록 · 산마다). */
    static String sitemap(String base, List<String> mountains) {
        StringBuilder b = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        for (String p : new String[] {"/", "/hike.html", "/series.html", "/about.html", "/privacy.html", "/m/"}) url(b, base + p);
        for (String m : mountains) url(b, base + "/m/" + URLEncoder.encode(m, StandardCharsets.UTF_8).replace("+", "%20"));
        return b.append("</urlset>\n").toString();
    }

    private static void url(StringBuilder b, String loc) {
        b.append("  <url><loc>").append(ShareServlet.esc(loc)).append("</loc></url>\n");
    }
}
