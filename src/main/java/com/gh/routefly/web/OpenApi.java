package com.gh.routefly.web;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * 공공데이터포털 API(TourAPI 숙박 · 기상청 단기예보)를 서버에서 부르고 결과를 잠시 담아 두는 곳. 2026-10-14.
 * 모든 API(tag 마다)에 같은 차단기: 하루 한도 초과면 자정까지, 연달아 실패하면 몇 분 쉼(2026-10-21).
 * 인증키는 요청 주소에만 들어가고 로그에는 주소를 적지 않습니다(응답 앞부분만).
 */
final class OpenApi {

    private static final Logger log = LogManager.getLogger(OpenApi.class);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    private OpenApi() {
    }

    /** GET 한 번(8초 안). 200 이 아니거나 실패하면 null(로그에 tag 와 까닭). */
    static String get(String url, String tag) {
        return get(url, tag, Duration.ofSeconds(8));
    }

    /**
     * 막아 둔 API(tag) → 다시 부를 수 있는 때 · 연달아 실패한 수(2026-10-21: 에어코리아 하루 한도를 넘긴 뒤에도 주말 미리 받기가 13ms 마다 다시 물어
     * 서버 로그 7,373줄 · 포털 부담). 한도 초과는 우리 시간 자정까지, 그 밖의 실패는 두 번째부터 5분 · 15분 쉼. 막힌 동안은 바로 null(로그도 없음).
     */
    private static final Map<String, long[]> BLOCK = new java.util.concurrent.ConcurrentHashMap<>();
    static {
        loadLimits(System.currentTimeMillis());
    }

    /** 하루 한도로 막힌 API 를 파일에 남김(stats 폴더 api-limits.json - tag → 자정 ms) - 같은 날 재시작 · 배포 때 막혔는지 알려고 다시 부르지 않게(2026-10-21 PC 제안). */
    private static java.nio.file.Path limitsFile() {
        return Stats.file().resolveSibling("api-limits.json");
    }

    private static void loadLimits(long now) {
        try {
            java.nio.file.Path f = limitsFile();
            if (!java.nio.file.Files.isRegularFile(f)) return;
            com.google.gson.JsonObject o = com.google.gson.JsonParser.parseString(java.nio.file.Files.readString(f, StandardCharsets.UTF_8)).getAsJsonObject();
            for (var e : o.entrySet()) {
                long until = e.getValue().getAsLong();
                if (until > now) {
                    BLOCK.put(e.getKey(), new long[] {until, 0});
                    log.info("[{}] DAILY_LIMIT_FILE 오늘 하루 한도를 이미 넘었음(파일) - 자정까지 부르지 않음", e.getKey());
                }
            }
        } catch (Exception e) {
            // 없이 시작
        }
    }

