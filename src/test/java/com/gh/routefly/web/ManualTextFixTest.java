package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 매뉴얼 5편 화면 대조에서 나온 앱 글 두 곳(2026-11-27 PC):
 * 3D 영상 묻는 글은 시작한 화면(따라가기 · 기록 보기)으로 돌아온다고, 기록 보기의 묻는 창은 우리 글자 창(앱에서 브라우저 confirm 은 영어),
 * 📮 등록 요청 창은 메모 칸이 함께 간다는 것과 맞게 "사진 메모는 보내지 않습니다"(개인정보처리방침 course-submit 과 같게).
 */
public class ManualTextFixTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 영상_묻는_글과_등록_요청_글() throws Exception {
        String ck = read("src/main/webapp/js/course-kit.js"), tj = read("src/main/webapp/js/trip.js");
        assertTrue("3D 영상 뒤 돌아오는 곳은 이 화면", ck.contains("초 동안 날며 영상을 만들고 이 화면으로 돌아옵니다.") && ck.contains("then comes back to this screen."));
        assertFalse("따라가기로 돌아온다고 하지 않음", ck.contains("영상을 만들고 따라가기 화면으로 돌아옵니다"));
        assertTrue("기록 보기는 우리 글자 창으로 묻고 시작", tj.contains("RFDialog.confirm(f.msg, { ok: T(\"시작\", \"Start\") }).then(function (yes) { if (yes) flyGo(got, f, hash); });"));
        assertFalse("브라우저 confirm 은 쓰지 않음", tj.contains("confirm(f.msg)) return;"));
        assertTrue("메모 칸은 가고 사진 메모는 안 감",
            ck.contains("(메모는 운영자 점검에만 씀). 시각 · 사진 · 사진 메모는 보내지 않습니다.") && !ck.contains("시각 · 사진 · 메모는 보내지 않습니다"));
        assertTrue("GPX 편집 처음 안내도 보낼 때 가는 것을 다 적음",
            read("src/main/webapp/js/studio.js").contains("\"📮 보낼 때만 선 모양 · 코스 이름(적으면 보낸 사람 이름 · 메모)이\") + \" 서버로 갑니다.)\""));
        assertTrue("방침도 같은 뜻", read("src/main/webapp/privacy.html").contains("<b>메모</b>를 받습니다. 사진 · 사진 메모는 보내지 않습니다."));
    }
}
