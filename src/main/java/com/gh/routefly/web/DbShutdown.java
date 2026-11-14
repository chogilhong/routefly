package com.gh.routefly.web;

import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;

/** 웹앱이 내려갈 때 산악회 방 파일을 마저 쓰고(모아 쓰기), 익명 자취 쓰기를 마친 뒤 DB 연결 풀을 닫습니다(이클립스 F5 로 다시 올려도 옛 연결 · 스레드가 남지 않게). */
@WebListener
public class DbShutdown implements ServletContextListener {
    /** 웹앱이 뜰 때 레이더 미리 받기를 시작(2026-11-14 - 배포 뒤 첫 손님 요청까지 레이더 줄이 비었음). 키가 없으면 하지 않음. */
    @Override
    public void contextInitialized(ServletContextEvent e) {
        Radar.start();
    }

    @Override
    public void contextDestroyed(ServletContextEvent e) {
        Party.STORE.shutdown();
        Radar.shutdown();   // 레이더 미리 받기 스레드(2026-11-14)
        PartyTrack.shutdown();
        Db.close();
    }
}
