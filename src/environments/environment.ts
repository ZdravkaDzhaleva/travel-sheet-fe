// Production environment.
// Firebase web config is NOT secret — safe to commit real values here.
// Replace every FILL_ME_ value with your actual Firebase project settings.
// Find them in Firebase Console → Project Settings → Your apps → SDK setup.
export const environment = {
  production: true,
  firebase: {
    apiKey:            'FILL_ME_API_KEY',
    authDomain:        'FILL_ME_PROJECT_ID.firebaseapp.com',
    projectId:         'FILL_ME_PROJECT_ID',
    storageBucket:     'FILL_ME_PROJECT_ID.firebasestorage.app',
    messagingSenderId: 'FILL_ME_MESSAGING_SENDER_ID',
    appId:             'FILL_ME_APP_ID',
  },
};
