package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;

/**
 * 기상청 중기예보 실제 응답 확인(시험이 아님 - 네트워크를 씀). 2026-10-15.
 * MidServlet 의 육상 구역 10곳 · 기온 지점 코드가 맞는지(totalCount), 칸 이름(wf4Am · rnSt4Am · taMin4 …)을 봅니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.MidFcstProbe
 * </pre>
 * 키는 weather.serviceKey(없으면 tour.serviceKey). 응답은 src/test/resources/mid/ 에(키는 지움) - 육상 한 곳 · 기온 한 곳만 파일로.
 */
public final class MidFcstProbe {

    private MidFcstProbe() {
    }

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("weather.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        if (key == null) { System.out.println("weather.serviceKey · tour.serviceKey 가 비어 있습니다."); return; }
        Path dir = Path.of("src", "test", "resources", "mid");
        Files.createDirectories(dir);
        String tm = MidServlet.tmFc(LocalDateTime.now(WeatherServlet.KST));
        System.out.println("발표 " + tm);
        for (String[] l : MidServlet.LAND) {
            Thread.sleep(500);
            String t = OpenApi.get(MidServlet.url(MidServlet.LAND_URL, key, l[0], tm), "MID-PROBE");
            report("육상 " + l[0] + " " + l[1], t);
            if (t != null && l[0].equals("11H20000")) Files.writeString(dir.resolve("land-11H20000.json"), PetTourProbe.scrub(t, key), StandardCharsets.UTF_8);
        }
        for (Object[] c : MidServlet.CITIES) {
            Thread.sleep(500);
            String t = OpenApi.get(MidServlet.url(MidServlet.TA_URL, key, (String) c[0], tm), "MID-PROBE");
            report("기온 " + c[0] + " " + c[1], t);
            if (t != null && c[0].equals("11H20701")) Files.writeString(dir.resolve("ta-11H20701.json"), PetTourProbe.scrub(t, key), StandardCharsets.UTF_8);
        }
        System.out.println("저장: " + dir.toAbsolutePath());
    }

    private static void report(String what, String text) {
        if (text == null) { System.out.println(what + " : 받지 못함(로그 [MID-PROBE])"); return; }
        var it = MidServlet.items(text);
        System.out.println(what + " : " + (it == null ? "읽지 못함 - " + text.substring(0, Math.min(160, text.length())).replaceAll("\\s+", " ") : it.keySet().size() + "칸 " + it.keySet()));
    }
}
