
const STORE = {
  STAFF: 'staffAttendancePwa_staff',
  TODAY: 'staffAttendancePwa_today',
  APP: 'staffAttendancePwa_app',
  QUEUE: 'staffAttendancePwa_queue',
  DEVICE: 'staffAttendancePwa_device'
};

let staff = [];
let today = [];
let appMeta = {};
let selectedStaffId = '';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function proper(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getQueue() {
  try { return JSON.parse(localStorage.getItem(STORE.QUEUE) || '[]'); }
  catch (_) { return []; }
}

function setQueue(q) {
  localStorage.setItem(STORE.QUEUE, JSON.stringify(q));
  renderConnectivity();
  renderQueue();
}

function deviceId() {
  let id = localStorage.getItem(STORE.DEVICE);
  if (!id) {
    id = 'PWA-' + cryptoRandom();
    localStorage.setItem(STORE.DEVICE, id);
  }
  return id;
}

function cryptoRandom() {
  if (window.crypto && crypto.getRandomValues) {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return Array.from(a).map(x => x.toString(16)).join('');
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function callbackName() {
  return '__pwa_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function jsonp(params, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes('PASTE_YOUR')) {
      reject(new Error('Apps Script URL is not configured in config.js.'));
      return;
    }

    const cb = callbackName();
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Server connection timed out.'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }

    window[cb] = data => {
      cleanup();
      resolve(data);
    };

    const qs = new URLSearchParams({
      ...params,
      callback: cb,
      _: Date.now().toString()
    });

    script.onerror = () => {
      cleanup();
      reject(new Error('Could not reach attendance server.'));
    };

    script.src = GAS_WEB_APP_URL + '?' + qs.toString();
    document.head.appendChild(script);
  });
}

function showNotice(message, type='ok') {
  const el = document.getElementById('notice');
  el.className = 'notice show ' + type;
  el.textContent = message;
  setTimeout(() => {
    el.className = 'notice';
  }, 5000);
}

function cacheBootstrap(data) {
  appMeta = data.app || {};
  staff = Array.isArray(data.staff) ? data.staff : [];
  today = Array.isArray(data.today) ? data.today : [];
  localStorage.setItem(STORE.APP, JSON.stringify(appMeta));
  localStorage.setItem(STORE.STAFF, JSON.stringify(staff));
  localStorage.setItem(STORE.TODAY, JSON.stringify(today));
}

function loadCache() {
  try { appMeta = JSON.parse(localStorage.getItem(STORE.APP) || '{}'); } catch(_) {}
  try { staff = JSON.parse(localStorage.getItem(STORE.STAFF) || '[]'); } catch(_) {}
  try { today = JSON.parse(localStorage.getItem(STORE.TODAY) || '[]'); } catch(_) {}
}

function renderHeader() {
  document.getElementById('institutionName').textContent =
    appMeta.institutionName || 'Staff Attendance';
  document.getElementById('orgUnit').textContent =
    appMeta.organizationalUnit || 'Offline Attendance Console';
  document.getElementById('officialHours').textContent =
    'Official: ' +
    (appMeta.officialTimeIn || '--:--') +
    ' - ' +
    (appMeta.officialTimeOut || '--:--');
}

function renderConnectivity() {
  const online = navigator.onLine;
  const badge = document.getElementById('connBadge');
  badge.textContent = online ? '● ONLINE' : '● OFFLINE';
  badge.classList.toggle('offline', !online);

  const q = getQueue();
  const pending = document.getElementById('pendingBadge');
  pending.textContent = q.length + ' pending';
  pending.classList.toggle('pending', q.length > 0);
}

function activeStaffList() {
  return staff.filter(s =>
    String(s.status || '').toLowerCase() !== 'inactive'
  );
}

function renderStaff(filter='') {
  const box = document.getElementById('staffList');
  const q = filter.trim().toLowerCase();

  const rows = activeStaffList().filter(s => {
    const hay = [
      s.staffId,
      s.staffName,
      s.department,
      s.position
    ].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });

  box.innerHTML = rows.length ? rows.map(s => `
    <button class="staff-item ${selectedStaffId === s.staffId ? 'selected' : ''}"
      onclick="selectStaff('${esc(s.staffId)}')">
      <strong>${esc(s.staffName || s.staffId)}</strong>
      <span class="muted">${esc(s.staffId)} · ${esc(s.department || '')}</span>
    </button>
  `).join('') : '<div class="muted">No matching staff.</div>';
}

function mergedAttendanceFor(staffId) {
  const server = today.find(r => String(r.staffId) === String(staffId));
  const q = getQueue()
    .filter(e => String(e.staffId) === String(staffId))
    .sort((a,b) => new Date(a.eventTime) - new Date(b.eventTime));

  const result = server ? {...server} : {
    staffId,
    timeIn: '',
    timeOut: '',
    hoursWorked: '',
    overallStatus: 'Not Recorded'
  };

  for (const e of q) {
    const t = new Date(e.eventTime);
    const time = t.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    if (e.action === 'TIME_IN' && !result.timeIn) {
      result.timeIn = time;
      result.overallStatus = 'Pending Sync';
    }
    if (e.action === 'TIME_OUT' && !result.timeOut) {
      result.timeOut = time;
      result.overallStatus = 'Pending Sync';
    }
  }
  return result;
}

function selectStaff(id) {
  selectedStaffId = id;
  renderStaff(document.getElementById('search').value);
  renderSelected();
}

