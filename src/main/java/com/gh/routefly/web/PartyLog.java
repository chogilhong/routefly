package com.gh.routefly.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 산악회 방 회원의 위치정보 이용 · 제공사실 확인자료(위치정보법 제16조 제2항) - 참가 · SOS · 출발 때 안 탐 · 내보냄 · 나감 의 때, 방 코드, 방 안 번호(이름 · 좌표 없음).
 * 2026-10-27 위치정보지원센터 답: 동의를 철회하면(그만 보내기) 법 제24조 제4항에 따라 그 회원의 확인자료를 즉시 파기 - 그래서 log4j 파일 대신
 * 사람별로 지울 수 있는 이 파일(달마다 하나, 권한 600)에 씀. 방 단위 기록(방 만들기 · 명단 · 방 끝)은 그대로 log4j party.log.
 * 200일이 지난 달 파일은 지움. dir 이 null 이면 메모리에만(시험).
 */
final class PartyLog {

    static final long KEEP_DAYS = 200;
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZONE);
    private static final Pattern NAME = Pattern.compile("party-member-(\\d{4})-(\\d{2})\\.log");

    private final Path dir;
    private final List<String> memory = new ArrayList<>();
    private long lastSweep = Long.MIN_VALUE / 4;

    PartyLog(Path dir) {
        this.dir = dir;
    }

    /** 한 줄 남김 - what 은 "join role=hiker" 처럼(빈칸 · 영문만, 이름 · 좌표를 넣지 않음). */
    synchronized void add(long now, String room, int member, String what) {
        String line = AT.format(Instant.ofEpochMilli(now)) + " " + what.split(" ", 2)[0] + " room=" + room + " member=" + member
                + (what.contains(" ") ? " " + what.split(" ", 2)[1] : "");
        if (dir == null) { memory.add(line); return; }
        try {
            Files.createDirectories(dir);
            Path f = dir.resolve("party-member-" + YearMonth.from(Instant.ofEpochMilli(now).atZone(ZONE)) + ".log");
            if (!Files.exists(f)) create(f);
            Files.writeString(f, line + "\n", StandardCharsets.UTF_8, StandardOpenOption.APPEND);
        } catch (IOException e) {
            org.apache.logging.log4j.LogManager.getLogger(PartyLog.class).warn("확인자료를 쓰지 못함: {}", e.toString());
        }
        if (now - lastSweep > 24 * 3600_000L) { lastSweep = now; sweep(now); }
    }

    /** 동의 철회 - 그 방 그 회원의 줄을 모든 달 파일에서 지움. 돌려줌: 지운 줄 수. */
    synchronized int purge(String room, int member) {
        Pattern p = Pattern.compile(" room=" + Pattern.quote(room) + " member=" + member + "(?: |$)");
        if (dir == null) {
            int before = memory.size();
            memory.removeIf(l -> p.matcher(l).find());
            return before - memory.size();
        }
        int n = 0;
        for (Path f : files()) {
            try {
                List<String> lines = Files.readAllLines(f, StandardCharsets.UTF_8), keep = new ArrayList<>();
                for (String l : lines) if (p.matcher(l).find()) n++; else keep.add(l);
                if (keep.size() == lines.size()) continue;
                Path tmp = dir.resolve(f.getFileName() + ".tmp");
                Files.deleteIfExists(tmp);
                create(tmp);
                Files.write(tmp, keep, StandardCharsets.UTF_8, StandardOpenOption.TRUNCATE_EXISTING);
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException e) {
                org.apache.logging.log4j.LogManager.getLogger(PartyLog.class).warn("확인자료를 지우지 못함: {}", e.toString());
            }
        }
        return n;
    }

    /** 그 달이 끝나고 200일이 지난 파일을 지움. */
    synchronized void sweep(long now) {
        if (dir == null) return;
        for (Path f : files()) {
            Matcher m = NAME.matcher(f.getFileName().toString());
            if (!m.matches()) continue;
            long monthEnd = YearMonth.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))).plusMonths(1).atDay(1).atStartOfDay(ZONE).toInstant().toEpochMilli();
            if (now - monthEnd > KEEP_DAYS * 24 * 3600_000L) {
                try { Files.deleteIfExists(f); } catch (IOException e) { /* 다음에 */ }
            }
        }
    }

    /** 시험 - 메모리의 줄. */
    synchronized List<String> lines() {
        if (dir == null) return new ArrayList<>(memory);
        List<String> out = new ArrayList<>();
        for (Path f : files()) {
            try { out.addAll(Files.readAllLines(f, StandardCharsets.UTF_8)); } catch (IOException e) { /* 없음 */ }
        }
        return out;
    }

    private List<Path> files() {
        List<Path> out = new ArrayList<>();
        if (dir == null || !Files.isDirectory(dir)) return out;
        try (var s = Files.list(dir)) {
            s.filter(f -> NAME.matcher(f.getFileName().toString()).matches()).sorted().forEach(out::add);
        } catch (IOException e) { /* 없음 */ }
        return out;
    }

    /** 처음부터 권한 600(party.json 과 같음) - 윈도우 등 POSIX 가 아니면 그냥 만듦. */
    private static void create(Path f) throws IOException {
        try {
            Files.createFile(f, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        } catch (UnsupportedOperationException e) {
            Files.createFile(f);
        }
    }
}
