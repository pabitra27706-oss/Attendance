import { db, auth } from './firebase.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

let currentSessionId = null;
let countdownInterval = null;

// ─── GET BASE URL ─────────────────────────────────────

function getBaseUrl() {
  const pathParts = window.location.pathname.split('/');
  const repoName  = pathParts[1];
  return `${window.location.origin}/${repoName}`;
}

// ─── AUTH ─────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    loadPastSessions();
  } else {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
  }
});

window.adminLogin = async () => {
  const email    = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const errorEl  = document.getElementById('loginError');

  if (!email || !password) {
    errorEl.textContent = '⚠️ Please enter email and password';
    return;
  }

  try {
    errorEl.textContent = 'Logging in...';
    await signInWithEmailAndPassword(auth, email, password);
    errorEl.textContent = '';
  } catch (err) {
    console.error(err);
    errorEl.textContent = '⚠️ Invalid email or password';
  }
};

window.adminLogout = async () => {
  await signOut(auth);
  currentSessionId = null;
  clearInterval(countdownInterval);
  document.getElementById('linkCard').classList.add('hidden');
  document.getElementById('attendanceCard').classList.add('hidden');
};

// ─── CREATE SESSION ───────────────────────────────────

window.createSession = async () => {
  const subject = document.getElementById('subject').value.trim();
  const date    = document.getElementById('date').value;
  const timer   = parseInt(document.getElementById('timer').value);

  if (!subject) {
    alert('⚠️ Please enter subject name');
    return;
  }
  if (!date) {
    alert('⚠️ Please select a date');
    return;
  }
  if (!timer || timer < 1) {
    alert('⚠️ Please enter a valid timer (minimum 1 minute)');
    return;
  }

  try {
    const endTime = new Date();
    endTime.setMinutes(endTime.getMinutes() + timer);

    const sessionRef = await addDoc(collection(db, 'sessions'), {
      subject,
      date,
      timer,
      endTime  : Timestamp.fromDate(endTime),
      isOpen   : true,
      createdAt: serverTimestamp()
    });

    currentSessionId = sessionRef.id;

    // Generate link
    const baseUrl = getBaseUrl();
    const link    = `${baseUrl}/index.html?session=${currentSessionId}`;

    document.getElementById('generatedLink').textContent = link;
    document.getElementById('linkCard').classList.remove('hidden');
    document.getElementById('closeBtn').disabled = false;

    // Start countdown
    startCountdown(endTime);

    // Auto close when timer ends
    setTimeout(() => closeSession(), timer * 60 * 1000);

    // Show live attendance
    listenAttendance(currentSessionId);

    // Refresh past sessions
    loadPastSessions();

  } catch (err) {
    console.error(err);
    alert('Error creating session. Check console for details.');
  }
};

// ─── COUNTDOWN ────────────────────────────────────────

function startCountdown(endTime) {
  clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const diff = endTime - new Date();

    if (diff <= 0) {
      clearInterval(countdownInterval);
      document.getElementById('countdown').textContent = '00:00';
      return;
    }

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, 1000);
}

// ─── CLOSE SESSION ────────────────────────────────────

window.closeSession = async () => {
  if (!currentSessionId) return;

  try {
    await updateDoc(doc(db, 'sessions', currentSessionId), {
      isOpen: false
    });

    clearInterval(countdownInterval);
    document.getElementById('countdown').textContent = '00:00';
    document.getElementById('closeBtn').disabled = true;

    loadPastSessions();

  } catch (err) {
    console.error(err);
    alert('Error closing session.');
  }
};

// ─── LIVE ATTENDANCE LIST ─────────────────────────────

