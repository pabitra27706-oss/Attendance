import { db } from './firebase.js';
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session');
let sessionData = null;
let countdownInterval = null;

// ─── LOAD SESSION ────────────────────────────────────

async function loadSession() {
  if (!sessionId) {
    showCard('notFoundCard');
    return;
  }
  
  const sessionRef = doc(db, 'sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);
  
  if (!sessionSnap.exists()) {
    showCard('notFoundCard');
    return;
  }
  
  sessionData = sessionSnap.data();
  
  const now = new Date();
  const endTime = sessionData.endTime.toDate();
  
  if (!sessionData.isOpen || now > endTime) {
    showCard('closedCard');
    return;
  }
  
  // Show form
  document.getElementById('sessionDetails').innerHTML = `
    <strong>📚 Subject:</strong> ${sessionData.subject}<br/>
    <strong>📅 Date:</strong> ${sessionData.date}
  `;
  
  startCountdown(endTime);
  showCard('formCard');
}

// ─── COUNTDOWN ───────────────────────────────────────

function startCountdown(endTime) {
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
      `⏱️ Closes in: ${mins}m ${secs}s`;
  }, 1000);
}

// ─── SUBMIT ──────────────────────────────────────────

window.submitAttendance = async () => {
  const name = document.getElementById('studentName').value.trim();
  
  if (!name) {
    document.getElementById('formError').textContent =
      'Please enter your full name';
    return;
  }
  
  if (name.length < 2) {
    document.getElementById('formError').textContent =
      'Name is too short';
    return;
  }
  
  try {
    await addDoc(
      collection(db, 'sessions', sessionId, 'attendance'), {
        name,
        submittedAt: serverTimestamp()
      }
    );
    
    clearInterval(countdownInterval);
    document.getElementById('successName').textContent =
      `Name recorded: ${name}`;
    showCard('successCard');
    
  } catch (err) {
    document.getElementById('formError').textContent =
      'Error submitting. Please try again.';
  }
};

// ─── HELPERS ─────────────────────────────────────────

function showCard(cardId) {
  const cards = ['formCard', 'successCard', 'closedCard', 'notFoundCard'];
  cards.forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(cardId).classList.remove('hidden');
}

loadSession();