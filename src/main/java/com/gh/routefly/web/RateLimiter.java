package com.gh.routefly.web;

import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 요청 횟수 제한(곳마다 물통 하나): 한꺼번에 burst 번까지, 그 뒤로는 1초에 perSecond 번씩 채워집니다.
 * 지도를 움직이며 목록 · 등산로를 부르는 보통 쓰임은 걸리지 않고, 프로그램으로 빠르게 긁어 가는 것만 막습니다.
 * 오래 안 온 곳은 지워 메모리가 늘지 않게 합니다.
 */
final class RateLimiter {

    /** 물통 수 상한 - 2026-10-10 점검: IPv6 주소를 바꿔 가며 보내면 물통이 끝없이 늘 수 있었음. */
    static final int MAX_KEYS = 100_000;

    private final double burst, perMs;
    private final Map<String, double[]> buckets = new ConcurrentHashMap<>();   // 곳 → {남은 횟수, 마지막 시각}
    private final AtomicLong lastSweep = new AtomicLong();

    RateLimiter(int burst, int perSecond) {
        this.burst = burst;
        this.perMs = perSecond / 1000.0;
    }

    /** 이 곳(key)의 요청을 받아도 되는가. now 는 ms(시험에서 시간을 정해 넣으려고). */
    boolean allow(String key, long now) {
        sweep(now);
        double[] b = buckets.computeIfAbsent(group(key), k -> new double[] {burst, now});
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

    /** 순수 함수 - IPv6 는 앞 64비트(한 집 · 한 회선이 받는 범위)로 묶습니다. IPv4 · 그 밖은 그대로. */
    static String group(String ip) {
        if (ip == null || ip.indexOf(':') < 0) return ip == null ? "?" : ip;
        String[] p = ip.split(":", -1);
        if (ip.contains("::")) {   // 줄인 표기 - 앞쪽 무리만 보고 모자라면 0
            String head = ip.substring(0, ip.indexOf("::"));
            p = head.isEmpty() ? new String[0] : head.split(":");
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 4; i++) sb.append(i < p.length && !p[i].isEmpty() ? p[i].toLowerCase(java.util.Locale.ROOT) : "0").append(':');
        return sb.append(":/64").toString();
    }

    private void sweep(long now) {
        long last = lastSweep.get();
        boolean full = buckets.size() > MAX_KEYS;
        if (!full && now - last < 60_000) return;
        if (!lastSweep.compareAndSet(last, now)) return;   // 다른 요청이 이미 쓸고 있음
        long idle = full ? 10_000 : 120_000;
        for (Iterator<double[]> it = buckets.values().iterator(); it.hasNext();) {
            if (now - it.next()[1] > idle) it.remove();
        }
        if (buckets.size() > MAX_KEYS) buckets.clear();   // 그래도 넘치면(공격) 한 번 비움
    }
}
