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

    /** GET 한 번 - 큰 응답(에어코리아 측정소 목록 등)은 시간 한도를 늘려서. */
    static String get(String url, String tag, Duration timeout) {
        try {
            HttpRequest r = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET().build();
            HttpResponse<String> res = HTTP.send(r, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (res.statusCode() == 200) return res.body();
            log.warn("[{}] HTTP {} {}", tag, res.statusCode(), head(res.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("[{}] 호출 실패 - {}", tag, e.toString());
        }
        return null;
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
