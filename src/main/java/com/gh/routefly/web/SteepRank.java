package com.gh.routefly.web;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * 🧗 가파른 산 순위(2026-10-18 홍TV님) - /m/ · /en/m/ 에 두 표: 평균이 가장 가파른 산 TOP10, 가장 가파른 코스를 가진 산 TOP10.
 *
 * <p>산 페이지와 같은 코스 목록(정상 2km 안)에서 거리 1km 이상 · 오르막이 있는 코스만. 각도 = atan(오르막 총량 ÷ 거리),
 * 산 평균은 코스 각도의 평균(경사 % 는 그 각도의 tan). 가장 가파른 1km 는 산 페이지의 data-steep(Steep) 과 같은 값.
 * 정상 높이는 공식 높이(peak-elev.json)만, 500m 아래와 높이가 없는 산은 뺌.
 */
final class SteepRank {

    static final int TOP = 10;
    static final int MIN_ELEV = 500;
    static final int MIN_DIST = 1000;

    private SteepRank() {}

    /** 산 하나 - 평균 각도 · 코스 수 · 가장 가파른 코스. */
    static final class Row {
        final String id;
        final int elev;
        final double avgDeg;
        final int count;
        final String course;
        final double deg;
        final Double steep1km;

        Row(String id, int elev, double avgDeg, int count, String course, double deg, Double steep1km) {
            this.id = id;
            this.elev = elev;
            this.avgDeg = avgDeg;
            this.count = count;
            this.course = course;
            this.deg = deg;
            this.steep1km = steep1km;
        }
    }

    /** 결과 - avg(평균 순) · steepest(가장 가파른 코스 순), 모든 산(화면은 TOP 개 + 나머지 접어서 - 2026-10-18 홍TV님 "전체"). */
    static final class Result {
        final List<Row> avg;
        final List<Row> steepest;

        Result(List<Row> avg, List<Row> steepest) {
            this.avg = avg;
            this.steepest = steepest;
        }
    }

    /** 순수 함수 - 코스 평균 각도(도) = atan(오르막 ÷ 거리). 순위와 같은 기준(1km 이상 · 오르막 있음)이 아니면 null. */
    static Double angle(int distM, Integer ascM) {
        return distM < MIN_DIST || ascM == null || ascM <= 0 ? null : Math.toDegrees(Math.atan((double) ascM / distM));
    }

    /**
     * 순수 함수 - 코스 줄의 가파름 글(산 페이지 · 순위가 같은 기준 - 2026-10-18 홍TV님 "통일"): " · 각도 19.2° · 경사 34.7% · 가파른 1km 36.0%".
     * 각도 · 경사는 1km 이상 · 오르막 있는 코스만, 가파른 1km 는 값이 있을 때만.
     */
    static String slopeText(int distM, Integer ascM, Double steep1km, boolean en) {
        StringBuilder b = new StringBuilder();
        Double a = angle(distM, ascM);
        if (a != null) b.append(String.format(Locale.ROOT, en ? " · angle %.1f° · grade %.1f%%" : " · 각도 %.1f° · 경사 %.1f%%", a, pct(a)));
        if (steep1km != null) b.append(String.format(Locale.ROOT, en ? " · steepest 1 km %.1f%%" : " · 가파른 1km %.1f%%", steep1km));
        return b.toString();
    }

    /** 순수 함수 - 각도(도) → 경사(%). */
    static double pct(double deg) {
        return Math.tan(Math.toRadians(deg)) * 100;
    }

