package com.gh.routefly.web;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

/**
 * 기상청 API허브 계절관측(진달래 · 개나리 등 - 2026-11-14 홍TV님 "1,2 번 해주고") 실제 응답을 받아 보는 확인용 프로그램(테스트가 아님 - 네트워크 · 키를 씀).
 * 날씨누리 파일(SeasonProbe)에는 진달래가 없어서, 관측소별 계절관측을 받아 산 가까운 관측소만 산에 붙일 수 있는지 보려는 것입니다. 응답 모양을 보기 전에는 화면에 넣지 않습니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.KmaSeasonProbe        → 아래 넷을 받아 src/test/resources/season/kma-*.txt 로 저장
 *   kma-ssn-help.txt      계절관측 자료(sfc_ssn.php, help=1 - 칸 설명 · 계절관측 코드가 나오는지)
 *   kma-ssn-2024-2026.txt 전 지점 전 요소 2024-01-01 ~ 2026-11-14
 *   kma-ssn-norm.txt      평년값(sfc_ssn_norm.php, tmst=2021 = 1991~2020년, 3월 1일 ~ 6월 30일)
 *   kma-stn-sfc.txt       지상 관측 지점 정보(stn_inf.php?inf=SFC - 지점 번호 · 위경도 · 이름)
 * </pre>
 *
 * 명세(2026-11-14 웹 Claude 가 apihub.kma.go.kr apiList.do?seqApi=2&amp;seqApiSub=926 공개 페이지에서 옮김):
 *   GET https://apihub.kma.go.kr/api/typ01/url/sfc_ssn.php?stn=0&amp;tm1=YYYYMMDD&amp;tm2=YYYYMMDD[&amp;ssn=코드]&amp;authKey=… → YY · STN · TM · SSN_ID(계절관측 코드) · SSN_MD(계절현상 코드)
 *   GET …/sfc_ssn_norm.php?tmst=2021&amp;stn=0&amp;MM1=&amp;DD1=&amp;MM2=&amp;DD2=&amp;authKey=… → ST · STN · MM · DD · SSN_ID · SSN_MD
 *   GET …/stn_inf.php?inf=SFC&amp;authKey=… (지점 정보 - 같은 API허브 목록 seqApiSub=317)
 * 키: config.properties 의 kma.apihub.key(API허브 인증키 - 공공데이터포털 키와 다름). 화면 · 파일 · 로그에 키를 쓰지 않습니다(저장 글에서도 지움).
 * 계절관측 코드 · 현상 코드 뜻은 API허브 "참고자료" 파일에 있어 이 프로그램이 받지 못합니다 - PC 가 그 표를 src/test/resources/season/ 에 함께 저장해 주세요.
 */
public final class KmaSeasonProbe {

    private KmaSeasonProbe() {
    }

    static final String BASE = "https://apihub.kma.go.kr/api/typ01/url/";

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("kma.apihub.key");
        if (key == null || key.isBlank()) {
            System.out.println("kma.apihub.key 가 비어 있습니다(apihub.kma.go.kr 가입 · 인증키 발급 뒤 config.properties 에).");
            return;
        }
        String k = "&authKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8);
        Path dir = Path.of("src", "test", "resources", "season");
        save(dir.resolve("kma-ssn-help.txt"), BASE + "sfc_ssn.php?stn=108&tm1=20250101&tm2=20251231&help=1" + k, key);
        save(dir.resolve("kma-ssn-2024-2026.txt"), BASE + "sfc_ssn.php?stn=0&tm1=20240101&tm2=20261114" + k, key);
        save(dir.resolve("kma-ssn-norm.txt"), BASE + "sfc_ssn_norm.php?tmst=2021&stn=0&MM1=3&DD1=1&MM2=6&DD2=30" + k, key);
        save(dir.resolve("kma-stn-sfc.txt"), BASE + "stn_inf.php?inf=SFC&help=1" + k, key);
    }

    /** 받아서 키를 지우고 저장(UTF-8 로) - 글자 집합은 text() 로 고름. */
    static void save(Path to, String url, String key) throws Exception {
        HttpClient c = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();
        HttpResponse<byte[]> r = c.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(60)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        String body = text(r.body(), r.headers().firstValue("Content-Type").orElse("")).replace(key, "{KEY}");
        Files.createDirectories(to.getParent());   // 처음 받는 폴더(2026-11-14 PC: radar 폴더가 없어 NoSuchFileException)
        Files.writeString(to, body, StandardCharsets.UTF_8);
        System.out.println(to + " ← HTTP " + r.statusCode() + ", " + body.length() + "자, 첫 줄: " + body.lines().findFirst().orElse(""));
    }

    /**
     * 순수 함수 - 응답 글자. 머리글에 charset 이 있으면 그것, 없으면 UTF-8 로 깨짐 없이 읽히면 UTF-8(API허브 JSON 오류 - 2026-11-14 PC: 403 안내문이 EUC-KR 로 읽혀 깨졌음),
     * 아니면 EUC-KR(typ01 텍스트로 알려진 것 - 실제 응답으로 아직 확인 전).
     */
    static String text(byte[] b, String contentType) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?i)charset=\"?([A-Za-z0-9._-]+)").matcher(contentType == null ? "" : contentType);
        if (m.find() && Charset.isSupported(m.group(1))) return new String(b, Charset.forName(m.group(1)));
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(b)).toString();
        } catch (java.nio.charset.CharacterCodingException e) {
            return new String(b, Charset.forName("EUC-KR"));
        }
    }
}
