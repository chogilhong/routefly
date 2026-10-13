package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

/** 2026-10-13 홍TV님: "출발" · "도착" 보다 들머리 · 날머리 이름 - 둘레 다른 코스 끝 이름(좌표는 만든 값). */
public class EndNamesTest {

    @Test
    public void nameEnds() {
        assertArrayEquals(new String[] {"백담사", "소청봉"}, CourseQueries.nameEnds("설악산 · 백담사 → 영시암 → 소청봉"));
        assertArrayEquals(new String[] {"선정암", null}, CourseQueries.nameEnds("무등산 · 선정암에서"));
        assertArrayEquals(new String[] {"가탄", "송정"}, CourseQueries.nameEnds("지리산둘레길 가탄-송정"));
        assertArrayEquals(new String[] {null, null}, CourseQueries.nameEnds("설악산 · 대청봉코스"));
        assertArrayEquals(new String[] {"덕전리", "덕전리"}, CourseQueries.nameEnds("덕대산 1코스 · 덕전리 순환"));
    }

    @Test
    public void endNameOfPicksTrailheadNamesFirst() {
        List<String[]> rows = List.of(
                new String[] {"산 · 갈림길 → 봉정암", "38.1650", "128.3762", "38.17", "128.40"},          // 막연한 이름 - 뺌
                new String[] {"산 · 영시암 → 수렴동", "38.1652", "128.3763", "38.17", "128.40"},          // 들머리답지 않음(가까워도 뒤로)
                new String[] {"산 · 용대리 → 백담사", "38.19", "128.35", "38.1655", "128.3765"},          // 끝이 들머리 이름
                new String[] {"산 · 먼마을 → 다른곳", "38.20", "128.30", "38.21", "128.31"});             // 멂
        assertEquals("백담사", CourseQueries.endNameOf(rows, 38.1650, 128.3762, 300));
        assertEquals("영시암", CourseQueries.endNameOf(rows.subList(0, 2), 38.1650, 128.3762, 300));
        assertNull(CourseQueries.endNameOf(rows.subList(3, 4), 38.1650, 128.3762, 300));
    }
}
