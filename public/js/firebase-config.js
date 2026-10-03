// =============================================================
//  FIREBASE CONFIGURATION  —  EDIT THIS FILE
// =============================================================
//  Replace every placeholder value below with the config of your own
//  Firebase *Web App*:
//    Firebase console → Project settings (gear icon) → General →
//    "Your apps" → Web app → SDK setup and configuration → "Config".
//
//  These values identify your project to the browser SDK. They are NOT
//  secrets — access is controlled by Firestore security rules
//  (see firestore.rules). Never put service-account keys
//  or Admin SDK credentials in this file.
// =============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDRz-PPw_spp6mbP3IevxIcOiPG2LFi8E0",
    authDomain: "learning-library-c4f41.firebaseapp.com",
    projectId: "learning-library-c4f41",
    storageBucket: "learning-library-c4f41.firebasestorage.app",
    messagingSenderId: "254629109771",
    appId: "1:254629109771:web:eeb4d086c0df9e6cd7270e"
};

// True once the placeholders above have been replaced.
export const isFirebaseConfigured =
    !firebaseConfig.apiKey.startsWith("YOUR_") &&
    !firebaseConfig.projectId.startsWith("YOUR_");

let db = null;

if (isFirebaseConfigured) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
}

export { db };
