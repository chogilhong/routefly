package com.gh.routefly.tidefly;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * 해 · 달 계산(2026-11-15 홍TV님 "1~5 작업해" - 일출 · 일몰, 음력 날짜). 바깥 API 없이 알려진 식으로 셈:
 * <ul>
 *   <li>일출 · 일몰: 미 해군 천문대 "Almanac for Computers" 식(천정 거리 90.833° - 대기 굴절 · 해 반지름 포함). 정확도 1 ~ 2분</li>
 *   <li>음력 날짜: 한국 음력은 우리 시간(UTC+9)으로 삭(새달)이 든 날이 1일. 삭 시각은 Meeus 「Astronomical Algorithms」 49장 식</li>
 * </ul>
 * AstroTest 가 astral(NOAA) 일출몰 · korean-lunar-calendar(천문연구원 음양력) 2년치와 맞는지 봅니다(src/test/resources/astro).
 */
final class Astro {

    private Astro() {
    }

    static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /** 순수 함수 - 그날 일출 · 일몰 시각(우리 시간, 하루 안의 초). 해가 뜨거나 지지 않는 날이면 그 칸 -1. */
    static int[] sun(double lat, double lon, LocalDate day) {
        return new int[] {sunEvent(lat, lon, day, true), sunEvent(lat, lon, day, false)};
    }

    private static int sunEvent(double lat, double lon, LocalDate day, boolean rise) {
        double zenith = 90.833;
        int n = day.getDayOfYear();
        double lngHour = lon / 15.0;
        double t = n + ((rise ? 6 : 18) - lngHour) / 24.0;
        double m = 0.9856 * t - 3.289;
        double l = norm360(m + 1.916 * sin(m) + 0.020 * sin(2 * m) + 282.634);
        double ra = norm360(Math.toDegrees(Math.atan(0.91764 * tan(l))));
        ra = (ra + (Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90)) / 15.0;
        double sinDec = 0.39782 * sin(l);
        double cosDec = Math.cos(Math.asin(sinDec));
        double cosH = (cos(zenith) - sinDec * sin(lat)) / (cosDec * cos(lat));
        if (cosH > 1 || cosH < -1) return -1;
        double h = (rise ? 360 - Math.toDegrees(Math.acos(cosH)) : Math.toDegrees(Math.acos(cosH))) / 15.0;
        double tt = h + ra - 0.06571 * t - 6.622;
        double ut = ((tt - lngHour) % 24 + 24) % 24;
        double local = (ut + 9) % 24;   // 우리 시간
        return (int) Math.round(local * 3600) % 86400;
    }

    /** 순수 함수 - 음력 날짜의 "일"(1 ~ 30). 우리 시간으로 가장 가까운 앞(그날 포함) 삭이 든 날이 1일. */
    static int lunarDay(LocalDate day) {
        double years = day.getYear() + (day.getDayOfYear() - 1) / 365.25;
        long k = Math.round((years - 2000) * 12.3685);
        for (long kk = k + 1; kk >= k - 2; kk--) {
            LocalDate nm = newMoonKst(kk);
            if (!nm.isAfter(day)) return (int) (day.toEpochDay() - nm.toEpochDay()) + 1;
        }
        throw new IllegalStateException("삭을 찾지 못함 " + day);
    }

