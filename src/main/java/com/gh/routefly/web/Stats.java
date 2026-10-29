package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 운영 통계(2026-10-15 홍TV님 - 제휴 심사 · 인기 산 보기). 화면 · 산 페이지마다 하루 방문 수, 하루 방문자 수, 검색 로봇 수 - 숫자만.
 *
 * <ul>
 *   <li>개인을 알아볼 수 있는 것은 남기지 않음: 방문자 수는 IP 를 그 날만 쓰는 무작위 소금과 함께 해시해 메모리에서만 견주고(날이 바뀌면 버림),
 *       파일에는 날짜별 숫자만 씀. 쿠키 · 외부 분석 도구 없음.</li>
 *   <li>들어온 곳(2026-10-15 홍TV님): Referer 의 도메인만 보고 네이버 · 구글 · 다음 · 카카오 … 가운데 하나로 묶어 그 수만 셈(주소 · 검색어는 버림).</li>
 *   <li>파일: 설정 {@code stats.dir}(없으면 톰캣 폴더/routefly-stats)/stats.json - 10분마다와 내려갈 때 씀, 400일치.</li>
 * </ul>
 */
final class Stats {
    // 요청마다 쓰는 글자 검사는 미리 만들어 둠(2026-10-29 점검 - 수집기가 몰릴 때 요청마다 다시 만들었음). 뜻은 예전 matches(".*(…).*") 와 같음(find)
    private static final java.util.regex.Pattern EN_SLUG = java.util.regex.Pattern.compile("[A-Za-z0-9-]{1,40}"), HTML_PAGE = java.util.regex.Pattern.compile("/[a-z]+\\.html"),
            UA_PREVIEW = java.util.regex.Pattern.compile("facebookexternalhit|kakaotalk-scrap|kakaostory-og|twitterbot|slackbot|telegrambot|discordbot|whatsapp|linkedinbot|skypeuripreview|line-poker|bandbot|naverbot-preview"),
            UA_SEARCH = java.util.regex.Pattern.compile("googlebot|google-inspectiontool|bingbot|yeti/|daum/|daumoa|duckduckbot|baiduspider|yandex|applebot|slurp|seznambot|petalbot|coccoc"),
            UA_TEST = java.util.regex.Pattern.compile("headless|python|curl|wget|playwright|node-fetch|axios|go-http|java/|okhttp|httpclient|powershell|claude/|electron/"),
            UA_BOT = java.util.regex.Pattern.compile("bot|crawl|spider|scrap");

    private static final Logger log = LogManager.getLogger(Stats.class);
    static final int KEEP_DAYS = 400;

    /** 날짜 → {"pages":{화면: 수}, "uniq": 방문자 수, "bots": 로봇 수, "botKinds":{검색 · 미리보기 · 시험 · 기타: 수}(10-21 부터)} */
    private static final TreeMap<String, JsonObject> DAYS = new TreeMap<>();
    private static String today = "";
    private static final Set<String> seen = new HashSet<>();
    /** 그 날 화면 js 가 돈 방문자 · 보안 머리글이 빠진 방문자(사람 확인, 2026-10-22) - seen 처럼 날이 바뀌면 버림. */
    private static final Set<String> jsSeen = new HashSet<>(), susSeen = new HashSet<>();
    private static byte[] salt = new byte[16];
    private static boolean loaded = false, dirty = false;

    private Stats() {
    }

    /**
     * 순수 함수 - 셀 화면 이름. 산 페이지는 "/m/가야산", 화면 파일은 "/hike.html" 처럼, 공유 링크는 "/s/", 코스 페이지는 "/c/". 그 밖(api · js · 그림)은 null.
     * path 는 컨텍스트를 뺀 경로.
     */
    /** 순수 함수 - 코스 소개 페이지(/c/<코스>)의 코스 번호, 아니면 null(2026-10-21 홍TV님 "인기 코스 상위 20"). */
    static String courseKey(String path) {
        if (path == null || !path.startsWith("/c/")) return null;
        String id = path.substring(3);
        return CourseQueries.validId(id) ? id : null;
    }

    static String pageKey(String path) {
        if (path == null) return null;
        if (path.equals("/") || path.equals("/index.html")) return "/index.html";
        if (path.startsWith("/m/")) {
            String n = URLDecoder.decode(path.substring(3), StandardCharsets.UTF_8).trim();
            return n.isEmpty() ? "/m/" : n.length() > 40 ? null : "/m/" + n;
        }
        if (path.startsWith("/en/m/")) {   // 영어 산 페이지 - slug(영문 · 숫자 · -)만
            String n = path.substring(6);
            return n.isEmpty() ? "/en/m/" : EN_SLUG.matcher(n).matches() ? "/en/m/" + n.toLowerCase() : null;
        }
        if (path.startsWith("/s/")) return "/s/";
        if (path.startsWith("/c/")) return "/c/";   // 코스 소개 페이지(2026-10-19) - 화면별 표에는 한 줄로, 코스마다는 courseKey 로 따로(10-21)
        if (HTML_PAGE.matcher(path).matches()) return path;
        return null;
    }

