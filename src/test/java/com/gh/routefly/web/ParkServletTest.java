package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 국립공원 전체 보기 - 공원 이름 목록 · 공식 안내도 바로가기(knps-maps.properties, UTF-8). */
public class ParkServletTest {

    @Test
    public void parksAndOfficialMaps() {
        assertEquals(22, ParkServlet.PARKS.size());
        assertTrue(ParkServlet.PARKS.contains("지리산"));
        assertTrue(ParkServlet.PARKS.contains("한려해상"));
        assertEquals("한글 주소가 깨지지 않음(UTF-8)", "https://www.knps.or.kr/download/park/map/지리산국립공원안내도.jpg", ParkServlet.officialMap("지리산"));
        assertNull("아직 확인 안 한 공원은 단추 없음", ParkServlet.officialMap("없는공원"));
    }
}
