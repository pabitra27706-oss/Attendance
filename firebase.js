import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3gHV_IwQaoLaJG7ZzzxLfYdrGS-nhXY8",
  authDomain: "attendance-b5200.firebaseapp.com",
  projectId: "attendance-b5200",
  storageBucket: "attendance-b5200.firebasestorage.app",
  messagingSenderId: "889766760457",
  appId: "1:889766760457:web:184035ab88c8c85c56a8d8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);