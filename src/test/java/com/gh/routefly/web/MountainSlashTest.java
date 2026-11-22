package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 산 페이지 주소 끝 "/" → 뺀 주소로 301(2026-11-22 /stats 404 /m/data/agoda-cities.json - 상대 주소가 한 칸 어긋났음). */
public class MountainSlashTest {

    @Test
    public void 끝_빗금은_빼서_보냄() {
        String enc = "/routefly/m/%EB%91%90%ED%83%80%EC%82%B0";   // 두타산
        assertEquals(enc, MountainServlet.slashFix("/두타산/", enc + "/", null));
        assertEquals("? 뒤도 그대로", enc + "?r=1", MountainServlet.slashFix("/두타산/", enc + "/", "r=1"));
        assertEquals("여러 개도", enc, MountainServlet.slashFix("/두타산//", enc + "//", null));
        assertEquals("/routefly/en/m/dutasan", MountainServlet.slashFix("/dutasan/", "/routefly/en/m/dutasan/", null));
        assertNull("코스 모음 /m/ 은 그대로", MountainServlet.slashFix("/", "/routefly/m/", null));
        assertNull("끝 빗금 없음", MountainServlet.slashFix("/두타산", enc, null));
        assertNull(MountainServlet.slashFix(null, "/routefly/m", null));
    }
}