    /**
     * 순수 함수 - 로봇 종류(2026-10-20 홍TV님 "나눠서 세기"). 사람이면 null.
     * 다음 · 네이버 앱 안 브라우저(DaumApps · NAVER(inapp))는 사람이라 "daum/" · "yeti/" 처럼 수집기 이름만 봄(전에는 "daum" 으로 다음 앱 손님을 로봇으로 셌음).
     * 미리보기(카톡 · 페이스북 등 링크 붙일 때) · 검색(구글 · 네이버 · 다음 · 빙 등) · 시험(curl · headless 브라우저 등 - 우리 점검 포함) · 기타(SEO · AI 수집기 등).
     */
    static String botKind(String ua, String acceptLanguage) {
        String k = botKind(ua);
        // 브라우저 이름을 대지만 언어 설정(Accept-Language)을 안 보냄 - 사람 브라우저 · 앱은 늘 보냄. 10-21 통계에서 PC 방문자 215명이 한 사람 1.3 화면이라 수상했음
        return k == null && (acceptLanguage == null || acceptLanguage.isBlank()) ? "숨은 로봇" : k;
    }

    static String botKind(String ua) {
        if (ua == null || ua.isBlank()) return "시험";
        String u = ua.toLowerCase();
        if (UA_PREVIEW.matcher(u).find()) return "미리보기";
        if (UA_SEARCH.matcher(u).find()) return "검색";
        if (UA_TEST.matcher(u).find()) return "시험";   // claude/ · electron/ - Claude 앱 · PC Claude(2026-10-21 PC 접속 기록)
        if (UA_BOT.matcher(u).find()) return "기타";
        return null;
    }

    /**
     * 순수 함수 - 사람으로 셌지만 의심스러운 방문(2026-10-22 홍TV님 "언어 설정을 넣으면 구분을 못하겠네"). 로봇으로 빼지는 않고 따로 셈 - 예전 아이폰(iOS 16.4 전) ·
     * 오래된 브라우저도 걸릴 수 있어서. 요즘 브라우저(크롬 · 엣지 · 삼성 · 파이어폭스 · 사파리 · 앱 안 브라우저)는 화면을 열 때 늘 Sec-Fetch-Mode 를 보내고,
     * 크롬 계열(UA 에 Chrome/)은 sec-ch-ua 도 보냄 - 언어 설정만 흉내 낸 수집 프로그램은 이것을 빠뜨리기 쉬움. 의심 없으면 null.
     */
    static String suspect(String ua, String secFetchMode, String secChUa) {
        if (secFetchMode == null || secFetchMode.isBlank()) return "보안 머리글 없음";
        if (ua != null && ua.contains("Chrome/") && (secChUa == null || secChUa.isBlank())) return "크롬 표식 없음";
        return null;
    }

    /**
     * 화면 js 가 돌았다는 신호(js/seen.js → /api/seen). 그 날 사람으로 센 방문자(seen)에서 온 것만, 한 사람 한 번 - 아무나 보내 숫자를 부풀리지 못하게.
     * 센 것이면 true.
     */
    static synchronized boolean js(String ip, String device) {
        load();
        if (!today.equals(LocalDate.now(WeatherServlet.KST).toString())) return false;
        String h = hash(ip);
        if (!seen.contains(h) || !jsSeen.add(h)) return false;
        JsonObject day = DAYS.get(today);
        if (day == null) return false;
        if (!day.has("jsUniq")) day.add("jsUniq", new JsonObject());
        add(day.getAsJsonObject("jsUniq"), device);
        dirty = true;
        return true;
    }

    /**
     * 순수 함수 - 사람이 연 화면인가. 서비스워커가 처음 설치될 때 화면 파일(hike · about · park · route · series · privacy · anbu · tools …)을
     * 한꺼번에 받아 두는데, 그것까지 세면 한 사람이 화면 9~10개를 본 것으로 잡혔음(2026-10-20 홍TV님 "통계가 이상").
     * sw.js 가 그 받기에 X-RF-Prefetch: 1 을 붙임(rf-shell-v23 부터) - 붙은 것은 안 셈. Sec-Fetch-Dest 는 서비스워커가 넘겨준 화면도 empty 라 못 씀.
     */
    static boolean isPageView(String prefetch) {
        return prefetch == null;
    }

