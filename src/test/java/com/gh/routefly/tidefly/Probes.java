package com.gh.routefly.tidefly;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

/**
 * 확인용 프로그램(PortalProbe · ApiHubProbe)이 같이 쓰는 받기 · 저장(routefly KmaSeasonProbe.save 와 같은 방식).
 * 저장하는 글에서 키(그대로 · 인코딩한 것)를 {KEY} 로 바꿉니다 - 테스트 데이터로 커밋하기 때문입니다.
 */
final class Probes {

    private Probes() {
    }

    /** GET 해서 to 에 저장(키는 지움). 상태 · 길이 · 첫 줄을 찍습니다. */
    static void save(Path to, String url, String key) throws Exception {
        HttpClient c = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();
        HttpResponse<byte[]> r = c.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(60)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        String body = hideKey(KmaText.text(r.body(), r.headers().firstValue("Content-Type").orElse("")), key);
        Files.createDirectories(to.getParent());
        Files.writeString(to, body, StandardCharsets.UTF_8);
        System.out.println(to + " ← HTTP " + r.statusCode() + ", " + body.length() + "자, 첫 줄: " + body.lines().findFirst().orElse(""));
    }

    /** 순수 함수 - 글 속 키(그대로 · URL 인코딩한 것)를 {KEY} 로. 키가 비면 그대로. */
    static String hideKey(String s, String key) {
        if (s == null || key == null || key.isEmpty()) return s;
        return s.replace(key, "{KEY}").replace(URLEncoder.encode(key, StandardCharsets.UTF_8), "{KEY}");
    }

}
