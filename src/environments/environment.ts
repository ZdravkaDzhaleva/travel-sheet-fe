// Production environment.
// Firebase web config is NOT secret — safe to commit real values here.
// Find them in Firebase Console → Project Settings → Your apps → SDK setup.
export const environment = {
  production: true,
  firebase: {
    apiKey:            'AIzaSyCQkGRD575MIOhcGO2FwOLDm-w5VMuSH94',
    authDomain:        'latituderealize-travel-sheet.firebaseapp.com',
    projectId:         'latituderealize-travel-sheet',
    storageBucket:     'latituderealize-travel-sheet.firebasestorage.app',
    messagingSenderId: '111457365029',
    appId:             '1:111457365029:web:982b0d004a63c1bda6e3cc',
  },
  // Google OAuth Web client ID — find in Google Cloud Console → APIs & Services → Credentials.
  googleOAuthClientId: '111457365029-aq809tjtfbgfnr0nlutvke5960us9lc2.apps.googleusercontent.com',
};
