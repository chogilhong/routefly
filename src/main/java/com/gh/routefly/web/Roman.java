package com.gh.routefly.web;

/**
 * 한글 → 로마자(국어의 로마자 표기법, 문화체육관광부 2000). 영어 산 페이지(/en/m/ - 2026-10-15 홍TV님)의 산 · 코스 이름.
 *
 * <p>소리 나는 대로 적는 규칙 가운데 이름에 자주 나오는 것만: 받침이 모음 앞에서 넘어감(설악 Seorak · 덕유 Deogyu),
 * 비음화(속리 Songni · 백마 Baengma), 유음화(한라 Halla · 신라 Silla), ㄹ+ㄹ → ll. 된소리 · 거센소리 되기는 이름에서 적지 않음(북한산 Bukhansan).
 * 한글이 아닌 글자는 그대로 두고, 한글 낱말마다 첫 글자를 대문자로.
 */
final class Roman {

    private Roman() {
    }

    private static final String[] INITIAL = {"g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"};
    private static final String[] VOWEL = {"a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"};
    /** 받침 28(0 = 없음) → 대표 소리: 0 없음, 1 ㄱ(k), 2 ㄴ(n), 3 ㄷ(t), 4 ㄹ(l), 5 ㅁ(m), 6 ㅂ(p), 7 ㅇ(ng). */
    private static final int[] FINAL_SOUND = {0, 1, 1, 1, 2, 2, 2, 3, 4, 1, 5, 4, 4, 4, 6, 4, 5, 6, 6, 3, 3, 7, 3, 3, 1, 3, 6, 3};
    /** 모음 앞에서 넘어가는 받침의 자음(초성 표기) - ㅇ 은 넘어가지 않음, ㅎ 은 소리 안 남. 겹받침은 뒤 자음이 넘어감. */
    private static final String[] FINAL_LINK = {"", "g", "kk", "ks", "n", "nj", "n", "d", "r", "lg", "lm", "lb", "ls", "lt", "lp", "r", "m", "b", "ps", "s", "ss", "ng", "j", "ch", "k", "t", "p", ""};
    private static final String[] SOUND = {"", "k", "n", "t", "l", "m", "p", "ng"};

    /** 순수 함수 - 한글 로마자로. null 은 "". */
    static String of(String s) {
        if (s == null) return "";
        StringBuilder out = new StringBuilder();
        int i = 0, n = s.length();
        while (i < n) {
            if (!hangul(s.charAt(i))) {
                out.append(s.charAt(i++));
                continue;
            }
            int j = i;
            while (j < n && hangul(s.charAt(j))) j++;
            String w = word(s.substring(i, j));
            boolean afterDigit = i > 0 && Character.isDigit(s.charAt(i - 1));   // "6봉" → 6bong
            out.append(afterDigit ? w.charAt(0) : Character.toUpperCase(w.charAt(0))).append(w.substring(1));
            i = j;
        }
        return out.toString();
    }

    /** 순수 함수 - 주소에 쓸 이름: 소문자 · 영숫자와 - 만("백운산(광양)" → "baegunsan-gwangyang"). */
    static String slug(String s) {
        return of(s).toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }

    private static boolean hangul(char c) {
        return c >= 0xAC00 && c <= 0xD7A3;
    }

    private static String word(String w) {
        int len = w.length();
        int[] ini = new int[len], vow = new int[len], fin = new int[len];
        for (int k = 0; k < len; k++) {
            int code = w.charAt(k) - 0xAC00;
            ini[k] = code / 588;
            vow[k] = code % 588 / 28;
            fin[k] = code % 28;
        }
        StringBuilder b = new StringBuilder();
        String carry = null;   // 앞 받침이 바꾼 이 글자의 초성
        for (int k = 0; k < len; k++) {
            b.append(carry != null ? carry : INITIAL[ini[k]]);
            b.append(VOWEL[vow[k]]);
            carry = null;
            if (fin[k] == 0) continue;
            if (k == len - 1) {
                b.append(SOUND[FINAL_SOUND[fin[k]]]);
                continue;
            }
            int next = ini[k + 1], snd = FINAL_SOUND[fin[k]];
            if (k == len - 2 && w.charAt(k + 1) == '리') {   // 행정 단위 리 - 붙임표, 소리 바꾸지 않음(중산리 Jungsan-ri)
                b.append(SOUND[snd]).append('-');
                continue;
            }
            if (next == 11) {   // 다음이 ㅇ(모음) - 받침이 넘어감
                String link = FINAL_LINK[fin[k]];
                if (fin[k] == 21) b.append("ng");   // ㅇ 받침은 그대로(강원 Gangwon)
                else if (link.length() == 2 && !link.equals("kk") && !link.equals("ss") && !link.equals("ng") && !link.equals("ch")) {
                    b.append(SOUND[FINAL_SOUND[firstOf(link)]]);   // 겹받침: 앞은 남고 뒤가 넘어감
                    carry = link.substring(1);
                } else carry = link;
                continue;
            }
            boolean nasalNext = next == 2 || next == 6, rieulNext = next == 5;
            if (snd == 4 && (rieulNext || next == 2)) {   // ㄹ+ㄹ · ㄹ+ㄴ → ll
                b.append("l");
                carry = "l";
            } else if (snd == 2 && rieulNext) {   // ㄴ+ㄹ → ll(한라 Halla)
                b.append("l");
                carry = "l";
            } else if (rieulNext) {   // ㄱ · ㅂ · ㅁ · ㅇ + ㄹ → ㄹ 이 ㄴ, 앞은 비음(속리 Songni · 종로 Jongno)
                b.append(SOUND[nasal(snd)]);
                carry = "n";
            } else if (nasalNext) {   // ㄱ · ㄷ · ㅂ + ㄴ · ㅁ → 비음(백마 Baengma)
                b.append(SOUND[nasal(snd)]);
            } else b.append(SOUND[snd]);
        }
        return b.toString();
    }

    private static int nasal(int snd) {
        return snd == 1 ? 7 : snd == 3 ? 2 : snd == 6 ? 5 : snd;
    }

    /** 겹받침 표기의 앞 자음 → 받침 번호(ㄱ 1 · ㄴ 4 · ㄹ 8 · ㅂ 17). */
    private static int firstOf(String link) {
        switch (link.charAt(0)) {
            case 'k': return 1;
            case 'n': return 4;
            case 'l': return 8;
            default: return 17;
        }
    }
}