    /** 순수 함수 - courses: 산 id → 산 페이지와 같은 코스 목록(distance_m · ascent_m · name · steep_pct). 코스가 없는 산은 뺌. */
    static Result rank(JsonArray peaks, Map<String, List<JsonObject>> courses) {
        List<Row> rows = new ArrayList<>();
        for (JsonElement e : peaks) {
            JsonObject p = e.getAsJsonObject();
            String id = MountainEn.id(p);
            Integer elev = MountainServlet.elev(p);
            List<JsonObject> cs = courses.get(id);
            if (id == null || elev == null || elev < MIN_ELEV || cs == null) continue;
            double sum = 0;
            int n = 0;
            JsonObject best = null;
            double bestDeg = -1;
            for (JsonObject c : cs) {
                if (!num(c, "distance_m") || !num(c, "ascent_m")) continue;
                Double a = angle(c.get("distance_m").getAsInt(), c.get("ascent_m").getAsInt());
                if (a == null) continue;
                double deg = a;
                sum += deg;
                n++;
                if (deg > bestDeg) {
                    bestDeg = deg;
                    best = c;
                }
            }
            if (n == 0) continue;
            rows.add(new Row(id, elev, sum / n, n, best.get("name").getAsString(), bestDeg, MountainServlet.steep(best)));
        }
        List<Row> avg = new ArrayList<>(rows), st = new ArrayList<>(rows);
        avg.sort(Comparator.comparingDouble((Row r) -> -r.avgDeg).thenComparing(r -> r.id));
        st.sort(Comparator.comparingDouble((Row r) -> -r.deg).thenComparing(r -> r.id));
        return new Result(avg, st);
    }

    private static boolean num(JsonObject o, String k) {
        return o.has(k) && o.get(k).isJsonPrimitive() && o.get(k).getAsJsonPrimitive().isNumber();
    }

    /** 순수 함수 - html(r, en, 0): 모두 접힌 채. */
    static String html(Result r, boolean en) {
        return html(r, en, 0);
    }

    /** 순수 함수 - "?open=steep1" · "steep2" → 펼칠 표 1 · 2, 아니면 0. */
    static int openOf(String open) {
        return "steep1".equals(open) ? 1 : "steep2".equals(open) ? 2 : 0;
    }

    /**
     * 순수 함수 - 접는 칸 하나 안에 두 표(표마다 접는 칸 - 처음엔 접힘, 하나를 펴면 다른 하나는 접힘, 2026-10-18 홍TV님). r 이 없거나 비면 "".
     * en - 영어(/en/m/). open - 펼칠 표(1 평균 · 2 코스, 0 은 모두 접음) - 산 페이지의 "‹ 코스 모음" 으로 돌아올 때(?open=steep1 · steep2).
     * 산 이름 링크에 ?from=steep1 · steep2 를 붙여 산 페이지(js/mountain.js · mountain-en.js)가 돌아갈 곳을 앎.
     */
    static String html(Result r, boolean en, int open) {
        if (r == null || r.avg.isEmpty()) return "";
        String rel = MountainServlet.REL;
        StringBuilder b = new StringBuilder("<section id=\"steep\"><details class=\"fold kind\" name=\"kind\"").append(open > 0 ? " open" : "").append("><summary><span class=\"ft\">")
                .append(en ? "🧗 Steepest mountains" : "🧗 가파른 산 순위").append("</span><span class=\"fs\">")
                .append(en ? "All peaks 500 m+ · angle · grade · steepest 1 km" : "500m 이상 전체 · 각도 · 경사 · 가파른 1km").append("</span><span class=\"fa\">▾</span></summary><div class=\"fb\">");
        // 3칸(# · 산 · 수치) - 수치는 한 칸에 세로로. 5칸이면 360px · 가++ · 영어에서 오른쪽이 잘렸음(2026-10-18 PC)
        String grade = en ? "grade " : "경사 ";
        b.append(sub(en ? "Steepest on average" : "평균이 가장 가파른 산", open == 1, r.avg.size(), en)).append("<div class=\"stWrap\"><table class=\"stT\"><thead><tr><th>#</th><th>")
                .append(en ? "Mountain · steepest trail" : "산 · 가장 가파른 코스").append("</th><th class=\"n\">").append(en ? "Avg angle" : "평균 각도").append("</th></tr></thead><tbody>");
        int i = 0;
        for (Row x : r.avg) {
            if (i == TOP) b.append(more(en, r.avg.size()));
            b.append("<tr><td class=\"rk\">").append(++i).append("</td><td>").append(peak(x, en, rel, 1)).append("<small>").append(String.format(Locale.ROOT, "%,dm", x.elev))
                    .append(en ? " · " + x.count + (x.count == 1 ? " trail" : " trails") : " · 코스 " + x.count).append("</small><small class=\"cr\">")
                    .append(en ? "Steepest: " : "가장 가파른 ").append(course(x, en)).append(String.format(Locale.ROOT, " %.1f°", x.deg)).append("</small></td><td class=\"n\"><b>")
                    .append(String.format(Locale.ROOT, "%.1f°", x.avgDeg)).append("</b><small>").append(grade).append(String.format(Locale.ROOT, "%.1f%%", pct(x.avgDeg))).append("</small></td></tr>");
        }
        b.append("</tbody></table></div></details>");
        b.append(sub(en ? "Steepest single trail" : "가장 가파른 코스를 가진 산", open == 2, r.steepest.size(), en)).append("<div class=\"stWrap\"><table class=\"stT\"><thead><tr><th>#</th><th>")
                .append(en ? "Mountain · trail" : "산 · 코스").append("</th><th class=\"n\">").append(en ? "Angle" : "각도").append("</th></tr></thead><tbody>");
        i = 0;
        for (Row x : r.steepest) {
            if (i == TOP) b.append(more(en, r.steepest.size()));
            b.append("<tr><td class=\"rk\">").append(++i).append("</td><td>").append(peak(x, en, rel, 2)).append("<small>").append(String.format(Locale.ROOT, "%,dm", x.elev))
                    .append(" · ").append(course(x, en)).append("</small></td><td class=\"n\"><b>").append(String.format(Locale.ROOT, "%.1f°", x.deg)).append("</b><small>")
                    .append(grade).append(String.format(Locale.ROOT, "%.1f%%", pct(x.deg))).append("</small>")
                    .append(x.steep1km != null ? "<small class=\"s1\">" + (en ? "steepest 1 km " : "가파른 1km ") + String.format(Locale.ROOT, "%.1f%%", x.steep1km) + "</small>" : "").append("</td></tr>");
        }
        b.append("</tbody></table></div></details><p class=\"dim\">").append(en
                ? "Peaks 500 m and higher. Trails of 1 km or more that reach the summit; angle = total ascent ÷ distance (whole trail), grade = rise per 100 m. "
                        + "1 km is the grade of the steepest 1 km stretch of that trail. Short sections are much steeper than the average."
                : "정상 해발 500m 이상 산, 정상까지 가는 1km 이상 코스. 각도는 오르막 총량 ÷ 코스 거리(코스 전체 평균), 경사는 100m 가는 동안 오르는 높이. "
                        + "1km 는 그 코스에서 가장 가파른 1km 구간의 경사 - 짧은 구간은 평균보다 훨씬 가파릅니다.")
                .append("</p></div></details></section>");
        return b.toString();
    }

