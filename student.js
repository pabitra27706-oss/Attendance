import { db } from './firebase.js';
import {
  doc,
  getDoc,
  addDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ─── GET SESSION ID FROM URL ──────────────────────────
// Fix for Chrome & other browsers that read URL differently

function getSessionId() {
  // Method 1 - URLSearchParams
  try {
    const params = new URLSearchParams(window.location.search);
    const id     = params.get('session');
    if (id && id.length > 5) return id;
  } catch (e) {
    console.log('Method 1 failed', e);
  }

  // Method 2 - Manual split
  try {
    const search = window.location.search;
    if (search.includes('session=')) {
      const id = search.split('session=')[1].split('&')[0];
      if (id && id.length > 5) return id;
    }
  } catch (e) {
    console.log('Method 2 failed', e);
  }

  // Method 3 - Full href split
  try {
    const href = window.location.href;
    if (href.includes('session=')) {
      const id = href.split('session=')[1].split('&')[0];
      if (id && id.length > 5) return id;
    }
  } catch (e) {
    console.log('Method 3 failed', e);
  }

  return null;
}

// ─── GET DEVICE ID ────────────────────────────────────
// Works across all browsers including Chrome

function getDeviceId() {
  try {
    // Try localStorage first
    let deviceId = localStorage.getItem('attendease_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Date.now() + '_' +
        Math.random().toString(36).substr(2, 9);
      localStorage.setItem('attendease_device_id', deviceId);
    }
    return deviceId;
  } catch (e) {
    // If localStorage blocked (private mode some browsers)
    // Use sessionStorage as fallback
    try {
      let deviceId = sessionStorage.getItem('attendease_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Date.now() + '_' +
          Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('attendease_device_id', deviceId);
      }
      return deviceId;
    } catch (e2) {
      // Last fallback - just generate random (no duplicate protection)
      return 'dev_' + Date.now() + '_' +
        Math.random().toString(36).substr(2, 9);
    }
  }
}

// ─── CHECK ALREADY SUBMITTED ─────────────────────────

async function checkAlreadySubmitted(sessionId, deviceId) {
  try {
    const ref  = collection(db, 'sessions', sessionId, 'attendance');
    const q    = query(ref, where('deviceId', '==', deviceId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data().name;
    }
  } catch (e) {
    console.log('Check submitted error', e);
  }
  return null;
}

// ─── SHOW CARD HELPER ─────────────────────────────────

function showCard(cardId) {
  const cards = [
    'loadingCard',
    'formCard',
    'alreadyCard',
    'successCard',
    'closedCard',
    'notFoundCard'
  ];
  cards.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(cardId);
  if (target) target.classList.remove('hidden');
}

// ─── COUNTDOWN ───────────────────────────────────────

let countdownInterval = null;

function startCountdown(endTime) {
  clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const diff = endTime - new Date();

    if (diff <= 0) {
      clearInterval(countdownInterval);
      const el = document.getElementById('countdown');
      if (el) el.textContent = '00:00';
      showCard('closedCard');
      return;
    }

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const el   = document.getElementById('countdown');
    if (el) {
      el.textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }, 1000);
}

// ─── LOAD SESSION ────────────────────────────────────

const sessionId = getSessionId();

console.log('Full URL:', window.location.href);
console.log('Search:', window.location.search);
console.log('Session ID found:', sessionId);

async function loadSession() {

  // No session ID in URL
  if (!sessionId) {
    console.log('No session ID found in URL');
    showCard('notFoundCard');
    return;
  }

  try {
    console.log('Fetching session:', sessionId);

    const sessionRef  = doc(db, 'sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);

    console.log('Session exists:', sessionSnap.exists());

    // Session not found in Firestore
    if (!sessionSnap.exists()) {
      console.log('Session not found in database');
      showCard('notFoundCard');
      return;
    }

    const sessionData = sessionSnap.data();
    console.log('Session data:', sessionData);

    const now     = new Date();
    const endTime = sessionData.endTime.toDate();

    console.log('Is open:', sessionData.isOpen);
    console.log('End time:', endTime);
    console.log('Now:', now);
    console.log('Expired:', now > endTime);

    // Session closed or expired
    if (!sessionData.isOpen || now > endTime) {
      console.log('Session is closed or expired');
      showCard('closedCard');
      return;
    }

    // Check device already submitted
    const deviceId      = getDeviceId();
    const submittedName = await checkAlreadySubmitted(sessionId, deviceId);

    if (submittedName) {
      console.log('Already submitted by:', submittedName);
      document.getElementById('alreadyName').textContent = submittedName;
      showCard('alreadyCard');
      return;
    }

    // Show the form
    const chips = document.getElementById('sessionInfoChips');
    if (chips) {
      chips.innerHTML = `
        <div class="info-chip">📚 ${sessionData.subject}</div>
        <div class="info-chip">📅 ${sessionData.date}</div>
      `;
    }

    startCountdown(endTime);
    showCard('formCard');

  } catch (err) {
    console.error('Error loading session:', err);
    // Show error details on page for debugging
    showCard('notFoundCard');
    const card = document.getElementById('notFoundCard');
    if (card) {
      card.querySelector('p').textContent =
        'Error: ' + err.message;
    }
  }
}

// ─── SUBMIT ATTENDANCE ────────────────────────────────

window.submitAttendance = async () => {
  const nameInput = document.getElementById('studentName');
  const errorEl   = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const name      = nameInput.value.trim();

  errorEl.textContent = '';

  if (!name) {
    errorEl.textContent = '⚠️ Please enter your full name';
    nameInput.focus();
    return;
  }

  if (name.length < 3) {
    errorEl.textContent = '⚠️ Name is too short';
    return;
  }

  // Disable button - prevent double submit
  submitBtn.disabled     = true;
  submitBtn.textContent  = 'Submitting...';

  try {
    const deviceId = getDeviceId();

    // Double check before submitting
    const alreadyName = await checkAlreadySubmitted(sessionId, deviceId);
    if (alreadyName) {
      document.getElementById('alreadyName').textContent = alreadyName;
      showCard('alreadyCard');
      return;
    }

    // Verify session still open
    const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));

    if (!sessionSnap.exists()) {
      showCard('notFoundCard');
      return;
    }

    const sessionData = sessionSnap.data();
    const endTime     = sessionData.endTime.toDate();

    if (!sessionData.isOpen || new Date() > endTime) {
      showCard('closedCard');
      return;
    }

    // Save to Firestore
    await addDoc(
      collection(db, 'sessions', sessionId, 'attendance'),
      {
        name,
        deviceId,
        submittedAt: serverTimestamp(),
        userAgent  : navigator.userAgent.substring(0, 200)
      }
    );

    clearInterval(countdownInterval);
    document.getElementById('successName').textContent = name;
    showCard('successCard');

  } catch (err) {
    console.error('Submit error:', err);
    errorEl.textContent = '⚠️ Error submitting. Please try again.';
    submitBtn.disabled    = false;
    submitBtn.textContent = '✅ Submit Attendance';
  }
};

// ─── START ────────────────────────────────────────────
loadSession();