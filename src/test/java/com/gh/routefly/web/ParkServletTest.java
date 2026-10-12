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
        assertEquals("PDF 는 PC 브라우저에서 내려받기로 넘어가 JPG 로", "https://www.knps.or.kr/download/park/map/설악산국립공원탐방로등급지도.jpg",
                ParkServlet.officialMap("설악산"));
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
        assertTrue("숫자로 시작하는 산(화면 mountainOf 와 같은 규칙)", ParkServlet.MOUNTAIN.matcher("157고지우송대뒷산").matches());
        assertFalse(ParkServlet.MOUNTAIN.matcher("12345산").matches());
        assertFalse(ParkServlet.MOUNTAIN.matcher("157").matches());
        assertTrue(ParkServlet.MOUNTAIN.matcher("민오름").matches());
        assertTrue(ParkServlet.MOUNTAIN.matcher("100고지").matches());
        assertFalse(ParkServlet.MOUNTAIN.matcher("고지").matches());
        // 대구 팔공산에만 공식 지도(진안 팔공산 35.73/127.59 는 아님)
        assertTrue(ParkServlet.nearCenter("팔공산", new double[] {128.70, 36.02}));
        assertFalse(ParkServlet.nearCenter("팔공산", new double[] {127.59, 35.73}));
        assertFalse(ParkServlet.nearCenter("모악산", new double[] {127.0, 35.7}));
        assertTrue(ParkServlet.inside(new double[] {127.6, 35.3}, new double[] {127.5, 35.2, 127.8, 35.4}, 0.1));
        assertTrue(ParkServlet.namedFor("김제 모악산 · 금산사 → 모악산", "모악산"));
        assertTrue(ParkServlet.namedFor("마이산 자락 2코스 · 북부주차장에서", "마이산"));
        assertTrue(ParkServlet.namedFor("대둔산(마천대) 1코스", "대둔산"));
        assertTrue("정맥 뒤 산 이름", ParkServlet.namedFor("금남정맥안골산 · 가 → 안골산", "안골산"));
        assertFalse("정맥 이름만", ParkServlet.namedFor("금남정맥 · 가 → 나", "안골산"));
        assertFalse("끝점에만 든 다른 노선", ParkServlet.namedFor("금호남정맥 · 부귀산 → 마이산", "마이산"));
        assertFalse("덕숭산 수덕산은 가야산 아님", ParkServlet.namedFor("예산 덕숭산 · 수덕사 → 덕숭산", "가야산"));
        assertFalse("서산 가야산은 합천 가야산 공원이 아님", ParkServlet.inside(new double[] {126.6, 36.7}, new double[] {128.0, 35.7, 128.2, 35.9}, 0.1));
        assertNull("아직 확인 안 한 공원은 단추 없음", ParkServlet.officialMap("없는공원"));
    }

    @Test
    public void headsOf() {
        double[] box = {127.4, 35.2, 127.9, 35.5};
        java.util.List<Object[]> h = ParkServlet.headsOf(java.util.List.of(
                new String[] {"산청 지리산 천왕봉 · 중산리탐방지원센터 → 천왕봉", "35.303", "127.7498", "35.337", "127.731"},
                new String[] {"하동 지리산 천왕봉 · 화개탐방안내소 → 천왕봉 → 중산리탐방지원센터", "35.25", "127.62", "35.304", "127.75"},
                new String[] {"먼 산 · 다른탐방지원센터 → 봉", "37.0", "128.0", "37.1", "128.1"},
                new String[] {"지리산 · 천왕봉 → 장터목", "35.3", "127.7", "35.3", "127.71"}), box);
        assertEquals(2, h.size());
        assertEquals("중산리탐방지원센터", h.get(0)[0]);
        assertEquals(35.303, (Double) h.get(0)[1], 1e-9);
        assertEquals("화개탐방안내소", h.get(1)[0]);
    }
}