    /** 순수 함수 - k 번째 삭(2000-01-06 근처가 0)이 든 날(우리 시간). Meeus 49장, 역학시 → 세계시는 ΔT 69초로 셈. */
    static LocalDate newMoonKst(long k) {
        double t = k / 1236.85, t2 = t * t, t3 = t2 * t, t4 = t3 * t;
        double jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t2 - 0.000000150 * t3 + 0.00000000073 * t4;
        double e = 1 - 0.002516 * t - 0.0000074 * t2;
        double m = 2.5534 + 29.10535670 * k - 0.0000014 * t2 - 0.00000011 * t3;
        double mp = 201.5643 + 385.81693528 * k + 0.0107582 * t2 + 0.00001238 * t3 - 0.000000058 * t4;
        double f = 160.7108 + 390.67050284 * k - 0.0016118 * t2 - 0.00000227 * t3 + 0.000000011 * t4;
        double om = 124.7746 - 1.56375588 * k + 0.0020672 * t2 + 0.00000215 * t3;
        double c = -0.40720 * sin(mp) + 0.17241 * e * sin(m) + 0.01608 * sin(2 * mp) + 0.01039 * sin(2 * f)
                + 0.00739 * e * sin(mp - m) - 0.00514 * e * sin(mp + m) + 0.00208 * e * e * sin(2 * m)
                - 0.00111 * sin(mp - 2 * f) - 0.00057 * sin(mp + 2 * f) + 0.00056 * e * sin(2 * mp + m)
                - 0.00042 * sin(3 * mp) + 0.00042 * e * sin(m + 2 * f) + 0.00038 * e * sin(m - 2 * f)
                - 0.00024 * e * sin(2 * mp - m) - 0.00017 * sin(om) - 0.00007 * sin(mp + 2 * m)
                + 0.00004 * sin(2 * mp - 2 * f) + 0.00004 * sin(3 * m) + 0.00003 * sin(mp + m - 2 * f)
                + 0.00003 * sin(2 * mp + 2 * f) - 0.00003 * sin(mp + m + 2 * f) + 0.00003 * sin(mp - m + 2 * f)
                - 0.00002 * sin(mp - m - 2 * f) - 0.00002 * sin(3 * mp + m) + 0.00002 * sin(4 * mp);
        double[][] a = {
            {299.77, 0.107408, -0.009173, 0.000325}, {251.88, 0.016321, 0, 0.000165}, {251.83, 26.651886, 0, 0.000164},
            {349.42, 36.412478, 0, 0.000126}, {84.66, 18.206239, 0, 0.000110}, {141.74, 53.303771, 0, 0.000062},
            {207.14, 2.453732, 0, 0.000060}, {154.84, 7.306860, 0, 0.000056}, {34.52, 27.261239, 0, 0.000047},
            {207.19, 0.121824, 0, 0.000042}, {291.34, 1.844379, 0, 0.000040}, {161.72, 24.198154, 0, 0.000037},
            {239.56, 25.513099, 0, 0.000035}, {331.55, 3.592518, 0, 0.000023}};
        double w = 0;
        for (double[] x : a) w += x[3] * sin(x[0] + x[1] * k + x[2] * t2);
        double jdUt = jde + c + w - 69.0 / 86400;
        long ms = Math.round((jdUt - 2440587.5) * 86400000L);
        return ZonedDateTime.ofInstant(Instant.ofEpochMilli(ms), KST).toLocalDate();
    }

    /**
     * 순수 함수 - 물때 이름(음력 한 달을 15일씩 셈).
     * <ul>
     *   <li>남해 · 동해 · 제주: 기상청 기상백과 "물때"(15간법) - 음력 1 · 16일 8물, 7 · 22일 14물, 8 · 23일 15물(조금), 9 · 24일 1물, 15 · 30일 7물(사리).
     *       2026-11-15 PC 가 본 바다타임(음력 10.7 14물 → 10.8 조금 → 10.9 1물)과 같음</li>
     *   <li>서해: 1물 ~ 13물 · 조금 · 무시 - 음력 10 · 25일 1물, 7 · 22일 13물, 8 · 23일 조금, 9 · 24일 무시, 1 · 16일 7물.
     *       2026-11-15 홍TV님이 보내 준 바다타임 2016년 6월 표(음력 5.7 13물 · 5.8 조금 · 5.9 무시 · 5.10 1물 · 5.1 7물 · 4.26 2물)와
     *       PC 가 본 서해 음력 10.7 13물에 맞춤</li>
     * </ul>
     */
    static String mulddae(int lunarDay, boolean west) {
        if (west) {
            int n = Math.floorMod(lunarDay - 10, 15) + 1;   // 1 ~ 15
            return n == 14 ? "조금" : n == 15 ? "무시" : n + "물";
        }
        int n = Math.floorMod(lunarDay - 9, 15) + 1;
        return n == 15 ? "조금" : n + "물";
    }

    /**
     * 순수 함수 - 사리 무렵인지: 음력 15 · 16 · 17 · 30 · 1 · 2일(남해 셈 7 ~ 9물). 기상청 기상백과는 7물(15 · 30일)을 사리라 하고,
     * 2026-11-15 홍TV님이 보내 준 글은 7 ~ 9물을 사리 기간이라 함 - 물이 가장 많이 들고 빠져 갯바위 · 방파제 고립을 조심할 때.
     */
    static boolean sari(int lunarDay) {
        return lunarDay == 15 || lunarDay == 16 || lunarDay == 17 || lunarDay == 30 || lunarDay == 1 || lunarDay == 2;
    }

    /** 순수 함수 - 하루 안의 초 → "HH:mm". -1 이면 "-". */
    static String hm(int sec) {
        if (sec < 0) return "-";
        return String.format("%02d:%02d", sec / 3600, sec % 3600 / 60);
    }

    private static double norm360(double d) {
        return ((d % 360) + 360) % 360;
    }

    private static double sin(double deg) {
        return Math.sin(Math.toRadians(deg));
    }

    private static double cos(double deg) {
        return Math.cos(Math.toRadians(deg));
    }

    private static double tan(double deg) {
        return Math.tan(Math.toRadians(deg));
    }
}
