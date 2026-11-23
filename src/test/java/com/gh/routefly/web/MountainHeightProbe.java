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
        String[] names = args.length > 0 ? args : new String[] { "백운산", "송산", "사패산", "대청봉", "덕기봉" };
        Path dir = Path.of("src", "test", "resources", "mountain-height");
        Files.createDirectories(dir);
        String enc = URLEncoder.encode(key, StandardCharsets.UTF_8);
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
}
