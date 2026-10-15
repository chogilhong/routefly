package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 가장 가파른 1km 구간(2026-10-16 홍TV님 - 난이도) - course-kit.test.js "steepest" 와 같은 값. */
public class SteepTest {

    @Test
    public void steepest() {
        double[] d = new double[51];
        Double[] e = new Double[51], r = new Double[51];
        for (int i = 0; i <= 50; i++) {
            d[i] = i * 100;
            e[i] = i < 30 ? 300.0 + i * 5 : 445.0 + (i - 30) * 30;   // 3km 완만(5%) 뒤 2km 가파름(30%)
        }
        for (int i = 0; i <= 50; i++) r[i] = e[50 - i];
        assertEquals(30.0, Steep.steepest(d, e), 1e-9);
        assertEquals("내리막도 셈", 30.0, Steep.steepest(d, r), 1e-9);
        assertEquals("1km 보다 짧으면 처음 ~ 끝", 20.0, Steep.steepest(new double[] {0, 500}, new Double[] {100.0, 200.0}), 1e-9);
        assertNull("300m 보다 짧음", Steep.steepest(new double[] {0, 200}, new Double[] {0.0, 50.0}));
        assertNull("고도 없음", Steep.steepest(new double[] {0, 2000}, new Double[] {null, null}));
    }

    @Test
    public void raisesDifficulty() {   // course-kit.test.js "difficulty 가파름이 올림" 과 같은 값
        assertEquals(1, MountainServlet.difficulty(5000, 600, null));
        assertEquals("가파름은 한 단계까지만", 2, MountainServlet.difficulty(5000, 600, 45.0));
        assertEquals(1, MountainServlet.difficulty(5000, 600, 27.0));
        assertEquals("오색 → 대청봉", 3, MountainServlet.difficulty(5000, 1300, 44.4));
        assertEquals("짧은 길은 매우 가팔라도 한 단계만", 1, MountainServlet.difficulty(2000, 100, 50.0));
        assertEquals("한계령 → 대청봉 → 남설악(급한 내리막) - PC", "<i class=\"lv lv3\">어려움</i>", MountainServlet.levelChip(12330, 1068, 40.0, false));
    }
}
