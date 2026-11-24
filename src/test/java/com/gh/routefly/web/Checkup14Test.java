package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Map;

import org.junit.Test;

/** 점검 14차(2026-11-24 홍TV님 "정밀하게 심도높게 해" · "전부 작업해") - 단계마다 메서드 하나. */
public class Checkup14Test {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 단계1_급한_것() throws Exception {
        // A1 걷기 길 칸: 없는 칸은 캐시에 넣지 않음 · 우리나라 밖 범위는 받지 않음
        java.lang.reflect.Field f = WalkWaysServlet.class.getDeclaredField("CACHE");
        f.setAccessible(true);
        Map<?, ?> cache = (Map<?, ?>) f.get(null);
        int before;
        synchronized (cache) { before = cache.size(); }
        for (int i = 0; i < 50; i++) assertTrue(WalkWaysServlet.rows(new File("/nonexistent-walk/c_" + i + ".tsv")).isEmpty());
        synchronized (cache) { assertEquals("없는 칸은 담지 않음", before, cache.size()); }
        assertTrue(WalkWaysServlet.inKorea(new double[] {127.0, 37.0, 127.05, 37.05}));
        assertFalse("바다 · 외국", WalkWaysServlet.inKorea(new double[] {0.0, 0.0, 0.05, 0.05}));
        // A3 공개 기록 만들기 입구는 없음(보기만) - VideoKitTest 가 405 · 1년 지움을 봄
        assertFalse(read("src/main/java/com/gh/routefly/web/RecordShareServlet.java").contains("doPost"));
        // A4 자동 광고는 쓰지 않음(문서)
        assertTrue(read("CLAUDE.md").contains("애드센스 \"자동 광고\" 는 켜지 않습니다"));
        // A5 이은 코스도 조각마다 받음 - 코스 보기 · 코스 GPX 저장 · GPX 편집이 같은 RF.courseFetch
        assertTrue(read("src/main/webapp/js/trip.js").contains("Promise.all([RF.courseFetch(courseParam, cJson), ownP])")
                && read("src/main/webapp/js/hike.js").contains("Promise.all([RF.courseFetch(id, getJson), ownerDevice()])")
                && read("src/main/webapp/js/studio.js").contains("RF.courseFetch(id, json).then(function (c) {"));
        // A6 밝은 모드에서 어두운 칸 글자
        assertTrue(read("src/main/webapp/trip.html").contains("<style>:root[data-theme=\"light\"] { --bg:#11161d;"));
        assertTrue(read("src/main/webapp/studio.html").contains(":root[data-theme=\"light\"] #findQ { background:var(--panel); color:var(--tx); }"));
        // F3 부르는 곳 없는 함수 · F2 같은 식 한 곳
        String st = read("src/main/webapp/js/studio.js");
        assertFalse(st.contains("function isOurs("));
        assertEquals("우리 지도 보이기 식은 한 곳", 1, st.split("l.layout.visibility !== \"none\"", -1).length - 1);
        // F4 방침 - 광고 자리 · 공개 기록 지우기
        for (String p : new String[] {"privacy.html", "privacy-en.html"}) {
            String t = read("src/main/webapp/" + p);
            assertFalse(p, t.contains("따라가기 · 산악회 방 화면과 앱에는 없음") || t.contains("not on the hike or hiking club room screens"));
            assertFalse(p, t.contains("\"공개 끄기\" 를 누르면 바로 지우고") || t.contains("\"Turn off\" deletes it immediately"));
        }
    }
}
