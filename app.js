(() => {
  const $ = id => document.getElementById(id);
  const video = $('video'), overlay = $('overlay'), ctx = overlay.getContext('2d');
  const work = $('workCanvas'), wctx = work.getContext('2d', { willReadFrequently: true });
  let fileUrl = '', selectedShape = 'any', tracks = [], analysis = false, frameNo = 0, samples = [], lastRender = 0;
  const COLORS = ['#c8f169', '#74d9be', '#ffbe70', '#a69bff', '#ff7f9d', '#72baff', '#e0dc79', '#ec9bfa'];

  document.querySelectorAll('.shape').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.shape').forEach(b => b.classList.remove('active'));
    button.classList.add('active'); selectedShape = button.dataset.shape;
  }));
  $('threshold').addEventListener('input', e => $('thresholdValue').textContent = e.target.value);
  $('chooseBtn').onclick = () => $('fileInput').click();
  $('dropzone').addEventListener('click', e => { if (e.target === $('dropzone')) $('fileInput').click(); });
  $('fileInput').addEventListener('change', e => { if (e.target.files[0]) loadVideo(e.target.files[0]); });
  ['dragenter', 'dragover'].forEach(type => $('dropzone').addEventListener(type, e => { e.preventDefault(); $('dropzone').classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => $('dropzone').addEventListener(type, e => { e.preventDefault(); $('dropzone').classList.remove('dragging'); }));
  $('dropzone').addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(x => x.type.startsWith('video/')); if (f) loadVideo(f); });
  function loadVideo(file) {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(file); video.src = fileUrl; video.load(); $('dropzone').classList.add('hidden'); $('player').classList.remove('hidden');
    $('analyzeBtn').disabled = true; $('metricStatus').textContent = '영상 읽는 중'; $('videoBadge').textContent = 'LOADING';
  }
  video.addEventListener('loadedmetadata', () => {
    overlay.width = video.videoWidth; overlay.height = video.videoHeight;
    $('analyzeBtn').disabled = false; $('metricStatus').textContent = '준비 완료'; $('videoBadge').textContent = 'READY'; updateClock(); draw();
  });
  $('playBtn').onclick = () => video.paused ? video.play() : video.pause();
  video.addEventListener('play', () => $('playBtn').textContent = 'Ⅱ'); video.addEventListener('pause', () => $('playBtn').textContent = '▶');
  $('seek').addEventListener('input', e => { if (video.duration) video.currentTime = video.duration * (+e.target.value / 1000); });
  video.addEventListener('timeupdate', updateClock);
  video.addEventListener('volumechange', () => $('muteBtn').textContent = video.muted ? '×' : '◖');
  $('muteBtn').onclick = () => video.muted = !video.muted;
  $('fullscreenBtn').onclick = () => $('player').requestFullscreen?.();
  $('resetBtn').onclick = () => { if (analysis) return; tracks = []; samples = []; ctx.clearRect(0, 0, overlay.width, overlay.height); $('emptyOverlay').classList.remove('hidden'); $('videoBadge').textContent = 'READY'; $('metricStatus').textContent = '대기 중'; $('metricObjects').textContent = '—'; $('metricSpeed').textContent = '—'; $('metricAccel').textContent = '—'; $('metricImpulse').textContent = '—'; $('metricTracking').textContent = '—'; $('speedUnit').textContent = '분석 후 계산'; $('accelUnit').textContent = '화면 y축 양수 · 포물선 근사'; $('impulseUnit').textContent = '질량 입력 필요'; $('resultsBody').innerHTML = '<tr class="placeholder"><td colspan="6">영상을 추가하고 분석을 시작하면 결과가 표시됩니다.</td></tr>'; $('downloadBtn').disabled = true; };
  function updateClock() {
    const t = video.currentTime || 0, d = video.duration || 0;
    $('timeLabel').textContent = `${stamp(t)} / ${stamp(d)}`; $('seek').value = d ? t / d * 1000 : 0;
    $('timelineProgress').style.width = `${d ? t / d * 100 : 0}%`; $('timelineDot').style.left = `${d ? t / d * 100 : 0}%`;
    $('frameLabel').textContent = `${Math.floor(t * (video.getVideoPlaybackQuality?.().totalVideoFrames / d || 30))} / ${Math.floor(d * 30)}`;
    if (!video.paused && performance.now() - lastRender > 50) draw();
  }
  function stamp(s) { const m = Math.floor(s / 60), sec = s % 60; return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`; }
  function draw() {
    if (!overlay.width || !video.videoWidth) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if ($('showTrail').checked) tracks.forEach(track => {
      if (track.points.length < 2) return;
      ctx.beginPath(); track.points.forEach((p, i) => { const x = p.x / work.width * overlay.width, y = p.y / work.height * overlay.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = track.color + 'b8'; ctx.lineWidth = Math.max(2, overlay.width / 650); ctx.stroke();
    });
    tracks.forEach(track => {
      const p = track.points.reduce((best, point) => Math.abs(point.t - video.currentTime) < Math.abs(best.t - video.currentTime) ? point : best, track.points[0]); if (!p) return;
      const x = p.x / work.width * overlay.width, y = p.y / work.height * overlay.height;
      const bw = p.w / work.width * overlay.width, bh = p.h / work.height * overlay.height;
      ctx.fillStyle = track.color + '18'; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
      ctx.strokeStyle = track.color; ctx.lineWidth = Math.max(2.5, overlay.width / 420); ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
      const fontSize = Math.max(12, overlay.width / 65); ctx.font = `700 ${fontSize}px sans-serif`;
      const sourcePx = video.videoWidth / work.width, physical = hasCalibration() ? ` · ${(p.w * sourcePx * scaleValue()).toFixed(1)}×${(p.h * sourcePx * scaleValue()).toFixed(1)} cm` : '';
      const label = `T${track.id}  ${Math.round(p.w * sourcePx)}×${Math.round(p.h * sourcePx)} px${physical}`;
      const labelW = ctx.measureText(label).width + 12, labelH = fontSize + 8, labelX = Math.max(0, Math.min(overlay.width - labelW, x - bw / 2));
      const labelY = Math.max(labelH, y - bh / 2);
      ctx.fillStyle = track.color; ctx.fillRect(labelX, labelY - labelH, labelW, labelH);
      ctx.fillStyle = '#101513'; ctx.fillText(label, labelX + 6, labelY - 5);
      ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, overlay.width / 250), 0, Math.PI * 2); ctx.fill();
    }); lastRender = performance.now();
  }

  $('analyzeBtn').onclick = async () => {
    if (analysis || !video.duration) return;
    const wasPlaying = !video.paused;
    video.pause();
    analysis = true; $('analyzeBtn').disabled = true; $('analyzeBtn').innerHTML = '<span>◌</span> 분석 중… <b>⏳</b>';
    $('metricStatus').textContent = '배경 모델 구성'; $('videoBadge').textContent = 'ANALYZING'; $('emptyOverlay').classList.add('hidden');
    tracks = []; samples = []; frameNo = 0; $('resultsBody').innerHTML = '<tr class="placeholder"><td colspan="6">영상 프레임을 분석하고 있습니다…</td></tr>';
    const originalTime = video.currentTime, duration = video.duration;
    const targetW = Math.min(600, video.videoWidth), targetH = Math.max(1, Math.round(video.videoHeight * targetW / video.videoWidth));
    work.width = targetW; work.height = targetH;
    const sampleStep = Math.max(1 / 30, duration / 420), times = [];
    for (let t = 0; t < duration; t += sampleStep) times.push(t);
    samples = times;
    if (times.length < 2) times.push(duration * .9);
    const bgCount = Math.min(7, times.length);
    const bgTimes = Array.from({ length: bgCount }, (_, i) => times[Math.round(i * (times.length - 1) / Math.max(1, bgCount - 1))]);
    let backgrounds = [];
    try {
      for (const t of bgTimes) { await seekTo(t); wctx.drawImage(video, 0, 0, targetW, targetH); backgrounds.push(wctx.getImageData(0, 0, targetW, targetH).data); }
      const background = medianBackground(backgrounds, targetW * targetH);
      $('metricStatus').textContent = '움직임 검출 중'; const maxFrames = times.length;
      for (let ti = 0; ti < maxFrames; ti++) {
        await seekTo(times[ti]); wctx.drawImage(video, 0, 0, targetW, targetH);
        const image = wctx.getImageData(0, 0, targetW, targetH); const components = detect(image.data, background, targetW, targetH);
        const filtered = filterComponents(components, targetW, targetH);
        linkDetections(filtered, times[ti], ti);
        if (ti % 8 === 0 || ti === maxFrames - 1) {
          $('metricStatus').textContent = `분석 중 ${Math.round((ti + 1) / maxFrames * 100)}%`;
          $('qualityBar').style.width = `${(ti + 1) / maxFrames * 100}%`; $('frameLabel').textContent = `${ti + 1} / ${maxFrames}`;
          draw(); await new Promise(r => requestAnimationFrame(r));
        }
      }
      tracks = tracks.filter(t => t.points.length >= 3).sort((a, b) => b.points.length - a.points.length).slice(0, 12);
      tracks.forEach((t, i) => t.color = COLORS[i % COLORS.length]);
      await seekTo(originalTime); analysis = false; $('analyzeBtn').disabled = false; $('analyzeBtn').innerHTML = '<span>↻</span> 다시 분석 <b>↗</b>';
      $('videoBadge').textContent = 'COMPLETE'; $('metricStatus').textContent = tracks.length ? '분석 완료' : '대상 미검출'; $('qualityBar').style.width = tracks.length ? '100%' : '0%';
      $('metricObjects').textContent = tracks.length; $('downloadBtn').disabled = !tracks.length; $('resultCount').textContent = `${tracks.length} tracks`;
      renderResults(); summarize(); draw(); if (wasPlaying) video.play();
    } catch (err) {
      console.error(err); analysis = false; $('analyzeBtn').disabled = false; $('metricStatus').textContent = '분석 오류'; $('videoBadge').textContent = 'ERROR';
    }
  };
  function seekTo(t) { return new Promise(resolve => {
    if (Math.abs(video.currentTime - t) < .001) {
      if (video.readyState >= 2) return resolve();
      video.addEventListener('loadeddata', resolve, { once: true }); return;
    }
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done); video.currentTime = Math.min(t, Math.max(0, video.duration - .001));
  }); }
  function medianBackground(frames, count) {
    const out = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) { const vals = frames.map(f => f[i * 4 + c]).sort((a, b) => a - b); out[i * 3 + c] = vals[vals.length >> 1]; }
    return out;
  }
  function detect(data, bg, width, height) {
    const n = width * height, threshold = +$('threshold').value, mask = new Uint8Array(n), visited = new Uint8Array(n);
    for (let i = 0, k = 0; i < n; i++, k += 4) { const b = i * 3; const delta = (Math.abs(data[k] - bg[b]) + Math.abs(data[k + 1] - bg[b + 1]) + Math.abs(data[k + 2] - bg[b + 2])) / 3; if (delta > threshold) mask[i] = 1; }
    const queue = new Int32Array(n), out = [], minArea = Math.max(4, +$('minArea').value);
    for (let i = 0; i < n; i++) {
      if (!mask[i] || visited[i]) continue;
      let head = 0, tail = 0, sumX = 0, sumY = 0, minX = width, minY = height, maxX = 0, maxY = 0;
      queue[tail++] = i; visited[i] = 1;
      while (head < tail) {
        const q = queue[head++], x = q % width, y = (q / width) | 0; sumX += x; sumY += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue; const ni = ny * width + nx; if (mask[ni] && !visited[ni]) { visited[ni] = 1; queue[tail++] = ni; } }
      }
      if (tail >= minArea) out.push({ x: sumX / tail, y: sumY / tail, area: tail, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
    return out;
  }
  function filterComponents(comps, width, height) {
    const maxArea = width * height * .24;
    return comps.filter(c => c.area <= maxArea && (selectedShape === 'any' || (selectedShape === 'circle' ? Math.min(c.w, c.h) / Math.max(c.w, c.h) > .55 : Math.max(c.w, c.h) / Math.max(1, Math.min(c.w, c.h)) > 2.1)))
      .sort((a, b) => b.area - a.area).slice(0, Math.max(1, +$('maxObjects').value));
  }
  function linkDetections(detections, time, idx) {
    const maxJump = Math.max(18, work.width * .13), used = new Set();
    for (const d of detections) {
      let best = null, bestDist = maxJump;
      for (const t of tracks) { if (used.has(t.id) || idx - t.lastFrame > 4) continue; const p = t.points.at(-1); const dt = Math.max(1, idx - t.lastFrame); const px = p.x + (t.vx || 0) * dt, py = p.y + (t.vy || 0) * dt; const dist = Math.hypot(d.x - px, d.y - py); if (dist < bestDist) { best = t; bestDist = dist; } }
      if (!best) { best = { id: tracks.length + 1, points: [], color: COLORS[tracks.length % COLORS.length], lastFrame: idx, vx: 0, vy: 0 }; tracks.push(best); }
      else { const p = best.points.at(-1), dt = Math.max(.001, time - p.t); best.vx = (d.x - p.x) / dt * samplePeriod(); best.vy = (d.y - p.y) / dt * samplePeriod(); }
      used.add(best.id); best.points.push({ ...d, t: time, frame: idx }); best.lastFrame = idx;
    }
  }
  function samplePeriod() { return Math.max(1 / 30, video.duration / 420); }
  // Calibration length is entered in source-video pixels; detections use the smaller work canvas.
  function hasCalibration() { return +$('knownLength').value > 0 && +$('pixelLength').value > 0; }
  function scaleValue() { const cm = +$('knownLength').value, px = +$('pixelLength').value; return hasCalibration() ? cm / px : 1; }
  function trackStats(t) {
    const pts = t.points, scale = scaleValue() * video.videoWidth / work.width;
    let distance = 0, maxSpeed = 0, maxDeltaV = 0, priorVelocity = null;
    for (let i = 1; i < pts.length; i++) { const dt = pts[i].t - pts[i - 1].t; const dx = (pts[i].x - pts[i - 1].x) * scale, dy = (pts[i].y - pts[i - 1].y) * scale; distance += Math.hypot(dx, dy); if (dt > 0) { const v = { x: dx / dt, y: dy / dt }; maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y)); if (priorVelocity) maxDeltaV = Math.max(maxDeltaV, Math.hypot(v.x-priorVelocity.x, v.y-priorVelocity.y)); priorVelocity = v; } }
    const start = pts[0], sourceScale = scaleValue();
    const x = (start.x / work.width * video.videoWidth) * sourceScale, y = (start.y / work.height * video.videoHeight) * sourceScale;
    return { distance, maxSpeed, maxDeltaV, x, y };
  }
  function trackStatsRaw(t) {
    const pts = t.points, sx = video.videoWidth / work.width, sy = video.videoHeight / work.height;
    let distance = 0, maxSpeed = 0;
    for (let i = 1; i < pts.length; i++) { const dt = pts[i].t - pts[i - 1].t, dx = (pts[i].x - pts[i - 1].x) * sx, dy = (pts[i].y - pts[i - 1].y) * sy; distance += Math.hypot(dx, dy); if (dt > 0) maxSpeed = Math.max(maxSpeed, Math.hypot(dx, dy) / dt); }
    return { distance, maxSpeed, x: pts[0].x * sx, y: pts[0].y * sy };
  }
  function physicalPair(cm, perSecond = '') { return `${cm.toFixed(1)} cm${perSecond}${Math.abs(cm) >= 100 ? ` · ${(cm / 100).toFixed(2)} m${perSecond}` : ''}`; }
  function summarize() {
    let speed = 0, pixelSpeed = 0, accels = [], pixelAccels = [];
    tracks.forEach(t => { const s = trackStats(t); speed = Math.max(speed, s.maxSpeed); const raw = trackStatsRaw(t); pixelSpeed = Math.max(pixelSpeed, raw.maxSpeed); const pts = t.points; if (pts.length >= 4) { const reg = regression(pts.map(p => [p.t, p.y * scaleValue() * video.videoHeight / work.height])); const rawReg = regression(pts.map(p => [p.t, p.y * video.videoHeight / work.height])); if (reg) accels.push(reg.a * 2); if (rawReg) pixelAccels.push(rawReg.a * 2); } });
    $('metricSpeed').textContent = tracks.length ? (hasCalibration() ? physicalPair(speed, '/s') : `${pixelSpeed.toFixed(1)} px/s`) : '—';
    $('speedUnit').textContent = hasCalibration() ? `픽셀 환산 ${pixelSpeed.toFixed(1)} px/s` : '실제 단위는 길이 보정 필요';
    const accel = accels.length ? accels.reduce((a, b) => a + b, 0) / accels.length : NaN;
    $('metricAccel').textContent = Number.isFinite(accel) ? (hasCalibration() ? physicalPair(accel, '/s²') : `${accel.toFixed(1)} px/s²`) : '—';
    const pixelAccel = pixelAccels.length ? pixelAccels.reduce((a, b) => a + b, 0) / pixelAccels.length : NaN;
    $('accelUnit').textContent = hasCalibration() ? `픽셀 환산 ${Number.isFinite(pixelAccel) ? `${pixelAccel.toFixed(1)} px/s²` : '계산 불가'}` : '화면 y축 양수 · 포물선 근사';
    const mass = +$('massKg').value;
    if (mass > 0 && hasCalibration()) { const impulse = Math.max(0, ...tracks.map(t => trackStats(t).maxDeltaV * mass / 100)); $('metricImpulse').textContent = `${impulse.toFixed(3)} N·s`; $('impulseUnit').textContent = '최대 |m·Δv| 추정'; }
    else { $('metricImpulse').textContent = '—'; $('impulseUnit').textContent = mass > 0 ? '길이 보정도 필요' : '질량 입력 필요'; }
    const continuity = tracks.length ? Math.round(100 * tracks.reduce((sum, t) => sum + t.points.length / Math.max(1, t.points.at(-1).frame - t.points[0].frame + 1), 0) / tracks.length) : NaN;
    $('metricTracking').textContent = Number.isFinite(continuity) ? `${continuity}%` : '—';
  }
  $('massKg').addEventListener('input', () => { if (tracks.length && !analysis) summarize(); });
  function regression(points) {
    // y = a*t² + b*t + c; fit by solving the 3x3 normal equations.
    const m = [[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    points.forEach(([t,y]) => { const v = [t*t,t,1]; for(let r=0;r<3;r++){ for(let c=0;c<3;c++)m[r][c]+=v[r]*v[c]; m[r][3]+=v[r]*y; } });
    for(let i=0;i<3;i++){ let p=m[i][i]; if(Math.abs(p)<1e-9)return null; for(let c=i;c<4;c++)m[i][c]/=p; for(let r=0;r<3;r++)if(r!==i){const f=m[r][i];for(let c=i;c<4;c++)m[r][c]-=f*m[i][c];} }
    return {a:m[0][3],b:m[1][3],c:m[2][3]};
  }
  function renderResults() {
    if (!tracks.length) { $('resultsBody').innerHTML = '<tr class="placeholder"><td colspan="6">움직이는 대상을 검출하지 못했습니다. 대비와 민감도 설정을 확인하세요.</td></tr>'; return; }
    $('resultsBody').innerHTML = tracks.map((t, i) => { const s = trackStats(t), px = trackStatsRaw(t), coverage = Math.round(100 * t.points.length / Math.max(1, t.points.at(-1).frame - t.points[0].frame + 1));
      const position = hasCalibration() ? `<span class="value-main">(${s.x.toFixed(1)}, ${s.y.toFixed(1)}) cm</span><small>(${px.x.toFixed(0)}, ${px.y.toFixed(0)}) px</small>` : `(${px.x.toFixed(0)}, ${px.y.toFixed(0)}) px`;
      const distance = hasCalibration() ? `<span class="value-main">${physicalPair(s.distance)}</span><small>${px.distance.toFixed(1)} px</small>` : `${px.distance.toFixed(1)} px`;
      const speed = hasCalibration() ? `<span class="value-main">${physicalPair(s.maxSpeed, '/s')}</span><small>${px.maxSpeed.toFixed(1)} px/s</small>` : `${px.maxSpeed.toFixed(1)} px/s`;
      return `<tr><td><span class="track-id" style="color:${t.color}">● T${i+1}</span></td><td>${t.points.length}</td><td>${position}</td><td>${distance}</td><td>${speed}</td><td><span class="conf">${coverage}%</span></td></tr>`;
    }).join('');
  }
  ['knownLength', 'pixelLength'].forEach(id => $(id).addEventListener('input', () => { if (tracks.length && !analysis) { renderResults(); summarize(); draw(); } }));
  $('downloadBtn').onclick = () => {
    const rows = [['track_id','time_s','frame_sample','x_px','y_px','x_cm','y_cm','box_width_work_px','box_height_work_px','speed','acceleration_y','impulse_magnitude','physical_unit']];
    tracks.forEach((t, i) => t.points.forEach((p, j) => { const pxScale=video.videoWidth/work.width, pyScale=video.videoHeight/work.height, scale=scaleValue(), yScale=scale*pyScale, unit=hasCalibration()?'cm':'px'; let speed='', acceleration='', impulse=''; if(j){const q=t.points[j-1],dt=p.t-q.t;speed=dt>0?(Math.hypot((p.x-q.x)*pxScale*scale,(p.y-q.y)*pyScale*scale)/dt).toFixed(4):''; if(j>1){const r=t.points[j-2],dt0=q.t-r.t,dt1=p.t-q.t;if(dt0>0&&dt1>0){const vx0=(q.x-r.x)*pxScale*scale/dt0,vy0=(q.y-r.y)*yScale/dt0,vx1=(p.x-q.x)*pxScale*scale/dt1,vy1=(p.y-q.y)*yScale/dt1;acceleration=((vy1-vy0)/((dt0+dt1)/2)).toFixed(4);const mass=+$('massKg').value;if(mass>0&&hasCalibration())impulse=(mass*Math.hypot(vx1-vx0,vy1-vy0)/100).toFixed(6);}}} rows.push([`T${i+1}`,p.t.toFixed(4),p.frame,(p.x*pxScale).toFixed(3),(p.y*pyScale).toFixed(3),hasCalibration()?(p.x*pxScale*scale).toFixed(3):'',hasCalibration()?(p.y*pyScale*scale).toFixed(3):'',p.w,p.h,speed,acceleration,impulse,unit]); }));
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})); a.download='kinematic-tracks.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
})();
