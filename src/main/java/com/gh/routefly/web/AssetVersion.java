package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;

/**
 * js · css 주소의 내용 판(?v=해시, 2026-11-01 점검 - 화면을 열 때마다 js · css 20여 개를 서버에 304 로 묻던 것).
 * war 를 만들 때 tools/minify/version.js 가 정적 html 의 주소에 판을 붙이고 같은 표를 WEB-INF/asset-versions.json 에 씀.
 * 서버가 만드는 화면(산 페이지 등)은 of() 로 같은 판을 붙이고, NoStaleFilter 는 지금 판이 붙은 요청만 1년 캐시로 보냄.
 * 표가 없으면(이클립스 · 시험) 주소를 그대로 두어 예전과 똑같이 돎.
 */
@WebListener
public class AssetVersion implements ServletContextListener {

    private static final Logger log = LogManager.getLogger(AssetVersion.class);
    private static final Pattern KEY = Pattern.compile("(?:js/[\\w.-]+\\.js|css/[\\w.-]+\\.css)"), HASH = Pattern.compile("[0-9a-f]{6,40}");
    private static volatile Map<String, String> versions = Map.of();

    @Override
    public void contextInitialized(ServletContextEvent e) {
        try (InputStream in = e.getServletContext().getResourceAsStream("/WEB-INF/asset-versions.json")) {
            load(in == null ? null : new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException | RuntimeException ex) {
            load(null);
            log.warn("[ROUTEFLY-ASSET] asset-versions.json 을 읽지 못해 판 없이 씁니다 ({})", ex.getMessage());
        }
        log.info("[ROUTEFLY-ASSET] js · css 판 {}개{}", versions.size(), versions.isEmpty() ? " (표 없음 - 개발 · 이클립스)" : "");
    }

    /** 표 글(JSON {"js/x.js": "해시"}) → 지금 표. null · 틀린 꼴이면 빈 표(판 없이). 꼴이 틀린 칸만 뺌. */
    static void load(String json) {
        Map<String, String> m = new HashMap<>();
        if (json != null) {
            try {
                JsonElement root = JsonParser.parseString(json);
                if (root.isJsonObject()) {
                    JsonObject o = root.getAsJsonObject();
                    for (String k : o.keySet()) {
                        JsonElement v = o.get(k);
                        if (KEY.matcher(k).matches() && v.isJsonPrimitive() && HASH.matcher(v.getAsString()).matches()) m.put(k, v.getAsString());
                    }
                }
            } catch (RuntimeException ex) {
                m.clear();
            }
        }
        versions = Map.copyOf(m);
    }

    /** "js/kit-m.js" → "js/kit-m.js?v=해시"(표에 없으면 그대로). */
    static String of(String path) {
        String v = versions.get(path);
        return v == null ? path : path + "?v=" + v;
    }

    /** 이 파일("js/x.js")의 지금 판이 v 인가 - 예전 판 주소(배포 직후 옛 화면)는 내용이 달라 오래 캐시하면 안 됨. */
    static boolean current(String path, String v) {
        return v != null && v.equals(versions.get(path));
    }
}
