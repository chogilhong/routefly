package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 기록 보기 구간을 공단 탐방로의 갈림길(처음 · 끝 - 비선대 · 마등령 · 무너미고개)에서도, 같은 곳을 두 번 지나면 두 번 끊음
 * (2026-11-26 홍TV님 "소공원 ~ 비선대, 비선대 ~ 마등령삼거리, … 비선대 ~ 소공원 이렇게 나눠야"). 셈은 course-kit.test.js trailEnds · trackSegments.
 */
public class TripJunctionSegTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 갈림길에서도_구간을_끊음() throws Exception {
        String tj = read("src/main/webapp/js/trip.js");
        assertTrue(tj.contains("parkEnds = RF.trailEnds(d.trails);") && tj.contains("if (parkEnds.length) { parkEnds = []; paintTrack(); }"));
        assertTrue(tj.contains("RF.trackSegments(rc, fam.huts.concat(fam.peaks, namedPeaks, parkEnds), SEG_NEAR_M, SEG_GAP_M)"));
        String ck = read("src/main/webapp/js/course-kit.js");
        assertTrue("지날 때마다", ck.contains("passesNear(c, s.lat, s.lon, maxM).forEach(function (q) {"));
        assertTrue("기록 보기용 작은 course-kit 에 있음", read("src/main/webapp/js/kit-trip.js").contains("trailEnds: trailEnds"));
        assertTrue("trip 은 서비스워커 화면 파일 - 캐시 이름을 올림", read("src/main/webapp/sw.js").contains("var SHELL = \"rf-shell-v431\""));
    }
}
