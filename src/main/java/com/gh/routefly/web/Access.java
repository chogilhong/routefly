package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 오늘 접속 분석(2026-10-29 홍TV님 "stats 에 이런 내용을 볼 수 있을까?" - PC 가 로그 열쇠로 접속 기록을 세던 것을 통계 화면에서 바로).
 * 화면을 연 요청(StatsFilter)과 모든 요청의 결과 번호(SecurityFilter)를 메모리에서만 셈 - 파일에 쓰지 않고, 날이 바뀌거나 서버를 다시 켜면 처음부터.
 * 주소는 그 날만 쓰는 무작위 값과 섞은 해시 8글자로만(IPv6 는 /64 로 묶음). 브라우저 글(User-Agent)은 많이 연 곳의 것만 160자까지 - 수집기를 알아보려고.
 * nginx 에서 막힌 수집기(크롬 124 등, docs/deploy-lightsail.md 10-2)는 여기 오지 않음.
 */
final class Access {

    /** 브라우저 종류(표 차례). */
    static final List<String> KINDS = List.of("사람", "검색 로봇", "AI 수집", "미리보기", "그 밖의 로봇", "오래된 크롬", "숨은 로봇", "Headless", "프로그램", "운영자");
    static final int MAX_SOURCES = 5000, MAX_NOTFOUND = 300, PATHS_PER_SOURCE = 12;

    static final class Source {
        int pages;
        String kind, ua;
        boolean js;
        long first, last;
        final Map<String, Integer> paths = new LinkedHashMap<>();
    }

    private static String day = "";
    private static byte[] salt = new byte[16];
    private static final Map<String, Integer> kinds = new HashMap<>(), groups = new HashMap<>(), notFound = new HashMap<>();
    private static final Map<Integer, Integer> status = new TreeMap<>();
    private static final Map<Integer, Map<String, Integer>> quarters = new TreeMap<>();   // 0~95(15분) → 종류 → 수
    private static final Map<String, Source> sources = new HashMap<>();
    private static int total;

    private Access() {
    }

    /** 순수 함수 - 브라우저 종류(PC 로그 요약 tools/log-key 와 같은 나눔). owner - 통계를 연 운영자 기기. */
    static String kind(String ua, String acceptLanguage, boolean owner) {
        if (owner) return "운영자";
        if (ua == null || ua.isBlank()) return "프로그램";
        String u = ua.toLowerCase();
        if (u.matches(".*(gptbot|chatgpt|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexity|ccbot|bytespider|amazonbot|meta-externalagent|ai2bot|cohere-ai|diffbot|google-extended).*")) return "AI 수집";
        String b = Stats.botKind(ua);
        if ("미리보기".equals(b)) return "미리보기";
        if ("검색".equals(b)) return "검색 로봇";
        if ("시험".equals(b)) return u.contains("headless") ? "Headless" : "프로그램";
        if ("기타".equals(b)) return "그 밖의 로봇";
        if (acceptLanguage == null || acceptLanguage.isBlank()) return "숨은 로봇";
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("chrome/(\\d+)").matcher(u);
        if (m.find() && Integer.parseInt(m.group(1)) < 130 && !u.contains("samsungbrowser") && !u.contains("whale")) return "오래된 크롬";
        return "사람";
    }

    /** 순수 함수 - 경로 묶음(통계 화면 이름과 같게: /m/ · /en/m/ · /c/ · /s/ · 화면.html, 첫 화면은 "/"). */
    static String group(String page) {
        if (page == null) return null;
        if (page.startsWith("/m/")) return "/m/";
        if (page.startsWith("/en/m/")) return "/en/m/";
        if (page.equals("/index.html")) return "/";
        return page;
    }

    /** 순수 함수 - 404 로 찾은 경로가 공격 시도 꼴인가(관리 화면 · 설정 파일 · 다른 프로그램의 빈틈 찾기). */
    static boolean attack(String path) {
        return path != null && path.toLowerCase().matches(".*(wp-|wordpress|xmlrpc|\\.env|\\.git|phpmyadmin|\\.php|/admin|cgi-bin|\\.\\./|/etc/passwd|\\.aws|actuator|/boaform|/hnap|\\.ds_store|/vendor/phpunit).*");
    }

    private static void roll(long now) {
        String d = LocalDate.now(WeatherServlet.KST).toString();
        if (d.equals(day)) return;
        day = d;
        new SecureRandom().nextBytes(salt);
        kinds.clear(); groups.clear(); status.clear(); notFound.clear(); quarters.clear(); sources.clear();
        total = 0;
    }

