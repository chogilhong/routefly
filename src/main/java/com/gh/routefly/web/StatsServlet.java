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

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!allowed(RouteflyConfig.get("stats.key"), req.getParameter("key"))) {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        resp.setHeader("X-Robots-Tag", "noindex");
        resp.getWriter().print(page(Stats.days(), 30));
    }

    /** 순수 함수 - 열쇠가 설정돼 있고(12자 이상) 같을 때만(시간이 같은 견줌). */
    static boolean allowed(String want, String got) {
        if (want == null || want.length() < 12 || got == null) return false;
        return MessageDigest.isEqual(want.getBytes(StandardCharsets.UTF_8), got.getBytes(StandardCharsets.UTF_8));
    }

    /** 순수 함수 - 보기 화면(최근 n 일). */
    static String page(Map<String, JsonObject> days, int n) {
        List<String> keys = new ArrayList<>(days.keySet());
        List<String> last = keys.subList(Math.max(0, keys.size() - n), keys.size());
        Map<String, Integer> mountains = new HashMap<>(), pages = new HashMap<>();
        StringBuilder rows = new StringBuilder();
        int tu = 0, tp = 0, tb = 0;
        for (int i = last.size() - 1; i >= 0; i--) {
            JsonObject d = days.get(last.get(i));
            int views = 0;
            for (Map.Entry<String, com.google.gson.JsonElement> e : d.getAsJsonObject("pages").entrySet()) {
                int v = e.getValue().getAsInt();
                views += v;
                (e.getKey().startsWith("/m/") && e.getKey().length() > 3 ? mountains : pages).merge(e.getKey().startsWith("/m/") && e.getKey().length() > 3 ? e.getKey().substring(3) : e.getKey(), v, Integer::sum);
            }
            int u = d.get("uniq").getAsInt(), b = d.get("bots").getAsInt();
            tu += u; tp += views; tb += b;
            rows.append("<tr><td>").append(last.get(i)).append("</td><td>").append(u).append("</td><td>").append(views).append("</td><td>").append(b).append("</td></tr>");
        }
        StringBuilder out = new StringBuilder("<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<meta name=\"robots\" content=\"noindex\"><title>routefly 통계</title><link rel=\"stylesheet\" href=\"css/mountain.css\"></head><body><main><h1>routefly 통계</h1>"
                + "<p class=\"lead\">최근 " + last.size() + "일 · 방문자(하루마다 센 수의 합) " + String.format(Locale.KOREA, "%,d", tu) + " · 화면 " + String.format(Locale.KOREA, "%,d", tp)
                + " · 검색 로봇 · 미리보기 " + String.format(Locale.KOREA, "%,d", tb) + "</p>");
        out.append("<section><h2>날마다</h2><table class=\"st\"><tr><th>날짜</th><th>방문자</th><th>화면</th><th>로봇</th></tr>").append(rows).append("</table></section>");
        out.append(top("인기 산 페이지(" + last.size() + "일)", mountains, 20)).append(top("화면별(" + last.size() + "일)", pages, 20));
        out.append("<p class=\"dim\">숫자만 셉니다 - 방문자는 그 날만 쓰는 해시로 겹침만 걸러 내고 IP 는 남기지 않습니다.</p></main></body></html>");
        return out.toString();
    }

    private static String top(String title, Map<String, Integer> m, int n) {
        StringBuilder b = new StringBuilder("<section><h2>").append(ShareServlet.esc(title)).append("</h2><table class=\"st\">");
        m.entrySet().stream().sorted((x, y) -> y.getValue() - x.getValue()).limit(n)
                .forEach(e -> b.append("<tr><td>").append(ShareServlet.esc(e.getKey())).append("</td><td>").append(e.getValue()).append("</td></tr>"));
        if (m.isEmpty()) b.append("<tr><td>아직 없음</td></tr>");
        return b.append("</table></section>").toString();
    }
}
