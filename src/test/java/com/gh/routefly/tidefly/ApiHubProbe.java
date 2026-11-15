package com.gh.routefly.tidefly;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

/**
 * 기상청 API허브 실제 응답을 받아 테스트 데이터로 저장하는 확인용 프로그램(테스트가 아님 - 네트워크 · 키를 씀).
 * API허브는 API 마다 요청 칸이 달라, 그 API 설명 화면의 "요청 예시" 주소를 그대로 받아 씁니다(요청 칸을 지어내지 않으려고).
 *
 * <pre>
 * .claude\run-tests.ps1 -Run tidefly.ApiHubProbe &lt;저장 이름&gt; "&lt;API허브 요청 예시 주소&gt;"
 *   예: -Run web.ApiHubProbe marine-large "https://apihub.kma.go.kr/api/typ01/url/marine_large_zone.php?...&amp;authKey=..."
 * </pre>
 * 주소에 authKey 가 있으면 빼고 kma.apihub.key 로 다시 붙입니다. 저장: src/test/resources/apihub/&lt;저장 이름&gt;.txt (키는 {KEY} 로 지움).
 * 받을 것(2026-11-14 자료 조사): 해양관측(sea_obs · kma_buoy · kma_buoy2 · stn_inf), 해구별 예측(marine_large_zone · marine_small_zone), 기상특보(wrn_now_data · wrn_reg).
 */
public final class ApiHubProbe {

    private ApiHubProbe() {
    }

    static final String HOST = "apihub.kma.go.kr";

    public static void main(String[] args) throws Exception {
        String key = com.gh.routefly.web.RouteflyConfig.get("kma.apihub.key");
        if (key == null) {
            System.out.println("kma.apihub.key 가 비어 있습니다.");
            return;
        }
        if (args.length < 2 || !args[0].matches("[A-Za-z0-9_.-]{1,60}")) {
            System.out.println("쓰는 법: ApiHubProbe <저장 이름(영문 · 숫자 · - _ .)> \"<API허브 요청 예시 주소>\"");
            return;
        }
        String url = withKey(args[1], key);
        if (url == null) {
            System.out.println("https://" + HOST + "/ 로 시작하는 주소만 받습니다.");
            return;
        }
        Probes.save(Path.of("src", "test", "resources", "tidefly", "apihub", args[0] + ".txt"), url, key);
    }

    /** 순수 함수 - API허브 주소의 authKey 칸을 빼고 key 로 다시 붙임. https://apihub.kma.go.kr 가 아니면 null(키를 다른 곳으로 보내지 않게). */
    static String withKey(String sample, String key) {
        URI u;
        try {
            u = URI.create(sample.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return null;
        String q = u.getRawQuery() == null ? "" : u.getRawQuery();
        StringBuilder kept = new StringBuilder();
        for (String part : q.split("&")) {
            if (part.isEmpty() || part.startsWith("authKey=")) continue;
            kept.append(kept.length() == 0 ? "" : "&").append(part);
        }
        String k = "authKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8);
        return "https://" + HOST + u.getRawPath() + "?" + (kept.length() == 0 ? k : kept + "&" + k);
    }
}
