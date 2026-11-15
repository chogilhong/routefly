package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** 앱 신호를 보낸 화면 경로만 로그에(2026-11-15) - 질의 · 조각(방 코드 · 열쇠)은 버림. */
public class SeenAppLogTest {

    @Test
    public void onlyPathIsKept() {
        assertEquals("/routefly/hike.html", SeenServlet.page("https://routefly.kr/routefly/hike.html?lang=ko#c=abc"));
        assertEquals("방 코드가 남지 않게", "/routefly/party.html", SeenServlet.page("https://routefly.kr/routefly/party.html?c=ROOMCODE#t=TOKEN"));
        assertEquals("/routefly/m/%EA%B0%80%EC%95%BC%EC%82%B0", SeenServlet.page("https://routefly.kr/routefly/m/%EA%B0%80%EC%95%BC%EC%82%B0"));
        assertEquals("-", SeenServlet.page(null));
        assertEquals("-", SeenServlet.page("::not a url::"));
    }
}
