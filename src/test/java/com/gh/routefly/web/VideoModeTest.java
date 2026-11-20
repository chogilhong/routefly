package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 3D 화면 영상 모드(?video=1) - 쇼츠 2판 마무리 3D 비행 녹화용(2026-11-20 홍TV님 "마무리에 3D 비행을 넣자").
 * V-World 약관에 방송 · 복제는 사전 승낙 문구가 있어(PC 2026-11-20 확인) 기본은 위성 없이 지형만, 출처 줄은 늘 화면에. 설정 풀이는 course-kit.test.js(RF.videoOpts).
 */
public class VideoModeTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    @Test
    public void 영상_모드() throws Exception {
        String js = read("src/main/webapp/js/app.js"), html = read("src/main/webapp/index.html");
        assertTrue(js.contains("var VIDEO = RF.videoOpts(location.search);"));
        assertTrue("기본은 위성 없이", js.contains("if (!VIDEO.sat) cfg = Object.assign({}, cfg, { vworldKey: null });"));
        assertTrue("코스를 연 뒤 저절로", js.contains("if (VIDEO) videoRun(c);"));
        assertTrue("to 에서 멈추고 끝 표시", js.contains("if (VIDEO && anim.d >= VIDEO.to * cur.total) {") && js.contains("window.routeflyVideo.done = Date.now();"));
        assertTrue("출처 줄 - 지형 · 등산로 · OSM", js.contains("+ ATTR_TRAILS + \"© OpenStreetMap contributors\";") && js.contains("\"Terrain Tiles (AWS Open Data) | \""));
        assertTrue("지도 출처 단추와 같은 글", js.contains("customAttribution: ATTR_TRAILS + "));
        assertTrue("칸 · 단추 숨김", html.contains("html.video .maplibregl-control-container { display:none !important; }"));
        assertTrue("출처 줄은 보임", html.contains("html.video #videoCredit { position:fixed;"));
    }
}
