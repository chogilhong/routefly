package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산마다 소개 페이지. {@code GET /m/} (100대 명산 목록) · {@code GET /m/가야산} (그 산 코스 · 날씨 · 일출 · 일몰).
 *
 * <p>2026-10-14 홍TV님 - "○○산 등산코스", "○○산 날씨" 같은 검색으로 들어오는 입구(앱 화면에는 단추를 더하지 않음).
 * 코스 목록은 서버가 HTML 로 그려 검색 엔진이 읽고, 날씨 · 일출 · 일몰은 js/mountain.js 가 채웁니다(script-src 'self').
 * 산 자료는 웹 앱의 data/mountains100.json, 코스는 정상(또는 두 번째 정상 alt)에서 2km 안에 끝나거나 시작하는 등산 코스
 * (course-kit.js peakCourses 와 같은 규칙).
 */
@WebServlet(urlPatterns = {"/m/*", "/en/m/*"})   // /en/m/ - 영어(MountainEn, 2026-10-15)
public class MountainServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(MountainServlet.class);
    static final double NEAR_M = 2000;
    static final int MAX_COURSES = 30;
    /** 가까운 100대 명산(2026-10-15) - 이 거리 안 몇 곳. */
    static final double NEARBY_M = 60000;
    static final int NEARBY_MAX = 6;
    /** 화면 안 링크 · css · js 는 상대 주소(/m/산 · /m/ 모두 한 단계 아래). 절대 주소는 canonical · og 만(설정 site.baseUrl). */
    static final String REL = "..";

    private volatile JsonArray peaks;
    private volatile JsonObject parks;
    private volatile JsonArray groups;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo();
        boolean en = "/en/m".equals(req.getServletPath());
        if (path == null) {   // /m → /m/ (상대 주소 ".." 가 맞게)
            resp.sendRedirect(req.getContextPath() + (en ? "/en/m/" : "/m/"));
            return;
        }
        String name = path == null ? "" : URLDecoder.decode(path.replaceFirst("^/", ""), StandardCharsets.UTF_8).trim();
        String base = ShareServlet.baseUrl(RouteflyConfig.get("site.baseUrl"), req.getScheme(), req.getServerName(), req.getServerPort(),
                req.getContextPath(), req.getHeader("X-Forwarded-Proto"));
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        JsonArray all = peaks();
        if (en) {
            english(name, all, base, resp);
            return;
        }
        if (name.isEmpty()) {
            resp.setHeader("Cache-Control", "public, max-age=600");   // 10분 - 1시간이면 배포한 문구가 늦게 보였음(2026-10-17 PC)
            // ?open=peaks - 산 페이지의 "‹ 코스 모음" 으로 오면 등산 › 100대 명산을 펼친 채(2026-10-15 홍TV님)
            resp.getWriter().print(indexPage(all, seriesGroups(), base, "peaks".equals(req.getParameter("open"))));
            return;
        }
        List<JsonObject> same = byName(all, name);
        JsonObject peak = find(all, name);
        if (peak == null && same.size() > 1) {   // 같은 이름 산이 여럿(백운산 광양 · 정선 · 포천) - 고르게
            resp.setHeader("Cache-Control", "public, max-age=600");   // 10분 - 1시간이면 배포한 문구가 늦게 보였음(2026-10-17 PC)
            resp.getWriter().print(choosePage(name, same, base));
            return;
        }
        if (peak == null) {
            resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
            resp.getWriter().print(notFoundPage(name, base));
            return;
        }
        List<JsonObject> courses = courses(peak);
        boolean failed = courses == null;
        if (failed) courses = new ArrayList<>();
        resp.setHeader("Cache-Control", failed ? "no-store" : "public, max-age=600");
        resp.getWriter().print(page(peak, courses, nearby(all, peak, NEARBY_MAX, NEARBY_M), parking(courses), base));
    }

    /** 영어 페이지(/en/m/ · /en/m/seoraksan). */
    private void english(String key, JsonArray all, String base, HttpServletResponse resp) throws IOException {
        if (key.isEmpty()) {
            resp.setHeader("Cache-Control", "public, max-age=600");   // 10분 - 1시간이면 배포한 문구가 늦게 보였음(2026-10-17 PC)
            resp.getWriter().print(MountainEn.indexPage(all, seriesGroups(), base));
            return;
        }
        JsonObject peak = MountainEn.find(all, key);
        if (peak == null) {
            resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
            resp.getWriter().print(MountainEn.notFoundPage(key, base));
            return;
        }
        List<JsonObject> courses = courses(peak);
        boolean failed = courses == null;
        if (failed) courses = new ArrayList<>();
        resp.setHeader("Cache-Control", failed ? "no-store" : "public, max-age=600");
        resp.getWriter().print(MountainEn.page(peak, courses, nearby(all, peak, NEARBY_MAX, NEARBY_M), parking(courses), base));
    }

    /** 산마다 코스 목록 10분 담아 둠(2026-10-16 속도 점검 - 검색 로봇이 산 페이지 196쪽을 훑을 때 DB · 경사 계산을 줄임). 산 id → [시각, 목록]. */
    private static final long COURSES_TTL_MS = 10 * 60 * 1000;
    private final java.util.Map<String, Object[]> coursesCache = new java.util.concurrent.ConcurrentHashMap<>();

    /** 정상까지 가는 코스(앱과 같은 이름) - DB 가 안 되면 null. 10분 담아 둔 것이 있으면 그것(한국어 · 영어 페이지가 함께 씀). */
    @SuppressWarnings("unchecked")
    private List<JsonObject> courses(JsonObject peak) {
        String key = str(peak, "id") != null ? str(peak, "id") : str(peak, "name");
        Object[] hit = coursesCache.get(key);
        if (hit != null && System.currentTimeMillis() - (Long) hit[0] < COURSES_TTL_MS) return (List<JsonObject>) hit[1];
        List<JsonObject> courses = load(peak);
        if (courses != null) coursesCache.put(key, new Object[] {System.currentTimeMillis(), courses});
        return courses;
    }

    private List<JsonObject> load(JsonObject peak) {
        List<JsonObject> courses;
        try (Connection c = Db.open()) {
            double lat = peak.get("lat").getAsDouble(), lon = peak.get("lon").getAsDouble();
            double dLat = 0.05, dLon = 0.05 / Math.cos(Math.toRadians(lat));
            JsonArray rows = CourseQueries.list(c, new double[] {lon - dLon, lat - dLat, lon + dLon, lat + dLat}, "hike", null);
            courses = near(rows, peak, NEAR_M);
            JsonArray picked = new JsonArray();
            courses.forEach(picked::add);
            Steep.fill(c, picked, Peaks.tops(getServletContext()));   // 가장 가파른 1km(난이도) · 정상을 지나면 최고 높이는 공식 값(2026-10-16)
            names(courses, parks());   // 앱과 같은 이름(공단 공식 이름 · 산마다 지명) · 지금은 없는 탐방로는 뺌
        } catch (Exception e) {
            log.warn("[MOUNTAIN] 코스 조회 실패 {} - {}", str(peak, "id"), e.toString());
            return null;
        }
        return courses;
    }

    /** 문답의 주차장 - 가장 가까운 코스 들머리 3km 안(전국주차장정보표준데이터, 파일이 없으면 null). */
    private static Integer parking(List<JsonObject> courses) {
        if (courses.isEmpty() || !courses.get(0).has("start_lat") || courses.get(0).get("start_lat").isJsonNull()) return null;
        int n = ParkingServlet.countNear(courses.get(0).get("start_lat").getAsDouble(), courses.get(0).get("start_lon").getAsDouble(), ParkingServlet.RADIUS_M);
        return n >= 0 ? n : null;
    }

    private JsonArray peaks() {
        JsonArray p = peaks;
        if (p != null) return p;
        try (InputStream in = getServletContext().getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            p = e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks") ? e.getAsJsonObject().getAsJsonArray("peaks") : new JsonArray();
        } catch (Exception e) {
            log.warn("[MOUNTAIN] mountains100.json 못 읽음 - {}", e.toString());
            p = new JsonArray();
        }
        withElev(p, readElev(getServletContext()));
        peaks = p;
        return p;
    }

    /** data/series.json 의 groups(걷기 · 자전거 노선 - 목록 /m/) - 못 읽으면 빈 것. */
    private JsonArray seriesGroups() {
        JsonArray g = groups;
        if (g != null) return g;
        try (InputStream in = getServletContext().getResourceAsStream("/data/series.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            g = e != null && e.isJsonObject() && e.getAsJsonObject().has("groups") ? e.getAsJsonObject().getAsJsonArray("groups") : new JsonArray();
        } catch (Exception e) {
            log.warn("[MOUNTAIN] series.json 못 읽음 - {}", e.toString());
            g = new JsonArray();
        }
        groups = g;
        return g;
    }

    /** data/park-notes.json 의 parks - 못 읽으면 빈 것(이름은 DB 그대로). */
    private JsonObject parks() {
        JsonObject n = parks;
        if (n != null) return n;
        try (InputStream in = getServletContext().getResourceAsStream("/data/park-notes.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            n = e != null && e.isJsonObject() && e.getAsJsonObject().has("parks") ? e.getAsJsonObject().getAsJsonObject("parks") : new JsonObject();
        } catch (Exception e) {
            n = new JsonObject();
        }
        parks = n;
        return n;
    }

    /** 순수 함수 - park-notes 의 hide(코스 ID 그대로나 앞부분)인 코스는 빼고, 이름은 공유 카드와 같은 규칙(ShareServlet.noteName)으로. */
    static void names(List<JsonObject> courses, JsonObject parks) {
        courses.removeIf(c -> hidden(parks, str(c, "course_id")));
        for (JsonObject c : courses) c.addProperty("name", ShareServlet.noteName(parks, str(c, "course_id"), str(c, "name")));
    }

    static boolean hidden(JsonObject parks, String id) {
        if (parks == null || id == null) return false;
        for (String park : parks.keySet()) {
            JsonElement pe = parks.get(park);
            if (!pe.isJsonObject() || !pe.getAsJsonObject().has("hide") || !pe.getAsJsonObject().get("hide").isJsonArray()) continue;
            for (JsonElement k : pe.getAsJsonObject().getAsJsonArray("hide")) {
                String h = k.getAsString();
                if (id.equals(h) || id.startsWith(h + "-")) return true;
            }
        }
        return false;
    }

    /**
     * 순수 함수 - 산 찾기. id(지역이 붙은 "백운산(광양)")가 같으면 그것, 아니면 이름이 같은 산이 하나뿐일 때만. 없으면 null.
     * 2026-10-14 PC: 이름으로만 찾아 /m/백운산 이 광양만 · 지리산(통영)이 지리산과 겹쳤음.
     */
    static JsonObject find(JsonArray peaks, String name) {
        for (JsonElement e : peaks) if (name.equals(str(e.getAsJsonObject(), "id"))) return e.getAsJsonObject();
        List<JsonObject> same = byName(peaks, name);
        return same.size() == 1 ? same.get(0) : null;
    }

    static List<JsonObject> byName(JsonArray peaks, String name) {
        List<JsonObject> out = new ArrayList<>();
        for (JsonElement e : peaks) if (name.equals(str(e.getAsJsonObject(), "name"))) out.add(e.getAsJsonObject());
        return out;
    }

    /** 순수 함수 - 같은 이름 산 고르기. */
    static String choosePage(String name, List<JsonObject> same, String base) {
        StringBuilder b = new StringBuilder(head(name + " 등산코스", "100대 명산 " + name + " " + same.size() + "곳 - 지역을 고르세요.", base + "/m/" + enc(name), base));
        b.append("<main><p class=\"crumb\"><a href=\"").append(REL).append("/m/?open=peaks\">‹ 코스 모음</a></p><h1>").append(esc(name))
                .append(" 등산코스</h1><p class=\"lead\">100대 명산에 ").append(esc(name)).append("이 ").append(same.size()).append("곳 있습니다.</p><section><ul class=\"ms\">");
        for (JsonObject o : same) b.append("<li><a href=\"").append(REL).append("/m/").append(esc(enc(str(o, "id")))).append("\">").append(esc(str(o, "id"))).append("</a></li>");
        return b.append("</ul></section>").append(foot(base)).toString();
    }

    /** 순수 함수 - 정상(또는 alt)에서 nearM 안에 끝(또는 시작)이 있는 코스, 가까운 차례. 비법정 · 비매칭 길은 뺌. */
    static List<JsonObject> near(JsonArray rows, JsonObject peak, double nearM) {
        List<double[]> tops = new ArrayList<>();
        tops.add(new double[] {peak.get("lat").getAsDouble(), peak.get("lon").getAsDouble()});
        if (peak.has("alt") && peak.get("alt").isJsonArray()) {
            for (JsonElement a : peak.getAsJsonArray("alt")) {
                JsonObject q = a.getAsJsonObject();
                if (q.has("lat") && q.has("lon")) tops.add(new double[] {q.get("lat").getAsDouble(), q.get("lon").getAsDouble()});
            }
        }
        List<Object[]> hit = new ArrayList<>();
        for (JsonElement e : rows) {
            JsonObject c = e.getAsJsonObject();
            String n = str(c, "name");
            if (n == null || n.matches(".*(비매칭|비법정).*")) continue;
            double d = Double.POSITIVE_INFINITY;
            for (double[] t : tops) {
                d = Math.min(d, gap(c, "end_lat", "end_lon", t));
                d = Math.min(d, gap(c, "start_lat", "start_lon", t));
            }
            if (d <= nearM) hit.add(new Object[] {c, d});
        }
        hit.sort(Comparator.comparingDouble(o -> (Double) o[1]));
        List<JsonObject> out = new ArrayList<>();
        for (Object[] o : hit) {
            if (out.size() >= MAX_COURSES) break;
            out.add((JsonObject) o[0]);
        }
        return out;
    }

    private static double gap(JsonObject c, String la, String lo, double[] t) {
        if (!c.has(la) || c.get(la).isJsonNull() || !c.has(lo) || c.get(lo).isJsonNull()) return Double.POSITIVE_INFINITY;
        return distM(c.get(la).getAsDouble(), c.get(lo).getAsDouble(), t[0], t[1]);
    }

    /** 순수 함수 - 들머리 좌표 [lat, lon]: 코스 시작 · 끝 가운데 정상에서 먼 쪽(정상에서 시작하게 적힌 코스도 있음). 좌표가 없으면 null. */
    static double[] trailhead(JsonObject c, JsonObject peak) {
        double[] t = {peak.get("lat").getAsDouble(), peak.get("lon").getAsDouble()};
        double ds = gap(c, "start_lat", "start_lon", t), de = gap(c, "end_lat", "end_lon", t);
        if (ds == Double.POSITIVE_INFINITY && de == Double.POSITIVE_INFINITY) return null;
        boolean start = de == Double.POSITIVE_INFINITY || (ds != Double.POSITIVE_INFINITY && ds >= de);
        return start ? new double[] {c.get("start_lat").getAsDouble(), c.get("start_lon").getAsDouble()}
                : new double[] {c.get("end_lat").getAsDouble(), c.get("end_lon").getAsDouble()};
    }

    /** 순수 함수 - 카카오맵 길찾기(도착 = 들머리, 출발은 카카오맵이 내 위치로). 키 없이 쓰는 링크. 2026-10-15 홍TV님. */
    static String kakaoTo(String name, double[] p) {
        return "https://map.kakao.com/link/to/" + enc(name.replace(",", " ")) + String.format(Locale.ROOT, ",%.6f,%.6f", p[0], p[1]);
    }

    /**
     * data/peak-elev.json 의 elev {산 id: 공식 높이 m} - 없거나 못 읽으면 빈 것. mountains100.json 은 배치(routefly-batch mountains100)가 다시 만들므로
     * 공식 높이는 이 파일에 따로 둡니다(배치를 다시 돌려도 안 지워짐).
     */
    static JsonObject readElev(jakarta.servlet.ServletContext ctx) {
        try (InputStream in = ctx.getResourceAsStream("/data/peak-elev.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            return e != null && e.isJsonObject() && e.getAsJsonObject().has("elev") ? e.getAsJsonObject() : new JsonObject();   // {elev, src} 통째로(withElev)
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    /**
     * 순수 함수 - 산마다 공식 높이(elev)와 그 출처(elev_src)를 붙임(id 로 맞춤). file 은 peak-elev.json 통째({elev, src}) 또는 elev 만.
     * 출처 기준(2026-10-16 홍TV님): 정상석(stone) → 국토지리정보원(ngii) → 산림청 e-book(ebook, src 에 없으면 이것).
     */
    static void withElev(JsonArray peaks, JsonObject file) {
        JsonObject elev = file.has("elev") && file.get("elev").isJsonObject() ? file.getAsJsonObject("elev") : file;
        JsonObject src = file.has("src") && file.get("src").isJsonObject() ? file.getAsJsonObject("src") : new JsonObject();
        for (JsonElement e : peaks) {
            JsonObject o = e.getAsJsonObject();
            String id = str(o, "id") != null ? str(o, "id") : str(o, "name");
            if (id == null || !elev.has(id) || !elev.get(id).isJsonPrimitive()) continue;
            o.add("elev", elev.get(id));
            o.addProperty("elev_src", src.has(id) && src.get(id).isJsonPrimitive() ? src.get(id).getAsString() : "ebook");
        }
    }

    /** 순수 함수 - 높이 출처 이름(문답 · 점검 화면). en - 영어. */
    static String elevSource(JsonObject peak, boolean en) {
        String s = str(peak, "elev_src");
        if ("stone".equals(s)) return en ? "summit stone" : "정상석";
        if ("ngii".equals(s)) return en ? "National Geographic Information Institute" : "국토지리정보원";
        return en ? "Korea Forest Service, 100 Famous Mountains" : "산림청 100대 명산";
    }

    /**
     * 순수 함수 - 화면에 보일 정상 높이(m): mountains100.json 의 elev(공식 높이 - 산림청 100대 명산 · 국토지리정보원, 홍TV님 PC 가 자료에서 넣음)만.
     * height 는 GPX 의 GPS 높이라 20~35m 높게 나와(설악산 1,734 ↔ 1,708 - 2026-10-15 PC) 도장 자리 맞추기에만 씀. 없으면 null(높이를 안 보임).
     */
    static Integer elev(JsonObject peak) {
        JsonElement e = peak == null ? null : peak.get("elev");
        if (e == null || e.isJsonNull()) return null;
        try {
            return (int) Math.round(e.getAsDouble());
        } catch (RuntimeException x) {
            return null;
        }
    }

    /** 난이도 5단계 [한국어, 영어] - course-kit.js LEVELS 와 같음(공단 탐방로 안내판 범례). 2026-10-15 홍TV님. */
    static final String[][] LEVELS = {{"매우 쉬움", "Easy"}, {"쉬움", "Moderate"}, {"보통", "Intermediate"}, {"어려움", "Advanced"}, {"매우 어려움", "Expert"}};
    static final double[] HOUR_STEPS = {1.5, 3, 5, 8}, ASC_STEPS = {300, 700, 1100, 1500}, STEEP_STEPS = {20, 28, 36, 46};

    /**
     * 순수 함수 - 등산 코스 난이도 0~4(routefly 기준) - 표준 시간 · 오르막 총량 · 가장 가파른 1km(Steep, 오르막 · 내리막) 가운데 높은 단계.
     * course-kit.js difficulty 와 같음. 거리가 없으면 -1. 셋 다 코스가 길어져도 줄지 않아 "길어지면 내려가지 않음"(2026-10-16 - 평균 경사는 내리막에 묽어졌음).
     */
    static int difficulty(int distM, Integer ascM, Double steepPct) {
        if (distM <= 0) return -1;
        double a = ascM == null ? 0 : ascM, h = distM / 1000.0 / 4 + a / 600;
        int base = Math.max(step(h, HOUR_STEPS), step(a, ASC_STEPS));
        // 가파름은 한 단계까지만 올림(2026-10-16 PC: 문턱이 낮아 설악산 57 중 47 이 매우 어려움이었음)
        return steepPct == null ? base : Math.max(base, Math.min(step(steepPct, STEEP_STEPS), base + 1));
    }

    private static int step(double v, double[] steps) {
        int i = 0;
        while (i < steps.length && v >= steps[i]) i++;
        return i;
    }

    /** 순수 함수 - 난이도 표(코스 이름 옆). steep - 가장 가파른 1km 경사(%, 없으면 null). en - 영어. */
    static String levelChip(int distM, Integer ascM, Double steep, boolean en) {
        int lv = difficulty(distM, ascM, steep);
        return lv < 0 ? "" : "<i class=\"lv lv" + lv + "\">" + LEVELS[lv][en ? 1 : 0] + "</i>";
    }

    /** 목록 줄의 steep_pct(Steep.fill) - 없으면 null. */
    static Double steep(JsonObject c) {
        return c.has("steep_pct") && !c.get("steep_pct").isJsonNull() ? c.get("steep_pct").getAsDouble() : null;
    }

    /** GPS 높이(height)는 공식 높이보다 보통 이만큼 높음(98곳 중앙값 +24.6m - 2026-10-16). */
    static final double GPS_BIAS_M = 25;
    /** GPS 높이 - 25 가 공식 높이와 이보다 많이 다르면 정상 자리가 실제 꼭대기가 아님. */
    static final double SUMMIT_TOL_M = 50;

    /**
     * 순수 함수 - 정상 자리(lat · lon · summit)가 공식 높이의 꼭대기와 같은 곳인가. GPS 높이 - 25 가 공식과 50m 넘게 다르면 아님.
     * 2026-10-16: 점봉산(곰배령 - 정상 입산통제) · 무등산(서석대) · 계룡산(관음봉)은 일부러 다른 곳, 두타산(청옥산 쪽) · 내연산(향로봉 ↔ 공식 높이 삼지봉) ·
     * 소요산 · 적상산은 확인할 곳. 아니면 그 자리에 공식 높이를 붙이지 않고(Peaks) 화면에 "정상 곰배령 1,426m" 처럼 쓰지 않음. 비교할 값이 없으면 true.
     */
    static boolean summitOk(JsonObject peak) {
        Integer official = elev(peak);
        if (official == null || !peak.has("height") || peak.get("height").isJsonNull()) return true;
        return Math.abs(peak.get("height").getAsDouble() - GPS_BIAS_M - official) <= SUMMIT_TOL_M;
    }

    /** 순수 함수 - 높이와 함께 쓸 정상 이름(정상 자리가 꼭대기일 때만, 아니면 null). */
    static String topName(JsonObject peak) {
        return summitOk(peak) ? str(peak, "summit") : null;
    }

    /** 순수 함수 - 두 점 거리(m, 하버사인). */
    static double distM(double lat1, double lon1, double lat2, double lon2) {
        double r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** 순수 함수 - 이 산에서 maxM 안의 다른 100대 명산, 가까운 차례로 max 곳. 각 [산, 거리 m]. */
    static List<Object[]> nearby(JsonArray peaks, JsonObject peak, int max, double maxM) {
        double lat = peak.get("lat").getAsDouble(), lon = peak.get("lon").getAsDouble();
        List<Object[]> hit = new ArrayList<>();
        for (JsonElement e : peaks) {
            JsonObject o = e.getAsJsonObject();
            if (o == peak || (str(o, "id") != null && str(o, "id").equals(str(peak, "id"))) || !o.has("lat") || !o.has("lon")) continue;
            double d = distM(lat, lon, o.get("lat").getAsDouble(), o.get("lon").getAsDouble());
            if (d <= maxM) hit.add(new Object[] {o, d});
        }
        hit.sort(Comparator.comparingDouble(o -> (Double) o[1]));
        return hit.size() > max ? hit.subList(0, max) : hit;
    }

    /** 순수 함수 - 검색 엔진용 구조 정보(schema.org Mountain, JSON-LD). Gson 이 &lt; · &gt; 를 \u003c 로 바꿔 &lt;/script&gt; 로 끊기지 않음. */
    static String jsonLd(JsonObject peak, String name, String url) {
        JsonObject o = new JsonObject(), geo = new JsonObject();
        o.addProperty("@context", "https://schema.org");
        o.addProperty("@type", "Mountain");
        o.addProperty("name", name);
        o.addProperty("url", url);
        geo.addProperty("@type", "GeoCoordinates");
        geo.addProperty("latitude", peak.get("lat").getAsDouble());
        geo.addProperty("longitude", peak.get("lon").getAsDouble());
        if (elev(peak) != null) geo.addProperty("elevation", elev(peak));   // 공식 높이만(GPS height 는 안 씀)
        o.add("geo", geo);
        return "<script type=\"application/ld+json\">" + new Gson().toJson(o) + "</script>";
    }

    /**
     * 순수 함수 - 산 페이지 문답(있는 자료로만): 코스 수 · 가장 짧은 / 긴 코스, 정상 높이, 걸리는 시간, 주차장, 날씨 · 일출. 2026-10-15.
     * parking: 들머리 3km 안 주차장 수(null 이면 그 문답은 뺌).
     */
    static List<String[]> faq(JsonObject peak, String name, List<JsonObject> courses, Integer parking) {
        List<String[]> out = new ArrayList<>();
        String summit = str(peak, "summit");
        if (!courses.isEmpty()) {
            JsonObject lo = null, hi = null;
            double loH = Double.MAX_VALUE, hiH = -1;
            for (JsonObject c : courses) {
                int dist = c.get("distance_m").getAsInt();
                Integer asc = c.has("ascent_m") && !c.get("ascent_m").isJsonNull() ? c.get("ascent_m").getAsInt() : null;
                double h = dist / 1000.0 / 4 + (asc == null ? 0 : asc / 600.0);
                if (h < loH) { loH = h; lo = c; }
                if (h > hiH) { hiH = h; hi = c; }
            }
            out.add(new String[] {name + " 등산코스는 몇 개인가요?", "정상까지 가는 코스 " + courses.size() + "개를 소개합니다. 가장 짧은 코스는 " + courseText(lo)
                    + (courses.size() > 1 ? ", 가장 긴 코스는 " + courseText(hi) : "") + "입니다."});
            out.add(new String[] {name + " 등산은 몇 시간 걸리나요?", "정상까지 편도 약 " + hours(lo.get("distance_m").getAsInt(), asc(lo))
                    + (courses.size() > 1 ? " ~ " + hours(hi.get("distance_m").getAsInt(), asc(hi)) : "") + "입니다(시속 4km · 오르막 600m 에 1시간으로 어림). 내려오는 시간은 따로 더하세요."});
        }
        if (MountainServlet.elev(peak) != null)
            out.add(new String[] {name + " 높이는 얼마인가요?", (topName(peak) != null ? "정상 " + topName(peak) + "은" : name + "은") + " 해발 약 " + String.format(Locale.KOREA, "%,d", MountainServlet.elev(peak)) + "m 입니다(" + elevSource(peak, false) + ")."});
        if (parking != null)
            out.add(new String[] {name + " 주차장이 있나요?", parking > 0 ? "가장 가까운 코스 들머리 3km 안에 주차장 " + parking + "곳이 있습니다(전국주차장정보표준데이터). 요금 · 운영 시간은 현지에서 확인하세요."
                    : "가장 가까운 코스 들머리 3km 안에 등록된 주차장이 없습니다. 대중교통이나 더 먼 주차장을 알아보세요."});
        out.add(new String[] {name + " 날씨와 일출 시간은?", "이 페이지의 '날씨 · 미세먼지 · 일출 · 일몰' 칸에서 오늘부터 10일 뒤까지의 날씨와 그 날 일출 · 일몰 시각을 볼 수 있습니다(기상청 · 에어코리아)."});
        return out;
    }

    private static Integer asc(JsonObject c) {
        return c.has("ascent_m") && !c.get("ascent_m").isJsonNull() ? c.get("ascent_m").getAsInt() : null;
    }

    private static String courseText(JsonObject c) {
        return str(c, "name") + "(" + String.format(Locale.ROOT, "%.1fkm", c.get("distance_m").getAsInt() / 1000.0) + " · 약 " + hours(c.get("distance_m").getAsInt(), asc(c)) + ")";
    }

    /** 순수 함수 - 문답 구조 정보(schema.org FAQPage, JSON-LD). */
    static String faqLd(List<String[]> qa) {
        JsonObject o = new JsonObject();
        o.addProperty("@context", "https://schema.org");
        o.addProperty("@type", "FAQPage");
        JsonArray main = new JsonArray();
        for (String[] x : qa) {
            JsonObject q = new JsonObject(), a = new JsonObject();
            q.addProperty("@type", "Question");
            q.addProperty("name", x[0]);
            a.addProperty("@type", "Answer");
            a.addProperty("text", x[1]);
            q.add("acceptedAnswer", a);
            main.add(q);
        }
        o.add("mainEntity", main);
        return "<script type=\"application/ld+json\">" + new Gson().toJson(o) + "</script>";
    }

    /** 순수 함수 - 예상 시간(등산 표준: 4km/h + 오르막 600m/h, course-kit.js standardMs 와 같음) "2시간 18분". */
    static String hours(int distanceM, Integer ascentM) {
        double h = distanceM / 1000.0 / 4 + (ascentM == null ? 0 : ascentM / 600.0);
        long m = Math.round(h * 60);
        return (m >= 60 ? m / 60 + "시간 " : "") + m % 60 + "분";
    }

    /** 순수 함수 - 산 페이지. */
    static String page(JsonObject peak, List<JsonObject> courses, List<Object[]> nearby, Integer parking, String base) {
        String name = str(peak, "id") != null ? str(peak, "id") : str(peak, "name"), summit = str(peak, "summit");   // id = 지역 붙은 이름(백운산(광양))
        String url = base + "/m/" + enc(name);
        Integer top = null;
        for (JsonObject c : courses) {
            if (c.has("ele_max_m") && !c.get("ele_max_m").isJsonNull()) {
                int e = (int) Math.round(c.get("ele_max_m").getAsDouble());
                top = top == null ? e : Math.max(top, e);
            }
        }
        String title = name + " 등산코스 · 날씨 · 일출 일몰";
        String desc = name + (summit != null && !summit.equals(name) ? "(" + summit + ")" : "") + " 등산코스 " + courses.size() + "개 - 거리 · 오르막 · 예상 시간, "
                + "오늘 날씨와 일출 · 일몰. 3D 지형 위로 코스를 미리 날아 보고 핸드폰으로 따라 걷기.";
        String enPath = "/en/m/" + Roman.slug(name);
        StringBuilder b = new StringBuilder(head(title, desc, url, base, base + enPath, base + "/og/m/" + enc(name) + ".png"));   // 산마다 공유 그림(2026-10-15)
        b.append("<main><p class=\"crumb\"><a href=\"").append(REL).append("/m/?open=peaks\">‹ 코스 모음</a></p>");
        b.append("<h1>").append(esc(name)).append(" 등산코스</h1>");
        Integer height = MountainServlet.elev(peak);
        b.append(jsonLd(peak, name, url));
        String topNm = topName(peak);   // 정상 자리가 꼭대기가 아니면(점봉산 곰배령 등) 높이와 이름을 붙이지 않음(2026-10-16)
        b.append("<p class=\"lead\">산림청 100대 명산").append(topNm != null ? " · 정상 " + esc(topNm) : height != null ? " · 해발" : "")
                .append(height != null ? String.format(Locale.KOREA, " %,dm", height) : "")
                .append(topNm == null && summit != null && !summit.equals(str(peak, "name")) ? " · 도장 자리 " + esc(summit) : "")
                .append(top != null ? String.format(Locale.KOREA, " · 코스 최고점 약 %,dm", top) : "").append("</p>");
        b.append("<section id=\"wx\" data-lat=\"").append(peak.get("lat").getAsDouble()).append("\" data-lon=\"").append(peak.get("lon").getAsDouble())
                .append("\"><h2>날씨 · 미세먼지 · 일출 · 일몰</h2><p class=\"dim\" id=\"wxBody\">불러오는 중…</p></section>");
        b.append("<section><h2>코스 ").append(courses.size()).append("개</h2>");
        if (courses.isEmpty()) b.append("<p class=\"dim\">정상까지 가는 코스를 찾지 못했습니다. <a href=\"").append(REL)
                .append("/hike.html\">따라가기에서 산 이름으로 찾아보세요</a>.</p>");
        else {
            b.append("<ul class=\"cs\">");
            for (JsonObject c : courses) {
                String id = str(c, "course_id");
                int dist = c.get("distance_m").getAsInt();
                Integer asc = c.has("ascent_m") && !c.get("ascent_m").isJsonNull() ? c.get("ascent_m").getAsInt() : null;
                Double steep = steep(c);
                b.append("<li data-id=\"").append(esc(id)).append("\" data-name=\"").append(esc(str(c, "name"))).append("\" data-dist=\"").append(dist)
                        .append(asc != null ? "\" data-asc=\"" + asc : "").append(steep != null ? "\" data-steep=\"" + steep : "")
                        .append("\"><b>").append(esc(str(c, "name"))).append(" ").append(levelChip(dist, asc, steep, false)).append("</b><span>")
                        .append(String.format(Locale.ROOT, "%.2fkm", dist / 1000.0))
                        .append(asc != null ? String.format(Locale.KOREA, " · 오르막 %,dm", asc) : "")
                        .append(steep != null && steep >= STEEP_STEPS[1] ? String.format(Locale.ROOT, " · 가장 가파른 1km %.0f%%", steep) : "")
                        .append(" · 약 ").append(hours(dist, asc)).append("</span><span class=\"go\">")
                        .append("<a href=\"").append(REL).append("/index.html#c=").append(esc(id)).append("&amp;m=").append(esc(enc(name))).append("\">fly(3D)</a>")
                        .append("<a href=\"").append(REL).append("/hike.html#c=").append(esc(id)).append("&amp;m=").append(esc(enc(name))).append("\">따라가기</a>");   // m= - 따라가기의 ‹ 가 이 화면으로
                double[] th = trailhead(c, peak);
                if (th != null) b.append("<a class=\"way\" href=\"").append(esc(kakaoTo(str(peak, "name") + " 들머리", th)))
                        .append("\" target=\"_blank\" rel=\"noopener\">🚌 가는 길</a>");   // 카카오맵 길찾기(대중교통 · 차)
                b.append("</span></li>");
            }
            b.append("</ul>");
        }
        if (!courses.isEmpty()) b.append("<p class=\"dim\">☆ 를 누르면 그 코스를 찜(즐겨찾기)합니다(★). 찜한 코스는 따라가기 첫 화면 \"★ 찜한 코스\" 에 모여 바로 고를 수 있고, "
                + "다시 누르면 풀립니다. 이 핸드폰에만 저장됩니다(따라가기 📒 내 기록 → 💾 백업 저장으로 옮길 수 있음). "
                + "🚌 가는 길은 카카오맵에서 지금 자리부터 그 코스 들머리까지 대중교통 · 차 길찾기를 엽니다. "
                + "난이도(매우 쉬움 ~ 매우 어려움)는 걸리는 시간 · 오르막 총량으로 routefly 가 어림한 것이고(공단 공식 등급이 아님), 📈 고도를 누르면 공단 안내판처럼 구간별 경사를 봅니다.</p>");   // 2026-10-15 홍TV님
        b.append("<p class=\"dim\">예상 시간은 시속 4km · 오르막 600m 에 1시간으로 어림한 값입니다. 코스 자료는 참고용이니 현지 안내판 · 통제를 꼭 따르세요.</p></section>");
        List<String[]> qa = faq(peak, name, courses, parking);   // 자주 묻는 질문(2026-10-15 홍TV님 - 검색 결과에 문답으로)
        if (!qa.isEmpty()) {
            b.append("<section class=\"faq\"><h2>").append(esc(name)).append(" 자주 묻는 질문</h2><dl>");
            for (String[] x : qa) b.append("<dt>").append(esc(x[0])).append("</dt><dd>").append(esc(x[1])).append("</dd>");
            b.append("</dl></section>").append(faqLd(qa));
        }
        b.append(tips());
        if (!nearby.isEmpty()) {   // 가까운 100대 명산(2026-10-15) - 다음 산행 고르기 · 산 페이지끼리 잇기
            b.append("<section><h2>가까운 100대 명산</h2><ul class=\"ms\">");
            for (Object[] n : nearby) {
                JsonObject o = (JsonObject) n[0];
                b.append("<li><a href=\"").append(REL).append("/m/").append(esc(enc(str(o, "id")))).append("\">").append(esc(str(o, "id")))
                        .append(" <small>").append(Math.round((Double) n[1] / 1000)).append("km</small></a></li>");
            }
            b.append("</ul></section>");
        }
        b.append(foot(base, REL + enPath));
        return b.toString();
    }

    /** 첫 단계(등산 · 걷기 · 자전거) - series.js KINDS 와 같음. */
    static final String[][] KINDS = {{"hike", "⛰️ 등산"}, {"walk", "🥾 걷기"}, {"bike", "🚴 자전거"}};

    /**
     * 순수 함수 - 목록(/m/). 2026-10-15 홍TV님: 도장 · 완주(series.html)처럼 등산 · 걷기 · 자전거 접는 칸, 걷기 · 자전거도.
     * 등산 › 100대 명산은 산 페이지로, 그 밖(백두대간 · 정맥 · 국가숲길 · 코리아둘레길 · 국토종주 자전거길)은 노선 안내도(route.html)로.
     * 접는 칸은 &lt;details&gt; - 스크립트 없이 열리고 검색 엔진도 안을 읽음. groups 는 data/series.json 의 groups(못 읽으면 빈 것).
     */
    static String indexPage(JsonArray peaks, JsonArray groups, String base, boolean openPeaks) {
        StringBuilder b = new StringBuilder(head("100대 명산 · 둘레길 · 자전거길 코스", "산림청 100대 명산 " + peaks.size()
                + "곳의 등산코스 · 날씨 · 일출 일몰과 백두대간 · 국가숲길 · 코리아둘레길 · 국토종주 자전거길 노선. 3D 지형 위로 미리 날아 보고 핸드폰으로 따라 걷기.", base + "/m/", base, base + "/en/m/"));
        // 맨 위 로고(img/logo-dark.svg - 2026-10-14 홍TV님), 누르면 따라가기
        // 오른쪽에 따라가기 › - 따라가기 화면 위의 "코스 모음 ›" 과 짝(2026-10-17 홍TV님)
        b.append("<main><div class=\"logoRow\"><a class=\"logo\" href=\"").append(REL).append("/hike.html\"><img src=\"").append(REL)
                .append("/img/logo-dark.svg\" alt=\"routefly\" width=\"256\" height=\"80\"></a>")
                .append("<a class=\"goHike\" href=\"").append(REL).append("/hike.html\" title=\"코스를 골라 핸드폰으로 따라 걷기 - GPS · 음성 안내 · SOS\">🥾 따라가기 ›</a></div>")
                .append("<h1 class=\"idx\">등산 · 걷기 · 자전거</h1>")   // "코스" 는 뺌(2026-10-17 홍TV님 - 줄바꿈 없이 한 줄)
                .append("<p class=\"lead\">산을 고르면 정상까지 가는 코스와 오늘 날씨 · 미세먼지 · 일출 · 일몰을, 길을 고르면 노선 안내도를 봅니다.</p>"
                // 📍 내 근처 - 다른 칸처럼 접고 펴기(2026-10-16 홍TV님), 펴면 위치를 찾음(js/mountain.js)
                + "<section id=\"near\"><details class=\"fold kind\" name=\"kind\" id=\"nearFold\"><summary><span class=\"ft\">📍 내 근처 100대 명산</span>"
                + "<span class=\"fs\">지금 자리에서 가까운 8곳</span><span class=\"fa\">▾</span></summary><div class=\"fb\"><div id=\"nearList\"></div></div></details></section>"
                + "<section id=\"weekend\" hidden></section><div class=\"folds\">");   // 이번 주말 날씨 좋은 산(js/mountain.js · /api/weekend - 2026-10-15)
        boolean hasPeaks = false;
        for (JsonElement e : groups) {
            JsonArray sr = e.getAsJsonObject().getAsJsonArray("series");
            if (sr != null && sr.size() > 0 && sr.get(0).getAsJsonObject().has("summits")) hasPeaks = true;
        }
        if (!hasPeaks) {   // series.json 을 못 읽어도 100대 명산은 보이게
            JsonArray g2 = JsonParser.parseString("[{\"kind\":\"hike\",\"title\":\"100대 명산\",\"icon\":\"⛰️\",\"series\":[{\"summits\":\"\"}]}]").getAsJsonArray();
            g2.addAll(groups);
            groups = g2;
        }
        for (String[] k : KINDS) {
            List<JsonObject> gs = new ArrayList<>();
            for (JsonElement e : groups) {
                JsonObject g = e.getAsJsonObject();
                String kind = str(g, "kind") != null ? str(g, "kind") : "walk";
                if (kind.equals(k[0]) && g.has("series") && g.getAsJsonArray("series").size() > 0) gs.add(g);
            }
            if (gs.isEmpty()) continue;
            List<String> titles = new ArrayList<>();
            for (JsonObject g : gs) titles.add(str(g, "title"));
            boolean openKind = openPeaks && k[0].equals("hike");
            b.append("<details class=\"fold kind\" name=\"kind\"").append(openKind ? " open" : "").append("><summary><span class=\"ft\">").append(esc(k[1])).append("</span><span class=\"fs\">")
                    .append(esc(String.join(" · ", titles))).append("</span><span class=\"fa\">▾</span></summary><div class=\"fb\">");
            for (JsonObject g : gs) {
                boolean peaksGroup = g.getAsJsonArray("series").get(0).getAsJsonObject().has("summits");
                int n = peaksGroup ? peaks.size() : g.getAsJsonArray("series").size();
                b.append("<details class=\"fold group\" name=\"group\"").append(openKind && peaksGroup ? " open" : "").append("><summary><span class=\"ft\">").append(esc(str(g, "icon") + " " + str(g, "title")))
                        .append("</span><span class=\"fs\">").append(n).append(peaksGroup ? "곳" : "개").append("</span><span class=\"fa\">▾</span></summary><ul class=\"ms\">");
                if (peaksGroup) {
                    List<String> names = new ArrayList<>();
                    for (JsonElement e : peaks) names.add(str(e.getAsJsonObject(), "id"));
                    names.sort(Comparator.naturalOrder());
                    for (String n2 : names) b.append("<li><a href=\"").append(REL).append("/m/").append(esc(enc(n2))).append("\">").append(esc(n2)).append("</a></li>");
                } else {
                    for (JsonElement e : g.getAsJsonArray("series")) {
                        JsonObject sr = e.getAsJsonObject();
                        String q = str(sr, "prefix") != null ? "prefix=" + enc(str(sr, "prefix")) : "trail=" + enc(str(sr, "match") != null ? str(sr, "match") : str(sr, "name"));
                        b.append("<li><a href=\"").append(REL).append("/route.html?").append(esc(q)).append("&amp;name=").append(esc(enc(str(sr, "name"))))
                                .append("&amp;back=m\">").append(esc(str(sr, "name")))
                                .append(sr.has("km") ? " <small>" + sr.get("km").getAsInt() + "km</small>" : "").append("</a></li>");
                    }
                }
                b.append("</ul></details>");
            }
            b.append("</div></details>");
        }
        b.append("</div>").append(tips()).append("<section id=\"fun\" class=\"fun\" hidden></section>")
                .append("<a class=\"anbuLink\" href=\"").append(REL).append("/anbu.html?lang=ko\">🏠 오늘의 안부 <small>하루 한 번 '잘 지내요' · 보호자에게 문자 · 매일 알림</small> ›</a>")
                .append("<a class=\"anbuLink toolLink\" href=\"").append(REL).append("/tools.html?lang=ko\">🧰 별거 별거 <small>우편번호 · 환율 · 음력 · 날씨 · 이자 · 타이머 · 사다리 · 공휴일 · 기름값 · 물때 · 호랑이 소리 · 곰 방울 · 요들 외침 등 26가지</small> ›</a>")   // 2026-10-18 홍TV님   // 2026-10-18 홍TV님 - 따라가기 첫 화면에서 옮김   // 🔮 재미로 보는 오늘의 산행 한마디(js/mountain.js - 2026-10-17 홍TV님)
                .append("<a class=\"anbuLink subwayLink\" href=\"").append(REL).append("/subway.html?lang=ko\">🚇 지하철 노선도 <small>수도권 · 부산 · 대구 · 광주 · 대전</small> ›</a>")   // 2026-10-18 홍TV님 - 별거 별거 아래
                .append(foot(base, REL + "/en/m/"));
        return b.toString();
    }

    /** 산행 안전 팁 - 영어판(MountainEn.tips)과 짝(2026-10-18 홍TV님). 1330(외국인 관광 통역)은 빼고 혼자 산행 알림을 넣음. */
    static String tips() {
        return "<section><h2>⚠ 산행 안전 팁</h2><ul class=\"tips\">"
                + "<li>사고 · 조난은 <b>119</b>. 가까운 다목적위치표지판(국가지점번호)의 번호를 알려 주면 빨리 찾습니다. 따라가기 화면의 🆘 SOS 는 내 위치를 문자로 보냅니다.</li>"
                + "<li>산불조심기간(대략 2월 1일 ~ 5월 15일 · 11월 1일 ~ 12월 15일)과 궂은 날씨에는 통제되는 탐방로가 있습니다.</li>"
                + "<li>일찍 출발해 해 지기 전에 내려오세요. 물 · 비옷 · 헤드랜턴을 챙기세요.</li>"
                + "<li>혼자 갈 때는 가족에게 코스와 돌아올 시각을 알려 두세요. 따라가기 화면의 공유 → 📨 가족에게 산행 계획 알리기를 누르면 코스 · 출발 · 하산 예정 시각이 담긴 문자가 내 문자 앱으로 열립니다.</li></ul></section>";
    }

    static String notFoundPage(String name, String base) {
        return head("산을 찾지 못했습니다", "routefly 100대 명산 등산코스", base + "/m/", base)
                + "<main><h1>" + esc(name) + "</h1><p>100대 명산 목록에 없는 산입니다. <a href=\"" + REL + "/m/\">목록 보기</a> · <a href=\""
                + REL + "/hike.html\">따라가기에서 찾기</a></p>" + foot(base);
    }

    private static String head(String title, String desc, String url, String base) {
        return head(title, desc, url, base, null);
    }

    /** enUrl - 영어 페이지가 있으면 hreflang 으로 서로 잇기(2026-10-15). */
    private static String head(String title, String desc, String url, String base, String enUrl) {
        return head(title, desc, url, base, enUrl, null);
    }

    /** og - 공유 그림 주소(산마다 OgServlet, null 이면 기본 img/og.png). */
    private static String head(String title, String desc, String url, String base, String enUrl, String og) {
        String t = esc(title) + " - routefly", d = esc(desc);
        return "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<title>" + t + "</title><meta name=\"description\" content=\"" + d + "\">"
                + "<link rel=\"canonical\" href=\"" + esc(url) + "\">"
                + (enUrl == null ? "" : "<link rel=\"alternate\" hreflang=\"ko\" href=\"" + esc(url) + "\"><link rel=\"alternate\" hreflang=\"en\" href=\""
                        + esc(enUrl) + "\"><link rel=\"alternate\" hreflang=\"x-default\" href=\"" + esc(url) + "\">")
                + "<meta property=\"og:type\" content=\"website\"><meta property=\"og:site_name\" content=\"routefly\">"
                + "<meta property=\"og:title\" content=\"" + t + "\"><meta property=\"og:description\" content=\"" + d + "\">"
                + "<meta property=\"og:url\" content=\"" + esc(url) + "\"><meta property=\"og:image\" content=\"" + esc(og != null ? og : base + "/img/og.png?v=2") + "\">"
                + "<meta property=\"og:image:width\" content=\"1200\"><meta property=\"og:image:height\" content=\"630\">"
                + "<link rel=\"icon\" type=\"image/svg+xml\" href=\"" + REL + "/favicon.svg?v=2\"><link rel=\"apple-touch-icon\" href=\"" + REL + "/img/apple-icon-180.png\"><meta name=\"theme-color\" content=\"#11161d\">"
                + "<link rel=\"stylesheet\" href=\"" + REL + "/css/course-kit.css\"><link rel=\"stylesheet\" href=\"" + REL + "/css/mountain.css\"></head><body>";
    }

    private static String foot(String base) {
        return foot(base, null);
    }

    /** en - 영어 페이지 상대 주소(있으면 "English" 링크). */
    private static String foot(String base, String en) {
        String b = REL;   // 상대 주소 - 터널(https → http 톰캣)에서 http 절대 주소가 막혔음(2026-10-14)
        return "<p class=\"dim\">자료: 산림청 100대 명산 · 등산로정보, 국립공원공단 탐방로, 기상청 단기예보 · 에어코리아 대기정보 · 두루누비(공공데이터포털), © OpenStreetMap contributors. "
                + "<a href=\"" + b + "/about.html\">안전 · 출처 안내</a> · <a href=\"" + b + "/privacy.html\">개인정보처리방침</a>"
                + (en == null ? "" : " · <a href=\"" + esc(en) + "\" hreflang=\"en\" lang=\"en\">English</a>") + "</p>"
                + "<p class=\"support\" id=\"support\" hidden></p>"   // ☕ 후원(설정 donate.url 이 있을 때만 mountain.js 가 보임)
                + "<p class=\"brand\"><a href=\"" + b + "/hike.html\"><img src=\"" + b + "/img/logo-dark.svg\" alt=\"routefly\" width=\"160\" height=\"50\"> 앱 열기 ›</a></p>"
                + "<p class=\"copy\">© 2026 홍TV · routefly. 코스 · 지도 자료의 권리는 위 출처에 있습니다.</p></main>"   // 저작권 표시(2026-10-17 홍TV님)
                + "<script src=\"" + b + "/js/course-kit.js\"></script><script src=\"" + b + "/js/mountain.js\"></script></body></html>";
    }

    static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String esc(String s) {
        return ShareServlet.esc(s == null ? "" : s);
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
