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
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    document.getElementById('loginError').textContent = 
      'Invalid email or password';
  }
};

window.adminLogout = async () => {
  await signOut(auth);
};

// ─── CREATE SESSION ──────────────────────────────────

window.createSession = async () => {
  const subject = document.getElementById('subject').value.trim();
  const date    = document.getElementById('date').value;
  const timer   = parseInt(document.getElementById('timer').value);

  if (!subject || !date || !timer) {
    alert('Please fill all fields');
    return;
  }

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

  // Show link
  const link = `${window.location.origin}/index.html?session=${currentSessionId}`;
  document.getElementById('generatedLink').textContent = link;
  document.getElementById('linkCard').classList.remove('hidden');

  // Start countdown
  startCountdown(endTime, currentSessionId);

  // Auto close after timer
  setTimeout(() => closeSession(), timer * 60 * 1000);

  // Live attendance list
  listenAttendance(currentSessionId);
};

// ─── COUNTDOWN ───────────────────────────────────────

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

// ─── CLOSE SESSION ───────────────────────────────────

window.closeSession = async () => {
  if (!currentSessionId) return;
  await updateDoc(doc(db, 'sessions', currentSessionId), {
    isOpen: false
  });
  clearInterval(countdownInterval);
  document.getElementById('countdown').textContent = '⛔ Session Closed';
  document.getElementById('closeBtn').disabled = true;
};

// ─── LIVE ATTENDANCE LIST ────────────────────────────

function listenAttendance(sessionId) {
  document.getElementById('attendanceCard').classList.remove('hidden');

  const attendanceRef = collection(db, 'sessions', sessionId, 'attendance');

  onSnapshot(query(attendanceRef, orderBy('submittedAt')), (snapshot) => {
    const list = document.getElementById('attendanceList');
    const info = document.getElementById('sessionInfo');

    info.textContent = `Total Present: ${snapshot.size}`;
    list.innerHTML = '';

    snapshot.forEach((docSnap, index) => {
      const data = docSnap.data();
      const div  = document.createElement('div');
      div.className = 'student-item';
      div.textContent = `${snapshot.docs.indexOf(docSnap) + 1}. ${data.name}`;
      list.appendChild(div);
    });
  });
}

// ─── COPY / DOWNLOAD ─────────────────────────────────

window.copyLink = () => {
  const link = document.getElementById('generatedLink').textContent;
  navigator.clipboard.writeText(link);
  alert('Link copied!');
};

window.copyAllNames = async () => {
  const items = document.querySelectorAll('.student-item');
  const names = Array.from(items).map(i => i.textContent).join('\n');
  await navigator.clipboard.writeText(names);
  alert('All names copied!');
};

window.downloadCSV = async () => {
  if (!currentSessionId) return;

  const ref  = collection(db, 'sessions', currentSessionId, 'attendance');
  const snap = await getDocs(query(ref, orderBy('submittedAt')));

  let csv = 'No,Name,Submitted At\n';
  snap.forEach((d, i) => {
    const data = d.data();
    const time = data.submittedAt?.toDate().toLocaleString() || '';
    csv += `${i + 1},${data.name},${time}\n`;
  });

  const blob = document.createElement('a');
  blob.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  blob.download = `attendance-${currentSessionId}.csv`;
  blob.click();
};

// ─── PAST SESSIONS ───────────────────────────────────

async function loadPastSessions() {
  const q    = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const div  = document.getElementById('pastSessions');
  div.innerHTML = '';

  snap.forEach(d => {
    const data  = d.data();
    const item  = document.createElement('div');
    item.className = 'session-item';
    item.innerHTML = `
      <span>${data.subject} — ${data.date}</span>
      <span class="${data.isOpen ? 'open-badge' : 'closed-badge'}">
        ${data.isOpen ? '🟢 Open' : '🔴 Closed'}
      </span>
      <button onclick="viewSession('${d.id}')">👁 View</button>
    `;
    div.appendChild(item);
  });
}

window.viewSession = (sessionId) => {
  currentSessionId = sessionId;
  document.getElementById('attendanceCard').classList.remove('hidden');
  listenAttendance(sessionId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};