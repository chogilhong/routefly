package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 따라가기 "‹ 안내도"(parkGo)로 탐방 안내도에 돌아갈 때 &from=이 코스 를 붙임(2026-11-10 원스토어 검증 "등산 > 임의의 코스 선택 > 안내도 빈 화면").
 * 국립공원이 아닌 산(가리왕산 등)은 api/park 가 from 없으면 400(ParkServlet - 같은 이름 산이 여러 곳) → 빈 지도에 "from 은 그 산의 코스 ID 입니다".
 * 운영에서 hike.html#c=kmp-2322010007-1&via=park → ‹ 안내도: 고치기 전 400, 고친 뒤 200(설악산 knps 코스도 200).
 */
public class ParkBackLinkTest {

    @Test
    public void backToParkKeepsFrom() throws Exception {
        String js = new String(Files.readAllBytes(Path.of("src/main/webapp/js/hike.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("이은 코스는 첫 구간의 원래 코스, GPX 는 없이", js.contains("var parkFrom = parts ? parts[0].base : isGpxId(id) ? null : id;"));
        assertTrue(js.contains("parkHref = park ? \"park.html?name=\" + encodeURIComponent(park) + (parkFrom ? \"&from=\" + encodeURIComponent(parkFrom) : \"\") + \"&back=list\" : null;"));
        assertFalse("from 없는 예전 줄", js.contains("parkHref = park ? \"park.html?name=\" + encodeURIComponent(park) + \"&back=list\" : null;"));
        // 서버는 국립공원이 아니면 from 이 꼭 있어야 함 - 이 규칙이 바뀌면 이 테스트도 다시 봄
        String srv = new String(Files.readAllBytes(Path.of("src/main/java/com/gh/routefly/web/ParkServlet.java")), StandardCharsets.UTF_8);
        assertTrue(srv.contains("\"from 은 그 산의 코스 ID 입니다(같은 이름 산이 여러 곳이라).\""));
    }
}
