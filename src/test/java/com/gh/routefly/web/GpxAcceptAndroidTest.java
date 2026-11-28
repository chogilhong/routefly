package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * GPX 열기 파일 고르기 - 안드로이드에서 .gpx 를 고를 수 있게(2026-11-28 PC 매뉴얼 녹화: 앱의 파일 고르기에서 .gpx 가 회색이라 못 고르고 .xml 만 됨 -
 * 안드로이드는 .gpx 의 형식을 몰라 application/octet-stream 으로 다룸). 네 화면(따라가기 · 3D · GPX 편집 · 기록 보기) 모두 같은 목록.
 */
public class GpxAcceptAndroidTest {

    static final String ACCEPT = "accept=\".gpx,application/gpx+xml,application/xml,text/xml,application/octet-stream\"";

    @Test
    public void 네_화면_모두_octet_stream() throws Exception {
        for (String f : new String[] {"hike.html", "index.html", "studio.html", "trip.html"}) {
            String h = new String(Files.readAllBytes(Paths.get("src/main/webapp/" + f)), StandardCharsets.UTF_8);
            assertTrue(f, h.contains(ACCEPT));
        }
    }
}
