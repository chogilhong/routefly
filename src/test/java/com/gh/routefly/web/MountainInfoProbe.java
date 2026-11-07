package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산림청 명산등산로(공공데이터포털 15158915, 2026-11-07 홍TV님 활용 신청) 실제 응답을 받아 보는 확인용 프로그램(테스트가 아님 - 네트워크를 씀).
 * 산 페이지 소개 글(100대 명산 선정 이유 · 개관 · 대중교통)을 지어내지 않고 이 자료로 쓰려고, 응답 모양부터 봅니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.MountainInfoProbe            → 설악산 검색 · 강원 지역 검색(3건) · 첫 산의 상세
 * .claude\run-tests.ps1 -Run web.MountainInfoProbe 가야산      → 그 산 이름으로
 * .claude\run-tests.ps1 -Run web.MountainInfoProbe all         → 전체를 100줄씩 받아 100대 명산과 맞춰 src/main/webapp/data/mountain-info.json 을 씀
 *                                                                 (산 페이지 "산림청 선정 이유" - 못 맞춘 산은 빼고 이름을 찍음, 지어내지 않음)
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
        if (args.length > 0 && "all".equals(args[0])) {
            all(key);
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

    /** 전체 목록 → 100대 명산과 맞춘 data/mountain-info.json. */
    private static void all(String key) throws Exception {
        String enc = URLEncoder.encode(key, StandardCharsets.UTF_8);
        List<Map<String, String>> items = new ArrayList<>();
        int total = Integer.MAX_VALUE;
        for (int page = 1; items.size() < total && page <= 10; page++) {
            if (page > 1) Thread.sleep(700);
            String text = OpenApi.get(BASE + "/gdTrailInfoOpenAPI?serviceKey=" + enc + "&pageNo=" + page + "&numOfRows=100", "MTN-PROBE");
            if (text == null) {
                System.out.println(page + "쪽: 받지 못함(로그 [MTN-PROBE]) - 파일을 쓰지 않습니다");
                return;
            }
            Matcher t = Pattern.compile("<totalCount>(\\d+)</totalCount>").matcher(text);
            if (t.find()) total = Integer.parseInt(t.group(1));
            List<Map<String, String>> got = items(text);
            if (got.isEmpty()) break;
            items.addAll(got);
        }
        System.out.println("받은 산 " + items.size() + " / " + (total == Integer.MAX_VALUE ? "?" : total));
        JsonArray peaks = JsonParser.parseString(Files.readString(Path.of("src/main/webapp/data/mountains100.json"), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("peaks");
        List<String> miss = new ArrayList<>();
        JsonObject info = match(peaks, items, miss);
        JsonObject file = new JsonObject();
        file.addProperty("_note", "산림청 명산등산로(공공데이터포털 15158915) - 100대 명산 선정 이유(aeatreason) · 부제(subnm) · 산코드(mntncd). "
                + "web.MountainInfoProbe all 이 만듦(" + java.time.LocalDate.now(WeatherServlet.KST) + ", 맞춘 산 " + info.size() + "). 고치지 말고 다시 만드세요.");
        file.add("info", info);
        Files.writeString(Path.of("src/main/webapp/data/mountain-info.json"), new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(file) + "\n", StandardCharsets.UTF_8);
        System.out.println("맞춤 " + info.size() + "곳, 못 맞춤 " + miss.size() + "곳: " + miss);
    }

    /** 순수 함수 - 응답 XML → item 마다 {칸: 글}(글은 clean). 틀린 응답이면 빈 목록. */
    static List<Map<String, String>> items(String xml) {
        List<Map<String, String>> out = new ArrayList<>();
        Matcher it = Pattern.compile("<item>(.*?)</item>", Pattern.DOTALL).matcher(xml);
        while (it.find()) {
            Map<String, String> m = new HashMap<>();
            Matcher f = Pattern.compile("<(\\w+)>(.*?)</\\1>", Pattern.DOTALL).matcher(it.group(1));
            while (f.find()) m.put(f.group(1), clean(f.group(2)));
            out.add(m);
        }
        return out;
    }

    /** 순수 함수 - 응답 글: 두 번 감싼 글자(&amp;lt;) · &lt;BR&gt; · 태그를 풀어 한 줄로. */
    static String clean(String s) {
        String t = s;
        for (int i = 0; i < 2; i++) {
            t = t.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ").replace("&amp;", "&");
            t = t.replaceAll("(?i)<br\\s*/?>", " ").replaceAll("</?[A-Za-z][^<>]{0,200}>", " ");   // 영문 태그만(〈금강산보다 …〉 같은 한글 제목은 둠)
        }
        return t.replaceAll("\\s+", " ").trim();
    }

    /**
     * 순수 함수 - 100대 명산(mountains100.json 의 id - "백운산(광양)" 처럼 괄호에 지역)과 산림청 목록을 맞춤 → {id: {code, reason, sub}}.
     * 이름이 같고, 괄호가 있으면 소재지(areanm)에 그 지역이 들고, 그래도 둘 넘으면 높이가 150m 안으로 가장 가까운 것. 못 맞추면 miss 에 이름을 넣고 뺌.
     */
    static JsonObject match(JsonArray peaks, List<Map<String, String>> items, List<String> miss) {
        JsonObject out = new JsonObject();
        for (com.google.gson.JsonElement e : peaks) {
            JsonObject p = e.getAsJsonObject();
            String id = p.get("id").getAsString(), base = id.replaceAll("\\(.*\\)$", "").trim();
            Matcher rg = Pattern.compile("\\((.+)\\)$").matcher(id);
            String region = rg.find() ? rg.group(1) : null;
            List<Map<String, String>> c = new ArrayList<>();
            for (Map<String, String> it : items)
                if (base.equals(it.get("mntnm")) && (region == null || String.valueOf(it.get("areanm")).contains(region))) c.add(it);
            if (c.size() > 1 && p.has("height")) {
                double h = p.get("height").getAsDouble();
                c.removeIf(it -> { try { return Math.abs(Double.parseDouble(it.get("mntheight")) - h) > 150; } catch (Exception x) { return true; } });
                if (c.size() > 1) c.sort(java.util.Comparator.comparingDouble(it -> Math.abs(Double.parseDouble(it.get("mntheight")) - h)));
            }
            Map<String, String> hit = c.isEmpty() ? null : c.get(0);
            if (hit == null || hit.get("aeatreason") == null || hit.get("aeatreason").isEmpty()) {
                miss.add(id);
                continue;
            }
            JsonObject o = new JsonObject();
            o.addProperty("code", hit.get("mntncd"));
            o.addProperty("reason", hit.get("aeatreason"));
            if (hit.get("subnm") != null && !hit.get("subnm").isEmpty()) o.addProperty("sub", hit.get("subnm"));
            out.add(id, o);
        }
        return out;
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
