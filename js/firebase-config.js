// Config de TON projet Firebase (Firebase Console → Paramètres du projet →
// Général → Tes applications → SDK setup and configuration → "Config").
//
// Ce n'est PAS un secret à cacher : la clé "apiKey" d'une app web Firebase
// est un identifiant public, pas un mot de passe — elle peut être lue par
// n'importe qui dans le code source d'un site, c'est normal. La vraie
// sécurité vient entièrement des règles Firestore (firestore.rules), pas du
// fait de cacher cette config. Tu peux donc la commiter sans souci.
//
// Remplace les valeurs ci-dessous par celles de ton propre projet, puis
// active "Google" comme fournisseur de connexion dans Authentication, crée
// une base Firestore, et colle le contenu de firestore.rules dans l'onglet
// Règles. Le détail est dans README.md.
export const firebaseConfig = {
  apiKey: "REMPLACE-MOI",
  authDomain: "REMPLACE-MOI.firebaseapp.com",
  projectId: "REMPLACE-MOI",
  storageBucket: "REMPLACE-MOI.appspot.com",
  messagingSenderId: "REMPLACE-MOI",
  appId: "REMPLACE-MOI",
};
