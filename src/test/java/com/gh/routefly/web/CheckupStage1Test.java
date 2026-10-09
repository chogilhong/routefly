package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 2026-10-09 2차 점검 1단계(데이터가 사라지는 버그) - 고친 자리가 남아 있는지 지킵니다.
 * 동작은 브라우저에서 확인했고(뒤로 가기 · 기록 옮기기 · 되돌아가기 메모), 순수 함수는 course-kit.test.js 가 봅니다.
 */
public class CheckupStage1Test {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of("src", "main", "webapp").resolve(path), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC 는 core.autocrlf=true 라 CRLF 로 꺼내집니다
    }

    private static String body(String js, String head) {
        int a = js.indexOf(head);
        assertTrue("없음: " + head, a >= 0);
        int b = js.indexOf("\n    }\n", a);
        return js.substring(a, b);
    }

    @Test
    public void turningBackKeepsNotes() throws Exception {
        String f = body(read("js/hike.js"), "function adoptCourse(");
        assertTrue("되돌아가기 뒤 메모를 다시 남김", f.contains("saveKey() + \"-notes\""));
    }

    @Test
    public void backButtonAsksInsteadOfEnding() throws Exception {
        String f = body(read("js/hike.js"), "function route()");
        assertTrue(f.indexOf("askStop()") > 0 && f.indexOf("askStop()") < f.indexOf("stopHike()"));
    }

    @Test
    public void recordsLiveInIndexedDb() throws Exception {
        String js = read("js/hike.js");
        assertTrue(js.contains("indexedDB.open(\"rf-records\""));
        assertFalse("기록을 말없이 5개로 줄이던 코드", js.contains("list.slice(0, 5)"));
        assertTrue("사진 정리는 이어 할 산행의 메모도 봄", body(js, "function gcPhotos()").contains("-notes$/"));
    }

    @Test
    public void lateCourseResponseIgnored() throws Exception {
        assertTrue(body(read("js/hike.js"), "function loadCourse(").contains("my !== loadSeq"));
        assertTrue(body(read("js/app.js"), "function select(").contains("my !== selectSeq"));
    }

    @Test
    public void trackIsNotRewrittenOnEveryPoint() throws Exception {
        String f = body(read("js/hike.js"), "function addTrack(");
        assertFalse(f.contains("localStorage.setItem"));
        assertTrue(f.contains("flushTrack()"));
    }
}
