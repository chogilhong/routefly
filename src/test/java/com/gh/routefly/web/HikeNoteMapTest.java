package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 내 기록 사진 · 메모 → 지도 자리 · 출발부터 거리 · 해발(2026-11-22 홍TV님 - 램블러처럼). 거리 셈은 course-kit.test.js(recordCourse pois). */
public class HikeNoteMapTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC git 은 CRLF 로 체크아웃
    }

    @Test
    public void 사진에서_지도로() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        assertTrue("줄마다 출발부터 거리", js.contains("T(\" · 출발부터 \", \" · from start \") + km(at) + \"km\""));
        assertTrue(js.contains("go.textContent = T(\"🗺 지도에서\", \"🗺 On map\");"));
        assertTrue("기록 지도 보기는 한 곳(recordOnMap)", js.contains("$(\"recViewMap\").onclick = function () { recordOnMap(rc, null); };")
                && js.indexOf("setData(RF.recordLines(rc))") == js.lastIndexOf("setData(RF.recordLines(rc))"));
        assertTrue("자리 표시 · 말풍선", js.contains("noteMark = marker(e, [note.lon, note.lat]).setPopup("));
        int cl = js.indexOf("function clearRecLine() {");
        assertTrue("기록 선 지우기에 표시도", cl > 0 && js.substring(cl, js.indexOf("\n    }\n", cl)).contains("if (noteMark) { noteMark.remove(); noteMark = null; }"));
        assertTrue(html.contains(".noteRow .noteGo {") && html.contains(".noteMark {"));
    }
}
