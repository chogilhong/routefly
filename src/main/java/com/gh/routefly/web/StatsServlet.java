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
 * 맞으면 보기 쿠키(30일)를 주고 {@code /stats} 로 다시 보냄 - 그 뒤 30일은 {@code /stats} 만 열어도 됨.
 * 최근 30일 날마다 방문자 · 화면 수 · 로봇, 30일 인기 산 페이지 20곳, 화면별 수. 검색 엔진에 안 나오게(noindex).
 */
@WebServlet(urlPatterns = {"/stats"})
public class StatsServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    /** 운영자 기기 쿠키 이름 - 있으면 방문 수에 안 셈. */
    static final String OWNER_COOKIE = "rf-owner";
    /** 보기 쿠키 - ?key= 로 한 번 들어오면 이것으로 바꾸고 주소에서 열쇠를 뺌(2026-10-21 점검: 방문 기록 · 화면 공유에 열쇠가 남았음). 30일. */
    static final String SEE_COOKIE = "rf-stats";

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String want = RouteflyConfig.get("stats.key");
        boolean byKey = allowed(want, req.getParameter("key"));
        if (!byKey && !allowed(want == null ? null : seeToken(want), cookie(req, SEE_COOKIE))) {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        String secure = req.isSecure() || "https".equalsIgnoreCase(req.getHeader("X-Forwarded-Proto")) ? "; Secure" : "";
        // 열쇠를 쿠키로 바꿈. 화면은 바로 주고 주소에서 열쇠는 js/stats.js 가 뺌 - 302 로 다시 보내면 앱(Capacitor)이 그 주소를 바깥 크롬으로 넘겨 404 였음(2026-10-21 PC)
        if (byKey) {
            resp.addHeader("Set-Cookie", SEE_COOKIE + "=" + seeToken(want) + "; Max-Age=" + (30 * 24 * 3600) + "; Path=" + req.getContextPath() + "/stats; HttpOnly; SameSite=Strict" + secure);
            resp.setHeader("Referrer-Policy", "no-referrer");
        }
        // 운영자 기기 표시(2026-10-20 홍TV님 "우리가 접속한 것도 잡히지?") - 이 기기의 방문은 그 뒤로 세지 않음(StatsFilter). 2년.
        resp.addHeader("Set-Cookie", OWNER_COOKIE + "=" + ownerToken(want) + "; Max-Age=" + (2 * 365 * 24 * 3600) + "; Path=" + (req.getContextPath().isEmpty() ? "/" : req.getContextPath())
                + "; HttpOnly; SameSite=Lax" + secure);
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
    /** 순수 함수 - 보기 쿠키 값(열쇠 자체가 아니라 열쇠의 SHA-256 - 쿠키가 새어도 열쇠는 안 나옴). 열쇠를 바꾸면 옛 쿠키는 안 맞음. */
    static String seeToken(String key) {
        return hash("rf-stats:", key);
    }

    /**
     * 순수 함수 - 운영자 기기 쿠키 값(2026-10-21: 예전엔 "1" 이라 누구나 흉내 낼 수 있었음). 통계에서 빼는 데는 아무 값이나 받지만(빼 봐야 제 방문만 빠짐),
     * 산악회 방 하루 만들기 제한을 넘기는 데는 이 값이 맞아야 함(PartyServlet - 시험 많은 날).
     */
    static String ownerToken(String key) {
        return hash("rf-owner:", key);
    }

    private static String hash(String prefix, String key) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest((prefix + key).getBytes(StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder();
            for (byte x : h) b.append(String.format("%02x", x));
            return b.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String cookie(HttpServletRequest req, String name) {
        if (req.getCookies() == null) return null;
        for (jakarta.servlet.http.Cookie c : req.getCookies()) if (name.equals(c.getName())) return c.getValue();
        return null;
    }

    static boolean allowed(String want, String got) {
        if (want == null || want.length() < 12 || got == null) return false;
        return MessageDigest.isEqual(want.getBytes(StandardCharsets.UTF_8), got.getBytes(StandardCharsets.UTF_8));
    }

    /** 순수 함수 - 보기 화면(최근 n 일). */
    static String page(Map<String, JsonObject> days, int n, Map<String, String> courseNames) {
        List<String> keys = new ArrayList<>(days.keySet());
        List<String> last = keys.subList(Math.max(0, keys.size() - n), keys.size());
        Map<String, Integer> mountains = new HashMap<>(), enMountains = new HashMap<>(), courses = new HashMap<>(), pages = new HashMap<>(), refs = new HashMap<>(), devs = new HashMap<>(), bots = new HashMap<>(), engines = new HashMap<>();
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
            if (d.has("engines")) for (var e : d.getAsJsonObject("engines").entrySet()) engines.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            if (d.has("devUniq")) for (var e : d.getAsJsonObject("devUniq").entrySet()) devs.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            rows.append("<tr><td>").append(last.get(i)).append("</td><td class=\"num\">").append(n(u)).append("</td><td class=\"num\">").append(dev(d, "모바일")).append("</td><td class=\"num\">").append(dev(d, "PC"))
                    .append("</td><td class=\"num\">").append(n(views)).append("</td><td class=\"num\">").append(n(b)).append("</td></tr>");
        }
        StringBuilder out = new StringBuilder("<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<meta name=\"robots\" content=\"noindex\"><title>routefly 통계</title>" + MountainServlet.icons(".") + "<link rel=\"stylesheet\" href=\"css/mountain.css\">"
                // 통계 화면만 글씨 · 간격을 작게(2026-10-21 홍TV님 "전체적으로 폰트가 너무 커") - 산 페이지(mountain.css)는 그대로
                + "<style>main{font-size:13px;line-height:1.5}h1{font-size:19px;margin:0 0 4px}h2{font-size:14.5px;margin:0 0 6px}.lead{font-size:12.5px;margin:0 0 10px}"
                + "section{padding:10px 12px;margin-bottom:10px}.st{font-size:12.5px}.st th,.st td{padding:3px 6px}.st th{font-weight:normal;color:var(--dim)}"
                + ".st td.num,.st th.num{text-align:right;white-space:nowrap}.st td.kd{white-space:nowrap;font-weight:bold;font-size:14px}"   // 숫자 오른쪽 · 종류 칸 한 줄(2026-10-21 홍TV님)
                + "details summary{font-size:14px!important}.st a{text-decoration:none}.st a:hover{text-decoration:underline}"
                // 칸마다 접고 펴기(2026-10-21 홍TV님) - 제목 줄을 누름, ▾ · ▸
                + "details.fold>summary{list-style:none;cursor:pointer}details.fold>summary::-webkit-details-marker{display:none}"
                + "details.fold>summary h2{display:inline;margin:0}details.fold>summary::before{content:'▶';display:inline-block;width:16px;color:var(--sky);font-size:11px}details.fold[open]>summary::before{content:'▼'}"
                + "details.fold[open]>summary{margin-bottom:6px}.statLogo{display:flex;align-items:center;gap:10px;margin:0 0 4px}.statLogo img{height:34px;width:auto}"
                + "</style></head><body><main><h1 class=\"statLogo\"><img src=\"img/logo-dark.svg\" alt=\"routefly\" width=\"110\" height=\"34\">통계</h1>"
                + "<p class=\"lead\">최근 " + last.size() + "일 · 방문자(하루마다 센 수의 합) " + String.format(Locale.KOREA, "%,d", tu) + " · 화면 " + String.format(Locale.KOREA, "%,d", tp)
                + " · 로봇 " + String.format(Locale.KOREA, "%,d", tb) + botLine(bots) + "</p>");
        out.append(trend(days, n));
        out.append("<section><h2>날마다</h2><table class=\"st\"><tr><th>날짜</th><th class=\"num\">방문자</th><th class=\"num\">모바일</th><th class=\"num\">PC</th><th class=\"num\">화면</th><th class=\"num\">로봇</th></tr>").append(rows).append("</table></section>");
        out.append(top("모바일 · PC 방문자(" + last.size() + "일 - 10-20 부터 셈)", devs, 5, null))
                .append(top("인기 산 페이지(" + last.size() + "일)", mountains, 20, null))
                .append(top("인기 산 페이지 - 영어(" + last.size() + "일 - /en/m/, 외국 손님)", enMountains, 20, null))
                .append(courseTable(courses, courseNames == null ? Map.of() : courseNames, last.size()))
                .append(top("화면별(" + last.size() + "일)", pages, 20, StatsServlet::pageName))
                .append(top("들어온 곳(" + last.size() + "일 - 바깥에서 처음 들어온 화면 수)", refs, 20, null))
                .append(botTable(bots, engines))
                .append(checkTable(days, last))
                .append(GUIDE);
        out.append("<p class=\"dim\">숫자만 셉니다 - 방문자는 그 날만 쓰는 해시로 겹침만 걸러 내고 IP 는 남기지 않습니다. 이 화면을 연 기기(브라우저)는 운영자로 보고 방문 수에서 뺍니다(2년, 사이트 데이터를 지우면 다시 셈). 앱은 안내 화면 \"안내\" 제목을 7번 누르고 열쇠를 넣으면 빠집니다.</p></main><script src=\"js/stats.js\"></script></body></html>");
        return fold(out.toString());
    }

    /** 늘 펼친 칸(제목 앞글자) - 접지 않음(2026-10-21 홍TV님). */
    static final List<String> ALWAYS = List.of("방문 추세", "날마다", "모바일 · PC 방문자");

    /** 순수 함수 - 칸(section 의 h2 제목)마다 누르면 접고 펴는 details 로 감쌈(처음엔 접힘). {@link #ALWAYS} 칸은 그대로 늘 보임. */
    static String fold(String html) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?s)<section><h2>(.*?)</h2>(.*?)</section>").matcher(html);
        StringBuilder b = new StringBuilder();
        while (m.find()) {
            String title = m.group(1);
            boolean keep = ALWAYS.stream().anyMatch(title::startsWith);
            m.appendReplacement(b, java.util.regex.Matcher.quoteReplacement(keep ? m.group()
                    : "<section><details class=\"fold\"><summary><h2>" + title + "</h2></summary>" + m.group(2) + "</details></section>"));
        }
        return m.appendTail(b).toString();
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
    static String botTable(Map<String, Integer> bots, Map<String, Integer> engines) {
        StringBuilder b = new StringBuilder("<section><h2>로봇 종류 <small style=\"font-weight:normal;color:var(--dim);font-size:13px\">사람이 아닌 프로그램 - 10월 21일부터 나눠 셈</small></h2><table class=\"st\">");
        String[][] kinds = {{"검색", "구글 · 네이버 · 다음이 페이지를 읽어 감 - 많을수록 검색에 잘 나옴"}, {"미리보기", "카톡 · 페이스북에 우리 링크를 붙일 때 제목 · 그림을 가져감"},
            {"시험", "웹 · PC Claude 점검 도구"}, {"기타", "검색 순위 분석 · AI 회사 수집 프로그램"},
            {"숨은 로봇", "브라우저인 척하지만 언어 설정을 안 보내는 수집 프로그램(2026-10-21 배포부터 따로 셈 - 그 전엔 PC 방문자로 섞였음)"}};
        if (bots.isEmpty()) return b.append("<tr><td>아직 없음</td></tr></table></section>").toString();
        b.append("<tr><th>종류</th><th>뜻</th><th class=\"num\">수</th></tr>");
        for (String[] k : kinds) {
            b.append("<tr><td class=\"kd\">").append(k[0]).append("</td><td>").append(k[1]).append("</td><td class=\"num\">").append(n(bots.getOrDefault(k[0], 0))).append("</td></tr>");
            if ("검색".equals(k[0])) {   // 검색엔진마다(10-21 배포부터) - 늘 같은 차례, 0 도 보임(빙이 안 오는지 바로 알게)
                StringBuilder e = new StringBuilder();
                for (String nm : new String[] {"구글", "네이버", "다음", "빙", "애플", "덕덕고", "얀덱스", "바이두", "그 밖"}) {
                    int v = engines.getOrDefault(nm, 0);
                    if (v > 0 || nm.equals("구글") || nm.equals("네이버") || nm.equals("다음") || nm.equals("빙")) e.append(e.length() > 0 ? " · " : "").append(nm).append(" ").append(n(v));
                }
                b.append("<tr><td></td><td colspan=\"2\" style=\"color:var(--dim)\">└ ").append(e).append("</td></tr>");
            }
        }
        return b.append("</table></section>").toString();
    }

    /**
     * 순수 함수 - 사람 확인 표(2026-10-22 홍TV님 "언어 설정을 넣으면 구분을 못하겠네"). 사람으로 센 방문자 가운데 화면 js 가 돈 사람(js/seen.js)과
     * 브라우저 보안 머리글이 빠진 사람(Stats.suspect)을 기기마다. 세기 시작한 날(jsUniq · sus 가 있는 날)만 더함 - 배포한 날은 그 전 방문자도 들어가 js 비율이 낮게 나옴.
     */
    static String checkTable(Map<String, JsonObject> days, List<String> keys) {
        Map<String, Integer> vis = new HashMap<>(), js = new HashMap<>(), sus = new HashMap<>();
        int nd = 0;
        for (String k : keys) {
            JsonObject d = days.get(k);
            if (!d.has("jsUniq") && !d.has("sus")) continue;
            nd++;
            if (d.has("devUniq")) for (var e : d.getAsJsonObject("devUniq").entrySet()) vis.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            if (d.has("jsUniq")) for (var e : d.getAsJsonObject("jsUniq").entrySet()) js.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
            if (d.has("sus")) for (var e : d.getAsJsonObject("sus").entrySet()) sus.merge(e.getKey(), e.getValue().getAsInt(), Integer::sum);
        }
        StringBuilder b = new StringBuilder("<section><h2>사람 확인 <small style=\"font-weight:normal;color:var(--dim);font-size:13px\">사람으로 센 방문자를 한 번 더 봄 - 10월 22일부터</small></h2>");
        if (nd == 0) return b.append("<table class=\"st\"><tr><td>아직 없음</td></tr></table></section>").toString();
        b.append("<table class=\"st\"><tr><th>기기</th><th class=\"num\">방문자</th><th class=\"num\">화면 js 돎</th><th class=\"num\">보안 머리글 빠짐</th></tr>");
        for (String dv : new String[] {"모바일", "PC"}) {
            int v = vis.getOrDefault(dv, 0), j = js.getOrDefault(dv, 0);
            b.append("<tr><td class=\"kd\">").append(dv).append("</td><td class=\"num\">").append(n(v)).append("</td><td class=\"num\">").append(n(j))
                    .append(v > 0 ? " (" + Math.round(100.0 * j / v) + "%)" : "").append("</td><td class=\"num\">").append(n(sus.getOrDefault(dv, 0))).append("</td></tr>");
        }
        return b.append("</table><p class=\"dim\" style=\"margin:6px 0 0\">").append(nd).append("일 합. 화면 js 돎 - 화면이 열려 그 안의 프로그램이 돈 사람(사람 브라우저는 거의 다). ")
                .append("낮으면 언어 설정까지 흉내 낸 수집 프로그램이 섞였다는 뜻. 보안 머리글 빠짐 - 요즘 브라우저가 늘 보내는 표식이 없는 사람(예전 아이폰도 걸릴 수 있어 로봇으로 빼지는 않음).</p></section>").toString();
    }

    /** 보는 법(2026-10-21 홍TV님 "설명자료도 추가") - 표마다 무엇을 세는지. */
    static final String GUIDE = "<section><details><summary style=\"cursor:pointer;font-weight:bold;font-size:15px\">📖 통계 보는 법 (누르면 펼침)</summary>"
            + "<table class=\"st\" style=\"font-size:12.5px;line-height:1.5;margin-top:8px\"><tr><th style=\"width:30%\">항목</th><th>뜻</th></tr>"
            + "<tr><td>방문자</td><td>그 날 들어온 사람 수(같은 사람은 하루 한 번). 여러 날 합이라 이틀 온 사람은 2</td></tr>"
            + "<tr><td>화면</td><td>연 화면 수</td></tr>"
            + "<tr><td>로봇</td><td>사람이 아닌 프로그램(검색 · 미리보기 · 시험 · 기타 · 숨은 로봇 - 아래 로봇 종류 표). 방문자 · 화면 수에는 안 들어감</td></tr>"
            + "<tr><td>인기 산 페이지</td><td>산 소개(/m/산이름) - 산마다</td></tr>"
            + "<tr><td>인기 산 페이지 - 영어</td><td>외국 손님용 영어 산 소개(/en/m/영문이름, 예: daeamsan = 대암산)</td></tr>"
            + "<tr><td>인기 코스 상위 20</td><td>코스 하나짜리 소개(/c/코스번호 - 주로 네이버 · 구글 검색 손님). 이름을 누르면 그 페이지. 화면별 표의 \"코스 소개 페이지\" 는 이것을 모두 더한 한 줄</td></tr>"
            + "<tr><td>들어온 곳</td><td>바깥(네이버 · 구글 · 카톡 등)에서 처음 들어온 화면 수. 우리 화면끼리 옮긴 것은 안 셈</td></tr>"
            + "<tr><td>사람 확인</td><td>사람으로 센 방문자 가운데 화면 프로그램(js)이 돈 사람 · 브라우저 표식이 빠진 사람(10-22 부터). js 돈 비율이 낮으면 숨은 수집 프로그램이 섞인 것</td></tr>"
            + "<tr><td>모바일 · PC</td><td>방문자를 기기로 나눔(10-20 부터)</td></tr>"
            + "<tr><td>운영자</td><td>이 화면을 연 브라우저는 세지 않음. 앱 · 다른 브라우저는 따로라 셈</td></tr>"
            + "<tr><td>언제 숫자</td><td>서버가 지금 세는 그대로(10분마다 파일로 저장)</td></tr>"
            + "</table></details></section>";

    /** 순수 함수 - "(검색 n · 미리보기 n · 시험 n · 기타 n)" - 나눠 센 날이 없으면 빈 글. */
    static String botLine(Map<String, Integer> bots) {
        if (bots.isEmpty()) return "";
        StringBuilder b = new StringBuilder();
        for (String k : new String[] {"검색", "미리보기", "시험", "기타", "숨은 로봇"}) {
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
        // 마지막 날이 오늘이면 아직 세는 중 - 점선 · "오늘" 로(2026-10-22 홍TV님: 새벽 1시 0명이 뚝 떨어진 것처럼 보였음)
        boolean live = end.equals(java.time.LocalDate.now(WeatherServlet.KST));
        return "<section><h2>방문 추세(" + dates.size() + "일)</h2>"   // 넓은 화면 · 휴대폰 두 벌(css 가 하나만 보임 - 한 벌을 줄이면 글자가 너무 작아짐)
                + "<div class=\"chW\">" + line("방문자", dates, uniq, 640, live) + line("화면", dates, views, 640, live) + "</div>"
                + "<div class=\"chN\">" + line("방문자", dates, uniq, 340, live) + line("화면", dates, views, 340, live) + "</div>"
                + "<p class=\"dim\">점에 손가락 · 마우스를 대면 그 날 수가 보입니다. 정확한 수는 아래 표." + (live ? " 점선은 오늘 - 아직 세는 중이라 낮게 보입니다." : "") + "</p></section>";
    }

    /**
     * 선 그림 하나(SVG). 눈금 0 · 가운데 · 위(1 · 2 · 5 × 10ⁿ 로 올림), 날짜는 며칠 안 되면 모두(아니면 처음 · 가운데 · 끝), 마지막 값은 글자로.
     * live - 마지막 날이 오늘(세는 중): 마지막 토막은 점선, 날짜는 "오늘".
     */
    static String line(String name, List<String> dates, List<Integer> v, int w, boolean live) {
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
        int[] at = k == 1 ? new int[] {0} : k <= (w < 500 ? 4 : 7) ? java.util.stream.IntStream.range(0, k).toArray()   // 며칠 안 되면 날마다(10-22: 4일인데 10-21 이 빠졌음)
                : w < 500 ? new int[] {0, k - 1} : new int[] {0, (k - 1) / 2, k - 1};   // 날짜(좁으면 처음 · 끝만)
        for (int i : at) {
            String anchor = k == 1 ? "middle" : i == 0 ? "start" : i == k - 1 ? "end" : "middle";
            String label = live && i == k - 1 ? "오늘" : dates.get(i).substring(5);
            s.append(String.format(Locale.ROOT, "<text x=\"%.1f\" y=\"%d\" fill=\"#9aa6b4\" font-size=\"11\" text-anchor=\"%s\">%s</text>", X.apply(i), h - 8, anchor, label));
        }
        double colW = k == 1 ? pw : pw / (k - 1);
        StringBuilder path = new StringBuilder(), area = new StringBuilder();
        int solid = live && k > 1 ? k - 1 : k;   // 오늘 토막은 따로 점선
        for (int i = 0; i < solid; i++) {
            path.append(i == 0 ? "M" : "L").append(String.format(Locale.ROOT, "%.1f,%.1f", X.apply(i), Y.apply(v.get(i))));
        }
        area.append(path).append(String.format(Locale.ROOT, "L%.1f,%.1fL%.1f,%.1fZ", X.apply(solid - 1), Y.apply(0), X.apply(0), Y.apply(0)));
        s.append("<path d=\"").append(area).append("\" fill=\"#38d9ea\" fill-opacity=\"0.10\"/>");
        s.append("<path d=\"").append(path).append("\" fill=\"none\" stroke=\"#38d9ea\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>");
        if (solid < k) s.append(String.format(Locale.ROOT, "<path d=\"M%.1f,%.1fL%.1f,%.1f\" fill=\"none\" stroke=\"#38d9ea\" stroke-opacity=\"0.6\" stroke-width=\"2\" stroke-dasharray=\"4 4\"/>",
                X.apply(k - 2), Y.apply(v.get(k - 2)), X.apply(k - 1), Y.apply(v.get(k - 1))));
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
    /** 숫자 - 천 단위 쉼표(2026-10-21 홍TV님). */
    static String n(int v) {
        return String.format(Locale.KOREA, "%,d", v);
    }

    private static String top(String title, Map<String, Integer> m, int n, java.util.function.Function<String, String> names) {
        StringBuilder b = new StringBuilder("<section><h2>").append(ShareServlet.esc(title)).append("</h2><table class=\"st\">");
        if (names != null && !m.isEmpty()) b.append("<tr><th>주소</th><th>화면 이름</th><th>수</th></tr>");
        m.entrySet().stream().sorted((x, y) -> y.getValue() - x.getValue()).limit(n)
                .forEach(e -> b.append("<tr><td>").append(ShareServlet.esc(e.getKey())).append("</td>")
                        .append(names == null ? "" : "<td>" + ShareServlet.esc(names.apply(e.getKey())) + "</td>")
                        .append("<td class=\"num\">").append(n(e.getValue())).append("</td></tr>"));
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
            case "/games.html" -> "심심풀이 게임";
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
