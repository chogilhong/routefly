package com.gh.routefly.web;

import java.io.IOException;
import java.sql.Connection;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 목록 응답(/api/courses · /api/park · /api/group · /api/trails) 서버 캐시 - 요청 열쇠(서블릿 + 검사한 값) → 완성된 JSON 글 · ETag.
 *
 * <p>2026-10-11 속도: 자료는 배치가 몇 시간 · 며칠마다만 바꿈 - 같은 물음에 DB · JSON 만들기를 되풀이하지 않게.
 * 최근 쓴 것 {@link #MAX}개 · 글자 {@link #MAX_CHARS} 까지, {@link #TTL_MS} 지나면 다시 읽음.
 * 자료 회차({@link #dbVersion} - 코스 넣은 시각 · 수, 표지판 · 위험지역 넣은 회차)가 바뀌면 모두 버림. 실패 응답은 담지 않습니다.
 */
final class ResultCache {

    private static final Logger log = LogManager.getLogger(ResultCache.class);

    static final int MAX = 500;
    /** 담아 둘 글자 합(공원 · 등산로 응답은 하나에 수백 KB 라 수로만 막으면 메모리가 큼). */
    static final long MAX_CHARS = 32L * 1024 * 1024;
    static final long TTL_MS = 10 * 60_000;
    /** 자료 회차는 1분 동안 받아 둔 값(CourseServlet.SIDE_TTL_MS 와 같음). */
    static final long VERSION_TTL_MS = CourseServlet.SIDE_TTL_MS;

    static final ResultCache LISTS = new ResultCache(MAX, MAX_CHARS, TTL_MS, ResultCache::dbVersion, System::currentTimeMillis);

    record Entry(String body, String tag, long at) {
    }

    private final LinkedHashMap<String, Entry> map = new LinkedHashMap<>(64, 0.75f, true);
    private final int max;
    private final long maxChars;
    private final long ttlMs;
    private final Supplier<String> version;
    private final LongSupplier clock;
    private long chars;
    private String seen;   // 지금 담긴 것들의 자료 회차

    ResultCache(int max, long maxChars, long ttlMs, Supplier<String> version, LongSupplier clock) {
        this.max = max;
        this.maxChars = maxChars;
        this.ttlMs = ttlMs;
        this.version = version;
        this.clock = clock;
    }

    /** 순수 함수 - 요청 열쇠. null 과 "null" 글자가 섞이지 않게 앞에 표시. */
    static String key(Object... parts) {
        StringBuilder b = new StringBuilder();
        for (Object p : parts) {
            if (p instanceof double[] d) {
                b.append('[');
                for (double v : d) b.append(v).append(',');
                b.append(']');
            } else {
                b.append(p == null ? "-" : "=" + p);
            }
            b.append('\n');
        }
        return b.toString();
    }

    /** 지금 자료 회차. 모르면(DB 실패) null - 그때는 캐시를 쓰지 않습니다. */
    String version() {
        return version.get();
    }

    /** 담아 둔 응답이 있으면 Json.ok 와 같은 길(ETag · 304 · 캐시 머리글)로 보내고 true. */
    boolean send(HttpServletRequest req, HttpServletResponse resp, String key, String ver) throws IOException {
        Entry e = get(key, ver);
        if (e == null) return false;
        Json.ok(req, resp, e.body(), e.tag());
        return true;
    }

    /** 성공 응답을 담고 보냄(Json.ok 와 같음). ver 는 DB 를 읽기 전에 받은 회차 - 그 사이 바뀌었으면 담지 않음. */
    void ok(HttpServletRequest req, HttpServletResponse resp, String key, String ver, JsonObject body) throws IOException {
        String text = body.toString(), tag = Json.etag(text);
        put(key, ver, text, tag);
        Json.ok(req, resp, text, tag);
    }

    synchronized Entry get(String key, String ver) {
        if (ver == null) return null;
        if (!ver.equals(seen)) {
            clear();
            seen = ver;
            return null;
        }
        Entry e = map.get(key);
        if (e == null) return null;
        if (clock.getAsLong() - e.at() >= ttlMs) {
            remove(key);
            return null;
        }
        return e;
    }

    synchronized void put(String key, String ver, String body, String tag) {
        if (ver == null || !ver.equals(seen) || body.length() > maxChars / 8) return;
        remove(key);
        map.put(key, new Entry(body, tag, clock.getAsLong()));
        chars += body.length();
        Iterator<Map.Entry<String, Entry>> it = map.entrySet().iterator();
        while ((map.size() > max || chars > maxChars) && it.hasNext()) {
            chars -= it.next().getValue().body().length();   // 가장 오래 안 쓴 것부터
            it.remove();
        }
    }

    private void remove(String key) {
        Entry old = map.remove(key);
        if (old != null) chars -= old.body().length();
    }

    private void clear() {
        map.clear();
        chars = 0;
    }

    private static volatile String versionCached;
    private static volatile long versionAt;

    /** 자료 회차(1분 동안 받아 둔 값). DB 를 못 읽으면 null(그 1분은 캐시 없이). */
    static String dbVersion() {
        long now = System.currentTimeMillis();
        if (versionAt != 0 && now - versionAt < VERSION_TTL_MS) return versionCached;
        String v;
        try (Connection c = Db.open()) {
            // 지운 코스도 알게 수도 함께. imported_at 은 다시 넣은 코스만 바뀜(파일이 같으면 건너뜀)
            JsonArray r = Json.rows(c, "SELECT MAX(imported_at) AS t, COUNT(*) AS n FROM route_course");
            v = r.get(0).toString() + "|" + CourseServlet.readSideVersion(c);
        } catch (Exception e) {
            log.debug("[CACHE] 자료 회차를 읽지 못함 - {}", e.toString());
            v = null;
        }
        versionCached = v;
        versionAt = now;
        return v;
    }
}
