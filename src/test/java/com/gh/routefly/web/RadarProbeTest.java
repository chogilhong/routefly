package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;

import java.time.LocalDateTime;

import org.junit.Test;

/** 레이더 받기 프로그램의 시각 계산(2026-11-14). 화면 · 서버 코드는 실제 응답을 받은 뒤에. */
public class RadarProbeTest {

    @Test
    public void tenMinuteSlotTwentyMinutesBack() {
        assertEquals("202611141320", RadarProbe.tenMinutesAgo(LocalDateTime.of(2026, 11, 14, 13, 47)));
        assertEquals("202611142350", RadarProbe.tenMinutesAgo(LocalDateTime.of(2026, 11, 15, 0, 10)));
    }
}
