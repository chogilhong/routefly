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
        if (id.startsWith(GAP_PREFIX)) {   // 탐방 안내도 빈 구간(OpenStreetMap - data/park-gaps.json, 2026-10-30 숨은벽 → 백운대) - DB 코스가 아님
            JsonObject d = gapDetail(gapEntry(id));
            if (d == null) {
                Json.fail(resp, HttpServletResponse.SC_NOT_FOUND, "코스가 없습니다: " + id);
                return;
            }
            Peaks.applyDetail(d, Peaks.tops(getServletContext()), Peaks.shelters(getServletContext()), Peaks.subs(getServletContext()));
            d.addProperty("success", true);
            Json.ok(req, resp, d);
            return;
        }
        try (Connection c = Db.open()) {
            // 2026-10-10 점검: 넣은 시각(배치가 코스를 다시 만들 때만 바뀜)으로 먼저 ETag 를 정해, 바뀌지 않았으면 점 수천 개를 읽기 전에 304
            JsonArray at = Json.rows(c, "SELECT imported_at FROM route_course WHERE course_id = ?", id);
            // SHAPE - 응답 모양이 바뀌면 올림(2026-10-13 ends 추가 - 받아 둔 304 를 쓰지 않게)
            String tag = at.size() == 0 ? null : versionTag(id, at.get(0).getAsJsonObject().get("imported_at").toString() + "\n" + sideVersion(c) + "\n" + SHAPE);
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
            if (detail.has("course") && detail.getAsJsonObject("course").has("kind") && java.util.Set.of("hike", "trek").contains(detail.getAsJsonObject("course").get("kind").getAsString()))
                Peaks.markMiss(detail, Peaks.named(getServletContext()));   // 등산만 - 목록(Steep)과 같게(2026-10-30 점검)   // 이름의 정상까지 안 가는 코스 - 화면 "정상 미포함"(2026-10-30 코스 점검)
            Peaks.applyDetail(detail, Peaks.tops(getServletContext()), Peaks.shelters(getServletContext()), Peaks.subs(getServletContext()));   // 정상 높이는 공식 값으로(대청봉 1,700 → 1,708 - 2026-10-16 홍TV님)
            detail.addProperty("success", true);
            if (tag == null) Json.ok(req, resp, detail);
            else Json.send(resp, detail.toString());
        } catch (Exception e) {
            log.warn("[COURSE] 조회 실패 id={} - {} (DB 접속 설정 db.url 등 · 표 routefly-batch sql/route_ddl.sql 확인)", id, e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                    "코스를 읽지 못했습니다. 잠시 뒤 다시 해 주세요.");
        }
    }

    /**
     * 코스와 따로 넣는 표(위치표지판 · 위험지역 · 조망점)의 넣은 회차 - ETag 에 넣어, 그 표만 다시 넣었을 때도 새 응답이 나가게.
     * 2026-10-10 PC: knpsSpot 을 다시 돌려 헬기장 종류가 바뀌었는데 ETag 가 같아 304 로 옛 응답을 썼음. 표가 없으면 "-".
     */
    static final String GAP_PREFIX = "osmgap-";

    private transient volatile com.google.gson.JsonObject gapParks;

    /** data/park-gaps.json 에서 그 ID 의 빈 구간. 없으면 null. */
    private JsonObject gapEntry(String id) {
        JsonObject parks = gapParks;
        if (parks == null) {
            try (java.io.InputStream in = getServletContext().getResourceAsStream("/data/park-gaps.json")) {
                com.google.gson.JsonElement e = in == null ? null : com.google.gson.JsonParser.parseReader(new java.io.InputStreamReader(in, java.nio.charset.StandardCharsets.UTF_8));
                parks = e != null && e.isJsonObject() && e.getAsJsonObject().has("parks") ? e.getAsJsonObject().getAsJsonObject("parks") : new JsonObject();
            } catch (Exception e) {
                parks = new JsonObject();
            }
            gapParks = parks;
        }
        for (String k : parks.keySet()) {
            if (!parks.get(k).isJsonArray()) continue;
            for (com.google.gson.JsonElement e : parks.getAsJsonArray(k)) {
                JsonObject g = e.getAsJsonObject();
                if (g.has("id") && id.equals(g.get("id").getAsString())) return g;
            }
        }
        return null;
    }

    /**
     * 순수 함수 - 빈 구간 하나(park-gaps.json: {id, name, coords:[[경도, 위도, 높이]…], fetched}) → /api/course 와 같은 꼴(CourseQueries.detail).
     * 누적 거리는 점 사이 거리 합, 오르막 · 내리막은 높이 차 합(높이는 Terrain Tiles), 이름표는 처음 · 끝(이름 "공원 · 처음 → 끝"). 꼴이 틀리면 null.
     */
    static JsonObject gapDetail(JsonObject g) {
        if (g == null || !g.has("coords") || !g.get("coords").isJsonArray() || !g.has("id") || !g.has("name")) return null;
        JsonArray cs = g.getAsJsonArray("coords"), points = new JsonArray();
        if (cs.size() < 2) return null;
        double dist = 0, up = 0, down = 0, lo = Double.MAX_VALUE, hi = -Double.MAX_VALUE, w = 180, so = 90, e = -180, n = -90;
        double[] prev = null;
        Double prevEle = null;
        boolean allEle = true;
        for (com.google.gson.JsonElement x : cs) {
            JsonArray p = x.getAsJsonArray();
            double lon = p.get(0).getAsDouble(), lat = p.get(1).getAsDouble();
            if (StaysServlet.parse(String.valueOf(lat), String.valueOf(lon)) == null) return null;
            Double ele = p.size() > 2 && !p.get(2).isJsonNull() ? p.get(2).getAsDouble() : null;
            if (prev != null) dist += MountainServlet.distM(prev[1], prev[0], lat, lon);
            if (ele == null) allEle = false;
            else {
                lo = Math.min(lo, ele);
                hi = Math.max(hi, ele);
                if (prevEle != null) { if (ele > prevEle) up += ele - prevEle; else down += prevEle - ele; }
                prevEle = ele;
            }
            w = Math.min(w, lon); e = Math.max(e, lon); so = Math.min(so, lat); n = Math.max(n, lat);
            JsonArray q = new JsonArray(4);
            q.add(CourseQueries.round5(lon));
            q.add(CourseQueries.round5(lat));
            if (ele == null) q.add(com.google.gson.JsonNull.INSTANCE); else q.add(ele);
            q.add((int) Math.round(dist));
            points.add(q);
            prev = new double[] {lon, lat};
        }
        String name = g.get("name").getAsString();
        int dot = name.indexOf(" · "), arrow = name.indexOf(" → ", Math.max(0, dot));
        String from = dot > 0 && arrow > dot ? name.substring(dot + 3, arrow) : null, to = arrow > 0 ? name.substring(arrow + 3) : null;
        JsonObject c = new JsonObject();
        c.addProperty("course_id", g.get("id").getAsString());
        c.addProperty("name", name);
        c.addProperty("kind", "hike");
        c.addProperty("distance_m", (int) Math.round(dist));
        if (allEle) {
            c.addProperty("ascent_m", (int) Math.round(up));
            c.addProperty("descent_m", (int) Math.round(down));
            c.addProperty("ele_min_m", lo);
            c.addProperty("ele_max_m", hi);
            c.addProperty("ele_source", "dem");
        }
        c.addProperty("point_cnt", points.size());
        JsonArray first = points.get(0).getAsJsonArray(), last = points.get(points.size() - 1).getAsJsonArray();
        c.addProperty("start_lat", first.get(1).getAsDouble());
        c.addProperty("start_lon", first.get(0).getAsDouble());
        c.addProperty("end_lat", last.get(1).getAsDouble());
        c.addProperty("end_lon", last.get(0).getAsDouble());
        c.addProperty("min_lat", so); c.addProperty("min_lon", w); c.addProperty("max_lat", n); c.addProperty("max_lon", e);
        c.addProperty("imported_at", g.has("fetched") ? g.get("fetched").getAsString() : "");
        JsonArray pois = new JsonArray();
        String[] nm = {from, to};
        JsonArray[] at = {first, last};
        for (int i = 0; i < 2; i++) {
            if (nm[i] == null || nm[i].isBlank()) continue;
            JsonObject o = new JsonObject();
            o.addProperty("seq", i + 1);
            o.addProperty("name", nm[i]);
            o.addProperty("lat", at[i].get(1).getAsDouble());
            o.addProperty("lon", at[i].get(0).getAsDouble());
            o.add("ele_m", at[i].get(2));
            o.add("dist_m", at[i].get(3));
            o.addProperty("off_route_m", 0);
            pois.add(o);
        }
        JsonObject out = new JsonObject();
        out.add("course", c);
        out.add("points", points);
        out.add("pois", pois);
        out.addProperty("source", "© OpenStreetMap contributors");
        return out;
    }

    /** 응답 모양 판 - ETag 에 넣음. */
    static final String SHAPE = "ends1-elev1-miss2";   // elev1 - 정상 높이 공식 값(2026-10-16), miss1 - summit_miss(2026-10-30)

    /** 2026-10-11 오픈 전 점검: 코스를 열 때마다(304 포함) 두 표를 훑었음 - 1분 동안은 받아 둔 값(배치는 몇 시간 · 며칠마다). */
    static final long SIDE_TTL_MS = 60_000;
    private static volatile String sideCached;
    private static volatile long sideAt;

    static String sideVersion(Connection c) {
        long now = System.currentTimeMillis();
        String v = sideCached;
        if (v != null && now - sideAt < SIDE_TTL_MS) return v;
        v = readSideVersion(c);
        sideCached = v;
        sideAt = now;
        return v;
    }

    static String readSideVersion(Connection c) {
        StringBuilder b = new StringBuilder();
        for (String table : new String[] {"route_signpost", "route_park_spot"}) {
            try {
                JsonArray r = Json.rows(c, "SELECT MAX(loaded) AS v FROM " + table);
                b.append(r.size() == 0 ? "-" : r.get(0).getAsJsonObject().get("v").toString()).append('|');
            } catch (Exception e) {
                b.append("-|");   // 표 없음
            }
        }
        return b.toString();
    }

    /** 웹앱이 올라온 시각 - 새로 배포하면(응답 모양이 바뀌었을 수 있음) ETag 가 모두 바뀝니다. */
    private static final long STARTED = System.currentTimeMillis();

    /** 순수 함수 - 코스 하나의 ETag(코스 ID · 넣은 시각 · 배포 시각). */
    static String versionTag(String id, String importedAt) {
        return Json.etag(id + "\n" + importedAt + "\n" + STARTED);
    }
}