    private static String hash(String ip) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(salt);
            return java.util.HexFormat.of().formatHex(md.digest(String.valueOf(RateLimiter.group(ip)).getBytes(StandardCharsets.UTF_8)), 0, 4);
        } catch (Exception e) {
            return "?";
        }
    }

    /** 화면 하나(StatsFilter) - page 는 Stats.pageKey. */
    static synchronized void page(String page, String ip, String ua, String acceptLanguage, boolean owner, long now) {
        roll(now);
        String k = kind(ua, acceptLanguage, owner), g = group(page);
        total++;
        kinds.merge(k, 1, Integer::sum);
        if (g != null) groups.merge(g, 1, Integer::sum);
        int q = LocalTime.now(WeatherServlet.KST).toSecondOfDay() / 900;
        quarters.computeIfAbsent(q, x -> new HashMap<>()).merge(k, 1, Integer::sum);
        String h = hash(ip);
        Source s = sources.get(h);
        if (s == null) {
            if (sources.size() >= MAX_SOURCES) return;   // 한도 - 곳마다 칸은 더 만들지 않음(합계 · 종류는 그대로 셈)
            s = new Source();
            s.first = now;
            sources.put(h, s);
        }
        s.pages++;
        s.kind = k;
        s.last = now;
        if (ua != null) s.ua = ua.length() > 160 ? ua.substring(0, 160) : ua;
        if (g != null && (s.paths.containsKey(g) || s.paths.size() < PATHS_PER_SOURCE)) s.paths.merge(g, 1, Integer::sum);
    }

    /** 화면 프로그램(js)이 돈 곳(SeenServlet) - 수집기는 대개 화면만 받고 js 를 돌리지 않음. */
    static synchronized void js(String ip, long now) {
        roll(now);
        Source s = sources.get(hash(ip));
        if (s != null) s.js = true;
    }

    /** 모든 요청의 결과 번호(SecurityFilter). path - 컨텍스트를 뺀 경로(? 뒤 없음). */
    static synchronized void status(String path, int code, long now) {
        roll(now);
        status.merge(code, 1, Integer::sum);
        if (code == 404 && path != null) {
            String p = path.replaceAll("[^\\x21-\\x7e]", "?");
            if (p.length() > 80) p = p.substring(0, 80);
            if (notFound.containsKey(p) || notFound.size() < MAX_NOTFOUND) notFound.merge(p, 1, Integer::sum);
        }
    }

    /** 순수 함수에 가까운 표 만들기 - 통계 화면 칸(StatsServlet, "사람 확인" 아래). */
    static synchronized String section(long now) {
        roll(now);
        StringBuilder b = new StringBuilder("<section><h2>오늘 접속 분석 <small style=\"font-weight:normal;color:var(--dim);font-size:13px\">")
                .append(day).append(" 00:00 ~ ").append(LocalTime.now(WeatherServlet.KST).toString().substring(0, 5))
                .append(" · 화면 ").append(n(total)).append(" · 서로 다른 곳 ").append(n(sources.size())).append("</small></h2>");
        // 브라우저 종류
        b.append("<table class=\"st\"><tr><th>브라우저 종류</th><th class=\"num\">화면</th><th class=\"num\">비율</th></tr>");
        for (String k : KINDS) {
            Integer v = kinds.get(k);
            if (v == null) continue;
            b.append("<tr><td>").append(k).append("</td><td class=\"num\">").append(n(v)).append("</td><td class=\"num\">").append(total == 0 ? "-" : Math.round(v * 100.0 / total) + "%").append("</td></tr>");
        }
        b.append("</table>");
        // 경로 묶음 · 15분
        b.append("<p class=\"dim\" style=\"margin:8px 0 4px\">경로: ").append(join(top(groups, 12))).append("</p>");
        List<Map.Entry<Integer, Integer>> qs = new ArrayList<>();
        for (var e : quarters.entrySet()) qs.add(Map.entry(e.getKey(), e.getValue().values().stream().mapToInt(Integer::intValue).sum()));
        qs.sort((x, y) -> y.getValue() - x.getValue());
        StringBuilder qb = new StringBuilder();
        for (var e : qs.subList(0, Math.min(8, qs.size()))) {
            String most = top(quarters.get(e.getKey()), 1).get(0).getKey();
            if (qb.length() > 0) qb.append(" · ");
            qb.append(String.format("%02d:%02d", e.getKey() / 4, e.getKey() % 4 * 15)).append(" ").append(e.getValue()).append("(").append(most).append(")");
        }
        b.append("<p class=\"dim\" style=\"margin:0 0 8px\">15분별 많은 때: ").append(qb.length() == 0 ? "-" : qb).append("</p>");
        // 많이 연 곳
        List<Map.Entry<String, Source>> ss = new ArrayList<>(sources.entrySet());
        ss.sort((x, y) -> y.getValue().pages - x.getValue().pages);
        b.append("<table class=\"st\"><tr><th>많이 연 곳(해시)</th><th class=\"num\">화면</th><th>종류</th><th>js</th><th>경로</th></tr>");
        for (var e : ss.subList(0, Math.min(10, ss.size()))) {
            Source s = e.getValue();
            b.append("<tr><td>").append(e.getKey()).append("</td><td class=\"num\">").append(s.pages).append("</td><td>").append(s.kind).append("</td><td>").append(s.js ? "✔" : "✘")
                    .append("</td><td>").append(ShareServlet.esc(join(top(s.paths, 3)))).append("</td></tr>");
        }
        b.append("</table>");
        // 수집기 의심 - 사람 · 오래된 크롬 · 숨은 로봇으로 보이는데 화면 프로그램(js)을 안 돌리고 5화면 넘게(브라우저 글별로 묶음)
        Map<String, int[]> sus = new HashMap<>();
        for (Source s : sources.values()) {
            if (s.js || s.pages < 1 || !("사람".equals(s.kind) || "오래된 크롬".equals(s.kind) || "숨은 로봇".equals(s.kind))) continue;
            int[] c = sus.computeIfAbsent(s.ua == null ? "(없음)" : s.ua, x -> new int[2]);
            c[0] += s.pages;
            c[1]++;
        }
        List<Map.Entry<String, int[]>> sl = new ArrayList<>(sus.entrySet());
        sl.removeIf(x -> x.getValue()[0] < 5);
        sl.sort((x, y) -> y.getValue()[0] - x.getValue()[0]);
        b.append("<p style=\"margin:10px 0 4px\"><b>수집기 의심</b> <span class=\"dim\">- 사람처럼 보이지만 화면 프로그램(js)을 안 돌리고 5화면 넘게 연 브라우저 글</span></p>");
        if (sl.isEmpty()) b.append("<p class=\"dim\">없음</p>");
        else {
            b.append("<table class=\"st\"><tr><th>브라우저 글</th><th class=\"num\">화면</th><th class=\"num\">곳</th></tr>");
            for (var e : sl.subList(0, Math.min(5, sl.size())))
                b.append("<tr><td style=\"word-break:break-all\">").append(ShareServlet.esc(e.getKey())).append("</td><td class=\"num\">").append(e.getValue()[0]).append("</td><td class=\"num\">").append(e.getValue()[1]).append("</td></tr>");
            b.append("</table>");
        }
        // 결과 번호 · 404 · 공격
        StringBuilder sb = new StringBuilder();
        for (var e : status.entrySet()) { if (sb.length() > 0) sb.append(" · "); sb.append(e.getKey()).append(" ").append(n(e.getValue())); }
        b.append("<p class=\"dim\" style=\"margin:10px 0 4px\">결과 번호(모든 요청): ").append(sb.length() == 0 ? "-" : sb).append("</p>");
        Map<String, Integer> atk = new HashMap<>();
        for (var e : notFound.entrySet()) if (attack(e.getKey())) atk.put(e.getKey(), e.getValue());
        b.append("<p class=\"dim\" style=\"margin:0 0 4px\">404 많은 곳: ").append(ShareServlet.esc(join(top(notFound, 5)))).append("</p>");
        b.append("<p style=\"margin:0\">").append(atk.isEmpty() ? "🛡 공격 시도로 보이는 경로 없음" : "⚠ 공격 시도로 보이는 경로: " + ShareServlet.esc(join(top(atk, 5)))).append("</p>");
        b.append("<p class=\"dim\" style=\"margin:8px 0 0\">메모리에서만 셈 - 서버를 다시 켜면 처음부터. 주소는 그 날만 쓰는 해시. nginx 에서 막은 수집기(크롬 124)는 여기 오지 않음. 5분마다 저절로 새로 고침.</p></section>");
        return b.toString();
    }

    private static <K> List<Map.Entry<K, Integer>> top(Map<K, Integer> m, int k) {
        List<Map.Entry<K, Integer>> l = new ArrayList<>(m.entrySet());
        l.sort((x, y) -> y.getValue() - x.getValue());
        return l.subList(0, Math.min(k, l.size()));
    }

    private static <K> String join(List<Map.Entry<K, Integer>> l) {
        if (l.isEmpty()) return "-";
        StringBuilder b = new StringBuilder();
        for (var e : l) { if (b.length() > 0) b.append(" · "); b.append(e.getKey()).append(" ").append(e.getValue()); }
        return b.toString();
    }

    private static String n(int v) {
        return String.format(java.util.Locale.KOREA, "%,d", v);
    }

    /** 시험용 - 비움. */
    static synchronized void reset() {
        day = "";
        roll(System.currentTimeMillis());
    }
}
