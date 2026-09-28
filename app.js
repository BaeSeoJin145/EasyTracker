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
  $('resetBtn').onclick = () => { if (analysis) return; tracks = []; samples = []; ctx.clearRect(0, 0, overlay.width, overlay.height); $('emptyOverlay').classList.remove('hidden'); $('videoBadge').textContent = 'READY'; $('metricStatus').textContent = '대기 중'; $('metricObjects').textContent = '—'; $('metricSpeed').textContent = '—'; $('metricAccel').textContent = '—'; $('resultsBody').innerHTML = '<tr class="placeholder"><td colspan="6">영상을 추가하고 분석을 시작하면 결과가 표시됩니다.</td></tr>'; $('downloadBtn').disabled = true; };
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
      const p = track.points.at(-1); if (!p) return;
      const x = p.x / work.width * overlay.width, y = p.y / work.height * overlay.height;
      const bw = p.w / work.width * overlay.width, bh = p.h / work.height * overlay.height;
      ctx.strokeStyle = track.color; ctx.lineWidth = Math.max(1.5, overlay.width / 800); ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
      ctx.fillStyle = track.color; ctx.font = `600 ${Math.max(11, overlay.width / 75)}px sans-serif`; ctx.fillText(`T${track.id}`, x + bw / 2 + 4, y - bh / 2);
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
    let distance = 0, maxSpeed = 0;
    for (let i = 1; i < pts.length; i++) { const dt = pts[i].t - pts[i - 1].t; const dx = (pts[i].x - pts[i - 1].x) * scale, dy = (pts[i].y - pts[i - 1].y) * scale; distance += Math.hypot(dx, dy); if (dt > 0) maxSpeed = Math.max(maxSpeed, Math.hypot(dx, dy) / dt); }
    const start = pts[0], sourceScale = scaleValue();
    const x = (start.x / work.width * video.videoWidth) * sourceScale, y = (start.y / work.height * video.videoHeight) * sourceScale;
    return { distance, maxSpeed, x, y };
  }
  function summarize() {
    let speed = 0, accels = [];
    tracks.forEach(t => { const s = trackStats(t); speed = Math.max(speed, s.maxSpeed); const pts = t.points; if (pts.length >= 4) { const sy = scaleValue() * video.videoHeight / work.height; const reg = regression(pts.map(p => [p.t, p.y * sy])); if (reg) accels.push(reg.a * 2); } });
    const unit = hasCalibration() ? 'cm/s' : 'px/s'; $('metricSpeed').textContent = speed ? speed.toFixed(1) : '—'; $('speedUnit').textContent = speed ? unit : '속도 계산 불가';
    const accel = accels.length ? accels.reduce((a, b) => a + b, 0) / accels.length : NaN;
    $('metricAccel').textContent = Number.isFinite(accel) ? `${accel.toFixed(1)} ${hasCalibration() ? 'cm' : 'px'}/s²` : '—';
  }
  function regression(points) {
    // y = a*t² + b*t + c; fit by solving the 3x3 normal equations.
    const m = [[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    points.forEach(([t,y]) => { const v = [t*t,t,1]; for(let r=0;r<3;r++){ for(let c=0;c<3;c++)m[r][c]+=v[r]*v[c]; m[r][3]+=v[r]*y; } });
    for(let i=0;i<3;i++){ let p=m[i][i]; if(Math.abs(p)<1e-9)return null; for(let c=i;c<4;c++)m[i][c]/=p; for(let r=0;r<3;r++)if(r!==i){const f=m[r][i];for(let c=i;c<4;c++)m[r][c]-=f*m[i][c];} }
    return {a:m[0][3],b:m[1][3],c:m[2][3]};
  }
  function renderResults() {
    if (!tracks.length) { $('resultsBody').innerHTML = '<tr class="placeholder"><td colspan="6">움직이는 대상을 검출하지 못했습니다. 대비와 민감도 설정을 확인하세요.</td></tr>'; return; }
    $('resultsBody').innerHTML = tracks.map((t, i) => { const s = trackStats(t), unit = hasCalibration() ? 'cm' : 'px', speedUnit = unit + '/s';
      return `<tr><td><span class="track-id" style="color:${t.color}">● T${i+1}</span></td><td>${t.points.length}</td><td>(${s.x.toFixed(1)}, ${s.y.toFixed(1)}) ${unit}</td><td>${s.distance.toFixed(1)} ${unit}</td><td>${s.maxSpeed.toFixed(1)} ${speedUnit}</td><td><span class="conf">${Math.min(99, Math.round(58 + t.points.length / Math.max(1, samples.length) * 40))}%</span></td></tr>`;
    }).join('');
  }
  $('downloadBtn').onclick = () => {
    const rows = [['track_id','time_s','frame_sample','x','y','width_px','height_px','speed','unit']];
    tracks.forEach((t, i) => t.points.forEach((p, j) => { const scale=scaleValue()*video.videoWidth/work.width, yScale=scaleValue()*video.videoHeight/work.height, unit=hasCalibration()?'cm':'px'; let speed=''; if(j){const q=t.points[j-1],dt=p.t-q.t;speed=dt>0?(Math.hypot((p.x-q.x)*scale,(p.y-q.y)*yScale)/dt).toFixed(4):'';} rows.push([`T${i+1}`,p.t.toFixed(4),p.frame,(p.x*scale).toFixed(3),(p.y*yScale).toFixed(3),p.w,p.h,speed,unit]); }));
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})); a.download='kinematic-tracks.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
})();
