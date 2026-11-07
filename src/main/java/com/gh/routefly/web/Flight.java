package com.gh.routefly.web;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * 같은 열쇠를 지금 묻는 중이면 그 답을 함께 기다림 - 기억이 빈 순간 손님 여럿이 같은 공공 API 를 따로따로 묻지 않게.
 * 2026-11-02 홍TV님 속도 점검에서 SafetyServlet 에 만든 것을 2026-11-07 전체 점검 3단계에서 날씨 · 중기예보 · 미세먼지도 함께 쓰게 뺌.
 * 열쇠는 쓰는 곳마다 앞말을 붙입니다("weather|…").
 */
final class Flight {

    private Flight() {
    }

    /** 함께 기다리는 한도 - OpenApi 묻기 마감(20초)보다 조금 길게. 날씨처럼 한 번에 몇 번을 묻는 것은 그 뒤 따로 물음. */
    static final long WAIT_MS = 25_000L;

    private static final ConcurrentHashMap<String, CompletableFuture<Object>> RUN = new ConcurrentHashMap<>();

    /** 처음 온 요청만 f 를 부르고, 그동안 같은 열쇠로 온 요청은 그 답을 받음(기다리다 넘치면 null). f 가 예외를 던지면 기다리던 쪽은 null. */
    @SuppressWarnings("unchecked")
    static <T> T once(String key, Supplier<T> f) {
        CompletableFuture<Object> mine = new CompletableFuture<>(), run = RUN.putIfAbsent(key, mine);
        if (run != null) {
            try {
                return (T) run.get(WAIT_MS, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            } catch (Exception e) {
                return null;
            }
        }
        T v = null;
        try {
            v = f.get();
            return v;
        } finally {
            RUN.remove(key, mine);
            mine.complete(v);
        }
    }
}
