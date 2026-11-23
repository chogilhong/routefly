package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 코스 기록 보기(trip.html?c=) - 누구나 지도 · 그래프 · 구간 · 3D, 받아도 되는 코스만 💾 GPX 저장, 운영자만 📐 GPX 편집(2026-11-24 홍TV님). 출처 판정은 course-kit.test.js courseGpxFree. */
public class TripCourseTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 코스_보기_단추() throws Exception {
        String tjs = read("src/main/webapp/js/trip.js"), hjs = read("src/main/webapp/js/hike.js");
        assertTrue("?c= 로 코스를 받아 기록처럼 그림", tjs.contains("var courseParam = recParam ? null : new URLSearchParams(location.search).get(\"c\");")
                && tjs.contains("RF.gpxRecord(RF.trackGpx(name, c.course && c.course.kind, t), true, name)"));
        assertTrue("삭제 없음 · 저장은 받아도 되는 코스 또는 운영자 · 편집은 운영자", tjs.contains("$(\"rec-del\").hidden = $(\"rec-save\").hidden = $(\"rec-edit\").hidden = true;")
                && tjs.contains("$(\"rec-save\").hidden = !(a[1] || RF.courseGpxFree(courseParam, src));") && tjs.contains("$(\"rec-edit\").hidden = !a[1];"));
        assertTrue("저장은 따라가기가(앱 공유 창 · 내려받기)", tjs.contains("\"#coursegpx=\" + encodeURIComponent(courseParam)") && hjs.contains("var cg = /^#coursegpx=([^&]+)(?:&title=(.*))?$/.exec(location.hash);"));
        assertTrue("따라가기도 다시 막음 · 출처 한 줄", hjs.contains("if (!a[1] && !RF.courseGpxFree(id, src)) {") && hjs.contains("credit: RF.courseGpxCredit(id, src, EN)"));
    }
}
