// ─────────────────────────────────────────────────────────────
//  Paste your Firebase config here
//  (Firebase Console → Project Settings → Your Apps → NPM)
// ─────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyD-JEd4NrM4-uEupjYWVPLXsOWpq-ZClqM",
  authDomain: "budget-anna-8b341.firebaseapp.com",
  projectId: "budget-anna-8b341",
  storageBucket: "budget-anna-8b341.firebasestorage.app",
  messagingSenderId: "457989083826",
  appId: "1:457989083826:web:412e44057e27318485afab"
};

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
