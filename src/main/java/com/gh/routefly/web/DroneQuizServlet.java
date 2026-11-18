package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 드론 필기 연습 문항을 검색에 잡히는 글로(2026-11-18 홍TV님 "드론 문제들도 모두 sitemap 에 등록해줘").
 * dronefly.html 의 📝 필기 연습은 화면 스크립트가 data/drone-quiz.json 을 받아 그려 주소가 없음 - 시험마다 한 페이지에 문제 · 보기 · 정답 · 해설을 모두 씀.
 * {@code /drone-quiz/c4} 4종 · {@code /drone-quiz/c1} 1종 · {@code /drone-quiz/inst} 교관 과정(묶음 id 는 drone-quiz.json 그대로), 사이트맵은 {@link #IDS}.
 * 문항 하나마다 페이지를 만들면 얇은 페이지 수백 개가 됨(2026-11-07 애드센스 "가치가 별로 없는 콘텐츠") - 묶음마다 한 페이지.
 */
@WebServlet(urlPatterns = {"/drone-quiz/*"})
public class DroneQuizServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String REL = "..";
    /** 사이트맵에 넣는 묶음(화면 고르기 차례와 같음). */
    static final String[] IDS = {"c4", "c1", "inst"};

    private static volatile JsonObject data;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String base = ShareServlet.baseUrl(RouteflyConfig.get("site.baseUrl"), req.getScheme(), req.getServerName(), req.getServerPort(),
                req.getContextPath(), req.getHeader("X-Forwarded-Proto"));
        String id = req.getPathInfo() == null ? "" : req.getPathInfo().replaceFirst("^/", "");
        JsonObject set = set(data(), id);
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setContentType("text/html");
        if (set == null) {
            resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
            resp.getWriter().print(MountainServlet.head("문항을 찾지 못했습니다", "dronefly 드론 필기 연습", base + "/dronefly.html", base, null, null, false)
                    + "<main><h1>문항을 찾지 못했습니다</h1><p><a href=\"" + REL + "/dronefly.html#quiz\">📝 dronefly 필기 연습</a></p>" + foot());
            return;
        }
        resp.setHeader("Cache-Control", "public, max-age=3600");
        resp.getWriter().print(page(set, base));
    }

    private JsonObject data() throws IOException {
        JsonObject d = data;
        if (d != null) return d;
        try (InputStream in = getServletContext().getResourceAsStream("/data/drone-quiz.json")) {
            if (in == null) return new JsonObject();
            return data = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
        }
    }

    /** 순수 함수 - 묶음 id 로 찾기(없거나 IDS 밖이면 null). */
    static JsonObject set(JsonObject d, String id) {
        if (d == null || !d.has("sets") || !java.util.Arrays.asList(IDS).contains(id)) return null;
        for (JsonElement e : d.getAsJsonArray("sets")) if (id.equals(e.getAsJsonObject().get("id").getAsString())) return e.getAsJsonObject();
        return null;
    }

    /** 순수 함수 - 묶음 한 페이지(문제 · 보기 · 정답 · 해설 · 근거 또는 블로그 글). */
    static String page(JsonObject set, String base) {
        String id = set.get("id").getAsString(), name = set.get("name").getAsString();
        JsonArray qs = set.getAsJsonArray("qs");
        boolean made = "c1".equals(id);   // 1종은 새로 쓴 연습 문제, 4종 · 교관 과정은 블로그 글 문항
        String url = base + "/drone-quiz/" + id;
        String title = "드론 " + name + " " + qs.size() + "문항 - 정답 · 해설";
        String desc = name + " " + qs.size() + "문항과 정답 · 해설. "
                + (made ? "항공안전법 원문(2026. 11. 13. 시행) · 항공기상 · 비행이론으로 만든 초경량비행장치 조종자 학과 연습 문제." : "hongtv.tistory.com 블로그의 평가시험 문항.")
                + " dronefly 에서 바로 풀어 보고 틀린 문항만 다시 풀 수 있습니다.";
        StringBuilder b = new StringBuilder(MountainServlet.head(title, desc, url, base, null, null, true));
        b.append(MountainServlet.breadcrumb(new String[][] {{"dronefly(드론)", base + "/dronefly.html"}, {name, url}}));
        b.append("<main class=\"cp\"><p class=\"crumb\"><a href=\"").append(REL).append("/dronefly.html\">‹ dronefly(드론)</a></p>");
        b.append("<h1>").append(esc(name)).append(" - ").append(qs.size()).append("문항</h1>");
        b.append("<p class=\"lead\">").append(made
                ? "법령 원문(항공안전법 · 시행령 · 시행규칙, 2026. 11. 13. 시행)과 항공기상 · 비행이론 일반 내용으로 새로 만든 연습 문제입니다. 실제 시험 문제가 아닙니다(1 ~ 3종 학과시험 범위)."
                : "hongtv.tistory.com 블로그에 올린 문항입니다. 그림이 있는 해설은 문항마다 블로그 글로 이어집니다.").append("</p>");
        b.append("<p class=\"go\"><a class=\"main\" href=\"").append(REL).append("/dronefly.html#quiz-").append(esc(id)).append("\">📝 dronefly 에서 풀어 보기</a>");
        for (String o : IDS) if (!o.equals(id)) b.append("<a href=\"").append(esc(o)).append("\">").append(esc(otherName(o))).append("</a>");
        b.append("</p><ol class=\"dq\">");
        for (JsonElement e : qs) {
            JsonObject q = e.getAsJsonObject();
            String no = q.get("no").getAsString();
            int ans = q.get("ans").getAsInt();
            JsonArray c = q.getAsJsonArray("c");
            b.append("<li id=\"q").append(esc(no)).append("\"><p class=\"dqQ\">").append(esc(label(no))).append(' ').append(esc(q.get("q").getAsString())).append("</p><ol class=\"dqC\">");
            for (int i = 0; i < c.size(); i++) b.append("<li>").append("①②③④".charAt(i)).append(' ').append(esc(c.get(i).getAsString())).append("</li>");
            b.append("</ol><details><summary>정답 · 해설</summary><p>정답 ").append("①②③④".charAt(ans - 1)).append(' ').append(esc(c.get(ans - 1).getAsString())).append("</p>");
            if (q.has("ex") && !q.get("ex").getAsString().isBlank()) b.append("<p class=\"dqEx\">").append(esc(q.get("ex").getAsString())).append("</p>");
            if (q.has("basis")) b.append("<p class=\"dim\">근거: ").append(esc(q.get("basis").getAsString())).append("</p>");
            if (q.has("post")) b.append("<p class=\"dim\"><a href=\"https://hongtv.tistory.com/").append(q.get("post").getAsInt()).append("\" rel=\"noopener\">블로그 글에서 그림과 함께 보기 ›</a></p>");
            b.append("</details></li>");
        }
        b.append("</ol><p class=\"go\"><a class=\"main\" href=\"").append(REL).append("/dronefly.html#quiz-").append(esc(id)).append("\">📝 dronefly 에서 풀어 보기</a></p>");
        return b.append(foot()).toString();
    }

    private static String otherName(String id) {
        return "c4".equals(id) ? "4종 95문항 ›" : "c1".equals(id) ? "1종 100문항 ›" : "교관 과정 65문항 ›";
    }

    /** "7" → "7.", "1-관련" → "1번 관련 문제)" - 화면(dronefly.js quizLabel)과 같은 글. */
    static String label(String no) {
        return no.endsWith("-관련") ? no.substring(0, no.length() - 3) + "번 관련 문제)" : no + ".";
    }

    private static String foot() {
        return "<p class=\"dim\">판정 · 문항은 참고용입니다. 법령 · 고시는 바뀔 수 있으니 국가법령정보센터 · 드론원스톱에서 한 번 더 확인하세요. "
                + "<a href=\"" + REL + "/about.html\">안내</a> · <a href=\"" + REL + "/terms.html\">이용약관</a> · <a href=\"" + REL + "/privacy.html\">개인정보처리방침</a> · <a href=\"" + REL + "/feedback.html?from=/drone-quiz/\">📮 의견 보내기</a></p>"
                + "<p class=\"copy\">© 2026 홍TV · routefly.</p></main>"
                + "<script src=\"" + REL + "/" + AssetVersion.of("js/seen.js") + "\"></script></body></html>";
    }

    private static String esc(String s) {
        return ShareServlet.esc(s == null ? "" : s);
    }
}
