package com.gh.routefly.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 올린 코스(u-…)의 만든 이(2026-11-01 홍TV님 "코스 이름은 깨끗하게, 만든 이는 코스 화면에 따로 한 줄") - DB 표는 그대로 두고 서버 파일 하나에.
 * <ul>
 *   <li>파일: party.json 과 같은 폴더(설정 party.dir, 없으면 stats.dir, 그것도 없으면 톰캣 폴더/routefly-party)의 course-makers.json - 따로 만들 것 없음(처음 올릴 때 생김)</li>
 *   <li>모양: {"u-20261101-120000": {"maker":"시험대장", "at":1761966000000}, …} - maker 가 "" 이면 홍TV님이 직접 만든 코스(화면 "만든 이: routefly")</li>
 *   <li>나중에 제휴 산악회(유료)는 손으로 "partner": true 를 더하면 화면에 "[제휴]"(결제는 아직 없음)</li>
 * </ul>
 * 처음 찾을 때 한 번 읽고 기억(이 웹앱만 씀). 쓰기는 임시 파일(600)에 쓴 뒤 옮김(office.json 과 같은 방식).
 */
final class CourseMakers {

    private static final Logger log = LogManager.getLogger(CourseMakers.class);

    /** 서버 하나에 하나. */
    static final CourseMakers STORE = new CourseMakers(Party.defaultFile().resolveSibling("course-makers.json"));

    private final Path file;
    private Map<String, JsonObject> byId;

    CourseMakers(Path file) {
        this.file = file;
    }

    /** 그 코스의 {maker, at[, partner]} 사본 - 없으면 null. */
    synchronized JsonObject get(String id) {
        JsonObject o = map().get(id);
        return o == null ? null : o.deepCopy();
    }

    /** 만든 이를 남기고 파일에 씀. maker 는 다듬은 이름("" = routefly). */
    synchronized void put(String id, String maker, long now) throws IOException {
        JsonObject o = new JsonObject();
        o.addProperty("maker", maker == null ? "" : maker);
        o.addProperty("at", now);
        map().put(id, o);
        JsonObject all = new JsonObject();
        byId.forEach(all::add);
        Files.createDirectories(file.toAbsolutePath().getParent());
        Path tmp = file.resolveSibling("course-makers.json.tmp");
        Files.deleteIfExists(tmp);
        try { Files.createFile(tmp, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))); }
        catch (UnsupportedOperationException ex) { Files.createFile(tmp); }   // 윈도우(PC 개발)
        Files.writeString(tmp, all.toString(), StandardCharsets.UTF_8);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private Map<String, JsonObject> map() {
        if (byId != null) return byId;
        byId = new HashMap<>();
        if (!Files.isRegularFile(file)) return byId;
        try {
            JsonElement e = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8));
            if (e.isJsonObject()) for (Map.Entry<String, JsonElement> x : e.getAsJsonObject().entrySet())
                if (x.getValue().isJsonObject()) byId.put(x.getKey(), x.getValue().getAsJsonObject());
        } catch (Exception ex) {
            log.warn("[MAKERS] 만든 이 파일을 읽지 못함 - {}", ex.toString());
        }
        return byId;
    }
}
