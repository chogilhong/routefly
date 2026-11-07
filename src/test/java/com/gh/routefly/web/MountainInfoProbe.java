package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 산림청 명산등산로(공공데이터포털 15158915, 2026-11-07 홍TV님 활용 신청) 실제 응답을 받아 보는 확인용 프로그램(테스트가 아님 - 네트워크를 씀).
 * 산 페이지 소개 글(100대 명산 선정 이유 · 개관 · 대중교통)을 지어내지 않고 이 자료로 쓰려고, 응답 모양부터 봅니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.MountainInfoProbe            → 설악산 검색 · 강원 지역 검색(3건) · 첫 산의 상세
 * .claude\run-tests.ps1 -Run web.MountainInfoProbe 가야산      → 그 산 이름으로
 * </pre>
 *
 * 키: config.properties 의 mountain.serviceKey, 없으면 tour.serviceKey(공공데이터포털 개인 키는 하나 - 서비스마다 활용 신청만 따로)를 RouteflyConfig 로 읽음(화면 · 파일에 키를 쓰지 않음).
 * 받은 응답(XML)은 키를 지우고 src/test/resources/mountain-info/ 에 저장합니다.
 * 명세(PC 가 공개 swagger 에서 옮김): Base https://apis.data.go.kr/1400000/cultureInfoService,
 * GET /gdTrailInfoOpenAPI(serviceKey · pageNo · numOfRows · searchMtNm 산명 · searchArNm 지역명), GET /gdTrailInfoImgOpenAPI(serviceKey · pageNo · numOfRows · searchWrd 산코드).
 */
public final class MountainInfoProbe {

    private MountainInfoProbe() {
    }

    static final String BASE = "https://apis.data.go.kr/1400000/cultureInfoService";

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("mountain.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        if (key == null) {
            System.out.println("mountain.serviceKey · tour.serviceKey 가 비어 있습니다.");
            return;
        }
        String name = args.length > 0 ? args[0] : "설악산";
        Path dir = Path.of("src", "test", "resources", "mountain-info");
        Files.createDirectories(dir);
        String enc = URLEncoder.encode(key, StandardCharsets.UTF_8);
        String search = save(dir, "search-" + name + ".xml", BASE + "/gdTrailInfoOpenAPI?serviceKey=" + enc + "&pageNo=1&numOfRows=10&searchMtNm="
                + URLEncoder.encode(name, StandardCharsets.UTF_8), key);
        if (args.length == 0) {
            Thread.sleep(700);
            save(dir, "area-강원.xml", BASE + "/gdTrailInfoOpenAPI?serviceKey=" + enc + "&pageNo=1&numOfRows=3&searchArNm=" + URLEncoder.encode("강원", StandardCharsets.UTF_8), key);
        }
        Matcher m = search == null ? null : Pattern.compile("<mntncd>\\s*([^<\\s]+)\\s*</mntncd>").matcher(search);
        if (m == null || !m.find()) {
            System.out.println("산코드(mntncd)를 찾지 못해 상세는 건너뜀 - search 파일을 보세요");
            return;
        }
        Thread.sleep(700);
        save(dir, "img-" + m.group(1) + ".xml", BASE + "/gdTrailInfoImgOpenAPI?serviceKey=" + enc + "&pageNo=1&numOfRows=10&searchWrd=" + URLEncoder.encode(m.group(1), StandardCharsets.UTF_8), key);
        System.out.println("저장: " + dir.toAbsolutePath());
    }

    private static String save(Path dir, String file, String url, String key) throws Exception {
        String text = OpenApi.get(url, "MTN-PROBE");
        if (text == null) {
            System.out.println(file + " : 받지 못함(로그 [MTN-PROBE] - 활용 신청 · 키 확인)");
            return null;
        }
        text = PetTourProbe.scrub(text, key);
        Files.writeString(dir.resolve(file), text, StandardCharsets.UTF_8);
        System.out.println(file + " : " + text.length() + "자 " + text.substring(0, Math.min(160, text.length())).replaceAll("\\s+", " "));
        return text;
    }
}
