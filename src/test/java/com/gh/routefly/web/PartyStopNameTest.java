package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;

import java.util.List;

import org.junit.Test;

/**
 * 탑승지 이름 12자 자르기(2026-11-12 홍TV님이 보여 준 반더룽 "지리산 연하선경 천왕봉" 일정표 글 그대로).
 * 전에는 "양재역 12번출구 50" · "중산리 거북이식당 주차" 처럼 낱말 가운데가 잘렸음 - 괄호 · 끝의 출발은 빼고 낱말 경계에서.
 */
public class PartyStopNameTest {

    @Test
    public void bandeorungJirisan() {
        String go = "23:20 사당역 1번출구 나와서 450m 대항병원 건너편(2.4호선)\n23:30 양재역 12번출구 50m 서초구청 마을버스정류장 앞 (3호선)\n"
            + "23:45 동천역 환승정류장\n23:50 죽전 간이정류장\n23:55 신갈 간이정류장";
        assertEquals(List.of("사당역 1번출구 나와서", "양재역 12번출구", "동천역 환승정류장", "죽전 간이정류장", "신갈 간이정류장"), Party.stops(go));
        assertEquals(List.of("23:20", "23:30", "23:45", "23:50", "23:55"), Party.stopTimes(go));
        String back = "15:00 중산리 거북이식당 주차장 출발. (경남 산청군 시천면 지리산대로 352)\n"
            + "16:00 대원사 버스정류장 출발. (경남 산청군 삼장면 대원사길241 대원사주차장(유평주차장)";
        assertEquals(List.of("중산리 거북이식당", "대원사 버스정류장"), Party.stops(back));
        assertEquals(List.of("15:00", "16:00"), Party.stopTimes(back));
    }

    @Test
    public void shortNamesAsBefore() {
        assertEquals(List.of("사당", "양재", "복정"), Party.stops("사당 17:00, 양재 17시20분, 복정"));
        assertEquals("한 낱말이 길면 12자 그대로", "가나다라마바사아자차카타", Party.stopName("가나다라마바사아자차카타파하"));
    }
}
