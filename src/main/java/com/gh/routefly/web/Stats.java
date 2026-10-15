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

    private static final Logger log = LogManager.getLogger(Stats.class);
    static final int KEEP_DAYS = 400;

    /** 날짜 → {"pages":{화면: 수}, "uniq": 방문자 수, "bots": 로봇 수} */
    private static final TreeMap<String, JsonObject> DAYS = new TreeMap<>();
    private static String today = "";
    private static final Set<String> seen = new HashSet<>();
    private static byte[] salt = new byte[16];
    private static boolean loaded = false, dirty = false;

    private Stats() {
    }

    /**
     * 순수 함수 - 셀 화면 이름. 산 페이지는 "/m/가야산", 화면 파일은 "/hike.html" 처럼, 공유 링크는 "/s/". 그 밖(api · js · 그림)은 null.
     * path 는 컨텍스트를 뺀 경로.
     */
    static String pageKey(String path) {
        if (path == null) return null;
        if (path.equals("/") || path.equals("/index.html")) return "/index.html";
        if (path.startsWith("/m/")) {
            String n = URLDecoder.decode(path.substring(3), StandardCharsets.UTF_8).trim();
            return n.isEmpty() ? "/m/" : n.length() > 40 ? null : "/m/" + n;
        }
        if (path.startsWith("/en/m/")) {   // 영어 산 페이지 - slug(영문 · 숫자 · -)만
            String n = path.substring(6);
            return n.isEmpty() ? "/en/m/" : n.matches("[A-Za-z0-9-]{1,40}") ? "/en/m/" + n.toLowerCase() : null;
        }
        if (path.startsWith("/s/")) return "/s/";
        if (path.matches("/[a-z]+\\.html")) return path;
        return null;
    }

    /** 순수 함수 - 검색 로봇 · 미리보기 수집기(카카오톡 · 페이스북 링크 미리보기 포함). */
    static boolean isBot(String ua) {
        return ua == null || ua.isBlank() || ua.toLowerCase().matches(".*(bot|crawl|spider|slurp|facebookexternalhit|kakaotalk-scrap|daum|yeti|headless|python|curl|wget).*");
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

    /** 한 번 셈(들어온 곳 없이 - 테스트). */
    static void hit(String page, String ip, boolean bot) {
        hit(page, ip, bot, null);
    }

    /** 한 번 셈. ip 는 해시해 그 날 메모리에서만 견줌. src - 들어온 곳(source, null 이면 안 셈). */
    static synchronized void hit(String page, String ip, boolean bot, String src) {
        load();
        String d = LocalDate.now(WeatherServlet.KST).toString();
        if (!d.equals(today)) {   // 날이 바뀜 - 어제 방문자 집합 · 소금은 버림
            today = d;
            seen.clear();
            new SecureRandom().nextBytes(salt);
        }
        JsonObject day = DAYS.computeIfAbsent(d, k -> {
            JsonObject o = new JsonObject();
            o.add("pages", new JsonObject());
            o.addProperty("uniq", 0);
            o.addProperty("bots", 0);
            return o;
        });
        if (bot) {
            day.addProperty("bots", day.get("bots").getAsInt() + 1);
        } else {
            JsonObject pages = day.getAsJsonObject("pages");
            pages.addProperty(page, (pages.has(page) ? pages.get(page).getAsInt() : 0) + 1);
            if (seen.add(hash(ip))) day.addProperty("uniq", day.get("uniq").getAsInt() + 1);
            if (src != null) {
                if (!day.has("refs")) day.add("refs", new JsonObject());
                JsonObject refs = day.getAsJsonObject("refs");
                refs.addProperty(src, (refs.has(src) ? refs.get(src).getAsInt() : 0) + 1);
            }
        }
        while (DAYS.size() > KEEP_DAYS) DAYS.pollFirstEntry();
        dirty = true;
    }

    private static String hash(String ip) {
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
