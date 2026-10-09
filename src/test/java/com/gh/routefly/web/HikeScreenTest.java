package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

/**
 * 2026-10-08 산행 화면 - hike.js 가 $("아이디") 로 찾는 요소가 hike.html 에 모두 있는지.
 * 단추 · 창을 새로 붙일 때(GPX 열기 · 오프라인 범위 · 사진 · 메모) 한쪽만 고치면 화면이 스크립트 오류로 멈추므로 지킵니다.
 */
public class HikeScreenTest {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of("src", "main", "webapp").resolve(path), StandardCharsets.UTF_8);
    }

    @Test
    public void everyIdTheScriptUsesIsInThePage() throws Exception {
        String js = read("js/hike.js"), html = read("hike.html");
        Set<String> used = new TreeSet<>(), missing = new TreeSet<>();
        Matcher m = Pattern.compile("\\$\\(\"([A-Za-z][\\w-]*)\"\\)").matcher(js);
        while (m.find()) used.add(m.group(1));
        for (String id : used) {
            if (!html.contains("id=\"" + id + "\"")) missing.add(id);
        }
        assertTrue("hike.js 가 찾는 아이디가 너무 적음 - 찾는 식이 바뀌었는지 확인", used.size() > 50);
        assertEquals("hike.html 에 없는 아이디", new TreeSet<String>(), missing);
    }

    /** 2026-10-09 코스 미리보기(index.html) - app.js 가 찾는 아이디가 모두 있는지, 내 주변 · 내 기록 · GPX 열기가 이어져 있는지. */
    @Test
    public void previewScreenIdsAndTools() throws Exception {
        String js = read("js/app.js"), html = read("index.html");
        Set<String> used = new TreeSet<>(), missing = new TreeSet<>();
        Matcher m = Pattern.compile("\\$\\(\"([A-Za-z][\\w-]*)\"\\)").matcher(js);
        while (m.find()) used.add(m.group(1));
        for (String id : used) {
            if (!html.contains("id=\"" + id + "\"")) missing.add(id);
        }
        assertEquals("index.html 에 없는 아이디", new TreeSet<String>(), missing);
        for (String id : new String[] {"nearMe", "myRecords", "gpxOpen", "gpxFile"}) assertTrue("app.js 에서 씀: " + id, used.contains(id));
        assertTrue("내 기록은 따라가기 화면으로", js.contains("hike.html#rec") && read("js/hike.js").contains("showRecords();   // 코스 미리보기"));
        assertTrue("GPX 를 두는 곳은 두 화면이 같이", read("js/course-kit.js").contains("storeGpx: storeGpx"));
    }

    /** 이번에 더한 단추 · 창이 실제로 쓰이고 있는지(지운 뒤 한쪽만 남지 않게). */
    @Test
    public void newControlsAreWired() throws Exception {
        String js = read("js/hike.js"), html = read("hike.html");
        for (String id : new String[] {"gpxOpen", "gpxFile", "saveSheet", "saveNear", "saveWide", "saveView", "noteBtn", "noteSheet",
                "notePhoto", "noteSave", "notesSheet", "notesList"}) {
            assertTrue("hike.js 에서 씀: " + id, js.contains("\"" + id + "\""));   // $("…") 이거나 [["saveNear", …]] 처럼
            assertTrue("hike.html 에 있음: " + id, html.contains("id=\"" + id + "\""));
        }
        assertTrue("GPX 는 공용 코스 도구에서 읽습니다", read("js/course-kit.js").contains("gpxToApi: gpxToApi"));
        // 2026-10-09 내 기록: 100m 미만 · 코스에서 3km 넘게 떨어진 기록은 남기지 않음(판단은 공용 도구 RF.recordSkip)
        assertTrue(read("js/course-kit.js").contains("recordSkip: recordSkip"));
        assertTrue("GPX 열기는 GPX 만", html.contains("id=\"gpxFile\" accept=\".gpx,application/gpx+xml\""));
        assertTrue("산행을 끝낼 때 거릅니다", js.contains("RF.recordSkip(hike.walked, hike.track, c)) return;"));
    }
}
