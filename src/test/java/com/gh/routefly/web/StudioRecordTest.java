package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 기록 보기 📐 GPX 편집 → GPX 편집에서 운영자는 ⬆ 코스로 올리기, 다른 사람은 📮 등록 요청(2026-11-24 홍TV님 "'등록 요청'을 'GPX 편집' 으로 바꾸고"). */
public class StudioRecordTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 기록을_GPX_편집에서_열어_등록_요청() throws Exception {
        String js = read("src/main/webapp/js/studio.js"), html = read("src/main/webapp/studio.html");
        assertTrue("#rec=기록 열쇠(시작 시각|코스)로 이 기기 내 기록에서 찾아 목록에", js.contains("var m = /^#rec=(.+)$/.exec(location.hash);")
                && js.contains("return x && x.start + \"|\" + (x.courseId || \"\") === key;") && js.contains("if (/^(hike|walk|bike)$/.test(r.kind)) $(\"kind\").value = r.kind;"));
        assertTrue("되살린 길 · 안내도 길 다음, 산 자리 앞", js.contains("restoreWork().then(openFromGuide).then(openFromRecord).then(openAt);"));
        assertTrue("다른 사람 단추는 📮 등록 요청", html.contains("id=\"sendBtn\" type=\"button\">📮 등록 요청</button>") && js.contains("$(\"upTool\").title = owner ? \"코스로 올리기\" : \"등록 요청\";"));
        assertTrue("겹침 출처에 OSM 을 또 적지 않음", js.contains("attr: \"등산로: © waymarkedtrails.org (CC-BY-SA)\" }") && js.contains("attr: \"자전거길: © waymarkedtrails.org (CC-BY-SA)\" }"));
    }
}
