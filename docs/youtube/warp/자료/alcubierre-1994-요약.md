# 알큐비에레 원 논문(1994) 요약

- 제목: The warp drive: hyper-fast travel within general relativity
- 지은이: Miguel Alcubierre (당시 University of Wales, College of Cardiff)
- 실린 곳: Class. Quantum Grav. 11-5, L73-L77 (1994), doi 10.1088/0264-9381/11/5/001
- arXiv: gr-qc/0009013 (arXiv 에 올린 날 2000-09-05) - https://arxiv.org/abs/gr-qc/0009013
- 받은 것: abs 페이지 · PDF · LaTeX 원본(manuscript.tex, 2026-11-26 PC). 원본은 저장소에 넣지 않음. 아래 수식은 LaTeX 원본 그대로 옮김(G = c = 1).

## 생각(본문 요지)

- 상대성이론에서 막힌 것은 "국소적으로(locally)" 빛보다 빠른 움직임뿐이다.
- 초기 우주 인플레이션 때 두 관측자가 멀어지는 속도는 빛보다 클 수 있다. 공간 자체가 팽창하기 때문이다.
- 같은 방식으로 우주선 뒤의 공간은 팽창시키고 앞의 공간은 수축시키면, 우주선이 공간 자체에 밀리고 당겨져 아주 빠르게 갈 수 있다.
- 우주선은 늘 자기 빛원뿔 안(시간꼴 궤적)에 있다. 빛도 공간의 뒤틀림에 함께 밀린다.
- 이름은 SF 의 "warp drive" 에서 따왔다고 본문에 적음.

## 거품 식(원문 수식)

3+1 계량:
```latex
ds^2 = -(\alpha^2 - \beta_i \beta^i) dt^2 + 2 \beta_i dx^i dt + \gamma_{ij} dx^i dx^j
```
x 축으로 가는 우주선(궤적 x_s(t)):
```latex
\alpha = 1 , \quad \beta^x = - v_s(t) f(r_s(t)) , \quad \beta^y = \beta^z = 0 , \quad \gamma_{ij} = \delta_{ij}
v_s(t) = \frac{d x_s(t)}{dt} , \qquad r_s(t) = \left[ (x - x_s(t))^2 + y^2 + z^2 \right]^{1/2}
```
모양 함수(거품의 모양):
```latex
f(r_s) = \frac{\tanh(\sigma (r_s + R)) - \tanh(\sigma (r_s - R))}{2 \tanh(\sigma R)}
```
- R > 0, σ > 0 은 마음대로 고르는 값. σ 가 크면 f 는 "모자(top hat)" 모양: 거품 안(r_s ≤ R)은 1, 밖은 0.

정리한 계량:
```latex
ds^2 = - dt^2 + (dx - v_s f(r_s) dt)^2 + dy^2 + dz^2
```
- 3차원 공간은 늘 평평(γ_ij = δ_ij), 시간 경과 함수 α = 1 → 거품 안 관측자는 자유낙하.
- 거품 밖(r_s ≫ R)은 거의 평평, 거품 반지름 R 근처만 휜다.

## 공간 수축 · 팽창 θ

```latex
\theta = - \alpha \, {\rm Tr} K
\theta = v_s \frac{x_s}{r_s} \frac{d f}{d r_s}
```
- 원문 그림 1: σ = 8, R = v_s = 1 일 때 θ 를 x 와 ρ = (y² + z²)^{1/2} 로 그림. "우주선 뒤는 부피가 팽창, 앞은 수축".
- ※ 위 식의 x_s 는 arXiv 원본 표기 그대로. 뜻으로는 우주선에서 잰 거리 (x − x_s) 로 읽어야 θ 가 앞뒤로 부호가 바뀌는 그림과 맞음 - 그림을 그릴 때 (x − x_s)/r_s 로 계산할 것(웹 Claude 확인 부탁).

## 우주선 안: 시간 지연 없음

- 우주선 궤적(x = x_s(t))을 넣으면 dτ = dt → 우주선의 고유 시간 = 멀리 있는 관측자의 시간. 시간 지연이 없다.
- 우주선은 측지선을 따라가므로 고유 가속도는 0. σ 가 크면 우주선 근처 조석력도 아주 작다(R 이 우주선보다 클 때). 다만 r_s ≈ R(거품 벽)에서는 조석력이 매우 클 수 있다.

## 별까지 왕복 시간

- 거리 D 인 두 별 A · B, 처음 · 끝은 로켓으로 속도 v < 1 로 거리 d 만큼(R ≪ d ≪ D), 가운데는 거품으로 가속 a → −a.
```latex
T = 2 \left[ \frac{d}{v} + \sqrt{\frac{D - 2d}{a}} \right] , \qquad
\tau = 2 \left[ \frac{d}{\gamma v} + \sqrt{\frac{D - 2d}{a}} \right] , \qquad
\tau \simeq T \simeq 2 \sqrt{\frac{D}{a}}
```
- a 를 키우면 T 를 얼마든지 짧게: 우주선 시계로도 별의 시계로도 왕복이 아주 짧을 수 있다.

## 음의 에너지 밀도(원문 수식)

```latex
T^{\alpha\beta} n_\alpha n_\beta = \alpha^2 T^{00} = \frac{1}{8\pi} G^{00}
 = - \frac{1}{8\pi} \frac{v_s^2 \rho^2}{4 r_c^2} \left( \frac{d f}{d r_s} \right)^2
```
- ρ = (y² + z²)^{1/2}. ※ 분모의 r_c 는 arXiv 원본 표기 그대로(위키백과 · 나무위키 식은 r_s).
- "이 식이 어디서나 음수" → 약한 · 지배적 에너지 조건 위반, 강한 에너지 조건도 위반.

## 본인이 적은 한계 · 결론(짧은 인용, 출처: Alcubierre 1994)

- 초록: "exotic matter will be needed" - 웜홀처럼 이색 물질(음의 에너지)이 필요하다.
- 본문: 세 에너지 조건(약한 · 지배적 · 강한)을 모두 어긴다는 "one important drawback".
- 다만 양자장론은 특별한 경우(예: 카시미르 효과) 음의 에너지 밀도를 허용하므로, 이색 물질이 필요하다는 것이 곧 불가능을 뜻하지는 않는다고 적음.
- 마지막: 이 시공간 자체에는 닫힌 시간꼴 곡선이 없지만, 비슷한 생각으로 그런 곡선(시간 여행)을 만드는 시공간은 어렵지 않게 만들 수 있을 것이라고 적음.
