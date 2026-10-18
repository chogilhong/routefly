package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 산행 안전 정보 실제 응답 확인(시험이 아님 - 네트워크를 씀). 2026-10-18 홍TV님 추천 - 기상특보 · 자외선 · 산불위험 · 응급실.
 * 주소 · 칸 이름은 PC 조사(공공데이터포털 15000415 · 15085288 · 15084817 · 15000563). 공식 응답 예시가 없어 이것으로 실제 모양을 봅니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.SafetyApiProbe
 * </pre>
 * 키는 tour.serviceKey(같은 개인 키, 서비스마다 활용 신청). 응답은 src/test/resources/safety/ 에(키는 지움).
 */
public final class SafetyApiProbe {

    private SafetyApiProbe() {
    }

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("tour.serviceKey");
        if (key == null) { System.out.println("tour.serviceKey 가 비어 있습니다."); return; }
        String k = URLEncoder.encode(key, StandardCharsets.UTF_8);
        LocalDateTime now = LocalDateTime.now(WeatherServlet.KST);
        String today = now.format(DateTimeFormatter.BASIC_ISO_DATE), weekAgo = now.minusDays(6).format(DateTimeFormatter.BASIC_ISO_DATE);
        LocalDateTime uv = now.getHour() >= 18 ? now.withHour(18) : now.getHour() >= 6 ? now.withHour(6) : now.minusDays(1).withHour(18);   // 06 · 18시 발표로 짐작
        String uvTime = uv.format(DateTimeFormatter.ofPattern("yyyyMMddHH"));
        String[][] calls = {
            {"warn-list", "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList?serviceKey=" + k + "&pageNo=1&numOfRows=10&dataType=JSON&stnId=108&fromTmFc=" + weekAgo + "&toTmFc=" + today},
            {"warn-status", "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?serviceKey=" + k + "&pageNo=1&numOfRows=10&dataType=JSON"},
            {"uv", "https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5?serviceKey=" + k + "&pageNo=1&numOfRows=10&dataType=JSON&areaNo=1100000000&time=" + uvTime},
            {"fire-sido", "https://apis.data.go.kr/1400377/forestPointV2/forestPointListSidoSearchV2?serviceKey=" + k + "&pageNo=1&numOfRows=20&_type=json"},
            {"er-near", "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytLcinfoInqire?serviceKey=" + k + "&WGS84_LON=126.9779&WGS84_LAT=37.5663&pageNo=1&numOfRows=5"}};
        Path dir = Path.of("src", "test", "resources", "safety");
        Files.createDirectories(dir);
        for (String[] c : calls) {
            Thread.sleep(500);
            String t = OpenApi.get(c[1], "SAFETY-PROBE");
            System.out.println(c[0] + " : " + (t == null ? "받지 못함(로그 [SAFETY-PROBE])" : t.length() + "자 / 앞부분 " + t.substring(0, Math.min(400, t.length())).replaceAll("\\s+", " ")));
            if (t != null) Files.writeString(dir.resolve(c[0] + (t.trim().startsWith("<") ? ".xml" : ".json")), PetTourProbe.scrub(t, key), StandardCharsets.UTF_8);
        }
        System.out.println("자외선 time=" + uvTime + " (형식이 틀리면 응답에 오류 코드가 나옴) · 저장: " + dir.toAbsolutePath());
    }
}
