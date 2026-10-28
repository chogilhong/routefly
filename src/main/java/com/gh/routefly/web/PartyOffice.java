package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 회사 사무실(2026-10-28 홍TV님 "회사는 이 전체를 모니터링 가능해?" - 한라산 · 지리산 · 설악산 여러 방을 한 화면에).
 * 아이디 · 비밀번호 없이 비밀 사무실 링크(key)로 들어옴 - 예전 산악회 계정을 "번거롭다"고 뺀 것(c010921)과 같은 생각.
 * 회사 코드(code, 6글자)는 인솔자에게 주는 것: 방을 만들 때 넣으면 그 방이 회사 화면에 올라감.
 * 끝난 산행은 요약만(이름 · 좌표 없음) 200일 남김. 파일은 party.json 옆 office.json(권한 600), dir 이 null 이면 메모리(시험).
 */
final class PartyOffice {

    private static final Logger log = LogManager.getLogger(PartyOffice.class);
    static final long KEEP_MS = 200L * 24 * 3600_000L;
    static final int MAX_OFFICES = 500, MAX_ENDED = 500;

    static final class Office {
        String code;   // 회사 코드 바꾸기로 바뀜
        final String name;
        String key;   // 사무실 링크 바꾸기로 바뀜
        final long created;
        final List<JsonObject> ended = new ArrayList<>();   // 끝난 산행 요약(새것이 앞)

        Office(String code, String name, String key, long created) {
            this.code = code; this.name = name; this.key = key; this.created = created;
        }
    }

    private final Path file;
    private final SecureRandom rnd = new SecureRandom();
    private final Map<String, Office> byCode = new LinkedHashMap<>();

    PartyOffice(Path file) {
        this.file = file;
        load();
    }

    /** 새 사무실 - 돌려줌: 사무실(key 는 이때 한 번만 화면에 보여 줌). */
    synchronized Office create(String name, String code, long now) {
        if (byCode.size() >= MAX_OFFICES) throw new IllegalStateException("지금은 사무실을 더 만들 수 없습니다.");
        byte[] b = new byte[24];
        rnd.nextBytes(b);
        Office o = new Office(code, name, Base64.getUrlEncoder().withoutPadding().encodeToString(b), now);
        byCode.put(code, o);
        save();
        log.info("[OFFICE] 사무실 만듦 code={}", code);
        return o;
    }

    synchronized Office byCode(String code) {
        return code == null ? null : byCode.get(code.trim().toUpperCase());
    }

    /** 비밀 링크로 - 없으면 SecurityException(틀린 열쇠). 같은 길이만 견줌. */
    synchronized Office byKey(String key) {
        if (key != null && key.length() >= 20 && key.length() <= 64)
            for (Office o : byCode.values())
                if (java.security.MessageDigest.isEqual(o.key.getBytes(StandardCharsets.UTF_8), key.getBytes(StandardCharsets.UTF_8))) return o;
        throw new SecurityException("사무실 링크가 맞지 않습니다.");
    }

    /** 사무실 링크 바꾸기(샜을 때) - 옛 링크는 바로 안 됨. 돌려줌: 새 열쇠. */
    synchronized String newKey(Office o) {
        byte[] b = new byte[24];
        rnd.nextBytes(b);
        o.key = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        save();
        log.info("[OFFICE] 사무실 링크 바꿈 code={}", o.code);
        return o.key;
    }

    /** 회사 코드 바꾸기 - 새 코드로(이미 올라온 방은 Party 가 새 코드로 옮김). */
    synchronized void newCode(Office o, String code) {
        byCode.remove(o.code);
        o.code = code;
        byCode.put(code, o);
        save();
        log.info("[OFFICE] 회사 코드 바꿈");
    }

    /** 사무실 없애기 - 사무실 · 끝난 산행 요약을 모두 지움. */
    synchronized void delete(Office o) {
        byCode.remove(o.code);
        save();
        log.info("[OFFICE] 사무실 없앰 code={}", o.code);
    }

    synchronized boolean has(String code) {
        return byCode.containsKey(code);
    }

    /** 끝난 산행 요약을 남김(이름 · 좌표 없음). 200일 지난 것 · 500개 넘는 것은 버림. */
    synchronized void ended(String code, JsonObject summary, long now) {
        Office o = byCode.get(code);
        if (o == null) return;
        o.ended.add(0, summary);
        o.ended.removeIf(x -> now - x.get("endedAt").getAsLong() > KEEP_MS);
        while (o.ended.size() > MAX_ENDED) o.ended.remove(o.ended.size() - 1);
        save();
    }

    synchronized JsonArray endedOf(Office o, long now) {
        JsonArray a = new JsonArray();
        for (JsonObject x : o.ended) if (now - x.get("endedAt").getAsLong() <= KEEP_MS) a.add(x.deepCopy());
        return a;
    }

    private void save() {
        if (file == null) return;
        JsonArray arr = new JsonArray();
        for (Office o : byCode.values()) {
            JsonObject x = new JsonObject();
            x.addProperty("code", o.code); x.addProperty("name", o.name); x.addProperty("key", o.key); x.addProperty("created", o.created);
            JsonArray e = new JsonArray();
            o.ended.forEach(e::add);
            x.add("ended", e);
            arr.add(x);
        }
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling("office.json.tmp");
            Files.deleteIfExists(tmp);
            try { Files.createFile(tmp, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))); }
            catch (UnsupportedOperationException ex) { Files.createFile(tmp); }
            Files.writeString(tmp, arr.toString(), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception ex) {
            log.warn("[OFFICE] 사무실 파일을 쓰지 못함 - {}", ex.toString());
        }
    }

    /**
     * 읽기 - 한 곳씩(2026-10-28 버그 점검: 깨진 곳 하나에 나머지를 못 읽고, 다음 저장이 빈 목록으로 덮어 모든 사무실을 잃었음).
     * 깨진 곳이 있으면 office.json.bad-<시각>(600)으로 옛 파일을 남김.
     */
    private void load() {
        if (file == null || !Files.isRegularFile(file)) return;
        int bad = 0;
        try {
            for (JsonElement e : JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonArray()) {
                try {
                    JsonObject x = e.getAsJsonObject();
                    Office o = new Office(x.get("code").getAsString(), x.get("name").getAsString(), x.get("key").getAsString(), x.get("created").getAsLong());
                    if (x.has("ended")) x.getAsJsonArray("ended").forEach(s -> o.ended.add(s.getAsJsonObject()));
                    byCode.put(o.code, o);
                } catch (RuntimeException ex) {
                    bad++;
                }
            }
        } catch (Exception ex) {
            bad++;
            log.warn("[OFFICE] 사무실 파일을 읽지 못함 - {}", ex.toString());
        }
        if (bad > 0) backup();
        log.info("[OFFICE] 사무실 {}곳 읽음{}", byCode.size(), bad > 0 ? " (" + bad + "곳 건너뜀 - office.json.bad-* 에 옛 파일)" : "");
    }

    private void backup() {
        try {
            Path b = file.resolveSibling("office.json.bad-" + System.currentTimeMillis());
            try { Files.createFile(b, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))); }
            catch (UnsupportedOperationException e) { /* 윈도 */ }
            Files.copy(file, b, StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            log.warn("[OFFICE] 옛 파일을 남기지 못함 - {}", e.toString());
        }
    }
}
