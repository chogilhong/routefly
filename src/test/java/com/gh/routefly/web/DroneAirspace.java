package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 드론 공역 고정 파일 만들기(2026-11-17 홍TV님 dronefly, 2026-11-18 부터 운영은 /api/airspace 가 하루 한 번 새로 받고 이 파일은 그때까지 · 못 받을 때 씀) - DroneProbe 가 받은 브이월드 응답(src/test/resources/drone/data-*-kr.json)에서
 * 이름 · 높이 칸과 경계(소수 5자리, 약 1m)만 남겨 src/main/webapp/data/drone-airspace.json 으로. 화면(js/dronefly.js)이 받아 폰 안에서 셈.
 * <pre>.claude\run-tests.ps1 -Run web.DroneAirspace   (DroneProbe 로 다시 받은 뒤)</pre>
 */
public final class DroneAirspace {

    private DroneAirspace() {
    }

    static final Path OUT = Path.of("src", "main", "webapp", "data", "drone-airspace.json");

    public static void main(String[] args) throws Exception {
        String s = build(Path.of("src", "test", "resources", "drone"), args.length > 0 ? args[0] : "2026-11-17");
        Files.writeString(OUT, s, StandardCharsets.UTF_8);
        System.out.println(OUT + " ← " + s.length() + "자");
    }

    /** 순수 함수(파일만 읽음) - 공역 파일 글. date - 받은 날(화면에 보임). 셈은 서버가 하루 한 번 새로 받을 때와 같은 AirspaceServlet.build(2026-11-18 - 한 벌로). */
    static String build(Path dir, String date) throws Exception {
        Map<String, String> data = new LinkedHashMap<>(), wfs = new LinkedHashMap<>();
        for (String[] k : AirspaceServlet.KINDS) data.put(k[1], Files.readString(dir.resolve("data-" + k[1] + "-kr.json"), StandardCharsets.UTF_8));
        for (String[] k : AirspaceServlet.WFS_KINDS) wfs.put(k[1], Files.readString(dir.resolve("wfs-" + k[1] + "-kr.json"), StandardCharsets.UTF_8));
        return AirspaceServlet.build(data, wfs, date);
    }
}
