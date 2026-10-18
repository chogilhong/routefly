package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;

/**
 * 공휴일(한국천문연구원) · 기름값(오피넷) 실제 응답 확인(시험이 아님 - 네트워크를 씀). 2026-10-18 🧰 별거 별거.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.HolidayFuelProbe
 * </pre>
 * 키는 holiday.serviceKey(없으면 tour.serviceKey) · opinet.key. 응답은 src/test/resources/holiday/ · fuel/ 에(키는 지움).
 */
public final class HolidayFuelProbe {

    private HolidayFuelProbe() {
    }

    public static void main(String[] args) throws Exception {
        int y = LocalDate.now(WeatherServlet.KST).getYear();
        String hk = RouteflyConfig.get("holiday.serviceKey");
        if (hk == null) hk = RouteflyConfig.get("tour.serviceKey");
        if (hk == null) System.out.println("공휴일: holiday.serviceKey · tour.serviceKey 가 비어 있습니다.");
        else {
            Path dir = Path.of("src", "test", "resources", "holiday");
            Files.createDirectories(dir);
            for (int m : new int[] {1, 7, 10}) {   // 설 · 공휴일 없는 달(7월 - 제헌절은 휴일 아님) · 개천절 · 한글날
                Thread.sleep(500);
                String t = OpenApi.get(HolidayServlet.url(HolidayServlet.DEFAULT_URL, hk, y, m), "HOLIDAY-PROBE");
                System.out.println("공휴일 " + y + "-" + m + " : " + (t == null ? "받지 못함(로그 [HOLIDAY-PROBE])" : HolidayServlet.items(t) + " / 앞부분 " + t.substring(0, Math.min(200, t.length())).replaceAll("\\s+", " ")));
                if (t != null) Files.writeString(dir.resolve(y + "-" + m + ".json"), PetTourProbe.scrub(t, hk), StandardCharsets.UTF_8);
            }
            System.out.println("저장: " + dir.toAbsolutePath());
        }
        String ok = RouteflyConfig.get("opinet.key");
        if (ok == null) { System.out.println("기름값: opinet.key 가 비어 있습니다."); return; }
        Path dir = Path.of("src", "test", "resources", "fuel");
        Files.createDirectories(dir);
        String[][] calls = {{"avgAllPrice.do", ""}, {"avgSidoPrice.do", "&prodcd=B027"}, {"lowTop10.do", "&prodcd=B027&area=01&cnt=10"}};
        for (String[] c : calls) {
            Thread.sleep(500);
            String t = OpenApi.get(FuelServlet.url(FuelServlet.DEFAULT_URL, c[0], c[1], ok), "FUEL-PROBE");
            System.out.println("기름값 " + c[0] + c[1] + " : " + (t == null ? "받지 못함(로그 [FUEL-PROBE])" : (FuelServlet.oil(t) == null ? "읽지 못함" : FuelServlet.oil(t).size() + "줄")
                    + " / 앞부분 " + t.substring(0, Math.min(300, t.length())).replaceAll("\\s+", " ")));
            if (t != null) Files.writeString(dir.resolve(c[0].replace(".do", "") + ".json"), PetTourProbe.scrub(t, ok), StandardCharsets.UTF_8);
        }
        System.out.println("저장: " + dir.toAbsolutePath());
    }
}
