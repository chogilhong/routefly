package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 국립공원 전체 보기 - 공원 이름 목록 · 공식 안내도 바로가기(knps-maps.properties, UTF-8). */
public class ParkServletTest {

    @Test
    public void parksAndOfficialMaps() {
        assertEquals("2023년 팔공산까지 23곳", 23, ParkServlet.PARKS.size());
        assertTrue(ParkServlet.PARKS.contains("지리산"));
        assertTrue(ParkServlet.PARKS.contains("한려해상"));
        assertEquals("한글 주소가 깨지지 않음(UTF-8) · 휴대폰에 가벼운 등급지도",
                "https://www.knps.or.kr/download/park/map/지리산국립공원탐방로등급지도.jpg", ParkServlet.officialMap("지리산"));
        assertEquals("https://www.knps.or.kr/download/park/map/map120400.pdf", ParkServlet.officialMap("설악산"));
        assertNull("한라산은 제주도 소관이라 저작권 확인 전까지 뺌", ParkServlet.officialMap("한라산"));
        for (String p : ParkServlet.PARKS) {
            String u = ParkServlet.officialMap(p);
            assertTrue(p + " 은 공단 누리집 주소", u == null || u.startsWith("https://www.knps.or.kr/download/park/map/"));
        }
        // 도립 · 군립공원 · 다른 산 이름
        assertTrue(ParkServlet.MOUNTAIN.matcher("모악산").matches());
        assertTrue(ParkServlet.MOUNTAIN.matcher("마이산").matches());
        assertFalse(ParkServlet.MOUNTAIN.matcher("모악산'; DROP").matches());
        assertFalse(ParkServlet.MOUNTAIN.matcher("송산 정상").matches());
        assertNull("아직 확인 안 한 공원은 단추 없음", ParkServlet.officialMap("없는공원"));
    }
}