    /**
     * TOP 아래는 접어 둠: 표 안에 &lt;details&gt; 를 못 넣어 tbody 를 둘로 - 첫 tbody 끝에 "11위부터 보기" 단추 줄, 둘째 tbody(class stRest)는
     * 접는 칸 열림을 CSS(:has)로 따름. 스크립트 없이도 됨(:has 가 없는 옛 브라우저는 모두 펼쳐 보임).
     */
    private static String more(boolean en, int n) {
        return "<tr class=\"stMoreRow\"><td colspan=\"3\"><details class=\"stMore\"><summary>" + (en ? "Show #" + (TOP + 1) + "–" + n : (TOP + 1) + "위 ~ " + n + "위 보기")
                + "</summary></details></td></tr></tbody><tbody class=\"stRest\">";
    }

    /** 표 하나의 접는 칸 머리 - name="steepT" 라 하나를 펴면 다른 하나는 접힘. */
    private static String sub(String title, boolean open, int n, boolean en) {
        return "<details class=\"fold group stF\" name=\"steepT\"" + (open ? " open" : "") + "><summary><span class=\"ft\">" + esc(title)
                + "</span><span class=\"fs\">" + (en ? "all " + n : "전체 " + n + "곳") + "</span><span class=\"fa\">▾</span></summary>";   // TOP 아래는 표 안 "11위부터 보기"
    }

    private static String peak(Row x, boolean en, String rel, int table) {
        String href = (en ? Roman.slug(x.id) : rel + "/m/" + MountainServlet.enc(x.id)) + "?from=steep" + table;
        String name = en ? Roman.of(x.id).replace("(", " (") : x.id;
        return "<a href=\"" + esc(href) + "\">" + esc(name) + "</a>";
    }

    private static String course(Row x, boolean en) {
        return en ? esc(MountainEn.courseName(x.course)) : esc(x.course);
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
