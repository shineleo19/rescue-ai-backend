const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase using environment variables
// Note: In a real production app, you'd download the serviceAccountKey.json from Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Replace literal \n with actual line breaks for the private key
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  }),
});

module.exports = admin;