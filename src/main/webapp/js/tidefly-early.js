/* 타이드플라이 - 고른 화면 모드 · 글자 크기를 그리기 전에(깜박임 없이). routefly 는 화면 안 스크립트를 막아(SecurityFilter CSP) 따로 파일로 */
// 고른 화면 모드 · 글자 크기를 그리기 전에(깜박임 없이) - 저장이 막힌 브라우저는 기본값
  try { var t = localStorage.getItem('tf-theme'), z = localStorage.getItem('tf-size');
        document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');   // 기본은 다크(2026-11-15 홍TV님) - 밝은 모드를 고른 때만 밝게
        if (z === 'l' || z === 'xl') document.documentElement.setAttribute('data-size', z); } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