function listenAttendance(sessionId) {
  document.getElementById('attendanceCard').classList.remove('hidden');

  const attendanceRef = collection(db, 'sessions', sessionId, 'attendance');
  const q = query(attendanceRef, orderBy('submittedAt'));

  onSnapshot(q, (snapshot) => {
    const list       = document.getElementById('attendanceList');
    const countBadge = document.getElementById('countBadge');

    // Update count
    countBadge.textContent = `${snapshot.size} present`;

    // Clear list
    list.innerHTML = '';

    // Empty state
    if (snapshot.empty) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <p>Waiting for students...</p>
        </div>
      `;
      return;
    }

    // Add each student row
    snapshot.docs.forEach((docSnap, index) => {
      const data = docSnap.data();

      let time = '';
      try {
        time = data.submittedAt
          ? data.submittedAt.toDate().toLocaleTimeString([], {
              hour  : '2-digit',
              minute: '2-digit'
            })
          : '';
      } catch (e) {
        time = '';
      }

      const item = document.createElement('div');
      item.className = 'student-item';
      item.innerHTML = `
        <div class="student-num">${index + 1}</div>
        <div class="student-name">${data.name}</div>
        <div class="student-time">${time}</div>
      `;
      list.appendChild(item);
    });
  });
}

// ─── COPY LINK ────────────────────────────────────────

window.copyLink = () => {
  const link = document.getElementById('generatedLink').textContent;

  navigator.clipboard.writeText(link).then(() => {
    alert('✅ Link copied to clipboard!');
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = link;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    alert('✅ Link copied!');
  });
};

// ─── COPY ALL NAMES ───────────────────────────────────

window.copyAllNames = async () => {
  if (!currentSessionId) {
    alert('No session selected');
    return;
  }

  try {
    const ref  = collection(db, 'sessions', currentSessionId, 'attendance');
    const snap = await getDocs(query(ref, orderBy('submittedAt')));

    if (snap.empty) {
      alert('No attendance records yet');
      return;
    }

    const names = snap.docs
      .map((d, i) => `${i + 1}. ${d.data().name}`)
      .join('\n');

    await navigator.clipboard.writeText(names);
    alert(`✅ ${snap.size} names copied!`);

  } catch (err) {
    console.error(err);
    alert('Error copying names');
  }
};

// ─── DOWNLOAD CSV ─────────────────────────────────────

window.downloadCSV = async () => {
  if (!currentSessionId) {
    alert('No session selected');
    return;
  }

  try {
    const ref  = collection(db, 'sessions', currentSessionId, 'attendance');
    const snap = await getDocs(query(ref, orderBy('submittedAt')));

    if (snap.empty) {
      alert('No attendance records to download');
      return;
    }

    let csv = 'No,Name,Submitted At\n';
    snap.docs.forEach((d, i) => {
      const data = d.data();
      const time = data.submittedAt
        ? data.submittedAt.toDate().toLocaleString()
        : 'N/A';
      csv += `${i + 1},${data.name},${time}\n`;
    });

    const blob    = new Blob([csv], { type: 'text/csv' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `attendance-${currentSessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error(err);
    alert('Error downloading CSV');
  }
};

// ─── LOAD PAST SESSIONS ───────────────────────────────

async function loadPastSessions() {
  try {
    const q    = query(
      collection(db, 'sessions'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const div  = document.getElementById('pastSessions');

    div.innerHTML = '';

    if (snap.empty) {
      div.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>No sessions yet</p>
        </div>
      `;
      return;
    }

    snap.forEach(d => {
      const data = d.data();
      const item = document.createElement('div');
      item.className = 'session-item';
      item.innerHTML = `
        <div class="session-item-info">
          <strong>${data.subject}</strong>
          <span>${data.date}</span>
        </div>
        <span class="badge ${data.isOpen ? 'badge-open' : 'badge-closed'}">
          ${data.isOpen ? '🟢 Open' : '🔴 Closed'}
        </span>
        <button class="btn btn-secondary btn-sm"
          onclick="viewSession('${d.id}')">
          👁 View
        </button>
      `;
      div.appendChild(item);
    });

  } catch (err) {
    console.error(err);
  }
}

// ─── VIEW PAST SESSION ────────────────────────────────

window.viewSession = async (sessionId) => {
  currentSessionId = sessionId;

  try {
    // Get session details
    const sessionRef  = doc(db, 'sessions', sessionId);
    const sessionSnap = await getDocs(collection(db, 'sessions'));

    sessionSnap.forEach(d => {
      if (d.id === sessionId) {
        const data  = d.data();
        const chips = document.getElementById('sessionInfoChips');
        if (chips) {
          chips.innerHTML = `
            <div class="info-chip">📚 ${data.subject}</div>
            <div class="info-chip">📅 ${data.date}</div>
          `;
        }
      }
    });

  } catch (e) {
    console.log(e);
  }

  document.getElementById('attendanceCard').classList.remove('hidden');
  listenAttendance(sessionId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};