    /** 순수 함수 - 모바일 · PC(2026-10-20 홍TV님). 휴대폰 · 태블릿 · 따라가기 앱(안드로이드 웹뷰)은 모바일. */
    static String device(String ua) {
        if (ua == null) return "PC";
        String u = ua.toLowerCase();
        return u.contains("mobi") || u.contains("android") || u.contains("iphone") || u.contains("ipad") ? "모바일" : "PC";
    }

    /** 들어온 곳 묶음 - 도메인 끝이 이것이면 그 이름. */
    private static final String[][] SOURCES = {
        {"naver.com", "네이버"}, {"naver.me", "네이버"}, {"google.", "구글"}, {"daum.net", "다음"}, {"kakao.com", "카카오"}, {"kakaocdn.net", "카카오"},
        {"bing.com", "빙"}, {"zum.com", "줌"}, {"instagram.com", "인스타그램"}, {"facebook.com", "페이스북"}, {"youtube.com", "유튜브"},
        {"x.com", "X(트위터)"}, {"t.co", "X(트위터)"}, {"band.us", "밴드"}, {"duckduckgo.com", "덕덕고"}, {"chatgpt.com", "ChatGPT"}, {"claude.ai", "Claude"}};

    /**
     * 순수 함수 - 들어온 곳 이름. Referer 가 없으면 "직접 · 앱", 이 사이트 안에서 옮겨 다닌 것은 null(세지 않음), 모르는 곳은 "그 밖".
     * host - 이 사이트 이름(요청의 Host).
     */
    static String source(String referer, String host) {
        if (referer == null || referer.isBlank()) return "직접 · 앱";
        String h;
        try {
            h = java.net.URI.create(referer.trim()).getHost();
        } catch (Exception e) {
            return "그 밖";
        }
        if (h == null) return "그 밖";
        h = h.toLowerCase();
        if (h.equals(host) || h.equals("localhost") || h.endsWith(".trycloudflare.com")) return null;
        for (String[] s : SOURCES) {
            String d = s[0];
            if (d.endsWith(".") ? h.startsWith(d) || h.contains("." + d) : h.equals(d) || h.endsWith("." + d)) return s[1];
        }
        return "그 밖";
    }

    /** 한 번 셈. ip 는 해시해 그 날 메모리에서만 견줌. src - 들어온 곳(source, null 이면 안 셈). */
    /** 순수 함수 - 검색 로봇이 어느 검색엔진인지(2026-10-21 홍TV님 "빙은 검색을 안 하나?" - 로봇 종류 "검색" 을 나눠 봄). 검색 로봇이 아니면 null. */
    static String searchEngine(String ua) {
        if (ua == null) return null;
        String u = ua.toLowerCase();
        if (u.contains("googlebot") || u.contains("google-inspectiontool")) return "구글";
        if (u.contains("yeti/")) return "네이버";
        if (u.contains("daum/") || u.contains("daumoa")) return "다음";
        if (u.contains("bingbot")) return "빙";
        if (u.contains("applebot")) return "애플";
        if (u.contains("duckduckbot")) return "덕덕고";
        if (u.contains("yandex")) return "얀덱스";
        if (u.contains("baiduspider")) return "바이두";
        return "그 밖";
    }

