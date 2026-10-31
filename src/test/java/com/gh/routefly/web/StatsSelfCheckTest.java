package com.gh.routefly.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** PC Claude 확인용 접속(이름표 routefly-check)은 방문 수에서 뺌(2026-10-31 홍TV님). */
public class StatsSelfCheckTest {

    @Test
    public void onlyTheCheckName() {
        assertTrue(StatsFilter.selfCheck("curl/8.9.1 routefly-check"));
        assertTrue(StatsFilter.selfCheck("Mozilla/5.0 (Windows NT 10.0; Win64; x64) routefly-check/1"));
        assertFalse(StatsFilter.selfCheck("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0"));
        assertFalse(StatsFilter.selfCheck("routefly-batch"));
        assertFalse(StatsFilter.selfCheck(null));
    }
}
