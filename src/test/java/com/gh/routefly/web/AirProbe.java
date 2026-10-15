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
        System.out.println("저장: " + dir.toAbsolutePath());
    }
}
