package com.gh.routefly.web;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import jakarta.servlet.ServletContext;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 100대 명산 정상의 공식 높이로 코스 높이 바로잡기(2026-10-16 홍TV님 - "대청봉 1,700m 를 1,708m 로, 정상 높이는 정확해야 신뢰").
 *
 * <p>코스 · 지점 높이는 지형 자료(DEM)라 정상이 몇 m 낮게 나옴. 정상(mountains100.json 좌표) 근처 지점의 높이와, 정상을 지나는 코스의 "최고" 높이를
 * data/peak-elev.json 의 공식 높이로 바꿔 보냄 - 3D · 따라가기 · 음성 · 산 페이지가 함께 맞춰짐.</p>
 */
final class Peaks {

    private Peaks() {
    }

    /** 지점(이름표)이 정상에서 이 안이면 그 정상의 높이로(m). */
    static final double POI_M = 300;
    /** 코스 점이 정상에서 이 안이면 그 정상을 지나는 코스(m). */
    static final double PASS_M = 200;
    /** 지형 자료 최고점과 공식 높이가 이보다 많이 다르면 바꾸지 않음(그 산 아닌 다른 높은 곳을 지나는 코스 - m). */
    static final double MAX_DIFF_M = 80;

    /** 공식 높이가 있는 자리 - 정상(name · summit 은 그 산 · 정상 이름) 또는 대피소. */
    record Top(double lat, double lon, int h, String name, String summit) {
    }

    /** 공식 높이보다 지형 높이가 이만큼 넘게 높으면 그 정상이 아님(이웃의 더 높은 봉우리 - 2026-10-16 두타산 자리 = 청옥산 1,404). */
    static final double ABOVE_M = 15;

    private static volatile List<Top> tops, shelters, subs;
    /** 정상이 아닌 봉우리(peak-elev.json sub)는 그 산 정상에서 이 안의 같은 이름 이름표에(m). */
    static final double SUB_M = 6000;

