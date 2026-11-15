package com.gh.routefly.tidefly;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 공공데이터포털(국립해양조사원) 실제 응답을 받아 테스트 데이터로 저장하는 확인용 프로그램(테스트가 아님 - 네트워크 · 키를 씀).
 * 응답 모양을 보기 전에는 화면을 만들지 않습니다(2026-11-14 홍TV님).
 *
 * <pre>
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe all                 → 아래 일곱을 기본값으로 한 번씩(7건)
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe hghlw   [obsCode] [yyyyMMdd]   조석예보(고, 저조)     15156018
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe time    [obsCode] [yyyyMMdd]   조석예보(시계열, 60분) 15156022
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe tidebed [위도 경도] [yyyyMMdd] [분 간격] TideBED 예측 조위(기본 60분) 15156026
 *     (2026-11-15: 포인트 자리 만조 · 간조를 찾으려고 10분 간격도 - 예: tidebed 35.97555 126.56305 20261114 10 → 군산 예보지점 자리, 같은 날 hghlw 와 견줌)
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe dt      [obsCode]              조위관측소 최신 관측   15155508
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe tw      [obsCode]              해양관측부이 최신 관측 15155516
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe wave    [obsCode]              실측 파랑              15155994
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe fishing [갯바위|선상] [장소]   바다낚시지수           15142486
 * .claude\run-tests.ps1 -Run tidefly.PortalProbe fishing-pages [갯바위|선상] [쪽 수]  바다낚시지수 1 ~ N 쪽(300줄씩) - 포인트 전체 목록용
 * </pre>
 * 저장: src/test/resources/portal/&lt;이름&gt;-&lt;조건&gt;.json (키는 {KEY} 로 지움).
 *
 * <p>주소 · 요청 칸 · 기본값은 2026-11-14 웹 Claude 가 data.go.kr 각 서비스 설명 페이지(openapi.do)의 명세(swagger)에서 옮겼습니다.
 * 기본값(DT_0018 · TW_0089 · 33.96194/126.44527 · 갯바위 · 김녕)은 그 페이지의 예시 값입니다. 키는 tide.serviceKey(없으면 tour.serviceKey, Decoding 키 - routefly TideServlet 과 같음).
 */
public final class PortalProbe {

    private PortalProbe() {
    }

    static final String BASE = "https://apis.data.go.kr/1192136/";
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /** 받을 것 하나 - 저장 이름과 주소(키 칸은 끝에 붙임). */
    record Ask(String file, String url) {
    }

    public static void main(String[] args) throws Exception {
        String key = TideflyServlet.portalKey();
        if (key == null) {
            System.out.println("tide.serviceKey · tour.serviceKey 가 비어 있습니다.");
            return;
        }
        String today = LocalDate.now(KST).format(DateTimeFormatter.BASIC_ISO_DATE);
        List<Ask> asks = asks(args, today);
        if (asks.isEmpty()) {
            System.out.println("쓰는 법: all | hghlw | time | tidebed | dt | tw | wave | fishing (PortalProbe 주석 참고)");
            return;
        }
        Path dir = Path.of("src", "test", "resources", "tidefly", "portal");
        for (Ask a : asks) {
            Probes.save(dir.resolve(a.file()), a.url() + "&serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8), key);
            Thread.sleep(300);
        }
    }

    /** 순수 함수 - 명령줄 → 받을 것들(키 없이). 모르는 이름이면 빈 목록. */
    static List<Ask> asks(String[] args, String today) {
        String mode = args.length > 0 ? args[0] : "";
        List<Ask> out = new ArrayList<>();
        if (mode.equals("all")) {
            for (String m : new String[] {"hghlw", "time", "tidebed", "dt", "tw", "wave", "fishing"}) out.addAll(asks(new String[] {m}, today));
            return out;
        }
        String a1 = args.length > 1 ? args[1] : null;
        String a2 = args.length > 2 ? args[2] : null;
        String a3 = args.length > 3 ? args[3] : null;
        switch (mode) {
            case "hghlw" -> {
                String obs = or(a1, "DT_0018"), d = or(a2, today);
                out.add(new Ask("hghlw-" + obs + "-" + d + ".json", BASE + "tideFcstHghLw/GetTideFcstHghLwApiService?type=json&pageNo=1&numOfRows=20&obsCode=" + enc(obs) + "&reqDate=" + d));
            }
            case "time" -> {
                String obs = or(a1, "DT_0018"), d = or(a2, today);
                out.add(new Ask("time-" + obs + "-" + d + ".json", BASE + "tideFcstTime/GetTideFcstTimeApiService?type=json&pageNo=1&numOfRows=300&min=60&obsCode=" + enc(obs) + "&reqDate=" + d));
            }
            case "tidebed" -> {
                String lat = or(a1, "33.96194"), lon = or(a2, "126.44527"), d = or(a3, today);
                String min = args.length > 4 && args[4].matches("[1-9][0-9]?") ? args[4] : "60";   // 명세: 1 ~ 60, 한 쪽 300줄(10분이면 144줄)
                out.add(new Ask("tidebed-" + lat + "_" + lon + "-" + d + (min.equals("60") ? "" : "-" + min + "m") + ".json",
                        BASE + "tidebed/GetTidebedApiService?type=json&pageNo=1&numOfRows=300&min=" + min + "&lat=" + enc(lat) + "&lot=" + enc(lon) + "&reqDate=" + d));
            }
            case "dt" -> {
                String obs = or(a1, "DT_0018");
                out.add(new Ask("dt-" + obs + ".json", BASE + "dtRecent/GetDTRecentApiService?type=json&pageNo=1&numOfRows=10&obsCode=" + enc(obs)));
            }
            case "tw" -> {
                String obs = or(a1, "TW_0089");
                out.add(new Ask("tw-" + obs + ".json", BASE + "twRecent/GetTWRecentApiService?type=json&pageNo=1&numOfRows=10&obsCode=" + enc(obs)));
            }
            case "wave" -> {
                String obs = or(a1, "TW_0089");
                out.add(new Ask("wave-" + obs + ".json", BASE + "noonWave/GetNoonWaveApiService?type=json&pageNo=1&numOfRows=10&obsCode=" + enc(obs)));
            }
            case "fishing" -> {
                String gubun = or(a1, "갯바위");
                String q = BASE + "fcstFishingv2/GetFcstFishingApiServicev2?type=json&pageNo=1&numOfRows=300&gubun=" + enc(gubun);
                if (a2 != null) q += "&placeName=" + enc(a2);
                out.add(new Ask("fishing-" + gubun + (a2 == null ? "" : "-" + a2) + ".json", q));
            }
            case "fishing-pages" -> {
                // 2026-11-14 실제 응답: 갯바위 totalCount 1990 인데 한 쪽은 최대 300줄 - 포인트 전체를 보려면 쪽을 넘겨 받음
                String gubun = or(a1, "갯바위");
                int pages = a2 != null && a2.matches("[1-9][0-9]?") ? Integer.parseInt(a2) : 1;
                for (int p = 1; p <= pages; p++) {
                    out.add(new Ask("fishing-" + gubun + "-p" + p + ".json",
                            BASE + "fcstFishingv2/GetFcstFishingApiServicev2?type=json&pageNo=" + p + "&numOfRows=300&gubun=" + enc(gubun)));
                }
            }
            default -> {
                // 모르는 이름 - 빈 목록
            }
        }
        return out;
    }

    private static String or(String v, String dflt) {
        return v == null || v.isBlank() ? dflt : v.trim();
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }
}
