package com.gh.routefly.web;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.EnumSet;

/**
 * 산악회 방 · 사무실 파일(열쇠 · 좌표가 들어 있음) 쓰기 · 깨진 파일 남기기(2026-11-03 홍TV님 보안 점검).
 * 전에는 createFile 로 만든 뒤 Files.writeString 이 다시 열어(그 사이 바꿔치기한 바로 가기를 따라감) fsync 없이 옮겼음 -
 * 이제 한 번만 CREATE_NEW(있으면 실패 - 바로 가기도) · 600 으로 열어 쓰고 force 한 뒤 ATOMIC_MOVE(안 되면 REPLACE_EXISTING).
 * 깨진 파일(*.bad-시각)은 BAD_KEEP_MS 가 지나면 읽을 때 지움(좌표가 들어 있어 영영 남지 않게 - privacy · docs/lbs-internal.md).
 */
final class PrivateFile {

    /** 깨진 파일을 남겨 두는 기간 - 7일(홍TV님이 살펴볼 만큼). */
    static final long BAD_KEEP_MS = 7L * 24 * 3600_000L;

    private PrivateFile() {
    }

    private static FileAttribute<?>[] owner(Path p) {
        return p.getFileSystem().supportedFileAttributeViews().contains("posix")
            ? new FileAttribute<?>[] {PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))}
            : new FileAttribute<?>[0];   // 윈도(PC 개발)
    }

    /** 새 파일(이미 있으면 실패)에 한 번 열어 쓰고 디스크까지. */
    private static void create(Path p, byte[] data) throws IOException {
        try (SeekableByteChannel ch = Files.newByteChannel(p, EnumSet.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE), owner(p))) {
            ByteBuffer b = ByteBuffer.wrap(data);
            while (b.hasRemaining()) ch.write(b);
            if (ch instanceof java.nio.channels.FileChannel fc) fc.force(true);
        }
    }

    /** file 을 통째로 바꿈 - 옆의 <이름>.tmp 에 쓰고 옮김. */
    static void write(Path file, String text) throws IOException {
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.deleteIfExists(tmp);   // 바로 가기면 그 바로 가기만 지움
        create(tmp, text.getBytes(StandardCharsets.UTF_8));
        try {
            Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** 읽지 못한 file 을 <이름>.bad-<시각>(600)으로 남김. 돌려줌: 남긴 파일. */
    static Path backup(Path file, long now) throws IOException {
        Path b = file.resolveSibling(file.getFileName() + ".bad-" + now);
        create(b, Files.readAllBytes(file));
        return b;
    }

    /** file 옆의 <이름>.bad-<시각> 가운데 BAD_KEEP_MS 가 지난 것을 지움. 돌려줌: 지운 수. */
    static int dropOldBackups(Path file, long now) {
        Path dir = file.toAbsolutePath().getParent();
        String pre = file.getFileName() + ".bad-";
        int n = 0;
        if (dir == null || !Files.isDirectory(dir)) return 0;
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, pre + "*")) {
            for (Path p : ds) {
                String t = p.getFileName().toString().substring(pre.length());
                if (!t.matches("\\d{1,19}") || !Files.isRegularFile(p, LinkOption.NOFOLLOW_LINKS)) continue;
                if (now - Long.parseLong(t) > BAD_KEEP_MS && Files.deleteIfExists(p)) n++;
            }
        } catch (IOException | RuntimeException e) {
            return n;
        }
        return n;
    }
}
