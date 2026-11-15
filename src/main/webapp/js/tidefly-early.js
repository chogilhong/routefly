/* 타이드플라이 - 고른 화면 모드 · 글자 크기를 그리기 전에(깜박임 없이). routefly 는 화면 안 스크립트를 막아(SecurityFilter CSP) 따로 파일로 */
// 고른 화면 모드 · 글자 크기를 그리기 전에(깜박임 없이) - 저장이 막힌 브라우저는 기본값
  try { var t = localStorage.getItem('tf-theme'), z = localStorage.getItem('tf-size');
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
        if (z === 'l' || z === 'xl') document.documentElement.setAttribute('data-size', z); } catch (e) {}
