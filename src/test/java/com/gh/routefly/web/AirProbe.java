package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 에어코리아 실제 응답을 받아 보는 확인용 프로그램(시험이 아님 - 네트워크를 씀). 2026-10-15.
 * AirServlet 이 읽는 칸(stationName · dmX · dmY · dataTime · pm10Value · pm25Value)이 실제 응답에 있는지 봅니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.AirProbe
 * .claude\run-tests.ps1 -Run web.AirProbe sido 서울 강원   → 시도별 실시간만(sido-&lt;이름&gt;.json, 다른 파일은 덮어쓰지 않음 - 2026-11-07 PC 요청)
 * </pre>
 *
 * 키는 config.properties 의 air.serviceKey(없으면 tour.serviceKey)를 RouteflyConfig 로 읽습니다(화면 · 파일에 키를 쓰지 않음).
 * 받은 응답은 src/test/resources/air/ 에 저장합니다(키는 지움, 측정소 목록은 앞 5곳만).
 */
public final class AirProbe {

    private AirProbe() {
    }

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("air.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        if (key == null) {
            System.out.println("air.serviceKey · tour.serviceKey 가 비어 있습니다.");
            return;
        }
        Path dir = Path.of("src", "test", "resources", "air");
        Files.createDirectories(dir);
        String enc = URLEncoder.encode(key, StandardCharsets.UTF_8);
        if (args.length > 0 && "sido".equals(args[0])) {
            for (int i = 1; i < Math.max(2, args.length); i++) sido(dir, enc, key, i < args.length ? args[i] : "경북");
            return;
        }
        String st = OpenApi.get(AirServlet.STATIONS_URL + "?serviceKey=" + enc + "&returnType=json&numOfRows=1000&pageNo=1", "AIR-PROBE", AirServlet.STATIONS_TIMEOUT);
        if (st == null) {
            System.out.println("측정소 목록: 받지 못함(로그 [AIR-PROBE] - 활용 신청 · 키 확인)");
            return;
        }
        st = PetTourProbe.scrub(st, key);
        Files.writeString(dir.resolve("stations-head.txt"), st.substring(0, Math.min(2000, st.length())), StandardCharsets.UTF_8);
        List<String> names = new ArrayList<>(), addrs = new ArrayList<>();
        List<double[]> pos = new ArrayList<>();
        boolean ok = AirServlet.stations(st, names, pos, addrs);
        System.out.println("측정소 목록: " + (ok ? names.size() + "곳" : "읽지 못함 - stations-head.txt 를 보세요"));
        if (!ok) return;
        double[][] at = {{35.7998, 128.0961}, {37.6879, 127.0350}, {33.3617, 126.5292}};   // 가야산 · 북한산 · 한라산
        for (double[] p : at) {
            List<Integer> near = AirServlet.nearest(pos, p[0], p[1], AirServlet.AIR_NEAR_M, 1);
            if (near.isEmpty()) { System.out.println(p[0] + "," + p[1] + " : 40km 안 측정소 없음"); continue; }
            int i = near.get(0);
            Thread.sleep(700);
            String m = OpenApi.get(AirServlet.MEASURE_URL + "?serviceKey=" + enc + "&returnType=json&numOfRows=" + AirServlet.ROWS + "&pageNo=1&dataTerm=DAILY&ver=1.0&stationName="
                    + URLEncoder.encode(names.get(i), StandardCharsets.UTF_8), "AIR-PROBE");
            if (m == null) { System.out.println(names.get(i) + " : 받지 못함"); continue; }
            m = PetTourProbe.scrub(m, key);
            Files.writeString(dir.resolve("measure-" + names.get(i).replaceAll("[^\\p{L}\\p{N}]", "_") + ".json"), m, StandardCharsets.UTF_8);
            System.out.println(names.get(i) + " : " + AirServlet.measure(m));
        }
        // 미세먼지 예보(2026-10-15) - 오늘 발표분
        String day = java.time.LocalDate.now(WeatherServlet.KST).toString();
        Thread.sleep(700);
        String fc = OpenApi.get(AirServlet.FORECAST_URL + "?serviceKey=" + enc + "&returnType=json&numOfRows=100&pageNo=1&ver=1.1&searchDate=" + day, "AIR-PROBE");
        if (fc == null) System.out.println("예보: 받지 못함");
        else {
            fc = PetTourProbe.scrub(fc, key);
            Files.writeString(dir.resolve("forecast.json"), fc, StandardCharsets.UTF_8);
            for (double[] p : at) {
                List<Integer> near = AirServlet.nearest(pos, p[0], p[1], AirServlet.AIR_NEAR_M, 1);
                if (near.isEmpty()) continue;
                String r = AirServlet.region(addrs.get(near.get(0)));
                System.out.println("예보 " + r + " (" + names.get(near.get(0)) + ") : " + AirServlet.forecastFor(fc, r));
            }
        }
        // 시도별 실시간 측정값(getCtprvnRltmMesureDnsty, 2026-11-07 전체 점검 3단계) - 한 번에 그 시도 측정소 모두.
        // 측정소마다 묻던 것을 시도마다 한 번으로 줄이려면 실제 응답 모양(칸 이름 · 줄 수)부터 봅니다. 가야산(대가야읍)이 든 경북
        sido(dir, enc, key, "경북");
        System.out.println("저장: " + dir.toAbsolutePath());
    }

    /** 시도별 실시간 측정값 하나를 받아 sido-&lt;이름&gt;.json 으로(AirServlet 과 같은 물음). */
    private static void sido(Path dir, String enc, String key, String name) throws Exception {
        Thread.sleep(700);
        String sd = OpenApi.get(AirServlet.SIDO_URL + "?serviceKey=" + enc + "&returnType=json&numOfRows=200&pageNo=1&ver=1.0&sidoName="
                + URLEncoder.encode(name, StandardCharsets.UTF_8), "AIR-PROBE");
        if (sd == null) {
            System.out.println("시도별(" + name + "): 받지 못함");
            return;
        }
        sd = PetTourProbe.scrub(sd, key);
        Files.writeString(dir.resolve("sido-" + name + ".json"), sd, StandardCharsets.UTF_8);
        java.util.Map<String, com.google.gson.JsonObject> rows = AirServlet.sidoRows(sd);
        System.out.println("시도별(" + name + "): " + (rows == null ? "읽지 못함(이름 · 응답 확인)" : rows.size() + "곳 값 있음") + " - sido-" + name + ".json");
    }
}
