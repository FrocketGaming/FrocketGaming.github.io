/**
 * Firebase Configuration
 *
 * To enable cloud sync:
 * 1. Create a project at https://console.firebase.google.com
 * 2. Enable Google sign-in under Authentication > Sign-in Methods
 * 3. Add your domain (e.g. frocketgaming.github.io, localhost) as authorized domains
 * 4. Create a Firestore database (production mode)
 * 5. Deploy security rules (see below)
 * 6. Register a Web App and paste your config values below
 *
 * Firestore Security Rules:
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /users/{userId}/{document=**} {
 *         allow read, write: if request.auth != null && request.auth.uid == userId;
 *       }
 *       match /{document=**} {
 *         allow read, write: if false;
 *       }
 *     }
 *   }
 */
const firebaseConfig = {
  apiKey: "AIzaSyBWJRSkWXP1ABmY7ScXFjj3pGYzsK52r0g",
  authDomain: "fg-portfolio-dcac9.firebaseapp.com",
  projectId: "fg-portfolio-dcac9",
  storageBucket: "fg-portfolio-dcac9.firebasestorage.app",
  messagingSenderId: "899987293812",
  appId: "1:899987293812:web:0145f0639384495fb47321",
};
