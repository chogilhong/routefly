package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalTime;

import org.junit.Test;

/** 일출몰 · 음력 · 물때 이름 - 기준값은 src/test/resources/astro(만든 도구는 파일 첫 줄). */
public class AstroTest {

    @Test
    public void 음력_날짜_2년치가_천문연구원_음양력과_같음() throws Exception {
        int n = 0;
        StringBuilder bad = new StringBuilder();
        for (String line : Files.readAllLines(Path.of("src", "test", "resources", "tidefly", "astro", "lunar-days.csv"), StandardCharsets.UTF_8)) {
            if (line.startsWith("#") || line.isBlank()) continue;
            String[] f = line.split(",");
            LocalDate d = LocalDate.parse(f[0]);
            int got = Astro.lunarDay(d);
            if (got != Integer.parseInt(f[1].trim())) bad.append(d).append(" 기대 ").append(f[1]).append(" 계산 ").append(got).append('\n');
            n++;
        }
        assertEquals(730, n);
        assertEquals("", bad.toString());
    }

    @Test
    public void 일출몰은_NOAA_식과_2분_안() throws Exception {
        int n = 0;
        for (String line : Files.readAllLines(Path.of("src", "test", "resources", "tidefly", "astro", "sun.csv"), StandardCharsets.UTF_8)) {
            if (line.startsWith("#") || line.isBlank()) continue;
            String[] f = line.split(",");
            int[] s = Astro.sun(Double.parseDouble(f[1]), Double.parseDouble(f[2]), LocalDate.parse(f[3]));
            int rise = LocalTime.parse(f[4]).toSecondOfDay(), set = LocalTime.parse(f[5]).toSecondOfDay();
            assertTrue(line + " 일출 " + Astro.hm(s[0]), Math.abs(s[0] - rise) <= 120);
            assertTrue(line + " 일몰 " + Astro.hm(s[1]), Math.abs(s[1] - set) <= 120);
            n++;
        }
        assertEquals(30, n);
    }

    @Test
    public void 물때_이름_15일_셈() {
        // 2026-11-15 PC 가 바다타임에서 본 차례: 음력 10.7 14물 → 10.8 조금 → 10.9 1물
        assertEquals("14물", Astro.mulddae(7, false));
        assertEquals("조금", Astro.mulddae(8, false));
        assertEquals("1물", Astro.mulddae(9, false));
        assertEquals("7물", Astro.mulddae(15, false));
        assertEquals("8물", Astro.mulddae(1, false));
        assertEquals("조금", Astro.mulddae(23, false));
        assertEquals("7물", Astro.mulddae(30, false));
        assertEquals("14물", Astro.mulddae(22, false));
        assertEquals(7, Astro.lunarDay(LocalDate.of(2026, 11, 15)));
        // 남해 · 동해 · 제주: 기상청 기상백과 15간법 - 1 · 16일 8물, 15 · 30일 7물, 8 · 23일 조금
        assertEquals("8물", Astro.mulddae(16, false));
        assertEquals("조금", Astro.mulddae(23, false));
        // 서해: 바다타임 2016년 6월 표(홍TV님이 보내 줌) - 음력 4.26 2물 · 4.29 5물 · 5.1 7물 · 5.7 13물 · 5.8 조금 · 5.9 무시 · 5.10 1물 · 5.11 2물
        //       + PC 가 본 음력 10.7 서해 13물
        int[] day = {26, 29, 1, 7, 8, 9, 10, 11};
        String[] want = {"2물", "5물", "7물", "13물", "조금", "무시", "1물", "2물"};
        for (int i = 0; i < day.length; i++) assertEquals("음력 " + day[i], want[i], Astro.mulddae(day[i], true));
        assertEquals("무시", Astro.mulddae(24, true));
        assertEquals("6물", Astro.mulddae(30, true));
        // 서해 포인트는 첫 특보구역이 S12…(가거도 서해남부남쪽바깥먼바다), 김녕(제주도북부앞바다)은 아님
        assertEquals(true, TideflyServlet.west(java.util.List.of("S1232220")));
        assertEquals(false, TideflyServlet.west(java.util.List.of("S1323100")));
        assertEquals(false, TideflyServlet.west(null));
        assertEquals("07:04", Astro.hm(7 * 3600 + 4 * 60 + 59));
        assertEquals("-", Astro.hm(-1));
    }

    @Test
    public void 사리_무렵과_지역_묶음() {
        assertEquals(true, Astro.sari(15));
        assertEquals(true, Astro.sari(1));
        assertEquals(true, Astro.sari(17));
        assertEquals(false, Astro.sari(8));
        assertEquals(false, Astro.sari(14));
        assertEquals("동해", TideflyServlet.area(java.util.List.of("S1151100")));
        assertEquals("서해", TideflyServlet.area(java.util.List.of("S1251300", "S1252010")));
        assertEquals("제주", TideflyServlet.area(java.util.List.of("S1323100")));   // 김녕
        assertEquals("남해", TideflyServlet.area(java.util.List.of("S1311100")));   // 부산
        assertEquals("남해", TideflyServlet.area(java.util.List.of("S1322200")));   // 거문도(남해서부동쪽먼바다)
        assertEquals("그 밖", TideflyServlet.area(null));
    }
}
