package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

/**
 * 드론 공역(2026-11-17 홍TV님 "타이드플라이 바로 아래에 드론을 넣고 드론 관련 정보를 넣고 싶은데") 실제 응답을 받아 보는 확인용 프로그램
 * (테스트가 아님 - 네트워크 · 키를 씀). 응답 모양을 보기 전에는 화면에 넣지 않습니다(타이드플라이와 같은 규칙).
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.DroneProbe                       → 서울시청(P-73 안으로 알려진 곳) 한 점 + 레이어마다 전국 첫 쪽
 * .claude\run-tests.ps1 -Run web.DroneProbe 127.0276 37.4979     → 그 자리(경도 위도) 한 점도 더
 *   src/test/resources/drone/data-&lt;레이어&gt;-kr.json        2D 데이터 API(req/data) 전국 상자, 첫 쪽 1000개
 *   src/test/resources/drone/data-&lt;레이어&gt;-pt-&lt;경도&gt;_&lt;위도&gt;.json   같은 API, 한 점(POINT) - 그 자리가 어느 공역 안인지
 *   src/test/resources/drone/wfs-lt_c_aisprhc-kr.json      WFS(req/wfs) 같은 레이어 - 두 방식 중 어느 것이 되는지 비교
 * </pre>
 *
 * 레이어 이름: V-World WMS/WFS 레퍼런스(항공 · 공항)의 lt_c_aisprhc 비행금지구역 · lt_c_aisresc 비행제한구역 · lt_c_aisctrc 관제권 ·
 * lt_c_aismoac 군작전구역 · lt_c_aisuac 초경량비행장치공역(UA) · lt_c_aistemp 임시비행금지 · lt_c_aisdronezone 드론 시범사업구역
 * (2026-11-17 웹 Claude 가 검색 · 공개 저장소에서 모음 - 클라우드에서 vworld.kr 에 닿지 않아 원문 확인은 이 응답으로).
 * 요청 주소 · 인자(req/data 의 data · geomFilter · crs · size, req/wfs 의 typename · bbox · output)도 아직 실제 응답으로 확인 전 - 오류면 받은 글 그대로 보고.
 * 키: drone.vworld.key → map.vworld.key → place.vworld.key 차례로 domain(site.baseUrl 호스트) 있음 · 없음을 한 점으로 해 보고 되는 짝으로(2026-11-17 PC: map 키 + domain 은 INCORRECT_KEY).
 * V-World 에서 "2D 데이터 API" · "WMS/WFS" 활용을 함께 신청해야 함. 저장 글에서 키를 지움.
 */
public final class DroneProbe {

    private DroneProbe() {
    }

    static final String[] LAYERS = {"lt_c_aisprhc", "lt_c_aisresc", "lt_c_aisctrc", "lt_c_aismoac", "lt_c_aisuac", "lt_c_aistemp", "lt_c_aisdronezone"};

    public static void main(String[] args) throws Exception {
        String base = RouteflyConfig.get("site.baseUrl");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^https?://([^/:]+)").matcher(base == null ? "" : base);
        String domain = m.find() ? m.group(1) : null;
        Path dir = Path.of("src", "test", "resources", "drone");
        // 2026-11-17 PC: map.vworld.key + domain=routefly.kr 로 15개 모두 INCORRECT_KEY. 어느 키 · 도메인 짝이 되는지 한 점(서울시청 비행금지)으로 먼저 봄
        //   try-<키 이름>-<domain 있음|없음>.json - 되는 짝이 나오면 그 짝으로 아래 전부를 받음(drone.vworld.key 가 있으면 그것을 먼저)
        String key = null, auth = null;
        for (String name : new String[] {"drone.vworld.key", "map.vworld.key", "place.vworld.key"}) {
            String k = RouteflyConfig.get(name);
            if (k == null || k.isBlank()) { System.out.println(name + " - 비어 있음"); continue; }
            for (String d : domain == null ? new String[] {null} : new String[] {domain, null}) {
                String a = "&key=" + URLEncoder.encode(k, StandardCharsets.UTF_8) + (d != null ? "&domain=" + URLEncoder.encode(d, StandardCharsets.UTF_8) : "");
                Path to = dir.resolve("try-" + name.replace('.', '_') + "-" + (d != null ? "domain" : "nodomain") + ".json");
                KmaSeasonProbe.save(to, data("lt_c_aisprhc", "POINT(126.9780 37.5665)") + a, k);
                if (auth == null && !java.nio.file.Files.readString(to).contains("\"status\":\"ERROR\"")) { key = k; auth = a; }
            }
        }
        if (auth == null) {
            System.out.println("되는 키 · 도메인 짝이 없습니다 - vworld.kr 마이페이지 인증키의 활용 API(2D 데이터 API · WMS/WFS)와 서비스 URL 을 확인해 주세요.");
            return;
        }
        String box = "BOX(124.0,33.0,132.0,39.0)";
        for (String layer : LAYERS)
            KmaSeasonProbe.save(dir.resolve("data-" + layer + "-kr.json"), data(layer, box) + auth, key);
        String[][] pts = args.length >= 2 ? new String[][] {{"126.9780", "37.5665"}, {args[0], args[1]}} : new String[][] {{"126.9780", "37.5665"}};
        for (String[] p : pts)
            for (String layer : LAYERS)
                KmaSeasonProbe.save(dir.resolve("data-" + layer + "-pt-" + p[0] + "_" + p[1] + ".json"), data(layer, "POINT(" + p[0] + " " + p[1] + ")") + auth, key);
        KmaSeasonProbe.save(dir.resolve("wfs-lt_c_aisprhc-kr.json"), "https://api.vworld.kr/req/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=lt_c_aisprhc"
                + "&bbox=33.0,124.0,39.0,132.0&srsname=EPSG:4326&output=application/json" + auth, key);
    }

    /** 순수 함수 - 2D 데이터 API 주소(키 · 도메인 빼고). geom - BOX(…) 또는 POINT(경도 위도). */
    static String data(String layer, String geom) {
        return "https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&format=json&errorformat=json&size=1000&page=1&crs=EPSG:4326&geometry=true&attribute=true"
                + "&data=" + layer.toUpperCase(java.util.Locale.ROOT) + "&geomFilter=" + URLEncoder.encode(geom, StandardCharsets.UTF_8);
    }
}
