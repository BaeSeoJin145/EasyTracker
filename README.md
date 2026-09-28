# Kinematic Lab

브라우저에서 동작하는 무학습 영상 분석 도구입니다. 영상에서 움직이는 영역을 검출하고 객체별 바운딩 박스, 궤적, 위치·속도·수직 가속도 및 선택적 충격량 추정치를 표시합니다. 영상은 브라우저 안에서 처리되며 서버로 업로드되지 않습니다.

## 실행

`index.html`을 최신 브라우저에서 열거나 `index.html`, `styles.css`, `app.js`를 정적 호스팅에 배포하세요. 외부 라이브러리나 빌드 단계는 없습니다.

## 사용 방법

1. 고정 카메라로 촬영한 MP4, MOV 또는 WebM 영상을 엽니다.
2. 대상 형태(자유 형태, 원형, 막대), 검출 민감도, 최소 면적과 최대 객체 수를 조정합니다.
3. 실제 단위 측정이 필요하면 알려진 길이(cm)와 영상 속 그 길이(px)를 입력합니다. 두 값 중 하나라도 없으면 좌표·속도·가속도는 작업 영상의 픽셀 단위입니다.
4. 충격량을 계산하려면 길이 보정과 대상 질량(kg)을 모두 입력합니다.
5. 분석을 시작합니다. 색이 지정된 박스는 검출 영역의 축 정렬 바운딩 박스이며 라벨에 추적 ID와 작업 프레임 기준 폭×높이(px)가 표시됩니다. 궤적 표시를 끄면 이동 경로 선만 숨겨집니다.
6. 결과 표에는 검출 프레임 수, 시작 위치, 총 이동 거리, 최대 속도 및 내부 검출 점수 기반의 참고용 신뢰도가 나옵니다. CSV에는 프레임별 중심 좌표, 박스 크기, 속도 등이 기록됩니다.

## 계산 방식과 제한

- 영상 프레임을 최대 600px 폭, 최대 420개 시점으로 축소해 분석합니다. 최대 7개 시점의 픽셀별 중앙값으로 배경을 만들고, RGB 차분 마스크의 8방향 연결 영역을 객체 후보로 검출합니다.
- 검출 후보 중심은 최근 추적점과의 거리 및 단순 속도 예측으로 연결합니다. 박스는 전경 연결 영역의 최소/최대 x·y 좌표로 그립니다. 박스는 객체의 실제 물리적 경계나 의미 객체 분할을 보장하지 않습니다.
- 속도는 연속 검출 중심의 위치 차분, 이동 거리는 그 차분의 합입니다. 수직 가속도는 각 추적의 y좌표(화면 아래쪽이 양수)에 대한 2차 최소제곱 포물선 근사입니다. 이는 중력가속도 자체를 측정하는 기능은 아니며, 자유 낙하·투사 운동 구간과 적절한 보정·카메라 방향에서 중력 성분의 근삿값으로 해석할 수 있습니다.
- 질량과 길이 보정이 입력되면 연속 구간 사이 속도 벡터 변화의 최대 크기로 `J = m·|Δv|`를 계산해 충격량(N·s)을 추정합니다. 이는 접촉 시점을 식별하거나 힘/접촉 시간을 측정한 결과가 아닙니다. 노이즈나 추적 ID 변경도 추정치를 크게 흔들 수 있습니다.
- 보정은 단일한 화면 길이 비율만 사용합니다. 원근 왜곡, 카메라 기울기, 렌즈 왜곡, 프레임 시간 오차, 측정 불확도는 보정하지 않습니다. 따라서 깊이 방향 운동이나 화면 전체에 걸친 큰 원근 변화가 있는 장면에서는 실제 단위가 부정확할 수 있습니다.
- 배경 차분 기반 베이스라인이며 객체 종류를 인식하는 학습 모델이 아닙니다. 고정 카메라, 조명 안정성, 뚜렷한 대상 대비가 유리합니다. 가림, 충돌/접촉, 유사한 배경색, 그림자, 카메라 이동은 누락·분리·ID 전환을 일으킬 수 있습니다. 결과는 실험 참고용이며 정밀 계측 장비를 대체하지 않습니다.

## English

Kinematic Lab is a browser-based, training-free video analysis tool. It detects moving regions and displays per-track bounding boxes, trails, position, speed, vertical acceleration, and an optional impulse estimate. Video is processed locally in the browser and is not uploaded to a server.

### Run

Open `index.html` in a modern browser, or host `index.html`, `styles.css`, and `app.js` as static files. No external libraries or build step are required.

### How to use

1. Open an MP4, MOV, or WebM video, preferably recorded with a stationary camera.
2. Choose a target shape and tune sensitivity, minimum component area, and maximum object count.
3. For measurements in real units, enter a known length in centimeters and its length in source-video pixels. Otherwise, position, speed, and acceleration are reported in work-image pixels.
4. Enter both a length calibration and target mass in kilograms to estimate impulse.
5. Start analysis. Each colored rectangle is an axis-aligned bounding box around a detected foreground component. Its label shows the track ID and box width × height in work-image pixels. Turning off trail display hides the path line.
6. The results table reports detected sample count, starting position, total path length, maximum speed, and a heuristic detection score. The CSV contains per-sample center coordinates, box dimensions, speed, and other available measurements.

### Method and limitations

- Frames are resized to at most 600 pixels wide and sampled at up to 420 time points. A pixel-wise median of up to seven selected frames models the background. RGB frame differences form a foreground mask, and 8-connected components become detection candidates.
- Candidates are linked to recent tracks by distance with a simple constant-velocity prediction. Boxes enclose each connected foreground region; they are not semantic object detections and need not match an object's true physical outline.
- Speed is computed from consecutive center positions; path length sums those displacements. Vertical acceleration comes from a quadratic least-squares fit to image y-position, where downward is positive. It is not a direct gravity measurement. It may approximate the gravity component for a suitable free-flight interval when scale and camera orientation are known.
- With mass and length calibration, the app estimates impulse as `J = m·|Δv|`, using the largest change between consecutive velocity vectors (N·s). It does not identify contact events or measure force or contact duration. Tracking noise and ID switches can strongly affect this estimate.
- Calibration uses one image-scale ratio. Perspective, camera tilt, lens distortion, timing error, and measurement uncertainty are not corrected. Real-unit results can be inaccurate for depth motion or strong perspective changes.
- This is a background-subtraction baseline, not a trained object recognizer. A stationary camera, stable lighting, and clear contrast help. Occlusion, contact, similar foreground/background colors, shadows, and camera motion can cause missed detections, merged regions, or ID switches. Treat outputs as experimental estimates, not precision-instrument measurements.
