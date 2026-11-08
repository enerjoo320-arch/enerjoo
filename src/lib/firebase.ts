import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth,
  initializeAuth, 
  browserLocalPersistence, 
  browserSessionPersistence, 
  indexedDBLocalPersistence, 
  inMemoryPersistence, 
  browserPopupRedirectResolver,
  Auth
} from "firebase/auth";
import { getFirestore, initializeFirestore, Firestore } from "firebase/firestore";
import defaultFirebaseConfig from "../../firebase-applet-config.json";

// Support both static provisioned config and optional VITE_ environment overrides
const metaEnv: Record<string, any> = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

export const currentFirebaseConfig = {
  projectId: (metaEnv.VITE_FIREBASE_PROJECT_ID as string) || defaultFirebaseConfig.projectId,
  appId: (metaEnv.VITE_FIREBASE_APP_ID as string) || defaultFirebaseConfig.appId,
  apiKey: (metaEnv.VITE_FIREBASE_API_KEY as string) || defaultFirebaseConfig.apiKey || "",
  authDomain: (metaEnv.VITE_FIREBASE_AUTH_DOMAIN as string) || defaultFirebaseConfig.authDomain,
  firestoreDatabaseId: (metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string) || defaultFirebaseConfig.firestoreDatabaseId,
  storageBucket: (metaEnv.VITE_FIREBASE_STORAGE_BUCKET as string) || defaultFirebaseConfig.storageBucket,
  messagingSenderId: (metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || defaultFirebaseConfig.messagingSenderId,
  measurementId: (metaEnv.VITE_FIREBASE_MEASUREMENT_ID as string) || defaultFirebaseConfig.measurementId
};

console.log("[Firebase Init] Configured with Project ID:", currentFirebaseConfig.projectId, "| Auth Domain:", currentFirebaseConfig.authDomain);

const app = getApps().length > 0 ? getApp() : initializeApp(currentFirebaseConfig);

let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver
  });
} catch {
  try {
    authInstance = getAuth(app);
  } catch {
    authInstance = {} as Auth;
  }
}

export const auth = authInstance;

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, currentFirebaseConfig.firestoreDatabaseId);
} catch {
  try {
    dbInstance = getFirestore(app, currentFirebaseConfig.firestoreDatabaseId);
  } catch {
    dbInstance = getFirestore(app);
  }
}

export const db: Firestore = dbInstance;

export default app;


