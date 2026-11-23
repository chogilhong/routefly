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
        String trip = read("src/main/webapp/js/trip.js");
        assertTrue("기록 🗺 지도는 기록 보기(trip.html)로 - 산행 중에는 안 넘어감(2026-11-22 홍TV님), 🖼 카드 단추는 뺌",
                js.contains("location.href = \"trip.html?rec=\" + encodeURIComponent(recKey(rec)) + (EN ? \"&lang=en\" : \"\");")
                && js.contains("if (hike.running) { toast(T(\"산행 중에는 기록 보기로 넘어가지 않습니다.") && !html.contains("recViewCard") && !js.contains("recViewCard"));
        assertTrue("기록 보기는 이 기기의 같은 저장소(rf-records r list · rf-photos p)에서 그 기록을 찾음 · 뒤로는 내 기록",
                trip.contains("idbGet(\"rf-records\", \"r\", \"list\")") && trip.contains("r.start + \"|\" + (r.courseId || \"\") === recParam")
                && trip.contains("idbGet(\"rf-photos\", \"p\", id)") && trip.contains("$(\"back\").href = (EN ? \"hike.html?lang=en\" : \"hike.html\") + \"#rec\";")
                && js.contains("function recKey(r) { return r ? r.start + \"|\" + (r.courseId || \"\") : \"\"; }"));
        assertTrue("사진 · 메모 🗺 지도에서는 그대로 따라가기 지도에(한 곳)", js.indexOf("setData(RF.recordLines(rc))") == js.lastIndexOf("setData(RF.recordLines(rc))"));
        assertTrue("자리 표시 · 말풍선", js.contains("noteMark = marker(e, [note.lon, note.lat]).setPopup("));
        int cl = js.indexOf("function clearRecLine() {");
        assertTrue("기록 선 지우기에 표시도", cl > 0 && js.substring(cl, js.indexOf("\n    }\n", cl)).contains("if (noteMark) { dropMarks([noteMark]); noteMark = null; }"));   // 2026-11-22 사진 작은 그림 - 그림 주소도 놓음
        assertTrue(html.contains(".noteRow .noteGo {") && html.contains(".noteMark {"));
    }
}