    /** 정상이 아닌 봉우리 높이(peak-elev.json sub - 북한산 인수봉 등) - 자리는 그 산 정상(이름 + SUB_M 로 맞춤). 없으면 빈 것. */
    static List<Top> subs(ServletContext ctx) {
        List<Top> s = subs;
        if (s != null) return s;
        JsonArray peaks = new JsonArray();
        try (InputStream in = ctx.getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            if (e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks")) peaks = e.getAsJsonObject().getAsJsonArray("peaks");
        } catch (Exception e) {
            // 없이
        }
        JsonObject file = MountainServlet.readElev(ctx);
        s = Collections.unmodifiableList(subs(peaks, file.has("sub") && file.get("sub").isJsonObject() ? file.getAsJsonObject("sub") : new JsonObject()));
        subs = s;
        return s;
    }

    /** 순수 함수 - sub {산 id: {봉우리: 높이}} → [자리 = 그 산 정상, 높이, 이름 = 봉우리]. */
    static List<Top> subs(JsonArray peaks, JsonObject sub) {
        List<Top> out = new ArrayList<>();
        for (JsonElement e : peaks) {
            JsonObject o = e.getAsJsonObject();
            String id = MountainEn.id(o);
            if (id == null || !sub.has(id) || !sub.get(id).isJsonObject() || !o.has("lat") || !o.has("lon")) continue;
            for (String k : sub.getAsJsonObject(id).keySet()) {
                JsonElement v = sub.getAsJsonObject(id).get(k);
                if (v.isJsonPrimitive() && v.getAsJsonPrimitive().isNumber())
                    out.add(new Top(o.get("lat").getAsDouble(), o.get("lon").getAsDouble(), (int) Math.round(v.getAsDouble()), k, null));
            }
        }
        return out;
    }
    /** 대피소 지점이 공단 대피소 자리에서 이 안이면 그 높이(m). */
    static final double SHELTER_M = 150;

    /**
     * 공단 대피소 [위도, 경도, 높이] - data/shelters.json {"shelters":[{name, lat, lon, ele}]}(국립공원공단_국립공원 대피소 자료를 PC 가 옮김).
     * 없거나 비면 빈 것(대피소 높이는 지형 자료 그대로). 2026-10-16 홍TV님: 중청대피소 높이.
     */
    static List<Top> shelters(ServletContext ctx) {
        List<Top> s = shelters;
        if (s != null) return s;
        List<Top> out = new ArrayList<>();
        try (InputStream in = ctx.getResourceAsStream("/data/shelters.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            if (e != null && e.isJsonObject() && e.getAsJsonObject().has("shelters")) out = shelters(e.getAsJsonObject().getAsJsonArray("shelters"));
        } catch (Exception e) {
            // 대피소 없이
        }
        s = Collections.unmodifiableList(out);
        shelters = s;
        return s;
    }

    /** 순수 함수 - 대피소 목록 → [위도, 경도, 높이](높이 없는 것은 뺌). */
    static List<Top> shelters(JsonArray rows) {
        List<Top> out = new ArrayList<>();
        for (JsonElement e : rows) {
            JsonObject o = e.getAsJsonObject();
            if (o.has("lat") && o.has("lon") && o.has("ele") && !o.get("ele").isJsonNull())
                out.add(new Top(o.get("lat").getAsDouble(), o.get("lon").getAsDouble(), (int) Math.round(o.get("ele").getAsDouble()),
                        o.has("name") && !o.get("name").isJsonNull() ? o.get("name").getAsString() : "대피소", null));
        }
        return out;
    }

    /** 공식 높이가 있는 정상 [위도, 경도, 높이] - 웹 앱의 data 파일에서 한 번 읽음. 못 읽으면 빈 것. */
    static List<Top> tops(ServletContext ctx) {
        List<Top> t = tops;
        if (t != null) return t;
        JsonArray peaks = new JsonArray();
        try (InputStream in = ctx.getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            if (e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks")) peaks = e.getAsJsonObject().getAsJsonArray("peaks");
        } catch (Exception e) {
            // 정상 없이 - 높이는 지형 자료 그대로
        }
        MountainServlet.withElev(peaks, MountainServlet.readElev(ctx));
        t = Collections.unmodifiableList(tops(peaks));
        tops = t;
        return t;
    }

    /** 순수 함수 - 공식 높이(elev)가 있는 정상만 [위도, 경도, 높이]. */
    static List<Top> tops(JsonArray peaks) {
        List<Top> out = new ArrayList<>();
        for (JsonElement e : peaks) {
            JsonObject o = e.getAsJsonObject();
            Integer h = MountainServlet.elev(o);
            // 정상 자리가 꼭대기가 아닌 산(점봉산 곰배령 · 두타산 청옥산 쪽 …)은 빼야 그 자리 지점에 산 높이가 붙지 않음(2026-10-16)
            if (h != null && o.has("lat") && o.has("lon") && MountainServlet.summitOk(o))
                out.add(new Top(o.get("lat").getAsDouble(), o.get("lon").getAsDouble(), h, MountainEn.id(o),
                        o.has("summit") && !o.get("summit").isJsonNull() ? o.get("summit").getAsString() : null));
        }
        return out;
    }

    /** 순수 함수 - (lat, lon) 에서 maxM 안의 가장 가까운 정상 높이, 없으면 null. */
    static Integer near(List<Top> tops, double lat, double lon, double maxM) {
        Top t = nearTop(tops, lat, lon, maxM);
        return t == null ? null : t.h();
    }

    /** 순수 함수 - (lat, lon) 에서 maxM 안의 가장 가까운 자리, 없으면 null. */
    static Top nearTop(List<Top> tops, double lat, double lon, double maxM) {
        double best = maxM;
        Top h = null;
        for (Top t : tops) {
            if (Math.abs(t.lat() - lat) > 0.01 || Math.abs(t.lon() - lon) > 0.013) continue;   // 1km 밖은 셈하지 않음
            double d = MountainServlet.distM(lat, lon, t.lat(), t.lon());
            if (d <= best) {
                best = d;
                h = t;
            }
        }
        return h;
    }

    /**
     * 순수 함수 - 선분(a → b, [위도, 경도])에서 maxM 안을 지나는 정상 가운데 가장 높은 것의 높이, 없으면 null.
     * 코스 점은 솎아져 있어 점과 점 사이로 정상을 지날 수 있음 - 점만 보면 놓쳤음(2026-10-16).
     */
    static Integer passing(List<Top> tops, double aLat, double aLon, double bLat, double bLon, double maxM) {
        Integer best = null;
        double kx = 111320 * Math.cos(Math.toRadians((aLat + bLat) / 2)), ky = 110540;
        for (Top t : tops) {
            if (t.lat() < Math.min(aLat, bLat) - 0.01 || t.lat() > Math.max(aLat, bLat) + 0.01 || t.lon() < Math.min(aLon, bLon) - 0.013 || t.lon() > Math.max(aLon, bLon) + 0.013) continue;
            double ax = (aLon - t.lon()) * kx, ay = (aLat - t.lat()) * ky, bx = (bLon - t.lon()) * kx, by = (bLat - t.lat()) * ky;
            double dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
            double f = len2 == 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
            double px = ax + f * dx, py = ay + f * dy;
            if (Math.sqrt(px * px + py * py) <= maxM && (best == null || t.h() > best)) best = t.h();
        }
        return best;
    }

    /**
     * 순수 함수 - 지점 이름이 그 정상인가: 띄어쓰기를 빼고 산 이름(두타산)이나 정상 이름(대청봉)이 들었거나, "정상" 만 있는 이름.
     * 2026-10-16 홍TV님 · PC: 같은 이름 산이 여럿(청옥산 3곳)이고 두타산 정상 자리가 청옥산에 잡혀 있었음 - 자리만 보지 않고 이름도 봄.
     */
    static boolean sameTop(String poiName, Top t) {
        String n = poiName == null ? "" : poiName.replaceAll("\\s+", "");
        if (n.isEmpty()) return false;
        if (n.equals("정상")) return true;
        for (String k : new String[] {t.name(), t.summit()}) {
            if (k == null) continue;
            String b = k.replaceAll("\\(.*\\)|\\s+", "");   // 백운산(광양) → 백운산
            if (!b.isEmpty() && n.contains(b)) return true;
        }
        return false;
    }

    /** 순수 함수 - 지형 자료 최고점(demMax)과 지나는 정상들의 공식 높이 → 화면 "최고" 높이. 지나는 정상이 없거나 너무 다르면 null(그대로). */
    static Integer courseTop(Double demMax, List<Integer> passed) {
        Integer best = null;
        for (Integer h : passed) if (best == null || h > best) best = h;
        if (best == null || demMax == null || Math.abs(best - demMax) > MAX_DIFF_M || demMax > best + ABOVE_M) return null;   // 정상보다 높은 곳을 지나면 그대로
        return best;
    }

    /**
     * 순수 함수 - /api/course 응답 고치기: 정상 근처 지점의 ele_m 을 공식 높이로(+ ele_official), 정상을 지나면 course.ele_max_m 도.
     * points 는 [경도, 위도, 고도, 누적 거리].
     */
    static void applyDetail(JsonObject detail, List<Top> tops) {
        applyDetail(detail, tops, List.of());
    }

    static void applyDetail(JsonObject detail, List<Top> tops, List<Top> shelters) {
        applyDetail(detail, tops, shelters, List.of());
    }

    /** shelters - 공단 대피소(이름에 "대피소" 가 든 지점이 SHELTER_M 안이면 그 높이), subs - 정상이 아닌 봉우리(이름이 들고 SUB_M 안). */
    static void applyDetail(JsonObject detail, List<Top> tops, List<Top> shelters, List<Top> subs) {
        if (detail == null) return;
        if (detail.has("pois") && detail.get("pois").isJsonArray()) {
            for (JsonElement e : detail.getAsJsonArray("pois")) {
                JsonObject q = e.getAsJsonObject();
                if (!q.has("lat") || q.get("lat").isJsonNull() || !q.has("lon") || q.get("lon").isJsonNull()) continue;
                String name = q.has("name") && !q.get("name").isJsonNull() ? q.get("name").getAsString() : "";
                Top t = nearTop(tops, q.get("lat").getAsDouble(), q.get("lon").getAsDouble(), POI_M);
                if (t != null && !sameTop(name, t)) t = null;   // 이름이 그 산 · 정상이 아니면(청옥산 · 탐방지원센터) 붙이지 않음
                if (t == null && name.contains("대피소")) t = nearTop(shelters, q.get("lat").getAsDouble(), q.get("lon").getAsDouble(), SHELTER_M);
                if (t == null) {   // 인수봉 · 노적봉 · 만경대(북한산) - 이름 + 그 산 둘레
                    String n = name.replaceAll("\\s+", "");
                    for (Top s : subs)
                        if (n.contains(s.name()) && MountainServlet.distM(q.get("lat").getAsDouble(), q.get("lon").getAsDouble(), s.lat(), s.lon()) <= SUB_M) t = s;
                }
                if (t == null) continue;
                int h = t.h();
                Double dem = q.has("ele_m") && !q.get("ele_m").isJsonNull() ? q.get("ele_m").getAsDouble() : null;
                if (dem != null && (Math.abs(dem - h) > MAX_DIFF_M || dem > h + ABOVE_M)) continue;
                q.addProperty("ele_m", h);
                q.addProperty("ele_official", true);
            }
        }
        JsonObject course = detail.has("course") && detail.get("course").isJsonObject() ? detail.getAsJsonObject("course") : null;
        if (course == null || !detail.has("points")) return;
        List<Integer> passed = new ArrayList<>();
        JsonArray pts = detail.getAsJsonArray("points");
        for (int i = 0; i < pts.size(); i++) {
            JsonArray p = pts.get(i).getAsJsonArray(), q = pts.get(Math.max(0, i - 1)).getAsJsonArray();   // 앞 점과 이은 선분
            Integer h = passing(tops, q.get(1).getAsDouble(), q.get(0).getAsDouble(), p.get(1).getAsDouble(), p.get(0).getAsDouble(), PASS_M);
            if (h != null && !passed.contains(h)) passed.add(h);
        }
        Double dem = course.has("ele_max_m") && !course.get("ele_max_m").isJsonNull() ? course.get("ele_max_m").getAsDouble() : null;
        Integer top = courseTop(dem, passed);
        if (top != null) course.addProperty("ele_max_m", top);
        // 오르막이 적어도 오르는 높이(가장 높은 점 - 낮은 끝)보다 작으면 그 높이로 - 목록(Steep)과 같게(2026-10-16 PC: 오르막 6m 코스)
        Double[] es = new Double[pts.size()];
        for (int i = 0; i < es.length; i++) {
            JsonElement el = pts.get(i).getAsJsonArray().get(2);
            es[i] = el == null || el.isJsonNull() ? null : el.getAsDouble();
        }
        Integer db = course.has("ascent_m") && !course.get("ascent_m").isJsonNull() ? course.get("ascent_m").getAsInt() : null;
        Integer asc = Steep.ascent(db, Steep.minClimb(es));
        if (asc != null && !asc.equals(db)) course.addProperty("ascent_m", asc);
    }
}
