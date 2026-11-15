package com.gh.routefly.tidefly;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 기상청 API허브 글 응답(typ01 · typ06) 읽기. 2026-11-14 실제 응답(src/test/resources/apihub)으로 확인한 모양:
 * 첫 줄 {@code #START7777}, {@code #} 줄은 설명, 자료 줄은 빈칸 또는 쉼표로 나뉘고 쉼표 줄은 끝에 {@code =} 칸이 붙음.
 * 잘못된 요청(없는 해구 번호 등)도 HTTP 200 에 안내 한 줄만 오므로 첫 줄로 가립니다.
 */
final class KmaText {

    private KmaText() {
    }

    /** 순수 함수 - 자료 줄들(칸 나눔). #START7777 로 시작하지 않으면 null(오류 안내 글). */
    static List<String[]> rows(String text) {
        if (text == null) return null;
        String t = text.startsWith("﻿") ? text.substring(1) : text;
        if (!t.startsWith("#START7777")) return null;
        List<String[]> out = new ArrayList<>();
        for (String line : t.split("\r?\n")) {
            if (line.startsWith("#") || line.isBlank()) continue;
            String[] f;
            if (line.contains(",")) {
                List<String> cells = new ArrayList<>();
                for (String c : line.split(",", -1)) cells.add(c.trim());
                while (!cells.isEmpty() && (cells.get(cells.size() - 1).isEmpty() || cells.get(cells.size() - 1).equals("="))) cells.remove(cells.size() - 1);
                f = cells.toArray(new String[0]);
            } else {
                f = line.trim().split("\\s+");
            }
            out.add(f);
        }
        return out;
    }

    /**
     * 순수 함수 - 응답 바이트 → 글. 머리글에 charset 이 있으면 그것, 없으면 UTF-8 로 깨짐 없이 읽히면 UTF-8, 아니면 EUC-KR
     * (routefly KmaSeasonProbe.text 와 같음 - API허브 typ01 텍스트가 EUC-KR 일 수 있음). 확인용 프로그램(Probes)도 이것을 씀.
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

    /** 순수 함수 - 숫자 칸. 비었거나 숫자가 아니거나 -999 · -99 (자료 없음)면 null. */
    static Double num(String[] f, int i) {
        if (i >= f.length) return null;
        try {
            double v = Double.parseDouble(f[i].trim());
            return v <= -99 ? null : v;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
