package com.gh.routefly.web;

import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * routefly 웹 설정. 실제 파일은 저장소 밖에 둡니다(investing 의 InvestingConfig 와 같은 방식).
 *
 * <p>찾는 순서
 * <ol>
 *   <li>{@code -Droutefly.config=<경로>}</li>
 *   <li>{@code C:\GH\config\routefly\config.properties} (노트북 기본 위치)</li>
 * </ol>
 * 키 이름은 전부 소문자와 점입니다({@code db.url}, {@code db.user}, {@code db.password},
 * {@code map.vworld.key}, {@code map.dem.url}). 견본은 {@code config.properties.example}.
 */
public final class RouteflyConfig {

    private static final Logger log = LogManager.getLogger(RouteflyConfig.class);

    static final String PROPERTY = "routefly.config";
    static final String DEFAULT_PATH = "C:\\GH\\config\\routefly\\config.properties";

    private static volatile Properties props;
    private static volatile String source = "(없음)";

    private RouteflyConfig() {
    }

    /** 순수 함수 - 읽을 파일 경로. 시스템 프로퍼티가 있으면 그것, 없으면 기본 위치. */
    static String resolvePath(String override) {
        return override != null && !override.trim().isEmpty() ? override.trim() : DEFAULT_PATH;
    }

    private static synchronized Properties load() {
        if (props != null) return props;
        Properties p = new Properties();
        Path path = Path.of(resolvePath(System.getProperty(PROPERTY)));
        if (Files.isRegularFile(path)) {
            try (Reader r = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
                p.load(r);
                source = path.toString();
            } catch (Exception e) {
                log.warn("[ROUTEFLY-CONFIG] 설정 화일을 읽지 못했습니다: {} ({})", path, e.getMessage());
            }
        } else {
            log.warn("[ROUTEFLY-CONFIG] 설정 화일이 없습니다: {} - DB 를 못 읽어 코스가 나오지 않습니다.", path);
        }
        log.info("[ROUTEFLY-CONFIG] 설정 출처={} ({}건)", source, p.size());
        props = p;
        return p;
    }

    /** 값. 비었으면 null. */
    public static String get(String key) {
        String v = load().getProperty(key);
        return v == null || v.trim().isEmpty() ? null : v.trim();
    }
}
