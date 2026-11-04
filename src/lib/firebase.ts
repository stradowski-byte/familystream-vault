import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const firebaseApp = initializeApp(firebaseConfig);

export const db = getFirestore(
  firebaseApp,
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(firebaseApp);

// Enforce native browser persistence (IndexedDB / localStorage) so closing tabs or restarting the PWA never destroys the session
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Błąd konfiguracji trwałej sesji Firebase Auth:', err);
});

export const googleProvider = new GoogleAuthProvider();

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIREBASE_AUTH_DOMAIN = firebaseConfig.authDomain;

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'vaultConfig', 'default'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error(
        'Please check your Firebase configuration. The client is offline.'
      );
    }
  }
}

void testFirestoreConnection();
