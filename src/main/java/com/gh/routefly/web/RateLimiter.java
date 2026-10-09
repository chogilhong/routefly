package com.gh.routefly.web;

import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 요청 횟수 제한(곳마다 물통 하나): 한꺼번에 burst 번까지, 그 뒤로는 1초에 perSecond 번씩 채워집니다.
 * 지도를 움직이며 목록 · 등산로를 부르는 보통 쓰임은 걸리지 않고, 프로그램으로 빠르게 긁어 가는 것만 막습니다.
 * 오래 안 온 곳은 지워 메모리가 늘지 않게 합니다.
 */
final class RateLimiter {

    private final double burst, perMs;
    private final Map<String, double[]> buckets = new ConcurrentHashMap<>();   // 곳 → {남은 횟수, 마지막 시각}
    private long lastSweep;

    RateLimiter(int burst, int perSecond) {
        this.burst = burst;
        this.perMs = perSecond / 1000.0;
    }

    /** 이 곳(key)의 요청을 받아도 되는가. now 는 ms(시험에서 시간을 정해 넣으려고). */
    boolean allow(String key, long now) {
        sweep(now);
        double[] b = buckets.computeIfAbsent(key, k -> new double[] {burst, now});
        synchronized (b) {
            b[0] = Math.min(burst, b[0] + (now - b[1]) * perMs);
            b[1] = now;
            if (b[0] < 1) return false;
            b[0] -= 1;
            return true;
        }
    }

    int size() {
        return buckets.size();
    }

    private void sweep(long now) {
        if (now - lastSweep < 60_000) return;
        lastSweep = now;
        for (Iterator<double[]> it = buckets.values().iterator(); it.hasNext();) {
            if (now - it.next()[1] > 120_000) it.remove();
        }
    }
}
