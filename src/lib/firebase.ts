import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import localAppletConfig from '../../firebase-applet-config.json';

// Helper to safely fetch environment variables for both Vite and Next.js / Node
const getEnv = (key: string): string => {
  // Vite client-side config
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const viteVal = (import.meta as any).env[key];
    if (viteVal) return viteVal;
  }
  // Next.js / standard Node process config
  try {
    if (typeof process !== 'undefined' && process.env) {
      const nodeVal = process.env[key];
      if (nodeVal) return nodeVal;
    }
  } catch {
    // Ignore ReferenceError if process is not defined
  }
  return '';
};

// Safe fallback config
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || getEnv('NEXT_PUBLIC_FIREBASE_API_KEY') || localAppletConfig.apiKey,
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || getEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN') || localAppletConfig.authDomain,
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID') || localAppletConfig.projectId,
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || getEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET') || localAppletConfig.storageBucket,
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || getEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || localAppletConfig.messagingSenderId,
  appId: getEnv('VITE_FIREBASE_APP_ID') || getEnv('NEXT_PUBLIC_FIREBASE_APP_ID') || localAppletConfig.appId,
  measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID') || getEnv('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID') || localAppletConfig.measurementId || '',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, localAppletConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Connectivity Test (as recommended in SKILL.md)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or internet connection.");
    }
  }
}
testConnection();

// Types for handleFirestoreError
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
