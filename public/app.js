// ============================================================
// AI Grand Prix - Spectator Client
// ============================================================
(function () {
  'use strict';

  // ---- State ----
  var liveFeed = null;
  var trackData = null;
  var registeredBot = null;
  var prevCars = {};
  var renderedEventCount = 0;
  var ws = null;
  var reconnectDelay = 1000;
  var reconnectTimer = null;
  var MAX_RECONNECT = 16000;

  // ---- DOM refs ----
  var canvas = document.getElementById('trackCanvas');
  var ctx = canvas.getContext('2d');
  var sessionDot = document.getElementById('sessionDot');
  var sessionType = document.getElementById('sessionType');
  var weatherValue = document.getElementById('weatherValue');
  var lapValue = document.getElementById('lapValue');
  var elapsedValue = document.getElementById('elapsedValue');
  var scIndicator = document.getElementById('scIndicator');
  var spectatorCount = document.getElementById('spectatorCount');
  var connDot = document.getElementById('connDot');
  var leaderboardBody = document.getElementById('leaderboardBody');
  var eventFeed = document.getElementById('eventFeed');
  var noEvents = document.getElementById('noEvents');
  var modalOverlay = document.getElementById('modalOverlay');
  var stepRegister = document.getElementById('stepRegister');
  var stepUpload = document.getElementById('stepUpload');

  // ---- Utilities ----

  function formatLapTime(ms) {
    if (!ms || ms <= 0 || ms > 600000) return '--:--.---';
    var totalSec = ms / 1000;
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return min + ':' + sec.toFixed(3).padStart(6, '0');
  }

  function formatElapsed(ms) {
    if (!ms || ms <= 0) return '--:--';
    var totalSec = Math.floor(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  function weatherText(w) {
    return { dry: 'DRY', light_rain: 'LIGHT RAIN', heavy_rain: 'HEAVY RAIN' }[w] || '--';
  }

  function tyreLabel(c) {
    return { soft: 'S', medium: 'M', hard: 'H', wet: 'W' }[c] || '?';
  }

  function tyreCss(c) { return 'tyre-badge tyre-' + (c || 'medium'); }

  function eventEmoji(type) {
    return {
      overtake: '\u{1F3C1}', pit_stop: '\u{1F527}', incident: '\u26A0\uFE0F',
      weather_change: '\u{1F327}\uFE0F', safety_car: '\u{1F7E1}', safety_car_end: '\u{1F7E2}',
      lap_record: '\u{1F3C6}', finish: '\u{1F3C1}', join: '\u{1F4E5}',
      leave: '\u{1F4E4}', retirement: '\u274C', drs_enabled: '\u{1F7E2}'
    }[type] || '\u{1F4AC}';
  }

  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escAttr(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function lerpAngle(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
  }

  // ---- Fetch track data ----

  function fetchTrackData() {
    fetch('/api/tracks')
      .then(function (r) { return r.json(); })
      .then(function (tracks) {
        if (tracks && tracks.length > 0 && tracks[0].segments) {
          trackData = tracks[0];
          computeTrackTransform();
        }
      })
      .catch(function () { setTimeout(fetchTrackData, 3000); });
  }

  function fetchInitialFeed() {
    fetch('/api/track/live')
      .then(function (r) { return r.json(); })
      .then(function (feed) {
        if (feed) { liveFeed = feed; updateHeader(); updateLeaderboard(); updateEventFeed(); }
      })
      .catch(function () {});
  }

  // ---- WebSocket ----

  function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    setConn('connecting');
    try { ws = new WebSocket(proto + '//' + location.host + '/ws/live'); } catch (e) { scheduleReconnect(); return; }

    ws.onopen = function () { setConn('connected'); reconnectDelay = 1000; };
    ws.onmessage = function (evt) {
      try { onLiveFeed(JSON.parse(evt.data)); } catch (e) {}
    };
    ws.onclose = function () { setConn('disconnected'); scheduleReconnect(); };
    ws.onerror = function () { setConn('disconnected'); };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT);
      connectWS();
    }, reconnectDelay);
  }

  function setConn(state) {
    connDot.className = 'conn-dot ' + state;
    connDot.title = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting...' : 'Disconnected';
  }

  // ---- Live feed handler ----

  function onLiveFeed(feed) {
    if (liveFeed && liveFeed.cars) {
      var now = performance.now();
      for (var i = 0; i < liveFeed.cars.length; i++) {
        var c = liveFeed.cars[i];
        prevCars[c.id] = { x: c.x, y: c.y, angle: c.angle, time: now };
      }
    }
    liveFeed = feed;
    updateHeader();
    updateLeaderboard();
    updateEventFeed();
  }

  // ---- Header ----

  function updateHeader() {
    if (!liveFeed) return;
    var s = liveFeed.session;
    var isActive = s.status === 'active';
    sessionDot.className = 'session-dot' + (isActive ? ' live' : '');
    sessionType.textContent = (s.type || 'NONE').toUpperCase() + (isActive ? ' - LIVE' : ' - ' + (s.status || 'WAITING').toUpperCase());
    weatherValue.textContent = weatherText(s.weather);
    weatherValue.className = 'info-value weather-' + (s.weather || 'dry');

    if (s.totalLaps > 0) {
      var maxLap = 0;
      if (liveFeed.cars) for (var i = 0; i < liveFeed.cars.length; i++) if (liveFeed.cars[i].lap > maxLap) maxLap = liveFeed.cars[i].lap;
      lapValue.textContent = maxLap + ' / ' + s.totalLaps;
    } else {
      lapValue.textContent = 'FREE';
    }
    elapsedValue.textContent = formatElapsed(s.elapsedTime);
    scIndicator.className = 'sc-indicator' + (s.safetyCar ? ' visible' : '');
    spectatorCount.textContent = liveFeed.spectatorCount || 0;
  }

  // ---- Leaderboard ----

  function updateLeaderboard() {
    if (!liveFeed || !liveFeed.cars) return;
    var cars = liveFeed.cars;
    var rows = '';
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      var cls = (c.position === 1 ? ' leader' : '') + (c.retired ? ' retired' : '');
      rows += '<tr class="' + cls.trim() + '">' +
        '<td class="pos-cell">' + c.position + '</td>' +
        '<td><div class="driver-cell"><span class="team-dot" style="background:' + escAttr(c.teamColor) + '"></span>' +
        '<span class="driver-name" title="' + escAttr(c.botName) + '">' + escHtml(c.botName) + '</span></div></td>' +
        '<td class="time-cell">' + formatLapTime(c.lastLapTime) + '</td>' +
        '<td class="time-cell best">' + formatLapTime(c.bestLapTime) + '</td>' +
        '<td><span class="' + tyreCss(c.tyreCompound) + '">' + tyreLabel(c.tyreCompound) + '</span></td>' +
        '<td>' + c.pitStops + '</td>' +
        '<td class="gap-cell' + (c.position === 1 ? ' is-leader' : '') + '">' + escHtml(c.gap) + '</td></tr>';
    }
    leaderboardBody.innerHTML = rows;
  }

  // ---- Event feed ----

  function updateEventFeed() {
    if (!liveFeed || !liveFeed.recentEvents) return;
    var events = liveFeed.recentEvents;
    if (events.length === 0) return;
    if (events.length <= renderedEventCount) return;
    if (noEvents) noEvents.style.display = 'none';

    for (var i = renderedEventCount; i < events.length; i++) {
      var ev = events[i];
      var item = document.createElement('div');
      item.className = 'feed-item';
      item.innerHTML = '<span class="feed-time">' + formatElapsed(ev.time) + '</span>' +
        '<span class="feed-icon">' + eventEmoji(ev.type) + '</span>' +
        '<span class="feed-msg">' + escHtml(ev.message) + '</span>';
      eventFeed.appendChild(item);
    }
    renderedEventCount = events.length;
    eventFeed.scrollTop = eventFeed.scrollHeight;
  }

  // ---- Canvas: track transform ----

  var trackTx = { scale: 1, ox: 0, oy: 0 };

  function computeTrackTransform() {
    if (!trackData || !trackData.segments || trackData.segments.length === 0) return;
    var segs = trackData.segments;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i]; var hw = (s.width || 40) / 2;
      if (s.center.x - hw < minX) minX = s.center.x - hw;
      if (s.center.y - hw < minY) minY = s.center.y - hw;
      if (s.center.x + hw > maxX) maxX = s.center.x + hw;
      if (s.center.y + hw > maxY) maxY = s.center.y + hw;
    }
    if (trackData.pitLane && trackData.pitLane.path) {
      for (var j = 0; j < trackData.pitLane.path.length; j++) {
        var p = trackData.pitLane.path[j];
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
    }
    trackTx._minX = minX; trackTx._minY = minY;
    trackTx._maxX = maxX; trackTx._maxY = maxY;
    trackTx._tw = maxX - minX; trackTx._th = maxY - minY;
  }

  function fitTransform(cw, ch) {
    if (!trackTx._tw) return;
    var margin = 50;
    var sx = (cw - margin * 2) / trackTx._tw;
    var sy = (ch - margin * 2) / trackTx._th;
    trackTx.scale = Math.min(sx, sy);
    trackTx.ox = (cw - trackTx._tw * trackTx.scale) / 2 - trackTx._minX * trackTx.scale;
    trackTx.oy = (ch - trackTx._th * trackTx.scale) / 2 - trackTx._minY * trackTx.scale;
  }

  function tx(x, y) {
    return { x: x * trackTx.scale + trackTx.ox, y: y * trackTx.scale + trackTx.oy };
  }

  function segDir(segs, i) {
    var cur = segs[i]; var next = segs[(i + 1) % segs.length];
    var dx = next.center.x - cur.center.x;
    var dy = next.center.y - cur.center.y;
    var m = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx: dx / m, dy: dy / m };
  }

  function isInDRS(idx) {
    if (!trackData || !trackData.drsZones) return false;
    for (var z = 0; z < trackData.drsZones.length; z++) {
      var zone = trackData.drsZones[z];
      if (zone.startIndex <= zone.endIndex) {
        if (idx >= zone.startIndex && idx <= zone.endIndex) return true;
      } else {
        if (idx >= zone.startIndex || idx <= zone.endIndex) return true;
      }
    }
    return false;
  }

  // ---- Canvas: drawing ----

  function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function drawTrack(cw, ch) {
    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, cw, ch);

    if (!trackData || !trackData.segments || trackData.segments.length < 2) {
      ctx.fillStyle = '#333';
      ctx.font = '14px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading track...', cw / 2, ch / 2);
      return;
    }

    var segs = trackData.segments;
    var n = segs.length;

    // Build edges
    var left = [], right = [];
    for (var i = 0; i < n; i++) {
      var dir = segDir(segs, i);
      var nx = -dir.dy, ny = dir.dx;
      var hw = (segs[i].width || 40) / 2;
      left.push({ x: segs[i].center.x + nx * hw, y: segs[i].center.y + ny * hw });
      right.push({ x: segs[i].center.x - nx * hw, y: segs[i].center.y - ny * hw });
    }

    // Draw track segments as quads
    for (var i = 0; i < n; i++) {
      var ni = (i + 1) % n;
      var l1 = tx(left[i].x, left[i].y), l2 = tx(left[ni].x, left[ni].y);
      var r1 = tx(right[i].x, right[i].y), r2 = tx(right[ni].x, right[ni].y);

      var surface = segs[i].surface || 'tarmac';
      var fill = '#2a2a3a';
      if (surface === 'kerb') fill = '#6b3020';
      else if (surface === 'grass') fill = '#152015';
      else if (surface === 'gravel') fill = '#302818';

      var drs = isInDRS(i);
      if (drs && surface === 'tarmac') fill = '#1a3528';

      ctx.beginPath();
      ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y);
      ctx.lineTo(r2.x, r2.y); ctx.lineTo(r1.x, r1.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      if (drs) {
        ctx.strokeStyle = 'rgba(46,204,113,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Track borders
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var p = tx(left[i].x, left[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath(); ctx.stroke();

    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var p = tx(right[i].x, right[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath(); ctx.stroke();

    // Kerb stripes
    for (var i = 0; i < n; i++) {
      if (segs[i].surface === 'kerb') {
        var ni = (i + 1) % n;
        ctx.strokeStyle = (i % 2 === 0) ? '#e94560' : '#ffffff';
        ctx.lineWidth = 2.5;
        var l1 = tx(left[i].x, left[i].y), l2 = tx(left[ni].x, left[ni].y);
        ctx.beginPath(); ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y); ctx.stroke();
        var r1 = tx(right[i].x, right[i].y), r2 = tx(right[ni].x, right[ni].y);
        ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
      }
    }

    // Start/finish line
    var sfi = trackData.startFinishIndex || 0;
    var sl = tx(left[sfi].x, left[sfi].y);
    var sr = tx(right[sfi].x, right[sfi].y);
    ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sr.x, sr.y);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    // Checkers
    for (var s = 0; s < 6; s++) {
      var t = s / 6;
      if (s % 2 === 0) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(lerp(sl.x, sr.x, t) - 2, lerp(sl.y, sr.y, t) - 2, 4, 4);
      }
    }

    // Pit lane
    if (trackData.pitLane && trackData.pitLane.path && trackData.pitLane.path.length > 1) {
      ctx.beginPath();
      var pp = tx(trackData.pitLane.path[0].x, trackData.pitLane.path[0].y);
      ctx.moveTo(pp.x, pp.y);
      for (var i = 1; i < trackData.pitLane.path.length; i++) {
        pp = tx(trackData.pitLane.path[i].x, trackData.pitLane.path[i].y);
        ctx.lineTo(pp.x, pp.y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'center';
      var pIn = tx(trackData.pitLane.path[0].x, trackData.pitLane.path[0].y);
      ctx.fillText('PIT IN', pIn.x, pIn.y - 8);
      var pOut = tx(trackData.pitLane.path[trackData.pitLane.path.length - 1].x, trackData.pitLane.path[trackData.pitLane.path.length - 1].y);
      ctx.fillText('PIT OUT', pOut.x, pOut.y - 8);
    }

    // Track name watermark
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(trackData.name || '', 14, ch - 14);
  }

  function drawCars() {
    if (!liveFeed || !liveFeed.cars) return;
    var now = performance.now();

    for (var i = 0; i < liveFeed.cars.length; i++) {
      var car = liveFeed.cars[i];
      if (car.retired) continue;

      var dx = car.x, dy = car.y, da = car.angle;
      var prev = prevCars[car.id];
      if (prev) {
        var elapsed = now - prev.time;
        var t = Math.min(elapsed / 200, 1);
        dx = lerp(prev.x, car.x, t);
        dy = lerp(prev.y, car.y, t);
        da = lerpAngle(prev.angle, car.angle, t);
      }

      var pos = tx(dx, dy);
      var sc = trackTx.scale;
      var cl = Math.max(8, 12 * sc / 1.5);
      var cw = Math.max(4, 6 * sc / 1.5);

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(da);

      // Car body with glow
      ctx.shadowColor = car.teamColor || '#fff';
      ctx.shadowBlur = 6;
      ctx.fillStyle = car.teamColor || '#fff';
      ctx.fillRect(-cl / 2, -cw / 2, cl, cw);
      ctx.shadowBlur = 0;

      // Nose
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cl / 2, 0);
      ctx.lineTo(cl / 2 - 3, -cw / 2 + 1);
      ctx.lineTo(cl / 2 - 3, cw / 2 - 1);
      ctx.closePath();
      ctx.fill();

      // DRS light
      if (car.drsActive) {
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(-cl / 2, -cw / 2 - 2, cl, 2);
      }

      ctx.restore();

      // Labels
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(car.botName || '', pos.x, pos.y - cw - 5);

      ctx.fillStyle = car.teamColor || '#fff';
      ctx.font = 'bold 9px Consolas, monospace';
      ctx.fillText('P' + car.position, pos.x, pos.y + cw + 11);
    }
  }

  // ---- Render loop ----

  function renderFrame() {
    var size = resizeCanvas();
    fitTransform(size.w, size.h);
    drawTrack(size.w, size.h);
    drawCars();
    requestAnimationFrame(renderFrame);
  }

  // ---- Modal / Registration ----

  function openModal() {
    var savedKey = localStorage.getItem('aigp_apiKey');
    var savedBotId = localStorage.getItem('aigp_botId');
    if (savedKey && savedBotId) {
      registeredBot = { botId: savedBotId, apiKey: savedKey };
      showStep('upload');
      document.getElementById('apiKeyValue').textContent = savedKey;
    } else {
      showStep('register');
    }
    modalOverlay.classList.add('visible');
  }

  function closeModal() {
    modalOverlay.classList.remove('visible');
  }

  function showStep(step) {
    stepRegister.classList.remove('active');
    stepUpload.classList.remove('active');
    (step === 'register' ? stepRegister : stepUpload).classList.add('active');
  }

  function handleRegister() {
    var name = document.getElementById('botName').value.trim();
    var team = document.getElementById('teamName').value.trim();
    var color = document.getElementById('teamColor').value;
    var errEl = document.getElementById('registerError');
    var btn = document.getElementById('btnRegister');

    if (!name || !team) {
      errEl.textContent = 'Bot name and team name are required.';
      errEl.classList.add('visible');
      return;
    }
    errEl.classList.remove('visible');
    btn.disabled = true; btn.textContent = 'Registering...';

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, team: team, teamColor: color })
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.data.error || 'Registration failed');
      localStorage.setItem('aigp_apiKey', res.data.apiKey);
      localStorage.setItem('aigp_botId', res.data.botId);
      registeredBot = { botId: res.data.botId, apiKey: res.data.apiKey };
      document.getElementById('apiKeyValue').textContent = res.data.apiKey;
      showStep('upload');
    })
    .catch(function (e) {
      errEl.textContent = e.message || 'Registration failed.';
      errEl.classList.add('visible');
    })
    .finally(function () {
      btn.disabled = false; btn.textContent = 'Register Bot';
    });
  }

  function handleDeploy() {
    if (!registeredBot) return;
    var code = document.getElementById('driverCode').value.trim();
    var errEl = document.getElementById('uploadError');
    var successEl = document.getElementById('deploySuccess');
    var btn = document.getElementById('btnDeploy');

    if (!code) {
      errEl.textContent = 'Please enter your driver code.';
      errEl.classList.add('visible');
      return;
    }
    errEl.classList.remove('visible');
    successEl.classList.remove('visible');
    btn.disabled = true; btn.textContent = 'Deploying...';

    fetch('/api/bot/' + registeredBot.botId + '/driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': registeredBot.apiKey },
      body: JSON.stringify({ code: code })
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.data.error || 'Upload failed');
      return fetch('/api/bot/' + registeredBot.botId + '/join-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': registeredBot.apiKey }
      });
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.data.error || 'Failed to join practice');
      successEl.classList.add('visible');
    })
    .catch(function (e) {
      errEl.textContent = e.message || 'Deployment failed.';
      errEl.classList.add('visible');
    })
    .finally(function () {
      btn.disabled = false; btn.textContent = 'Deploy Bot';
    });
  }

  // ---- Event listeners ----

  document.getElementById('btnJoin').addEventListener('click', openModal);
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnCloseModal2').addEventListener('click', closeModal);
  document.getElementById('btnRegister').addEventListener('click', handleRegister);
  document.getElementById('btnDeploy').addEventListener('click', handleDeploy);
  modalOverlay.addEventListener('click', function (e) { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  // ---- Init ----

  fetchTrackData();
  fetchInitialFeed();
  connectWS();
  requestAnimationFrame(renderFrame);

})();
