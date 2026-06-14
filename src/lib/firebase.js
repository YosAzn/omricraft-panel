// --- Firebase Setup ---
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBc72tYqQAlJarsqt5CUJQ93rFCfHIZe3M",
  authDomain: "omricraft-74735.firebaseapp.com",
  projectId: "omricraft-74735",
  storageBucket: "omricraft-74735.firebasestorage.app",
  messagingSenderId: "308782209773",
  appId: "1:308782209773:web:4a5808ece4a1d7f06e4ae4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functionsInstance = getFunctions(app);
