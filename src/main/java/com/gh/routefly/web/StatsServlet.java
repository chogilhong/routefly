package com.gh.routefly.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonObject;

/**
 * 운영 통계 보기. {@code GET /stats?key=…} - 설정 {@code stats.key}(12자 이상)와 같을 때만, 아니면 404. 2026-10-15 홍TV님.
 * 최근 30일 날마다 방문자 · 화면 수 · 로봇, 30일 인기 산 페이지 20곳, 화면별 수. 검색 엔진에 안 나오게(noindex).
 */
@WebServlet(urlPatterns = {"/stats"})
public class StatsServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    /** 운영자 기기 쿠키 이름 - 있으면 방문 수에 안 셈. */
    static final String OWNER_COOKIE = "rf-owner";

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!allowed(RouteflyConfig.get("stats.key"), req.getParameter("key"))) {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        // 운영자 기기 표시(2026-10-20 홍TV님 "우리가 접속한 것도 잡히지?") - 이 기기의 방문은 그 뒤로 세지 않음(StatsFilter). 2년.
        resp.addHeader("Set-Cookie", OWNER_COOKIE + "=1; Max-Age=" + (2 * 365 * 24 * 3600) + "; Path=" + (req.getContextPath().isEmpty() ? "/" : req.getContextPath())
                + "; HttpOnly; SameSite=Lax" + (req.isSecure() || "https".equalsIgnoreCase(req.getHeader("X-Forwarded-Proto")) ? "; Secure" : ""));
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        resp.setHeader("X-Robots-Tag", "noindex");
        Map<String, JsonObject> days = Stats.days();
        resp.getWriter().print(page(days, 30, courseNames(topCourses(days, 30, 20))));
    }

    /** 인기 코스 이름(DB) - 못 읽으면 빈 표(번호만 보임). */
    private static Map<String, String> courseNames(List<String> ids) {
        Map<String, String> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        try (java.sql.Connection c = Db.open()) {
            String marks = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
            for (var e : Json.rows(c, "SELECT course_id, name FROM route_course WHERE course_id IN (" + marks + ")", ids.toArray())) {
                JsonObject o = e.getAsJsonObject();
                out.put(o.get("course_id").getAsString(), o.get("name").getAsString());
            }
        } catch (Exception e) {
            // DB 가 없거나 막힘 - 번호만
        }
        return out;
    }

    /** 순수 함수 - 최근 n 일 코스 소개 페이지 많이 본 코스 번호 위에서 k 개. */
    static List<String> topCourses(Map<String, JsonObject> days, int n, int k) {
        Map<String, Integer> m = new HashMap<>();
        List<String> keys = new ArrayList<>(days.keySet());
        for (String d : keys.subList(Math.max(0, keys.size() - n), keys.size())) {
            JsonObject o = days.get(d);
            if (o.has("courses")) for (var e : o.getAsJsonObject("courses").entrySet()) m.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
        }
        List<String> out = new ArrayList<>();
        m.entrySet().stream().sorted((x, y) -> y.getValue() - x.getValue()).limit(k).forEach(e -> out.add(e.getKey()));
        return out;
    }

    /** 순수 함수 - 열쇠가 설정돼 있고(12자 이상) 같을 때만(시간이 같은 견줌). */
    static boolean allowed(String want, String got) {
        if (want == null || want.length() < 12 || got == null) return false;
        return MessageDigest.isEqual(want.getBytes(StandardCharsets.UTF_8), got.getBytes(StandardCharsets.UTF_8));
    }

    /** 순수 함수 - 보기 화면(최근 n 일). */
    static String page(Map<String, JsonObject> days, int n, Map<String, String> courseNames) {
        List<String> keys = new ArrayList<>(days.keySet());
        List<String> last = keys.subList(Math.max(0, keys.size() - n), keys.size());
        Map<String, Integer> mountains = new HashMap<>(), enMountains = new HashMap<>(), courses = new HashMap<>(), pages = new HashMap<>(), refs = new HashMap<>(), devs = new HashMap<>(), bots = new HashMap<>();
        StringBuilder rows = new StringBuilder();
        int tu = 0, tp = 0, tb = 0;
        for (int i = last.size() - 1; i >= 0; i--) {
            JsonObject d = days.get(last.get(i));
            int views = 0;
            for (Map.Entry<String, com.google.gson.JsonElement> e : d.getAsJsonObject("pages").entrySet()) {
                int v = e.getValue().getAsInt();
                views += v;
                String k = e.getKey();
                if (k.startsWith("/m/") && k.length() > 3) mountains.merge(k.substring(3), v, Integer::sum);
                else if (k.startsWith("/en/m/") && k.length() > 6) enMountains.merge(k.substring(6), v, Integer::sum);   // 영어 산 페이지는 따로 표(2026-10-21)
                else pages.merge(k, v, Integer::sum);
            }
            if (d.has("refs")) for (Map.Entry<String, com.google.gson.JsonElement> e : d.getAsJsonObject("refs").entrySet()) refs.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            int u = d.get("uniq").getAsInt(), b = d.get("bots").getAsInt();
            tu += u; tp += views; tb += b;
            if (d.has("courses")) for (var e : d.getAsJsonObject("courses").entrySet()) courses.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            if (d.has("botKinds")) for (var e : d.getAsJsonObject("botKinds").entrySet()) bots.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            if (d.has("devUniq")) for (var e : d.getAsJsonObject("devUniq").entrySet()) devs.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            rows.append("<tr><td>").append(last.get(i)).append("</td><td>").append(u).append("</td><td>").append(dev(d, "모바일")).append("</td><td>").append(dev(d, "PC"))
                    .append("</td><td>").append(views).append("</td><td>").append(b).append("</td></tr>");
        }
        StringBuilder out = new StringBuilder("<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<meta name=\"robots\" content=\"noindex\"><title>routefly 통계</title>" + MountainServlet.icons(".") + "<link rel=\"stylesheet\" href=\"css/mountain.css\"></head><body><main><h1>routefly 통계</h1>"
                + "<p class=\"lead\">최근 " + last.size() + "일 · 방문자(하루마다 센 수의 합) " + String.format(Locale.KOREA, "%,d", tu) + " · 화면 " + String.format(Locale.KOREA, "%,d", tp)
                + " · 로봇 " + String.format(Locale.KOREA, "%,d", tb) + botLine(bots) + "</p>");
        out.append(trend(days, n));
        out.append("<section><h2>날마다</h2><table class=\"st\"><tr><th>날짜</th><th>방문자</th><th>모바일</th><th>PC</th><th>화면</th><th>로봇</th></tr>").append(rows).append("</table></section>");
        out.append(top("모바일 · PC 방문자(" + last.size() + "일 - 10-20 부터 셈)", devs, 5, null))
                .append(top("인기 산 페이지(" + last.size() + "일)", mountains, 20, null))
                .append(top("인기 산 페이지 - 영어(" + last.size() + "일 - /en/m/, 외국 손님)", enMountains, 20, null))
                .append(courseTable(courses, courseNames == null ? Map.of() : courseNames, last.size()))
                .append(top("화면별(" + last.size() + "일)", pages, 20, StatsServlet::pageName))
                .append(top("들어온 곳(" + last.size() + "일 - 바깥에서 처음 들어온 화면 수)", refs, 20, null))
                .append(botTable(bots))
                .append(GUIDE);
        out.append("<p class=\"dim\">숫자만 셉니다 - 방문자는 그 날만 쓰는 해시로 겹침만 걸러 내고 IP 는 남기지 않습니다. 이 화면을 연 기기(브라우저)는 운영자로 보고 방문 수에서 뺍니다(2년, 사이트 데이터를 지우면 다시 셈). 앱(따라가기 앱)은 따로라 빠지지 않습니다.</p></main></body></html>");
        return out.toString();
    }

    /** 순수 함수 - 인기 코스 상위 20(코스 소개 페이지 /c/<코스>, 10-21 부터 셈). 이름은 DB 에서(없으면 번호만), 누르면 그 코스 소개. */
    static String courseTable(Map<String, Integer> m, Map<String, String> names, int days) {
        StringBuilder b = new StringBuilder("<section><h2>인기 코스 상위 20(" + days + "일 - 코스 소개 페이지, 10-21 부터 셈)</h2><table class=\"st\">");
        if (m.isEmpty()) return b.append("<tr><td>아직 없음</td></tr></table></section>").toString();
        b.append("<tr><th>코스</th><th>번호</th><th>수</th></tr>");
        m.entrySet().stream().sorted((x, y) -> y.getValue() - x.getValue()).limit(20).forEach(e -> b.append("<tr><td><a href=\"c/").append(ShareServlet.esc(e.getKey())).append("\">")
                .append(ShareServlet.esc(names.getOrDefault(e.getKey(), e.getKey()))).append("</a></td><td>").append(ShareServlet.esc(e.getKey())).append("</td><td>").append(e.getValue()).append("</td></tr>"));
        return b.append("</table></section>").toString();
    }

    /** 순수 함수 - 로봇 종류 표(사람이 아닌 접속, 10-21 부터 나눠 셈) - 줄마다 뜻(2026-10-21 홍TV님 "무슨 말이야?" - 제목에 다 넣었던 것을 줄로). */
    static String botTable(Map<String, Integer> bots) {
        StringBuilder b = new StringBuilder("<section><h2>로봇 종류 <small style=\"font-weight:normal;color:var(--dim);font-size:13px\">사람이 아닌 프로그램 - 10월 21일부터 나눠 셈</small></h2><table class=\"st\">");
        String[][] kinds = {{"검색", "구글 · 네이버 · 다음이 페이지를 읽어 감 - 많을수록 검색에 잘 나옴"}, {"미리보기", "카톡 · 페이스북에 우리 링크를 붙일 때 제목 · 그림을 가져감"},
            {"시험", "웹 · PC Claude 점검 도구"}, {"기타", "검색 순위 분석 · AI 회사 수집 프로그램"}};
        if (bots.isEmpty()) return b.append("<tr><td>아직 없음</td></tr></table></section>").toString();
        b.append("<tr><th>종류</th><th>뜻</th><th>수</th></tr>");
        for (String[] k : kinds) b.append("<tr><td>").append(k[0]).append("</td><td>").append(k[1]).append("</td><td>").append(bots.getOrDefault(k[0], 0)).append("</td></tr>");
        return b.append("</table></section>").toString();
    }

    /** 보는 법(2026-10-21 홍TV님 "설명자료도 추가") - 표마다 무엇을 세는지. */
    static final String GUIDE = "<section><h2>📖 통계 보는 법</h2><ul>"
            + "<li><b>방문자</b>: 그 날 들어온 사람 수(같은 사람은 하루 한 번). 여러 날을 더한 수라 같은 사람이 이틀 오면 2. <b>화면</b>: 연 화면 수.</li>"
            + "<li><b>로봇</b>: 사람이 아닌 접속. 검색(구글 · 네이버 · 다음이 페이지를 읽어 감 - 검색에 나오려면 필요), 미리보기(카톡 · 페이스북에 링크를 붙일 때), "
            + "시험(웹 · PC Claude 점검 도구), 기타(검색 순위 분석 · AI 수집기). 방문자 · 화면 수에는 안 들어감.</li>"
            + "<li><b>인기 산 페이지</b>: 산 소개(/m/산이름) - 산마다. <b>영어</b> 표는 외국 손님용 영어 산 소개(/en/m/영문이름, 예: daeamsan = 대암산).</li>"
            + "<li><b>인기 코스 상위 20</b>: 코스 하나짜리 소개(/c/코스번호 - 수천 개, 주로 네이버 · 구글 검색 손님) - 코스 이름을 누르면 그 페이지. "
            + "화면별 표의 \"코스 소개 페이지(검색 손님)\" 는 이 페이지들을 모두 더한 한 줄.</li>"
            + "<li><b>들어온 곳</b>: 바깥(네이버 · 구글 · 카톡 등)에서 처음 들어온 화면 수. 우리 화면끼리 옮겨 다닌 것은 안 셈.</li>"
            + "<li><b>모바일 · PC</b>: 방문자를 기기로 나눔(10-20 부터).</li>"
            + "<li>이 화면을 연 브라우저(운영자)는 세지 않습니다. 앱 · 다른 브라우저는 따로라 셉니다. 숫자는 서버가 지금 세는 것 그대로(10분마다 파일로 저장).</li>"
            + "</ul></section>";

    /** 순수 함수 - "(검색 n · 미리보기 n · 시험 n · 기타 n)" - 나눠 센 날이 없으면 빈 글. */
    static String botLine(Map<String, Integer> bots) {
        if (bots.isEmpty()) return "";
        StringBuilder b = new StringBuilder();
        for (String k : new String[] {"검색", "미리보기", "시험", "기타"}) {
            if (!bots.containsKey(k)) continue;
            b.append(b.length() == 0 ? "" : " · ").append(k).append(' ').append(String.format(Locale.KOREA, "%,d", bots.get(k)));
        }
        return " (" + b + ")";
    }

    /**
     * 방문 추세 그림(2026-10-20 홍TV님 "방문 추세를 그래프로"). 방문자 · 화면 두 그림(눈금이 달라 한 그림에 겹치지 않음 - 한 축).
     * 첫날부터 마지막 날까지 빈 날은 0 으로 채우고 최근 n 일. 스크립트 없이 SVG - 점에 손을 대면 날짜 · 수(title).
     */
    static String trend(Map<String, JsonObject> days, int n) {
        if (days.isEmpty()) return "";
        java.util.TreeMap<String, JsonObject> sorted = new java.util.TreeMap<>(days);
        java.time.LocalDate first = java.time.LocalDate.parse(sorted.firstKey()), end = java.time.LocalDate.parse(sorted.lastKey());
        if (first.isBefore(end.minusDays(n - 1))) first = end.minusDays(n - 1);
        List<String> dates = new ArrayList<>();
        List<Integer> uniq = new ArrayList<>(), views = new ArrayList<>();
        for (java.time.LocalDate d = first; !d.isAfter(end); d = d.plusDays(1)) {
            JsonObject o = days.get(d.toString());
            dates.add(d.toString());
            uniq.add(o == null ? 0 : o.get("uniq").getAsInt());
            int v = 0;
            if (o != null) for (var e : o.getAsJsonObject("pages").entrySet()) v += e.getValue().getAsInt();
            views.add(v);
        }
        return "<section><h2>방문 추세(" + dates.size() + "일)</h2>"   // 넓은 화면 · 휴대폰 두 벌(css 가 하나만 보임 - 한 벌을 줄이면 글자가 너무 작아짐)
                + "<div class=\"chW\">" + line("방문자", dates, uniq, 640) + line("화면", dates, views, 640) + "</div>"
                + "<div class=\"chN\">" + line("방문자", dates, uniq, 340) + line("화면", dates, views, 340) + "</div>"
                + "<p class=\"dim\">점에 손가락 · 마우스를 대면 그 날 수가 보입니다. 정확한 수는 아래 표.</p></section>";
    }

    /** 선 그림 하나(SVG). 눈금 0 · 가운데 · 위(1 · 2 · 5 × 10ⁿ 로 올림), 날짜는 처음 · 가운데 · 끝, 마지막 값은 글자로. */
    static String line(String name, List<String> dates, List<Integer> v, int w) {
        int h = w < 500 ? 170 : 190, l = 40, r = 36, t = 14, b = 26, k = v.size();
        int max = 1;
        for (int x : v) max = Math.max(max, x);
        int top = nice(max);
        double pw = w - l - r, ph = h - t - b;
        java.util.function.IntFunction<Double> X = i -> k == 1 ? l + pw / 2 : l + pw * i / (k - 1);
        java.util.function.IntFunction<Double> Y = val -> t + ph * (1 - (double) val / top);
        StringBuilder s = new StringBuilder("<figure style=\"margin:8px 0 14px\"><figcaption class=\"dim\">" + name + " (하루)</figcaption>")
                .append("<svg viewBox=\"0 0 ").append(w).append(' ').append(h).append("\" width=\"100%\" role=\"img\" aria-label=\"")
                .append(name).append(" 날마다 - ").append(dates.get(0)).append("부터 ").append(dates.get(k - 1)).append("까지, 마지막 날 ").append(v.get(k - 1)).append("\">");
        for (int g : new int[] {0, top / 2, top}) {   // 눈금 - 옅게
            double y = Y.apply(g);
            s.append(String.format(Locale.ROOT, "<line x1=\"%d\" x2=\"%d\" y1=\"%.1f\" y2=\"%.1f\" stroke=\"rgba(255,255,255,0.12)\" stroke-width=\"1\"/>", l, w - r, y, y))
                    .append(String.format(Locale.ROOT, "<text x=\"%d\" y=\"%.1f\" fill=\"#9aa6b4\" font-size=\"11\" text-anchor=\"end\">%,d</text>", l - 6, y + 4, g));
        }
        for (int i : k == 1 ? new int[] {0} : w < 500 ? new int[] {0, k - 1} : new int[] {0, (k - 1) / 2, k - 1}) {   // 날짜(좁으면 처음 · 끝만)
            String anchor = k == 1 ? "middle" : i == 0 ? "start" : i == k - 1 ? "end" : "middle";
            s.append(String.format(Locale.ROOT, "<text x=\"%.1f\" y=\"%d\" fill=\"#9aa6b4\" font-size=\"11\" text-anchor=\"%s\">%s</text>", X.apply(i), h - 8, anchor, dates.get(i).substring(5)));
        }
        double colW = k == 1 ? pw : pw / (k - 1);
        StringBuilder path = new StringBuilder(), area = new StringBuilder();
        for (int i = 0; i < k; i++) {
            path.append(i == 0 ? "M" : "L").append(String.format(Locale.ROOT, "%.1f,%.1f", X.apply(i), Y.apply(v.get(i))));
        }
        area.append(path).append(String.format(Locale.ROOT, "L%.1f,%.1fL%.1f,%.1fZ", X.apply(k - 1), Y.apply(0), X.apply(0), Y.apply(0)));
        s.append("<path d=\"").append(area).append("\" fill=\"#38d9ea\" fill-opacity=\"0.10\"/>");
        s.append("<path d=\"").append(path).append("\" fill=\"none\" stroke=\"#38d9ea\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>");
        for (int i = 0; i < k; i++) {   // 점(점 사이가 넉넉할 때만) + 손 대는 칸(점보다 넓게)
            if (colW >= 12) s.append(String.format(Locale.ROOT, "<circle cx=\"%.1f\" cy=\"%.1f\" r=\"4\" fill=\"#38d9ea\" stroke=\"#1a212b\" stroke-width=\"2\"/>", X.apply(i), Y.apply(v.get(i))));
            s.append(String.format(Locale.ROOT, "<rect x=\"%.1f\" y=\"%d\" width=\"%.1f\" height=\"%.1f\" fill=\"transparent\"><title>%s · %s %,d</title></rect>",
                    X.apply(i) - colW / 2, t, colW, ph, dates.get(i), name, v.get(i)));
        }
        s.append(String.format(Locale.ROOT, "<text x=\"%.1f\" y=\"%.1f\" fill=\"#e9eef4\" font-size=\"12\" font-weight=\"bold\">%,d</text>",   // 마지막 값
                X.apply(k - 1) + 8, Y.apply(v.get(k - 1)) + 4, v.get(k - 1)));
        return s.append("</svg></figure>").toString();
    }

    /** 1 · 2 · 5 × 10ⁿ 로 올림(눈금 위끝). */
    static int nice(int max) {
        int p = 1;
        while (p * 10 <= max) p *= 10;
        for (int m : new int[] {1, 2, 5, 10}) if (m * p >= max) return m * p;
        return 10 * p;
    }

    /** names - 가운데 칸에 넣을 화면 이름(null 이면 두 칸). */
    private static String top(String title, Map<String, Integer> m, int n, java.util.function.Function<String, String> names) {
        StringBuilder b = new StringBuilder("<section><h2>").append(ShareServlet.esc(title)).append("</h2><table class=\"st\">");
        if (names != null && !m.isEmpty()) b.append("<tr><th>주소</th><th>화면 이름</th><th>수</th></tr>");
        m.entrySet().stream().sorted((x, y) -> y.getValue() - x.getValue()).limit(n)
                .forEach(e -> b.append("<tr><td>").append(ShareServlet.esc(e.getKey())).append("</td>")
                        .append(names == null ? "" : "<td>" + ShareServlet.esc(names.apply(e.getKey())) + "</td>")
                        .append("<td>").append(e.getValue()).append("</td></tr>"));
        if (m.isEmpty()) b.append("<tr><td>아직 없음</td></tr>");
        return b.append("</table></section>").toString();
    }

    /** 날마다 표의 모바일 · PC 방문자 칸 - 세기 전 날(10-20 전)은 "-". */
    private static String dev(JsonObject d, String k) {
        if (!d.has("devUniq")) return "-";
        JsonObject o = d.getAsJsonObject("devUniq");
        return o.has(k) ? o.get(k).getAsString() : "0";
    }

    /** 화면 주소 → 이름(2026-10-20 홍TV님 "화면 이름도 칸을 만들어"). 각 html 의 title 과 같게. */
    static String pageName(String key) {
        return switch (key) {
            case "/index.html" -> "코스 미리보기(3D, 첫 화면)";
            case "/hike.html" -> "따라가기";
            case "/route.html" -> "노선 안내도";
            case "/park.html" -> "탐방 안내도";
            case "/series.html" -> "도장 · 완주";
            case "/anbu.html" -> "오늘의 안부";
            case "/tools.html" -> "별거 별거";
            case "/party.html" -> "산악회 방";
            case "/party-guide.html" -> "산악회 방 - 인솔자 사용법";
            case "/subway.html" -> "지하철 노선도(예전 화면 - 지금은 별거 별거 안)";
            case "/about.html" -> "안내 - 안전 · 개인정보 · 출처";
            case "/privacy.html" -> "개인정보처리방침";
            case "/feedback.html" -> "의견 보내기";
            case "/c/" -> "코스 소개 페이지(검색 손님)";
            case "/s/" -> "공유 링크";
            case "/m/" -> "산 모음";
            case "/en/m/" -> "산 모음(영어)";
            default -> key.startsWith("/en/m/") ? "산 소개(영어) - " + key.substring(6) : key.startsWith("/m/") ? "산 소개 - " + key.substring(3) : "";
        };
    }
}