function renderSelected() {
  const panel = document.getElementById('selectedPanel');
  const s = staff.find(x => String(x.staffId) === String(selectedStaffId));

  if (!s) {
    panel.innerHTML = '<div class="muted">Select a staff member.</div>';
    return;
  }

  const a = mergedAttendanceFor(s.staffId);
  const status = proper(a.overallStatus || 'Not Recorded');
  const lateClass = status.toLowerCase() === 'late' ? 'status-late' : '';
  const canIn = !a.timeIn;
  const canOut = !!a.timeIn && !a.timeOut;

  panel.innerHTML = `
    <h2>${esc(s.staffName || s.staffId)}</h2>
    <div class="info-grid">
      <div class="muted">Staff ID</div><strong>${esc(s.staffId)}</strong>
      <div class="muted">Department</div><strong>${esc(s.department || '')}</strong>
      <div class="muted">Position</div><strong>${esc(s.position || '')}</strong>
      <div class="muted">Status</div><strong>${esc(proper(s.status || 'Active'))}</strong>
    </div>

    <div class="att-box">
      <div class="muted"><strong>TODAY'S ATTENDANCE</strong></div>
      <h2 class="${lateClass}" style="margin:8px 0 12px">${esc(status)}</h2>
      <div class="info-grid" style="margin:0">
        <div class="muted">Time In</div><strong>${esc(a.timeIn || '--')}</strong>
        <div class="muted">Time Out</div><strong>${esc(a.timeOut || '--')}</strong>
        <div class="muted">Hours Worked</div><strong>${esc(a.hoursWorked || '--')}</strong>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-in" ${canIn ? '' : 'disabled'}
        onclick="recordAction('TIME_IN')">✓ Record Time In</button>
      <button class="btn btn-out" ${canOut ? '' : 'disabled'}
        onclick="recordAction('TIME_OUT')">✓ Record Time Out</button>
    </div>
  `;
}

function recordAction(action) {
  const s = staff.find(x => String(x.staffId) === String(selectedStaffId));
  if (!s) return;

  const current = mergedAttendanceFor(s.staffId);
  if (action === 'TIME_IN' && current.timeIn) {
    showNotice('Time In is already recorded for this staff member.', 'warn');
    return;
  }
  if (action === 'TIME_OUT' && (!current.timeIn || current.timeOut)) {
    showNotice('Time Out is not currently available.', 'warn');
    return;
  }

  const event = {
    clientEventId: 'EVT-' + cryptoRandom() + '-' + Date.now(),
    staffId: s.staffId,
    staffName: s.staffName || '',
    action,
    eventTime: new Date().toISOString(),
    deviceId: deviceId(),
    createdOffline: !navigator.onLine
  };

  const q = getQueue();
  q.push(event);
  setQueue(q);
  renderSelected();

  showNotice(
    (action === 'TIME_IN' ? 'Time In' : 'Time Out') +
    ' saved on this device.' +
    (navigator.onLine ? ' Synchronizing…' : ' It will synchronize when internet returns.'),
    navigator.onLine ? 'ok' : 'warn'
  );

  if (navigator.onLine) {
    syncQueue();
  }
}

async function refreshFromServer() {
  if (!navigator.onLine) return;
  try {
    const data = await jsonp({api:'bootstrap'});
    if (!data || !data.success) {
      throw new Error(data && data.message ? data.message : 'Could not load server data.');
    }
    cacheBootstrap(data);
    renderHeader();
    renderStaff(document.getElementById('search').value);
    renderSelected();
  } catch (err) {
    showNotice(err.message, 'warn');
  }
}

async function syncQueue() {
  if (!navigator.onLine) return;
  let q = getQueue();
  if (!q.length) return;

  for (const event of [...q]) {
    try {
      const data = await jsonp({
        api: 'sync',
        staffId: event.staffId,
        action: event.action,
        eventTime: event.eventTime,
        clientEventId: event.clientEventId,
        deviceId: event.deviceId
      });

      if (data && (data.success || data.alreadySynced)) {
        q = q.filter(x => x.clientEventId !== event.clientEventId);
        setQueue(q);
      } else {
        showNotice(
          (data && data.message) ||
          'A pending attendance record could not synchronize.',
          'warn'
        );
      }
    } catch (err) {
      showNotice('Synchronization paused: ' + err.message, 'warn');
      break;
    }
  }

  if (!q.length) {
    showNotice('All pending attendance records are synchronized.', 'ok');
    await refreshFromServer();
  }
}

function renderQueue() {
  const q = getQueue();
  const box = document.getElementById('queueList');
  if (!q.length) {
    box.innerHTML = '<div class="muted">No pending offline records.</div>';
    return;
  }

  box.innerHTML = q.map(e => `
    <div class="queue-row">
      <strong>${esc(e.staffName || e.staffId)}</strong> —
      ${esc(e.action === 'TIME_IN' ? 'Time In' : 'Time Out')}
      <div class="muted">${esc(new Date(e.eventTime).toLocaleString())}</div>
    </div>
  `).join('');
}

async function init() {
  loadCache();
  renderHeader();
  renderConnectivity();
  renderStaff();
  renderSelected();
  renderQueue();

  document.getElementById('search').addEventListener('input', e => {
    renderStaff(e.target.value);
  });

  window.addEventListener('online', async () => {
    renderConnectivity();
    showNotice('Internet connection restored. Synchronizing pending attendance…', 'ok');
    await syncQueue();
    await refreshFromServer();
  });

  window.addEventListener('offline', () => {
    renderConnectivity();
    showNotice('Offline mode active. Attendance will be saved on this device.', 'warn');
  });

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (_) {}
  }

  if (navigator.onLine) {
    await syncQueue();
    await refreshFromServer();
  } else if (!staff.length) {
    showNotice(
      'No cached staff directory exists yet. Connect once before using this device offline.',
      'warn'
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