    private static void saveLimits(long now) {
        try {
            com.google.gson.JsonObject o = new com.google.gson.JsonObject();
            BLOCK.forEach((k, v) -> { if (v[1] == 0 && v[0] > now + 60 * 60_000L) o.addProperty(k, v[0]); });   // 한도 초과(자정까지)만
            java.nio.file.Path f = limitsFile();
            java.nio.file.Files.createDirectories(f.getParent());
            java.nio.file.Files.writeString(f, o.toString(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // 다음에
        }
    }

    /** GET 한 번 - 큰 응답(에어코리아 측정소 목록 등)은 시간 한도를 늘려서. */
    static String get(String url, String tag, Duration timeout) {
        long now = System.currentTimeMillis();
        long[] b = BLOCK.get(tag);
        if (b != null && now < b[0]) return null;
        try {
            HttpRequest r = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET().build();
            HttpResponse<String> res = HTTP.send(r, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (limitHit(res.statusCode(), res.body())) {
                long until = kstMidnightAfter(now);
                BLOCK.put(tag, new long[] {until, 0});
                saveLimits(now);
                log.warn("[{}] DAILY_LIMIT 하루 호출 한도를 넘음 - 오늘 자정(우리 시간)까지 부르지 않음({}분)", tag, (until - now) / 60000);
                return null;
            }
            if (res.statusCode() == 200) { BLOCK.remove(tag); return res.body(); }
            log.warn("[{}] HTTP {} {}", tag, res.statusCode(), head(res.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            log.warn("[{}] 호출 실패 - {}", tag, e.toString());
        }
        int fails = (b == null ? 0 : (int) b[1]) + 1;
        long rest = restMs(fails);
        BLOCK.put(tag, new long[] {now + rest, fails});
        if (rest > 0) log.warn("[{}] {}번 연달아 실패 - {}분 쉼", tag, fails, rest / 60000);
        return null;
    }

    /** 그 API 를 다시 부를 수 있는 때(막혀 있지 않으면 0). */
    static long blockedUntil(String tag) {
        long[] b = BLOCK.get(tag);
        return b == null ? 0 : b[0];
    }

    /** 순수 함수 - 공공데이터포털 하루 한도 초과(HTTP 429, 또는 200 이어도 본문에 LIMITED_NUMBER_OF_SERVICE_REQUESTS · returnReasonCode 22). */
    static boolean limitHit(int status, String body) {
        if (status == 429) return true;
        if (body == null || body.length() > 4000) return false;   // 정상 자료는 길고, 오류 응답은 짧음
        return body.contains("LIMITED_NUMBER_OF_SERVICE_REQUESTS") || body.matches("(?s).*returnReasonCode\\W{0,3}22\\D.*");
    }

    /** 순수 함수 - n 번 연달아 실패한 뒤 쉬는 시간: 한 번은 안 쉼(잠깐 느렸을 수 있음), 두 번 5분, 그 뒤 15분. */
    static long restMs(int n) {
        return n <= 1 ? 0 : n == 2 ? 5 * 60_000L : 15 * 60_000L;
    }

    /** 순수 함수 - now 다음 우리 시간 자정(공공데이터포털 하루 한도가 다시 차는 때). */
    static long kstMidnightAfter(long now) {
        java.time.ZoneId kst = java.time.ZoneId.of("Asia/Seoul");
        return java.time.Instant.ofEpochMilli(now).atZone(kst).toLocalDate().plusDays(1).atStartOfDay(kst).toInstant().toEpochMilli();
    }

    static void warn(String tag, String body) {
        log.warn("[{}] 응답을 읽지 못함 - {}", tag, head(body));
    }

    private static String head(String s) {
        return s == null ? "" : s.length() > 200 ? s.substring(0, 200) : s;
    }

    /** 크기가 정해진 담아 두기(오래 안 쓴 것부터 버림) - 값과 담은 시각. */
    /** 순수 함수 - 관광공사 글의 꼬리표를 떼고 HTML 엔티티(&amp;amp; 등)를 풂(2026-10-14 PC: 시설 값에 "&amp;amp;" 가 그대로). */
    static String plain(String s) {
        if (s == null) return null;
        String t = s.replaceAll("<br\\s*/?>", " ").replaceAll("<[^>]*>", "")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ")
                .replace("&amp;", "&");
        return t.trim();
    }

    static final class Cache<V> {
        private final int max;
        private final long ttlMs;
        private final Map<String, Object[]> map;

        Cache(int max, long ttlMs) {
            this.max = max;
            this.ttlMs = ttlMs;
            this.map = new LinkedHashMap<>(64, 0.75f, true) {
                private static final long serialVersionUID = 1L;

                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Object[]> e) {
                    return size() > Cache.this.max;
                }
            };
        }

        @SuppressWarnings("unchecked")
        synchronized V get(String key, long now) {
            Object[] hit = map.get(key);
            return hit != null && now - (Long) hit[0] < ttlMs ? (V) hit[1] : null;
        }

        synchronized void put(String key, V value, long now) {
            map.put(key, new Object[] {now, value});
        }
    }
}
