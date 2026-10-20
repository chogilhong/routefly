package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
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
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

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
        boolean failed = false;
        try (Connection c = Db.open()) {
            JsonArray rows = Json.rows(c, "SELECT name, kind, distance_m, ascent_m, ele_max_m FROM route_course WHERE course_id = ?", id);
            if (rows.size() > 0) {
                JsonObject r = rows.get(0).getAsJsonObject();
                title = noteName(notes(), id, r.get("name").getAsString());   // 앱과 같은 이름(park-notes 로 바로잡은 탐방로 · 산마다 다른 지명)
                desc = describe(r.get("distance_m").getAsInt(), r.get("ascent_m").isJsonNull() ? null : r.get("ascent_m").getAsInt(),
                        r.get("ele_max_m").isJsonNull() ? null : r.get("ele_max_m").getAsDouble());
            }
        } catch (Exception e) {
            failed = true;
            log.warn("[SHARE] 조회 실패 id={} - {}", id, e.toString());   // 미리 보기만 못 할 뿐 넘어가기는 됩니다
        }
        String base = baseUrl(RouteflyConfig.get("site.baseUrl"), req.getScheme(), req.getServerName(), req.getServerPort(),
                req.getContextPath(), req.getHeader("X-Forwarded-Proto"));
        String target = base + (hike ? "/hike.html#c=" : "/index.html#c=") + id;   // 예전 3D 공유 링크도 3D 화면으로 바로(첫 주소는 이제 따라가기)
        resp.setStatus(HttpServletResponse.SC_OK);
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", failed ? "no-store" : "public, max-age=300");   // DB 실패 때의 빈 미리 보기는 캐시하지 않음
        PrintWriter w = resp.getWriter();
        w.print(page(title, desc, base + "/s/" + id, base + "/c/" + id, base + "/img/og.png?v=2", target));   // canonical - 검색에는 코스 소개 페이지(2026-10-19)   // v=2: 새 로고(2026-10-14) - 카카오톡 등이 예전 그림을 담아 둔 것을 피함
    }

    /** 순수 함수 - "5.81km · 오르막 1,460m · 최고 1,700m · 3D 미리 보기". */
    static String describe(int distanceM, Integer ascentM, Double eleMaxM) {
        StringBuilder sb = new StringBuilder(String.format(Locale.ROOT, "%.2fkm", distanceM / 1000.0));
        if (ascentM != null) sb.append(String.format(Locale.KOREA, " · 오르막 %,dm", ascentM));
        if (eleMaxM != null) sb.append(String.format(Locale.KOREA, " · 최고 %,dm", Math.round(eleMaxM)));
        return sb.append(" · 3D 로 미리 날아 보고 핸드폰으로 따라 걷기").toString();
    }

    /** 순수 함수 - 미리 보기 카드 + 곧장 넘어가는 페이지. canonical - 검색 사이트가 이 주소 대신 볼 코스 소개 페이지(/c/). */
    static String page(String title, String desc, String url, String canonical, String image, String target) {
        String t = esc(title), d = esc(desc), u = esc(url), i = esc(image), g = esc(target);
        return "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<title>" + t + " - routefly</title>"
                + MountainServlet.icons("..")
                + "<meta name=\"description\" content=\"" + d + "\"><link rel=\"canonical\" href=\"" + esc(canonical) + "\">"
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

    /**
     * 순수 함수 - 이 사이트 주소(공유 카드 · 넘어갈 주소). 설정 site.baseUrl 이 있으면 그것.
     * 없으면 요청의 Host 로 만들되 X-Forwarded-Host 는 믿지 않습니다(2026-10-09 보안 - 누가 꾸민 머리글로 만든 페이지가
     * Cloudflare 등에 5분 캐시돼 다른 사람이 엉뚱한 사이트로 넘어갈 수 있었음). 프로토콜은 http · https 만.
     */
    static String baseUrl(String configured, String scheme, String host, int port, String contextPath, String forwardedProto) {
        if (configured != null && configured.matches("https?://[A-Za-z0-9.:\\-]+(/[\\w./-]*)?")) return configured.replaceAll("/+$", "");
        String proto = "https".equalsIgnoreCase(forwardedProto) ? "https" : "https".equalsIgnoreCase(scheme) ? "https" : "http";
        String h = host == null ? "localhost" : host.replaceAll("[^A-Za-z0-9.\\-]", "");
        boolean defaultPort = port == 80 || port == 443 || "https".equals(proto) && !"https".equalsIgnoreCase(scheme);
        return proto + "://" + h + (defaultPort ? "" : ":" + port) + contextPath;
    }

    /** data/park-notes.json(웹 앱과 같은 파일) - 한 번 읽어 둠. 못 읽으면 빈 것. */
    private volatile JsonObject notes;

    private JsonObject notes() {
        JsonObject n = notes;
        if (n != null) return n;
        try (InputStream in = getServletContext().getResourceAsStream("/data/park-notes.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            n = e != null && e.isJsonObject() && e.getAsJsonObject().has("parks") ? e.getAsJsonObject().getAsJsonObject("parks") : new JsonObject();
        } catch (Exception e) {
            log.warn("[SHARE] park-notes 못 읽음 - {}", e.toString());
            n = new JsonObject();
        }
        notes = n;
        return n;
    }

    /**
     * 순수 함수 - 공유 카드 제목을 앱 화면과 같게(2026-10-13 PC: 미리보기는 "북한산 · 구기분소 → 대남문", 따라가기는 "헤원사삼거리 → 대남문").
     * course-kit.js 의 noteTrailName(trails - 코스 ID 그대로나 앞부분, " · " 가 있으면 이름 전체) 뒤 aliasName(names - 그 산의 지명)과 같은 규칙.
     */
    static String noteName(JsonObject parks, String id, String name) {
        String out = name;
        if (parks == null) return out;
        for (String park : parks.keySet()) {
            JsonElement pe = parks.get(park);
            JsonObject tr = pe.isJsonObject() && pe.getAsJsonObject().has("trails") && pe.getAsJsonObject().get("trails").isJsonObject()
                    ? pe.getAsJsonObject().getAsJsonObject("trails") : null;
            if (tr == null) continue;
            for (String k : tr.keySet()) {
                if (!id.equals(k) && !id.startsWith(k + "-")) continue;
                String v = tr.get(k).getAsString();
                int i = name.indexOf(" · ");
                out = v.contains(" · ") ? v : (i > 0 ? name.substring(0, i) : park) + " · " + v;
            }
        }
        int i = out.indexOf(" · ");
        String group = i > 0 ? out.substring(0, i) : null;
        JsonElement pe = group == null ? null : parks.get(group);
        JsonObject names = pe != null && pe.isJsonObject() && pe.getAsJsonObject().has("names") && pe.getAsJsonObject().get("names").isJsonObject()
                ? pe.getAsJsonObject().getAsJsonObject("names") : null;
        if (names == null) return out;
        String[] parts = out.substring(i + 3).split(" → ", -1);
        for (int k = 0; k < parts.length; k++) {
            String key = parts[k].trim();
            if (names.has(key)) parts[k] = names.get(key).getAsString();
        }
        return group + " · " + String.join(" → ", parts);
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
