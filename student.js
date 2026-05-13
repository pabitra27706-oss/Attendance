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

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session');
let countdownInterval = null;

// ─── DEVICE FINGERPRINT ──────────────────────────────
// Creates a unique ID for this device/browser
// Stored in localStorage so same device = same ID

function getDeviceId() {
  let deviceId = localStorage.getItem('attendease_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('attendease_device_id', deviceId);
  }
  return deviceId;
}

// ─── CHECK ALREADY SUBMITTED ─────────────────────────

async function checkAlreadySubmitted(sessionId, deviceId) {
  const ref = collection(db, 'sessions', sessionId, 'attendance');
  const q = query(ref, where('deviceId', '==', deviceId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].data().name;
  }
  return null;
}

// ─── LOAD SESSION ────────────────────────────────────

async function loadSession() {
  if (!sessionId) {
    showCard('notFoundCard');
    return;
  }
  
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) {
      showCard('notFoundCard');
      return;
    }
    
    const sessionData = sessionSnap.data();
    const now = new Date();
    const endTime = sessionData.endTime.toDate();
    
    // Check if closed
    if (!sessionData.isOpen || now > endTime) {
      showCard('closedCard');
      return;
    }
    
    // ── Check device already submitted ──
    const deviceId = getDeviceId();
    const submittedName = await checkAlreadySubmitted(sessionId, deviceId);
    
    if (submittedName) {
      document.getElementById('alreadyName').textContent = submittedName;
      showCard('alreadyCard');
      return;
    }
    
    // ── Show form ──
    document.getElementById('sessionInfoChips').innerHTML = `
      <div class="info-chip">📚 ${sessionData.subject}</div>
      <div class="info-chip">📅 ${sessionData.date}</div>
    `;
    
    startCountdown(endTime);
    showCard('formCard');
    
  } catch (err) {
    console.error(err);
    showCard('notFoundCard');
  }
}

// ─── COUNTDOWN ───────────────────────────────────────

function startCountdown(endTime) {
  clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    const diff = endTime - new Date();
    
    if (diff <= 0) {
      clearInterval(countdownInterval);
      showCard('closedCard');
      return;
    }
    
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown').textContent =
      `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }, 1000);
}

// ─── SUBMIT ──────────────────────────────────────────

window.submitAttendance = async () => {
  const nameInput = document.getElementById('studentName');
  const errorEl = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const name = nameInput.value.trim();
  
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
  
  // Disable button to prevent double submit
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  
  try {
    const deviceId = getDeviceId();
    
    // Double check device before submitting
    const alreadyName = await checkAlreadySubmitted(sessionId, deviceId);
    if (alreadyName) {
      document.getElementById('alreadyName').textContent = alreadyName;
      showCard('alreadyCard');
      return;
    }
    
    // Verify session still open
    const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
    const sessionData = sessionSnap.data();
    const endTime = sessionData.endTime.toDate();
    
    if (!sessionData.isOpen || new Date() > endTime) {
      showCard('closedCard');
      return;
    }
    
    // Submit attendance
    await addDoc(
      collection(db, 'sessions', sessionId, 'attendance'),
      {
        name,
        deviceId,
        submittedAt: serverTimestamp(),
        userAgent: navigator.userAgent.substring(0, 200)
      }
    );
    
    clearInterval(countdownInterval);
    document.getElementById('successName').textContent = name;
    showCard('successCard');
    
  } catch (err) {
    console.error(err);
    errorEl.textContent = '⚠️ Error submitting. Please try again.';
    submitBtn.disabled = false;
    submitBtn.textContent = '✅ Submit Attendance';
  }
};

// ─── HELPERS ─────────────────────────────────────────

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
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(cardId).classList.remove('hidden');
}

// Start
loadSession();