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

// ─── GET REPO NAME AUTOMATICALLY ─────────────────────

function getBaseUrl() {
  const pathParts = window.location.pathname.split('/');
  // pathParts = ['', 'repo-name', 'admin.html']
  const repoName = pathParts[1];
  return `${window.location.origin}/${repoName}`;
}

// ─── AUTH ────────────────────────────────────────────

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
    errorEl.textContent = 'Please enter email and password';
    return;
  }

  try {
    errorEl.textContent = 'Logging in...';
    await signInWithEmailAndPassword(auth, email, password);
    errorEl.textContent = '';
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Invalid email or password';
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
  const subject  = document.getElementById('subject').value.trim();
  const date     = document.getElementById('date').value;
  const timer    = parseInt(document.getElementById('timer').value);

  if (!subject) {
    alert('Please enter subject name');
    return;
  }
  if (!date) {
    alert('Please select a date');
    return;
  }
  if (!timer || timer < 1) {
    alert('Please enter a valid timer (minimum 1 minute)');
    return;
  }

  try {
    const endTime = new Date();
    endTime.setMinutes(endTime.getMinutes() + timer);

    const sessionRef = await addDoc(collection(db, 'sessions'), {
      subject,
      date,
      timer,
      endTime: Timestamp.fromDate(endTime),
      isOpen: true,
      createdAt: serverTimestamp()
    });

    currentSessionId = sessionRef.id;

    // ── Generate correct link with repo name ──
    const baseUrl = getBaseUrl();
    const link = `${baseUrl}/index.html?session=${currentSessionId}`;

    document.getElementById('generatedLink').textContent = link;
    document.getElementById('linkCard').classList.remove('hidden');
    document.getElementById('closeBtn').disabled = false;

    // Start countdown
    startCountdown(endTime, currentSessionId);

    // Auto close when timer ends
    setTimeout(() => {
      closeSession();
    }, timer * 60 * 1000);

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

function startCountdown(endTime, sessionId) {
  clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const now  = new Date();
    const diff = endTime - now;

    if (diff <= 0) {
      clearInterval(countdownInterval);
      document.getElementById('countdown').textContent = '⏰ Session Closed';
      return;
    }

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown').textContent =
      `⏱️ Closes in: ${mins}m ${secs}s`;
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
    document.getElementById('countdown').textContent = '⛔ Session Closed';
    document.getElementById('closeBtn').disabled = true;

    // Refresh past sessions list
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
    const list    = document.getElementById('attendanceList');
    const info    = document.getElementById('sessionInfo');

    info.textContent = `Total Present: ${snapshot.size}`;
    list.innerHTML = '';

    snapshot.forEach((docSnap, index) => {
      const data  = docSnap.data();
      const div   = document.createElement('div');
      div.className = 'student-item';

      const time = data.submittedAt
        ? data.submittedAt.toDate().toLocaleTimeString()
        : '';

      div.innerHTML = `
        <span>${snapshot.docs.indexOf(docSnap) + 1}. ${data.name}</span>
        <span style="color:#718096; font-size:0.85rem;">${time}</span>
      `;
      list.appendChild(div);
    });
  });
}

// ─── COPY LINK ────────────────────────────────────────

window.copyLink = () => {
  const link = document.getElementById('generatedLink').textContent;
  navigator.clipboard.writeText(link).then(() => {
    alert('✅ Link copied to clipboard!');
  }).catch(() => {
    // Fallback for older browsers
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
    alert('No active session');
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
    alert('No active session');
    return;
  }

  try {
    const ref  = collection(db, 'sessions', currentSessionId, 'attendance');
    const snap = await getDocs(query(ref, orderBy('submittedAt')));

    if (snap.empty) {
      alert('No attendance records to download');
      return;
    }

    // Get session info for filename
    const sessionDoc = await getDocs(
      query(collection(db, 'sessions'))
    );

    let csv = 'No,Name,Submitted At\n';
    snap.forEach((d, i) => {
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

// ─── PAST SESSIONS ────────────────────────────────────

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
      div.innerHTML = '<p style="color:#718096;">No sessions yet</p>';
      return;
    }

    snap.forEach(d => {
      const data = d.data();
      const item = document.createElement('div');
      item.className = 'session-item';
      item.innerHTML = `
        <span>
          <strong>${data.subject}</strong> — ${data.date}
        </span>
        <span class="${data.isOpen ? 'open-badge' : 'closed-badge'}">
          ${data.isOpen ? '🟢 Open' : '🔴 Closed'}
        </span>
        <button onclick="viewSession('${d.id}')">👁 View</button>
      `;
      div.appendChild(item);
    });

  } catch (err) {
    console.error(err);
  }
}

// ─── VIEW PAST SESSION ────────────────────────────────

window.viewSession = (sessionId) => {
  currentSessionId = sessionId;
  document.getElementById('attendanceCard').classList.remove('hidden');
  listenAttendance(sessionId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};