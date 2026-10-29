package com.gh.routefly.web;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 바깥 API(관광공사 · 카카오 · V-World)에 새로 묻는 횟수 상한(2026-10-30 홍TV님 "해킹대비"). 서버 기억(캐시)에 있는 답은 세지 않음.
 * 좌표 · 이름을 조금씩 바꿔 가며 부르면 기억에 없어 매번 바깥에 묻게 되어 하루 호출 한도를 다 쓸 수 있음 - 주소(IP)마다 한 시간 상한, 서버 전체 하루 상한(한국 시각 자정에 새로).
 * 상한을 넘으면 그 요청만 "지금 못 받음"(unavailable)으로 답하고 기억하지 않음.
 */
final class OutQuota {

    static final int MAX_KEYS = 20_000;

    private final String tag;
    private final int perIpHour, perDay;
    private final Map<String, long[]> ips = new LinkedHashMap<>(256, 0.75f, true) {   // 주소 → {시간 번호, 횟수}
        private static final long serialVersionUID = 1L;

        @Override
        protected boolean removeEldestEntry(Map.Entry<String, long[]> e) {
            return size() > MAX_KEYS;
        }
    };
    private long day = Long.MIN_VALUE;
    private int dayCount;
    private boolean dayWarned;

    OutQuota(String tag, int perIpHour, int perDay) {
        this.tag = tag;
        this.perIpHour = perIpHour;
        this.perDay = perDay;
    }

    /** 설정(quota.&lt;이름&gt;.ip · .day)이 있으면 그 수, 없으면 기본. */
    static OutQuota of(String name, int perIpHour, int perDay) {
        return new OutQuota(name, num("quota." + name + ".ip", perIpHour), num("quota." + name + ".day", perDay));
    }

    private static int num(String key, int dflt) {
        try {
            String v = RouteflyConfig.get(key);
            return v == null ? dflt : Math.max(0, Integer.parseInt(v.trim()));
        } catch (RuntimeException e) {
            return dflt;
        }
    }

    /** 이 주소(ip)가 지금 바깥에 새로 물어도 되는가 - 되면 한 번 셈. now 는 ms(시험에서 시간을 정해 넣으려고). */
    synchronized boolean allow(String ip, long now) {
        long d = Math.floorDiv(now + 9 * 3_600_000L, 86_400_000L), h = now / 3_600_000L;
        if (d != day) {
            day = d;
            dayCount = 0;
            dayWarned = false;
        }
        if (dayCount >= perDay) {
            if (!dayWarned) org.apache.logging.log4j.LogManager.getLogger(OutQuota.class).warn("[QUOTA] {} 하루 상한 {} 번 - 오늘은 기억에 있는 답만", tag, perDay);
            dayWarned = true;
            return false;
        }
        long[] c = ips.computeIfAbsent(RateLimiter.group(ip), k -> new long[] {h, 0});
        if (c[0] != h) {
            c[0] = h;
            c[1] = 0;
        }
        if (c[1] >= perIpHour) return false;
        c[1]++;
        dayCount++;
        return true;
    }
}
