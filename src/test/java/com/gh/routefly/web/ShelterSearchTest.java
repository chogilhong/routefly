package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.Arrays;

import org.junit.Test;

/** 대피소 이름으로 찾으면 그 대피소를 지나는 코스까지(2026-11-19 홍TV님 "소청대피소를 검색하면 … 대피소를 거치는 코스를 모두 보여주면"). */
public class ShelterSearchTest {

    @Test
    public void 대피소를_지나는_코스까지() {
        assertTrue(CourseQueries.viaPoi("소청대피소"));
        assertTrue(CourseQueries.viaPoi("장터목대피소"));
        assertTrue(CourseQueries.viaPoi("오색산장"));
        assertFalse("대피소 하나만은 이름으로만(민방위대피소 수백 개)", CourseQueries.viaPoi("대피소"));
        assertFalse(CourseQueries.viaPoi("설악산"));
        CourseQueries.Sql s = CourseQueries.listSql(null, "hike", "소청대피소");
        assertTrue(s.sql().contains("(name LIKE ? OR course_id IN (SELECT course_id FROM route_course_poi WHERE name LIKE ? AND off_route_m <= 100))"));
        // 바인드 차례: kind 둘 · 이름 · 지점 이름 · 정렬(이름으로 시작 → 이름에 듦 → 지나기만) - 2026-11-19 PC: 이름에 든 코스가 5번째 밖이었음
        assertTrue(s.sql().contains("ORDER BY CASE WHEN name LIKE ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END"));
        assertEquals(Arrays.asList("hike", CourseQueries.TREK, "%소청대피소%", "%소청대피소%", "소청대피소%", "%소청대피소%"), Arrays.asList(s.params()));
        // 산 이름 검색은 그대로
        CourseQueries.Sql m = CourseQueries.listSql(null, null, "설악산");
        assertFalse(m.sql().contains("route_course_poi"));
    }
}
