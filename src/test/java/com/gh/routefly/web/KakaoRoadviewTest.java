package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-11-02 홍TV님: 들머리 로드뷰(카카오맵 지도 URL) - 산 페이지 코스 카드 · 따라가기 길찾기 창. */
public class KakaoRoadviewTest {

    @Test
    public void roadviewLink() {
        assertEquals("https://map.kakao.com/link/roadview/37.675360,126.959490", MountainServlet.kakaoRoad(new double[] {37.67536, 126.95949}));
    }

    @Test
    public void navSheetHasRoadview() throws Exception {
        String h = Files.readString(Path.of("src/main/webapp/hike.html")), js = Files.readString(Path.of("src/main/webapp/js/hike.js"));
        assertTrue(h.contains("id=\"navRoad\"") && h.contains("class=\"big kmap\" id=\"navKakao\""));
        assertTrue(js.contains("\"https://map.kakao.com/link/roadview/\" + lat + \",\" + lon"));
    }
}
