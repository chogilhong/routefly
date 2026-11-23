package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * 산림청 「산 정보 조회」(공공데이터포털 15158978, 2026-11-23 홍TV님 활용 신청) 실제 응답을 받아 보는 확인용 프로그램(테스트가 아님 - 네트워크를 씀).
 * 공식 산 높이(mntninfohght)가 있는지 보려고 받습니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.MountainHeightProbe                      → 백운산 · 송산 · 사패산 · 대청봉 · 덕기봉
 * .claude\run-tests.ps1 -Run web.MountainHeightProbe 설악산 가야산          → 그 산 이름들로
 * .claude\run-tests.ps1 -Run web.MountainHeightProbe --all                → 모든 산(500개씩 쪽마다) → target/mountain-height-all/all-p&lt;n&gt;.xml
 *   (tools 저장소 map/forest-summits.py 가 봉우리 높이로 읽음 - 크고 다시 받을 수 있어 커밋하지 않음, 2026-11-23 홍TV님 "정상 높이는 보여줘야지")
 * </pre>
 *
 * 키: config.properties 의 mountain.serviceKey, 없으면 tour.serviceKey 를 RouteflyConfig 로 읽음(화면 · 파일에 키를 쓰지 않음).
 * 받은 응답(XML)은 키를 지우고 src/test/resources/mountain-height/name-&lt;산이름&gt;.xml 로 저장합니다.
 * 명세(PC 가 공개 swagger 에서 옮김): Base https://apis.data.go.kr/1400000/trailInfoService,
 * GET /getforeststoryservice(serviceKey · pageNo · numOfRows · mntnNm 산명 · mntnHght · mntnAdd · mntnInfoAraCd · mntnInfoSsnCd · mntnInfoThmCd),
 * 응답 item 칸 mntnid 산코드 · mntnnm 산명 · mntninfohght 산정보 높이 · mntninfopoflc 소재지 · mntninfomngmemnbdnm 관리주체 등.
 */
public final class MountainHeightProbe {

    private MountainHeightProbe() {
    }

    static final String BASE = "https://apis.data.go.kr/1400000/trailInfoService/getforeststoryservice";

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("mountain.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        if (key == null) {
            System.out.println("mountain.serviceKey · tour.serviceKey 가 비어 있습니다.");
            return;
        }
        String enc = URLEncoder.encode(key, StandardCharsets.UTF_8);
        if (args.length == 1 && "--all".equals(args[0])) {
            all(key, enc);
            return;
        }
        String[] names = args.length > 0 ? args : new String[] { "백운산", "송산", "사패산", "대청봉", "덕기봉" };
        Path dir = Path.of("src", "test", "resources", "mountain-height");
        Files.createDirectories(dir);
        for (int i = 0; i < names.length; i++) {
            if (i > 0) Thread.sleep(700);
            String name = names[i];
            String text = OpenApi.get(BASE + "?serviceKey=" + enc + "&pageNo=1&numOfRows=50&mntnNm=" + URLEncoder.encode(name, StandardCharsets.UTF_8), "MTN-HGHT-PROBE");
            if (text == null) {
                System.out.println(name + " : 받지 못함(로그 [MTN-HGHT-PROBE] - 활용 신청 · 키 확인)");
                continue;
            }
            text = PetTourProbe.scrub(text, key);
            Files.writeString(dir.resolve("name-" + name + ".xml"), text, StandardCharsets.UTF_8);
            List<Map<String, String>> items = MountainInfoProbe.items(text);
            System.out.println("== " + name + " : " + text.length() + "자, item " + items.size() + (items.isEmpty() ? " | " + text.substring(0, Math.min(200, text.length())).replaceAll("\\s+", " ") : ""));
            for (Map<String, String> it : items)
                System.out.println("   " + it.get("mntnid") + " | " + it.get("mntnnm") + " | 높이 " + it.get("mntninfohght") + " | " + it.get("mntninfopoflc") + " | " + it.get("mntninfomngmemnbdnm"));
            if (!items.isEmpty()) System.out.println("   칸: " + new java.util.TreeSet<>(items.get(0).keySet()));
        }
        System.out.println("저장: " + dir.toAbsolutePath());
    }

    /** 모든 산을 500개씩 받아 target/mountain-height-all/all-p<n>.xml 로(키 지움). 한 쪽이 500개보다 적으면 끝, 많아야 20쪽. */
    private static void all(String key, String enc) throws Exception {
        Path dir = Path.of("target", "mountain-height-all");
        Files.createDirectories(dir);
        int total = 0;
        for (int page = 1; page <= 20; page++) {
            if (page > 1) Thread.sleep(700);
            String text = OpenApi.get(BASE + "?serviceKey=" + enc + "&pageNo=" + page + "&numOfRows=500", "MTN-HGHT-PROBE");
            if (text == null) {
                System.out.println(page + "쪽 : 받지 못함(로그 [MTN-HGHT-PROBE])");
                return;
            }
            text = PetTourProbe.scrub(text, key);
            Files.writeString(dir.resolve("all-p" + page + ".xml"), text, StandardCharsets.UTF_8);
            int n = MountainInfoProbe.items(text).size();
            total += n;
            System.out.println(page + "쪽 : item " + n);
            if (n < 500) break;
        }
        System.out.println("모두 " + total + "개 - 저장: " + dir.toAbsolutePath());
    }
}
