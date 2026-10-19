package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import jakarta.servlet.ServletContext;
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
 * 코스마다 소개 페이지. {@code GET /c/<코스ID>} (2026-10-19 홍TV님 - "○○산 ○○ 코스" 같은 검색으로 들어오는 입구).
 *
 * <p>산 소개 페이지(/m/)처럼 서버가 글로 그립니다(스크립트 없음): 거리 · 오르막 · 예상 시간 · 난이도, 국립공원 공식 정보, 고도 그림(SVG),
 * 지나는 곳, 출발점 가는 길(카카오맵), 3D · 따라가기 단추, 닿는 100대 명산.
 *
 * <p>검색에 내는 코스는 {@link #indexable} 만 - 공식 · 이름 있는 코스(국립공원 · 두루누비 · 등산·트레킹지원센터)와 100대 명산 정상에 닿는 등산 코스.
 * 나머지(산림청 등산로로 자동으로 이은 frst 1만 8천여 개 · OSM 조각)는 페이지는 열리되 noindex - 비슷한 페이지를 한꺼번에 많이 내면
 * 검색 사이트가 사이트 전체를 낮게 볼 수 있어서(2026-10-19 route_course 26,683개 - frst 18,668).
 */
@WebServlet(urlPatterns = {"/c/*"})
public class CoursePageServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(CoursePageServlet.class);
    /** 화면 안 링크는 상대 주소(/c/코스 는 한 단계 아래 - 산 페이지와 같음). */
    static final String REL = MountainServlet.REL;
    /** 검색에 내는 공식 · 이름 있는 코스 ID 앞머리. */
    static final Set<String> OFFICIAL = Set.of("knps", "drnb", "kmp", "kmf");
    /** 고도 그림 점 수 상한(코스 점이 수천 개라도 글이 커지지 않게). */
    static final int PROFILE_MAX = 240;
    /** 지나는 곳: 경로에서 이만큼(m) 안의 이름표만, 이만큼까지. 이보다(SIDE_M) 멀면 "길에서 ○m 옆" 을 붙임. */
    static final int POI_OFF_M = 150, POI_MAX = 25, SIDE_M = 50;

    private volatile JsonArray peaks;
    private volatile JsonObject parks;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo();
        String id = path == null ? "" : path.replaceFirst("^/", "");
        if (id.isEmpty()) {
            resp.sendRedirect(req.getContextPath() + "/m/");
            return;
        }
        String base = ShareServlet.baseUrl(RouteflyConfig.get("site.baseUrl"), req.getScheme(), req.getServerName(), req.getServerPort(),
                req.getContextPath(), req.getHeader("X-Forwarded-Proto"));
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        if (!CourseQueries.validId(id)) {
            resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
            resp.getWriter().print(notFoundPage(base));
            return;
        }
        JsonObject course = null, info = null;
        double[] dist = null;
        Double[] ele = null;
        JsonArray pois = new JsonArray();
        try (Connection c = Db.open()) {
            JsonArray rows = Json.rows(c, "SELECT " + CourseQueries.COURSE_COLUMNS + ", imported_at FROM route_course WHERE course_id = ?", id);
            if (rows.size() > 0) {
                course = rows.get(0).getAsJsonObject();
                JsonArray pts = Json.rows(c, "SELECT dist_m, ele_m FROM route_course_point WHERE course_id = ? ORDER BY seq", id);
                dist = new double[pts.size()];
                ele = new Double[pts.size()];
                for (int i = 0; i < pts.size(); i++) {
                    JsonObject p = pts.get(i).getAsJsonObject();
                    dist[i] = p.get("dist_m").getAsDouble();
                    ele[i] = p.get("ele_m").isJsonNull() ? null : p.get("ele_m").getAsDouble();
                }
                pois = Json.rows(c, "SELECT name, ele_m, dist_m, off_route_m FROM route_course_poi WHERE course_id = ? ORDER BY seq", id);
                if (id.startsWith(CourseQueries.INFO_PREFIX)) {
                    try {
                        JsonArray r = Json.rows(c, "SELECT up_min, down_min, level, notice FROM route_course_info WHERE course_id = ?", id);
                        if (r.size() > 0) info = r.get(0).getAsJsonObject();
                    } catch (java.sql.SQLException e) {
                        // 표 없음(DDL 전) - 공식 정보 없이
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[COURSE-PAGE] 조회 실패 id={} - {}", id, e.toString());
            resp.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            resp.setHeader("Cache-Control", "no-store");
            resp.getWriter().print(failPage(base));
            return;
        }
        if (course == null) {
            resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
            resp.getWriter().print(notFoundPage(base));
            return;
        }
        JsonObject pk = parks();
        String rawName = str(course, "name");
        course.addProperty("name", ShareServlet.noteName(pk, id, rawName));   // 앱 · 공유 카드와 같은 이름
        JsonObject peak = peakOf(peaks(), course);
        boolean index = indexable(id, rawName, str(course, "kind"), peak, pk);
        resp.setHeader("Cache-Control", "public, max-age=600");
        resp.getWriter().print(page(course, peak, info, dist, ele, pois, index, base));
    }

    /** 순수 함수 - 코스 ID 앞머리("knps-…" → "knps"). '-' 가 없으면 ""(GPX 로 넣은 코스). */
    static String prefix(String id) {
        int i = id == null ? -1 : id.indexOf('-');
        return i > 0 ? id.substring(0, i) : "";
    }

    /**
     * 순수 함수 - 검색에 내는 코스인가. 비매칭 · 비법정 길과 park-notes 의 hide(지금은 없는 탐방로)는 아님.
     * 공식 · 이름 있는 코스(OFFICIAL)는 냄. 그 밖은 100대 명산 정상에 닿는 등산 코스(산 페이지 목록에 나오는 것)만.
     */
    static boolean indexable(String id, String name, String kind, JsonObject peak, JsonObject parks) {
        if (name == null || name.matches(".*(비매칭|비법정).*") || MountainServlet.hidden(parks, id)) return false;
        if (OFFICIAL.contains(prefix(id))) return true;
        return peak != null && ("hike".equals(kind) || CourseQueries.TREK.equals(kind));
    }

    /** 순수 함수 - 코스 시작 · 끝이 정상(또는 alt)에서 산 페이지 기준(NEAR_M) 안인 100대 명산 가운데 가장 가까운 것. 없으면 null. */
    static JsonObject peakOf(JsonArray peaks, JsonObject c) {
        JsonObject best = null;
        double bestD = MountainServlet.NEAR_M;
        if (peaks == null) return null;
        for (JsonElement e : peaks) {
            JsonObject p = e.getAsJsonObject();
            if (!p.has("lat") || !p.has("lon")) continue;
            for (double[] t : MountainServlet.tops(p)) {
                double d = Math.min(MountainServlet.gap(c, "start_lat", "start_lon", t), MountainServlet.gap(c, "end_lat", "end_lon", t));
                if (d <= bestD) {
                    bestD = d;
                    best = p;
                }
            }
        }
        return best;
    }

    /** 순수 함수 - 코스 종류 이름. */
    static String kindLabel(String kind) {
        return switch (kind == null ? "" : kind) {
            case "hike" -> "등산";
            case "trek" -> "등산 · 걷기";
            case "walk" -> "걷기";
            case "bike" -> "자전거";
            default -> "코스";
        };
    }

    /** 순수 함수 - 자료 출처(about.html 의 출처 표와 같은 말). 모르는 앞머리는 "". */
    static String source(String id) {
        return switch (prefix(id)) {
            case "frst" -> "산림청 「산림공간정보 등산로정보」 · 국립공원공단 「국립공원 선형시설」(공공데이터포털) - routefly 가 등산로 구간을 이어 들머리 → 정상 코스로 만들었습니다.";
            case "knps" -> "국립공원공단 「국립공원 탐방로 공간데이터」(공공데이터포털)";
            case "drnb" -> "한국관광공사 「두루누비 정보 서비스」(공공데이터포털)";
            case "kmp" -> "한국등산·트레킹지원센터 「전국 주요 봉우리 코스」(공공데이터포털) - routefly 가 한 줄로 잇고 고도를 다시 계산했습니다.";
            case "kmf" -> "한국등산·트레킹지원센터 「국가숲길 코스」(공공데이터포털) - routefly 가 한 줄로 잇고 고도를 다시 계산했습니다.";
            case "osmb", "osmh" -> "<a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">© OpenStreetMap contributors</a>(ODbL) - routefly 가 구간으로 나눴습니다.";
            default -> "";
        };
    }

    /** 순수 함수 - 예상 시간 글. 자전거는 시속 15km, 그 밖은 산 페이지와 같은 등산 표준(시속 4km · 오르막 600m 에 1시간). */
    static String timeText(String kind, int distM, Integer ascM) {
        if ("bike".equals(kind)) {
            long m = Math.round(distM / 1000.0 / 15 * 60);
            return "약 " + (m >= 60 ? m / 60 + "시간 " : "") + m % 60 + "분(시속 15km 어림)";
        }
        return "약 " + MountainServlet.hours(distM, ascM) + "(시속 4km · 오르막 600m 에 1시간 어림)";
    }

    /** 순수 함수 - 고도 그림(SVG, 스크립트 없음). 높이가 있는 점이 둘보다 적으면 "". 점은 PROFILE_MAX 개로 솎음. */
    static String profileSvg(double[] dist, Double[] ele) {
        if (dist == null || ele == null || dist.length != ele.length) return "";
        List<double[]> pts = new ArrayList<>();
        int step = Math.max(1, (int) Math.ceil(dist.length / (double) PROFILE_MAX));
        for (int i = 0; i < dist.length; i++) {
            boolean keep = i % step == 0 || i == dist.length - 1;
            if (keep && ele[i] != null) pts.add(new double[] {dist[i], ele[i]});
        }
        if (pts.size() < 2) return "";
        double maxD = pts.get(pts.size() - 1)[0], lo = Double.MAX_VALUE, hi = -Double.MAX_VALUE;
        for (double[] p : pts) {
            lo = Math.min(lo, p[1]);
            hi = Math.max(hi, p[1]);
        }
        if (maxD <= 0) return "";
        double span = Math.max(hi - lo, 50);   // 평지도 선이 납작하게만(위아래 50m 는 늘 보임)
        final int W = 640, H = 150, L = 6, R = W - 6, T = 10, B = H - 6;
        StringBuilder line = new StringBuilder();
        for (double[] p : pts) {
            double x = L + p[0] / maxD * (R - L), y = B - (p[1] - lo) / span * (B - T);
            line.append(String.format(Locale.ROOT, "%.1f,%.1f ", x, y));
        }
        String l = line.toString().trim();
        StringBuilder b = new StringBuilder("<svg class=\"prof\" viewBox=\"0 0 " + W + " " + H + "\" width=\"100%\" role=\"img\" aria-label=\"고도 그림: 최저 "
                + Math.round(lo) + "m, 최고 " + Math.round(hi) + "m, 거리 " + String.format(Locale.ROOT, "%.1f", maxD / 1000) + "km\">");
        b.append(String.format(Locale.ROOT, "<polygon points=\"%.1f,%d %s %.1f,%d\" fill=\"rgba(77,163,255,0.18)\"/>", (double) L, B, l, (double) R, B));
        b.append("<polyline points=\"").append(l).append("\" fill=\"none\" stroke=\"#4da3ff\" stroke-width=\"2\" stroke-linejoin=\"round\"/>");
        // 눈금 글자는 그림 밖 한 줄로(2026-10-19 다음 문서분석: 그림 안 글자가 본문에 "712m192m01.8km" 처럼 붙어 읽혔음)
        b.append("</svg>");
        return b.append(String.format(Locale.KOREA, "<p class=\"dim profCap\">출발 0km → 도착 %.1fkm · 높이 %,dm ~ %,dm</p>", maxD / 1000, Math.round(lo), Math.round(hi))).toString();
    }

    /**
     * 순수 함수 - 지나는 곳: 경로에서 POI_OFF_M 안, 바로 앞과 같은 이름은 한 번만, POI_MAX 개까지. 각 [이름, 거리 m, 높이 m 또는 null, 길에서 떨어진 m].
     * 높이는 이름표 높이가 아니라 그 거리의 코스선 높이(2026-10-19 PC: 만경대 이름표 801m 인데 코스는 옆을 지나 최고 712m - 고도 그림과 어긋났음).
     */
    static List<Object[]> passes(JsonArray pois, double[] dist, Double[] ele) {
        List<Object[]> out = new ArrayList<>();
        String last = null;
        for (JsonElement e : pois) {
            JsonObject p = e.getAsJsonObject();
            String n = str(p, "name");
            if (n == null || n.isBlank() || p.get("off_route_m").getAsInt() > POI_OFF_M || n.equals(last)) continue;
            int at = p.get("dist_m").getAsInt();
            out.add(new Object[] {n, at, eleAt(dist, ele, at), p.get("off_route_m").getAsInt()});
            last = n;
            if (out.size() >= POI_MAX) break;
        }
        return out;
    }

    /** 순수 함수 - 누적 거리 at(m)에 가장 가까운 코스 점의 높이(그 점에 높이가 없거나 점이 없으면 null). dist 는 오름차순. */
    static Double eleAt(double[] dist, Double[] ele, double at) {
        if (dist == null || ele == null || dist.length == 0 || dist.length != ele.length) return null;
        int i = java.util.Arrays.binarySearch(dist, at);
        if (i < 0) {
            int hi = Math.min(-i - 1, dist.length - 1), lo = Math.max(hi - 1, 0);
            i = Math.abs(dist[lo] - at) <= Math.abs(dist[hi] - at) ? lo : hi;
        }
        return ele[i];
    }

    /** 순수 함수 - 코스 페이지. */
    static String page(JsonObject c, JsonObject peak, JsonObject info, double[] dist, Double[] ele, JsonArray pois, boolean index, String base) {
        String id = str(c, "course_id"), name = str(c, "name"), kind = str(c, "kind"), kl = kindLabel(kind);
        String peakId = peak == null ? null : str(peak, "id") != null ? str(peak, "id") : str(peak, "name");
        int d = c.get("distance_m").getAsInt();
        // 오르막은 산 페이지와 같게 바로잡음(DB 오르막이 최고점 - 낮은 끝보다 작으면 그 값 - Steep.fill 과 같은 규칙)
        Integer asc = Steep.ascent(num(c, "ascent_m"), ele == null ? null : Steep.minClimb(ele)), desc = num(c, "descent_m"), hi = num(c, "ele_max_m"), lo = num(c, "ele_min_m");
        boolean hike = "hike".equals(kind) || CourseQueries.TREK.equals(kind);
        String url = base + "/c/" + id;
        String summary = String.format(Locale.ROOT, "%.2fkm", d / 1000.0) + (asc != null ? String.format(Locale.KOREA, " · 오르막 %,dm", asc) : "")
                + " · " + timeText(kind, d, asc).replaceFirst("\\(.*\\)$", "");
        String title = name + (name.endsWith("코스") ? "" : " " + kl + " 코스");
        String metaDesc = name + " - " + kl + " 코스 " + summary + ". 고도 그림 · 지나는 곳 · 가는 길, 3D 지형 위로 미리 날아 보고 핸드폰으로 따라 걷기.";
        StringBuilder b = new StringBuilder(MountainServlet.head(title, metaDesc, url, base, null, null, index));
        b.append("<main class=\"cp\"><p class=\"crumb\"><a href=\"").append(REL)
                .append(peakId != null ? "/m/" + esc(MountainServlet.enc(peakId)) + "\">‹ " + esc(peakId) : "/m/?open=peaks\">‹ 코스 모음").append("</a></p>");
        b.append("<h1>").append(esc(name)).append("</h1>");
        b.append("<p class=\"lead\">").append(kl).append(" 코스").append(peakId != null ? " · 100대 명산 " + esc(peakId) : "").append("</p>");

        // 요약
        Double steep = ele == null ? null : Steep.steepest(dist, ele);
        b.append("<dl class=\"sum\"><dt>거리</dt><dd>").append(String.format(Locale.ROOT, "%.2fkm", d / 1000.0)).append("</dd>");
        if (asc != null) b.append("<dt>오르막 · 내리막</dt><dd>").append(String.format(Locale.KOREA, "%,dm", asc)).append(desc != null ? String.format(Locale.KOREA, " · %,dm", desc) : "").append("</dd>");
        if (hi != null) b.append("<dt>높이</dt><dd>").append(lo != null ? String.format(Locale.KOREA, "%,dm ~ ", lo) : "").append(String.format(Locale.KOREA, "%,dm", hi)).append("</dd>");
        b.append("<dt>예상 시간</dt><dd>").append(timeText(kind, d, asc)).append("</dd>");
        if (hike) {
            String chip = MountainServlet.levelChip(d, asc, steep, false);
            if (!chip.isEmpty()) b.append("<dt>난이도</dt><dd>").append(chip).append(SteepRank.slopeText(d, asc, steep, false)).append("</dd>");
        }
        b.append("</dl>");
        if (info != null) {   // 국립공원 공식 정보(route_course_info)
            Integer up = num(info, "up_min"), down = num(info, "down_min");
            b.append("<section><h2>국립공원 공식 안내</h2><ul class=\"tips\">");
            if (up != null || down != null) b.append("<li>").append(up != null ? "오르는 시간 " + up + "분" : "").append(up != null && down != null ? " · " : "")
                    .append(down != null ? "내려오는 시간 " + down + "분" : "").append("</li>");
            if (str(info, "level") != null) b.append("<li>난이도 ").append(esc(str(info, "level"))).append("</li>");
            if (str(info, "notice") != null) b.append("<li>통제 · 알림: ").append(esc(str(info, "notice"))).append("</li>");
            b.append("</ul></section>");
        }
        // 단추
        String m = peakId != null ? "&amp;m=" + esc(MountainServlet.enc(peakId)) : "";
        b.append("<p class=\"go\"><a href=\"").append(REL).append("/index.html?lang=ko#c=").append(esc(id)).append(m).append("\">🛩 3D 로 미리 날기</a>")
                .append("<a href=\"").append(REL).append("/hike.html?lang=ko#c=").append(esc(id)).append(m).append("\">🥾 따라가기</a>");
        double[] start = peak != null ? MountainServlet.trailhead(c, peak) : new double[] {c.get("start_lat").getAsDouble(), c.get("start_lon").getAsDouble()};
        if (start != null) b.append("<a href=\"").append(esc(MountainServlet.kakaoTo(name.replaceFirst(" · .*$", "") + " 출발점", start)))
                .append("\" target=\"_blank\" rel=\"noopener\">🚌 출발점 가는 길</a>");
        b.append("</p>");
        // 고도 그림
        String svg = profileSvg(dist, ele);
        if (!svg.isEmpty()) b.append("<section><h2>고도 그림</h2>").append(svg).append("</section>");
        // 지나는 곳
        List<Object[]> ps = passes(pois, dist, ele);
        if (!ps.isEmpty()) {
            b.append("<section><h2>지나는 곳</h2><ol class=\"pass\">");
            for (Object[] p : ps) {
                b.append("<li><b>").append(esc((String) p[0])).append("</b> <span>").append(String.format(Locale.ROOT, "%.1fkm", (Integer) p[1] / 1000.0))
                        .append(p[2] != null ? String.format(Locale.KOREA, " · 해발 %,dm", Math.round((Double) p[2])) : "")
                        .append((Integer) p[3] > SIDE_M ? " · 길에서 " + p[3] + "m 옆" : "").append("</span></li>");
            }
            b.append("</ol></section>");
        }
        String day = str(c, "imported_at");
        if (day != null && day.length() >= 10)   // 코스를 넣은 날(검색 사이트가 날짜로 읽음 - 2026-10-19 다음 문서분석 "날짜 -")
            b.append("<p class=\"dim\">코스 자료 날짜 <time datetime=\"").append(esc(day.substring(0, 10))).append("\">").append(esc(day.substring(0, 10))).append("</time></p>");
        b.append("<p class=\"dim\">예상 시간 · 난이도는 routefly 가 거리 · 오르막으로 어림한 값입니다(공식 등급이 아님). 코스 자료는 참고용이니 현지 안내판 · 통제를 꼭 따르세요.</p>");
        if (hike) b.append(MountainServlet.tips());
        String src = source(id);
        if (!src.isEmpty()) b.append("<p class=\"dim\">코스 자료: ").append(src).append("</p>");   // 이미 이스케이프 · 링크가 든 고정 글
        b.append(MountainServlet.foot(null, false));
        return b.toString();
    }

    static String notFoundPage(String base) {
        return MountainServlet.head("코스를 찾지 못했습니다", "routefly 등산 · 걷기 · 자전거 코스", base + "/m/", base, null, null, false)
                + "<main><h1>코스를 찾지 못했습니다</h1><p>지워졌거나 주소가 바뀐 코스입니다. <a href=\"" + REL + "/m/\">코스 모음</a> · <a href=\""
                + REL + "/hike.html?lang=ko\">따라가기에서 찾기</a></p>" + MountainServlet.foot(null, false);
    }

    static String failPage(String base) {
        return MountainServlet.head("잠시 뒤 다시 열어 주세요", "routefly 코스", base + "/m/", base, null, null, false)
                + "<main><h1>잠시 뒤 다시 열어 주세요</h1><p>코스 자료를 읽지 못했습니다. <a href=\"" + REL + "/m/\">코스 모음</a></p>" + MountainServlet.foot(null, false);
    }

    private JsonArray peaks() {
        JsonArray p = peaks;
        if (p == null) peaks = p = readPeaks(getServletContext());
        return p;
    }

    private JsonObject parks() {
        JsonObject n = parks;
        if (n == null) parks = n = readParks(getServletContext());
        return n;
    }

    /** data/mountains100.json 의 peaks - 못 읽으면 빈 것(사이트맵도 씀). */
    static JsonArray readPeaks(ServletContext ctx) {
        try (InputStream in = ctx.getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            return e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks") ? e.getAsJsonObject().getAsJsonArray("peaks") : new JsonArray();
        } catch (Exception e) {
            log.warn("[COURSE-PAGE] mountains100.json 못 읽음 - {}", e.toString());
            return new JsonArray();
        }
    }

    /** data/park-notes.json 의 parks - 못 읽으면 빈 것(사이트맵도 씀). */
    static JsonObject readParks(ServletContext ctx) {
        try (InputStream in = ctx.getResourceAsStream("/data/park-notes.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            return e != null && e.isJsonObject() && e.getAsJsonObject().has("parks") ? e.getAsJsonObject().getAsJsonObject("parks") : new JsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    private static Integer num(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : (int) Math.round(e.getAsDouble());
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }

    private static String esc(String s) {
        return ShareServlet.esc(s == null ? "" : s);
    }
}
