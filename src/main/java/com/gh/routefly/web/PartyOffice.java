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
    /** 1년 동안 사무실 화면을 안 열고, 올라온 방 · 끝난 산행도 없으면 지움(500곳이 차 아무도 못 만들게 되는 것을 막음, 2026-10-29 보안 점검). */
    static final long IDLE_MS = 365L * 24 * 3600_000L;

    static final class Office {
        String code;   // 회사 코드 바꾸기로 바뀜
        String name;   // 이름 바꾸기로 바뀜(2026-10-29)
        String key;   // 사무실 링크 바꾸기로 바뀜
        final long created;
        long seen;   // 마지막으로 사무실 화면을 연 때(하루 단위로 파일에) - 오래 안 쓴 빈 사무실 정리(2026-10-29 보안 점검)
        final List<JsonObject> ended = new ArrayList<>();   // 끝난 산행 요약(새것이 앞)

        Office(String code, String name, String key, long created) {
            this.code = code; this.name = name; this.key = key; this.created = created; this.seen = created;
        }
    }

    private final Path file;
    private final SecureRandom rnd = new SecureRandom();
    private final Map<String, Office> byCode = new LinkedHashMap<>();

    // ---- 내 사무실 묶음(2026-10-30 홍TV님 "② 내 사무실 묶음 링크로 해줘") - PC · 폰 · 직원 기기가 같은 사무실 목록을 씀.
    // 묶음 열쇠(비밀) → 회사 코드 목록. 사무실 열쇠가 아니라 코드를 두어 사무실 링크 · 회사 코드를 바꿔도 묶음은 그대로(코드 바꾸기는 묶음도 고침).
    // 없앤 사무실은 묶음을 읽을 때 뺌. 파일은 office.json 옆 office-bundle.json(600).
    static final int MAX_BUNDLES = 2000, BUNDLE_MAX = 20;

    static final class Bundle {
        String key;
        final List<String> codes = new ArrayList<>();
        long seen;

        Bundle(String key, long seen) {
            this.key = key; this.seen = seen;
        }
    }

    private final Path bundleFile;
    private final Map<String, Bundle> bundles = new LinkedHashMap<>();   // 묶음 열쇠 → 묶음

    PartyOffice(Path file) {
        this.file = file;
        this.bundleFile = file == null ? null : file.resolveSibling("office-bundle.json");
        load();
        loadBundles();
    }

    private String newSecret() {
        byte[] b = new byte[24];
        rnd.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    /** 새 묶음 - 사무실들(비밀 링크로 확인한 것)로. 돌려줌: 묶음 열쇠. */
    synchronized String newBundle(List<Office> list, long now) {
        if (list.isEmpty()) throw new IllegalArgumentException("묶을 사무실이 없습니다.");
        if (bundles.size() >= MAX_BUNDLES) throw new IllegalStateException("지금은 묶음을 더 만들 수 없습니다.");
        Bundle b = new Bundle(newSecret(), now);
        for (Office o : list) if (!b.codes.contains(o.code) && b.codes.size() < BUNDLE_MAX) b.codes.add(o.code);
        bundles.put(b.key, b);
        saveBundles();
        log.info("[OFFICE] 묶음 만듦 사무실 {}곳", b.codes.size());
        return b.key;
    }

    /** 묶음 열쇠로 - 없으면 SecurityException. 같은 길이만 견줌(byKey 와 같게). */
    private Bundle bundleOf(String key) {
        if (key != null && key.length() >= 20 && key.length() <= 64)
            for (Bundle b : bundles.values())
                if (java.security.MessageDigest.isEqual(b.key.getBytes(StandardCharsets.UTF_8), key.getBytes(StandardCharsets.UTF_8))) return b;
        throw new SecurityException("묶음 링크가 맞지 않습니다.");
    }

    /** 묶음의 사무실들(없앤 사무실은 빼고 파일도 고침). 하루에 한 번 seen. */
    synchronized List<Office> bundleOffices(String key, long now) {
        Bundle b = bundleOf(key);
        boolean changed = b.codes.removeIf(c -> !byCode.containsKey(c));
        if (now - b.seen >= 24 * 3600_000L) { b.seen = now; changed = true; }
        if (changed) saveBundles();
        List<Office> out = new ArrayList<>();
        for (String c : b.codes) out.add(byCode.get(c));
        return out;
    }

    /** 묶음에 사무실 더하기(이미 있으면 그대로). */
    synchronized void bundleAdd(String key, Office o) {
        Bundle b = bundleOf(key);
        if (b.codes.contains(o.code)) return;
        if (b.codes.size() >= BUNDLE_MAX) throw new IllegalStateException("한 묶음에는 사무실을 " + BUNDLE_MAX + "곳까지 넣습니다.");
        b.codes.add(o.code);
        saveBundles();
    }

    /** 묶음에서 사무실 빼기(사무실은 그대로). */
    synchronized void bundleRemove(String key, Office o) {
        if (bundleOf(key).codes.remove(o.code)) saveBundles();
    }

    /** 묶음 링크 바꾸기(샜을 때) - 옛 묶음 링크는 바로 안 됨. 돌려줌: 새 열쇠. */
    synchronized String bundleNewKey(String key) {
        Bundle b = bundleOf(key);
        bundles.remove(b.key);
        b.key = newSecret();
        bundles.put(b.key, b);
        saveBundles();
        log.info("[OFFICE] 묶음 링크 바꿈");
        return b.key;
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
        boolean inBundle = false;
        for (Bundle b : bundles.values()) {   // 묶음도 새 코드로
            int i = b.codes.indexOf(o.code);
            if (i >= 0) { b.codes.set(i, code); inBundle = true; }
        }
        if (inBundle) saveBundles();
        o.code = code;
        byCode.put(code, o);
        save();
        log.info("[OFFICE] 회사 코드 바꿈");
    }

    /** 이름 바꾸기(2026-10-29 홍TV님 "만들어줘" - 오타 · 상호 변경). 코드 · 링크는 그대로. */
    synchronized void rename(Office o, String name) {
        o.name = name;
        save();
        log.info("[OFFICE] 사무실 이름 바꿈 code={}", o.code);
    }

    /** 사무실 없애기 - 사무실 · 끝난 산행 요약을 모두 지움. */
    synchronized void delete(Office o) {
        byCode.remove(o.code);
        save();
        log.info("[OFFICE] 사무실 없앰 code={}", o.code);
    }

    /** 사무실 화면을 엶 - 하루에 한 번만 파일에. */
    synchronized void seen(Office o, long now) {
        if (now - o.seen < 24 * 3600_000L) return;
        o.seen = now;
        save();
    }

    /** 오래 안 쓴 빈 사무실 지우기 - linked: 지금 방이 올라온 회사 코드. 돌려줌: 지운 수. */
    synchronized int sweepIdle(long now, java.util.Set<String> linked) {
        int n = 0;
        for (java.util.Iterator<Office> it = byCode.values().iterator(); it.hasNext();) {
            Office o = it.next();
            o.ended.removeIf(x -> now - x.get("endedAt").getAsLong() > KEEP_MS);
            if (now - o.seen > IDLE_MS && o.ended.isEmpty() && !linked.contains(o.code)) { it.remove(); n++; log.info("[OFFICE] 1년 안 쓴 빈 사무실 지움 code={}", o.code); }
        }
        if (n > 0) save();
        int nb = bundles.size();   // 1년 안 쓴 묶음 · 빈 묶음도 지움
        bundles.values().removeIf(b -> now - b.seen > IDLE_MS || b.codes.stream().noneMatch(byCode::containsKey) && now - b.seen > 24 * 3600_000L);
        if (bundles.size() != nb) saveBundles();
        return n;
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
            x.addProperty("code", o.code); x.addProperty("name", o.name); x.addProperty("key", o.key); x.addProperty("created", o.created); x.addProperty("seen", o.seen);
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
                    if (x.has("seen")) o.seen = x.get("seen").getAsLong();
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

    private void saveBundles() {
        if (bundleFile == null) return;
        JsonArray arr = new JsonArray();
        for (Bundle b : bundles.values()) {
            JsonObject x = new JsonObject();
            x.addProperty("key", b.key);
            x.addProperty("seen", b.seen);
            JsonArray c = new JsonArray();
            b.codes.forEach(c::add);
            x.add("codes", c);
            arr.add(x);
        }
        try {
            Files.createDirectories(bundleFile.getParent());
            Path tmp = bundleFile.resolveSibling("office-bundle.json.tmp");
            Files.deleteIfExists(tmp);
            try { Files.createFile(tmp, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))); }
            catch (UnsupportedOperationException ex) { Files.createFile(tmp); }
            Files.writeString(tmp, arr.toString(), StandardCharsets.UTF_8);
            Files.move(tmp, bundleFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception ex) {
            log.warn("[OFFICE] 묶음 파일을 쓰지 못함 - {}", ex.toString());
        }
    }

    /** 묶음 읽기 - 하나씩(깨진 것은 건너뜀). */
    private void loadBundles() {
        if (bundleFile == null || !Files.isRegularFile(bundleFile)) return;
        try {
            for (JsonElement e : JsonParser.parseString(Files.readString(bundleFile, StandardCharsets.UTF_8)).getAsJsonArray()) {
                try {
                    JsonObject x = e.getAsJsonObject();
                    Bundle b = new Bundle(x.get("key").getAsString(), x.get("seen").getAsLong());
                    x.getAsJsonArray("codes").forEach(c -> b.codes.add(c.getAsString()));
                    bundles.put(b.key, b);
                } catch (RuntimeException ex) { /* 건너뜀 */ }
            }
        } catch (Exception ex) {
            log.warn("[OFFICE] 묶음 파일을 읽지 못함 - {}", ex.toString());
        }
    }

    private void backup() {
        try {
            Path b = file.resolveSibling("office.json.bad-" + System.currentTimeMillis());
            try { Files.createFile(b, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))); }
            catch (UnsupportedOperationException e) { /* 윈도 */ }
            Files.write(b, Files.readAllBytes(file));   // 만든 600 파일에 씀(copy 는 파일을 새로 만들어 원래 권한이 됐음, 2026-10-28 점검)
        } catch (Exception e) {
            log.warn("[OFFICE] 옛 파일을 남기지 못함 - {}", e.toString());
        }
    }
}
