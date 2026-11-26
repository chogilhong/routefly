# Fuchs 외 (2024) 요약 - 빛보다 느린 양의 에너지 워프

- 제목: Constant Velocity Physical Warp Drive Solution
- 지은이: Jared Fuchs, Christopher Helmerich, Alexey Bobrick, Luke Sellers, Brandon Melcher, Gianni Martire
  (UAH · Advanced Propulsion Laboratory at Applied Physics · Technion · UCLA)
- 연도: 원고 날짜 August 2023, arXiv 2024-05-04(2405.02709), 학술지 doi 10.1088/1361-6382/ad26aa (Class. Quantum Grav.)
- 찾은 곳: UAH 소식(2024-05-29, Russ Nelson) https://www.uah.edu/news/items/uah-researcher-leads-groundbreaking-paper-that-demonstrates-for-the-first-time-a-subluminal-warp-drive-is-possible-through-known-physics 에 걸린 링크 https://arxiv.org/pdf/2405.02709
- 받은 것: UAH 소식 · abs · PDF · LaTeX 원본(2026-11-26 PC). 원본은 저장소에 넣지 않음.

## 주장(초록 · 결론 요지)

- 모든 에너지 조건(NEC · WEC · DEC · SEC)을 만족하는 "등속 · 빛보다 느린" 워프 드라이브 해.
- 방법: 안정한 물질 껍질(양의 ADM 질량) + 알큐비에레 계량과 비슷한 이동 벡터 분포를 안쪽에.
- 계량을 수치로 만들고(Warp Factory 도구), 에너지 조건을 평가하고, 이동 벡터가 단순 좌표 변환이 아님을 확인.
- 고전적 워프 시공간도 양의 ADM 질량을 가진 보통 물질 껍질을 더하면 에너지 조건을 만족하게 할 수 있음을 보임.

## 숫자

- 껍질: 안 반지름 R1 = 10 m, 바깥 반지름 R2 = 20 m, 질량 M = 4.49 × 10^27 kg.
- 빛 왕복 시간 차 시험(v_warp = 0.04 c): 워프 껍질 δt ≈ 7.6 ns, 보통 물질 껍질 0 ns
  (비교: 알큐비에레 R = 15 m 8.0 ns, 반 덴 브룩 9.1 ns, Modified Time 6.7 ns).
  → 진행 방향을 따라 · 거슬러 지나는 빛의 시간이 다름("선형 끌림") - 측정 가능한 양이라 좌표 변환이 아님.
- 질량에는 한계: 껍질 안에 사건의 지평선이 생기지 않아야(R_shell > 2GM/c²).

## 무엇을 보였고 무엇은 아닌지

- 보인 것: 등속으로 움직이는, 빛보다 느린 워프 해가 알려진 물리(양의 에너지)로 가능하다는 것.
- 아닌 것:
  - 초광속이 아님. UAH 소식에서 푹스: "스타트렉 같은 빠른 이동을 해결하지는 않는다"(뜻을 옮김).
  - 가속 방법이 아님 - 논문 토론에서 가속은 "워프 연구의 가장 앞선 문제" 로 남겨 둠. 중심을 그냥 가속하면 다시 음의 에너지가 필요해짐(슈바르츠실트 드라이브와 같은 문제), 질량을 뿜는 로켓식도 문제.
  - 위키백과: "초광속이 아니고 껍질을 가속하는 방법을 주지도 않는다".
- UAH 소식에서 푹스: 대중적 설명과 달리 워프는 공간을 늘이거나 줄이는 것이 아니라, 승객 공간 둘레를 빠르게 도는 큰 에너지가 안쪽에 "컨베이어 벨트" 효과를 내는 것(연기 고리에 비유).
- 앞으로: 질량 대 속도 비율 최적화(필요 질량을 여러 자릿수 줄일 수 있을 것), 물리성을 깨지 않는 가속.
- Warp Factory 코드: https://github.com/NerdsWithAttitudes/WarpFactory