    /** engine - 검색 로봇이면 어느 검색엔진(searchEngine), 아니면 null. sus - 사람이지만 의심스러운 까닭(suspect), 없으면 null. */
    static synchronized void hit(String page, String course, String ip, String bot, String engine, String src, String device, String sus) {
        load();
        String d = LocalDate.now(WeatherServlet.KST).toString();
        if (!d.equals(today)) {   // 날이 바뀜 - 어제 방문자 집합 · 소금은 버림
            today = d;
            seen.clear();
            jsSeen.clear();
            susSeen.clear();
            new SecureRandom().nextBytes(salt);
        }
        JsonObject day = DAYS.computeIfAbsent(d, k -> {
            JsonObject o = new JsonObject();
            o.add("pages", new JsonObject());
            o.addProperty("uniq", 0);
            o.addProperty("bots", 0);
            return o;
        });
        if (bot != null) {   // bot - 로봇 종류(botKind), null 이면 사람
            day.addProperty("bots", day.get("bots").getAsInt() + 1);
            if (!day.has("botKinds")) day.add("botKinds", new JsonObject());
            add(day.getAsJsonObject("botKinds"), bot);
            if (engine != null) {   // 검색엔진마다(10-21 부터)
                if (!day.has("engines")) day.add("engines", new JsonObject());
                add(day.getAsJsonObject("engines"), engine);
            }
        } else {
            JsonObject pages = day.getAsJsonObject("pages");
            pages.addProperty(page, (pages.has(page) ? pages.get(page).getAsInt() : 0) + 1);
            String h = hash(ip);
            // 하루 방문자 칸 한도(2026-10-28 보안 점검: 화면은 횟수 제한이 없어 IPv6 주소를 바꿔 가며 수백만 칸을 채울 수 있었음) - 넘으면 방문자 수만 더 세지 않음
            boolean first = seen.size() < SEEN_MAX && seen.add(h);
            if (sus != null && device != null && susSeen.add(h)) {   // 의심 방문자 - 기기마다(10-22 부터), 한 사람 한 번
                if (!day.has("sus")) day.add("sus", new JsonObject());
                add(day.getAsJsonObject("sus"), device);
            }
            if (first) day.addProperty("uniq", day.get("uniq").getAsInt() + 1);
            if (device != null) {   // dev: 화면 수, devUniq: 방문자 수(그 날 처음 본 기기로)
                if (!day.has("dev")) { day.add("dev", new JsonObject()); day.add("devUniq", new JsonObject()); }
                add(day.getAsJsonObject("dev"), device);
                if (first) add(day.getAsJsonObject("devUniq"), device);
            }
            if (course != null) {   // 코스 소개 페이지 - 코스마다(10-21 부터)
                if (!day.has("courses")) day.add("courses", new JsonObject());
                add(day.getAsJsonObject("courses"), course);
            }
            if (src != null) {
                if (!day.has("refs")) day.add("refs", new JsonObject());
                JsonObject refs = day.getAsJsonObject("refs");
                refs.addProperty(src, (refs.has(src) ? refs.get(src).getAsInt() : 0) + 1);
            }
        }
        while (DAYS.size() > KEEP_DAYS) DAYS.pollFirstEntry();
        dirty = true;
    }

    private static void add(JsonObject o, String k) {
        o.addProperty(k, (o.has(k) ? o.get(k).getAsInt() : 0) + 1);
    }

    static final int SEEN_MAX = 200_000;

    /** IPv6 는 /64 로 묶어 셈(한 집 · 한 폰의 주소 바꾸기를 한 사람으로, RateLimiter.group). */
    private static String hash(String ip) {
        ip = RateLimiter.group(ip);
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(salt);
            return java.util.HexFormat.of().formatHex(md.digest(String.valueOf(ip).getBytes(StandardCharsets.UTF_8)), 0, 12);
        } catch (Exception e) {
            return String.valueOf(ip);
        }
    }

    /** 날짜별 숫자 사본(보기 화면). */
    static synchronized Map<String, JsonObject> days() {
        load();
        Map<String, JsonObject> out = new TreeMap<>();
        DAYS.forEach((k, v) -> out.put(k, v.deepCopy()));
        return out;
    }

    static Path file() {
        String dir = RouteflyConfig.get("stats.dir");
        if (dir == null) dir = System.getProperty("catalina.base", System.getProperty("java.io.tmpdir")) + "/routefly-stats";
        return Path.of(dir, "stats.json");
    }

    private static void load() {
        if (loaded) return;
        loaded = true;
        new SecureRandom().nextBytes(salt);
        try {
            Path f = file();
            if (!Files.isRegularFile(f)) return;
            JsonObject o = JsonParser.parseString(Files.readString(f, StandardCharsets.UTF_8)).getAsJsonObject();
            for (String k : o.keySet()) if (k.matches("\\d{4}-\\d\\d-\\d\\d") && o.get(k).isJsonObject()) DAYS.put(k, o.getAsJsonObject(k));
        } catch (Exception e) {
            log.warn("[STATS] 통계 파일을 읽지 못함 - {}", e.toString());
        }
    }

    /** 바뀐 것이 있으면 파일로(임시 파일에 쓰고 바꿔 끼움). */
    static synchronized void save() {
        if (!dirty) return;
        try {
            Path f = file();
            Files.createDirectories(f.getParent());
            JsonObject o = new JsonObject();
            DAYS.forEach(o::add);
            Path tmp = f.resolveSibling("stats.json.tmp");
            Files.writeString(tmp, o.toString(), StandardCharsets.UTF_8);
            Files.move(tmp, f, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            dirty = false;
        } catch (IOException e) {
            log.warn("[STATS] 통계 파일을 쓰지 못함 - {}", e.toString());
        }
    }
}
