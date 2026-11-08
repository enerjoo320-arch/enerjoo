import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { User } from "../types";
import { safeLocalStorage } from "../utils/safeStorage";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  register: (email: string, password: string, additionalData?: any) => Promise<User | null>;
  login: (email: string, password: string, preferredRole?: 'customer' | 'supplier') => Promise<User | null>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: (role?: 'customer' | 'supplier') => Promise<User | null>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const EXCLUDED_ADMIN_EMAILS = [
  'eng.faressnasser@gmail.com',
  'faressnasser12@gmail.com'
];

const checkIsAdminEmail = (emailStr: string | null | undefined): boolean => {
  if (!emailStr) return false;
  const clean = emailStr.toLowerCase().trim();
  if (EXCLUDED_ADMIN_EMAILS.includes(clean)) {
    return false;
  }
  return clean === 'enerjoo365@gmail.com' || clean === 'enerjoo320@gmail.com';
};

/**
 * Normalizes a User object strictly from the authoritative Firestore `users/{uid}` document
 * and Firebase Auth identity, without trusting any localStorage role overrides.
 */
function normalizeUserFromFirestore(
  uid: string,
  data: Record<string, any>,
  fallbackEmail?: string | null,
  fallbackName?: string | null,
  fallbackPhoto?: string | null
): User {
  const emailStr = String(data.email || fallbackEmail || "").toLowerCase().trim();
  const isAdminEmail = checkIsAdminEmail(emailStr);
  const isExcludedAdmin = EXCLUDED_ADMIN_EMAILS.includes(emailStr);

  let resolvedType: 'customer' | 'supplier' | 'admin' = 'customer';
  if (isAdminEmail) {
    resolvedType = 'admin';
  } else if (data.type === 'admin' && !isExcludedAdmin) {
    resolvedType = 'admin';
  } else if (data.type === 'supplier') {
    resolvedType = 'supplier';
  } else {
    resolvedType = 'customer';
  }

  const isRejected = resolvedType === 'supplier' ? Boolean(data.rejected) : false;
  const isVerified =
    resolvedType === 'admin'
      ? true
      : resolvedType === 'supplier'
        ? Boolean(data.verified) && !isRejected
        : data.verified !== undefined
          ? Boolean(data.verified)
          : true;

  const displayName = data.name || fallbackName || emailStr.split('@')[0] || 'User';
  const displayNameAr = data.nameAr || data.name || fallbackName || emailStr.split('@')[0] || 'مستخدم';

  return {
    uid,
    name: displayName,
    nameAr: displayNameAr,
    email: emailStr,
    avatar: data.avatar || fallbackPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
    createdAt: data.createdAt || new Date().toISOString(),
    ...data,
    type: resolvedType,
    verified: isVerified,
    rejected: isRejected
  } as User;
}

/**
 * Creates a brand-new user document in Firestore (`users/{uid}`) when none exists yet.
 * Never deletes or overwrites an existing document.
 * Respects supplier verification workflow: new suppliers start with `verified: false, rejected: false`.
 */
async function createInitialUserDoc(uid: string, userData: User): Promise<User> {
  const userDocRef = doc(db, "users", uid);
  const isSupplier = userData.type === 'supplier';
  const firestorePayload: Record<string, any> = {
    ...userData,
    uid,
    type: userData.type,
    verified: isSupplier ? false : Boolean(userData.verified ?? true),
    rejected: false,
    createdAt: userData.createdAt || new Date().toISOString()
  };

  await setDoc(userDocRef, firestorePayload);
  return normalizeUserFromFirestore(uid, firestorePayload, userData.email, userData.name, userData.avatar);
}

/**
 * Non-destructively upgrades an existing `customer` document to `supplier` using `setDoc(..., { merge: true })`.
 * NEVER calls `deleteDoc`. Preserves all existing document fields and sets `verified: false` (pending admin approval).
 * If the deployed Firestore rules reject changing `type` on update, the existing document remains completely intact
 * and the truthful stored document is returned.
 */
async function upgradeCustomerDocToSupplier(
  uid: string,
  existingData: Record<string, any>,
  additionalData?: Partial<User>,
  fallbackEmail?: string | null,
  fallbackName?: string | null,
  fallbackPhoto?: string | null
): Promise<User> {
  const userDocRef = doc(db, "users", uid);
  const upgradeFields: Record<string, any> = {
    type: 'supplier',
    verified: false,
    rejected: Boolean(existingData.rejected ?? false),
    updatedAt: new Date().toISOString()
  };

  if (additionalData?.name) upgradeFields.name = additionalData.name;
  if (additionalData?.nameAr) upgradeFields.nameAr = additionalData.nameAr;
  if (additionalData?.company) upgradeFields.company = additionalData.company;
  if (additionalData?.location) upgradeFields.location = additionalData.location;
  if (additionalData?.phone) upgradeFields.phone = additionalData.phone;

  try {
    await setDoc(userDocRef, upgradeFields, { merge: true });
    const updatedSnap = await getDoc(userDocRef);
    if (updatedSnap.exists()) {
      return normalizeUserFromFirestore(uid, updatedSnap.data(), fallbackEmail, fallbackName, fallbackPhoto);
    }
    return normalizeUserFromFirestore(
      uid,
      { ...existingData, ...upgradeFields },
      fallbackEmail,
      fallbackName,
      fallbackPhoto
    );
  } catch (err) {
    console.warn("Non-destructive role upgrade was rejected by Firestore rules; keeping existing user document intact:", err);
    return normalizeUserFromFirestore(uid, existingData, fallbackEmail, fallbackName, fallbackPhoto);
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authOperationRef = useRef(false);

  useEffect(() => {
    // Clean up any legacy localStorage role/mock keys so browser storage cannot spoof roles
    safeLocalStorage.removeItem("enerjoo_mock_auth_uid");
    safeLocalStorage.removeItem("enerjoo_mock_user_data");
    safeLocalStorage.removeItem("enerjoo_local_users_map");

    let unsubUserDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (firebaseUser) {
        // Sync customer metadata record in background without blocking user role resolution
        (async () => {
          try {
            const custDocRef = doc(db, "customers", firebaseUser.uid);
            const custDocSnap = await getDoc(custDocRef);
            if (!custDocSnap.exists()) {
              await setDoc(custDocRef, {
                uid: firebaseUser.uid,
                fullName: firebaseUser.displayName || 'عميل إينرجو',
                email: firebaseUser.email || '',
                authProvider: 'google',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              }, { merge: true });
            } else {
              await setDoc(custDocRef, {
                lastLoginAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          } catch (custCheckErr) {
            console.warn("Notice checking customers collection:", custCheckErr);
          }
        })();

        const userDocRef = doc(db, "users", firebaseUser.uid);
        unsubUserDoc = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            const finalUser = normalizeUserFromFirestore(
              firebaseUser.uid,
              userDoc.data(),
              firebaseUser.email,
              firebaseUser.displayName,
              firebaseUser.photoURL
            );
            setUser(finalUser);
            setLoading(false);
          } else {
            // If an explicit register / signInWithGoogle / login operation is in progress,
            // wait for it to create the initial document to avoid a race condition.
            if (authOperationRef.current) {
              return;
            }

            const emailStr = (firebaseUser.email || "").toLowerCase().trim();
            const isAdminEmail = checkIsAdminEmail(emailStr);
            const defaultRole: 'customer' | 'admin' = isAdminEmail ? 'admin' : 'customer';

            const initialUser: User = {
              uid: firebaseUser.uid,
              email: emailStr,
              name: firebaseUser.displayName || emailStr.split('@')[0] || "User",
              nameAr: firebaseUser.displayName || emailStr.split('@')[0] || "مستخدم",
              type: defaultRole,
              phone: firebaseUser.phoneNumber || "",
              avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
              verified: true,
              rejected: false,
              createdAt: new Date().toISOString()
            };

            try {
              const createdUser = await createInitialUserDoc(firebaseUser.uid, initialUser);
              setUser(createdUser);
            } catch (saveErr) {
              console.warn("Could not save initial user doc:", saveErr);
              setUser(initialUser);
            }
            setLoading(false);
          }
        }, (err) => {
          console.error("User snapshot listening error:", err);
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  const register = async (email: string, password: string, additionalData: any = {}): Promise<User | null> => {
    const emailStr = email.toLowerCase().trim();
    const isAdminEmail = checkIsAdminEmail(emailStr);
    const requestedRole: 'customer' | 'supplier' | 'admin' = isAdminEmail
      ? 'admin'
      : (additionalData.type === 'supplier' ? 'supplier' : 'customer');

    authOperationRef.current = true;

    try {
      const res = await createUserWithEmailAndPassword(auth, emailStr, password);
      const firebaseUser = res.user;
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const existingSnap = await getDoc(userDocRef);

      let resolvedUser: User;
      if (!existingSnap.exists()) {
        const newUserData: User = {
          uid: firebaseUser.uid,
          email: emailStr,
          name: additionalData.name || "User",
          nameAr: additionalData.nameAr || additionalData.name || "مستخدم",
          type: requestedRole,
          company: additionalData.company || "",
          location: additionalData.location || "Cairo, Egypt",
          phone: additionalData.phone || "",
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
          verified: requestedRole === 'supplier' ? false : true,
          rejected: false,
          createdAt: new Date().toISOString()
        };
        resolvedUser = await createInitialUserDoc(firebaseUser.uid, newUserData);
      } else {
        const existingData = existingSnap.data();
        if (requestedRole === 'supplier' && existingData.type === 'customer') {
          resolvedUser = await upgradeCustomerDocToSupplier(
            firebaseUser.uid,
            existingData,
            additionalData,
            emailStr,
            additionalData.name,
            firebaseUser.photoURL
          );
        } else {
          resolvedUser = normalizeUserFromFirestore(
            firebaseUser.uid,
            existingData,
            emailStr,
            additionalData.name,
            firebaseUser.photoURL
          );
        }
      }

      setUser(resolvedUser);
      setLoading(false);
      return resolvedUser;
    } finally {
      authOperationRef.current = false;
    }
  };

  const login = async (
    email: string,
    password: string,
    _preferredRole?: 'customer' | 'supplier'
  ): Promise<User | null> => {
    const emailStr = email.toLowerCase().trim();
    const isAdminEmail = checkIsAdminEmail(emailStr);

    authOperationRef.current = true;

    try {
      const res = await signInWithEmailAndPassword(auth, emailStr, password);
      const firebaseUser = res.user;
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        // Strictly resolve role and verification status from the authoritative Firestore document
        const resolvedUser = normalizeUserFromFirestore(
          firebaseUser.uid,
          userDoc.data(),
          firebaseUser.email || emailStr,
          firebaseUser.displayName,
          firebaseUser.photoURL
        );
        setUser(resolvedUser);
        setLoading(false);
        return resolvedUser;
      } else {
        // If no Firestore profile exists yet for an existing Auth user, default safely to customer (or admin)
        const defaultRole: 'customer' | 'admin' = isAdminEmail ? 'admin' : 'customer';
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || emailStr,
          name: firebaseUser.displayName || emailStr.split('@')[0] || 'User',
          nameAr: firebaseUser.displayName || emailStr.split('@')[0] || 'مستخدم',
          type: defaultRole,
          company: "",
          location: "Cairo, Egypt",
          phone: "",
          avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
          verified: true,
          rejected: false,
          createdAt: new Date().toISOString()
        };

        const createdUser = await createInitialUserDoc(firebaseUser.uid, newUser);
        setUser(createdUser);
        setLoading(false);
        return createdUser;
      }
    } finally {
      authOperationRef.current = false;
    }
  };

  const signInWithGoogle = async (role: 'customer' | 'supplier' = 'customer'): Promise<User | null> => {
    authOperationRef.current = true;

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      const res = await signInWithPopup(auth, provider);
      if (!res || !res.user) return null;

      const firebaseUser = res.user;
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);

      const emailStr = (firebaseUser.email || "").toLowerCase().trim();
      const isAdminEmail = checkIsAdminEmail(emailStr);

      let finalUser: User;

      if (!userDoc.exists()) {
        const initialRole: 'customer' | 'supplier' | 'admin' = isAdminEmail ? 'admin' : role;
        const newUser: User = {
          uid: firebaseUser.uid,
          email: emailStr,
          name: firebaseUser.displayName || "User",
          nameAr: firebaseUser.displayName || "مستخدم جديد",
          type: initialRole,
          company: "",
          location: "Cairo, Egypt",
          phone: "",
          avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
          verified: initialRole === 'supplier' ? false : true,
          rejected: false,
          createdAt: new Date().toISOString()
        };

        finalUser = await createInitialUserDoc(firebaseUser.uid, newUser);
      } else {
        const existingData = userDoc.data();
        if (role === 'supplier' && existingData.type === 'customer' && !isAdminEmail) {
          finalUser = await upgradeCustomerDocToSupplier(
            firebaseUser.uid,
            existingData,
            undefined,
            firebaseUser.email,
            firebaseUser.displayName,
            firebaseUser.photoURL
          );
        } else {
          finalUser = normalizeUserFromFirestore(
            firebaseUser.uid,
            existingData,
            firebaseUser.email,
            firebaseUser.displayName,
            firebaseUser.photoURL
          );
        }
      }

      setUser(finalUser);
      setLoading(false);

      // Sync customer metadata record in background
      try {
        const custDocRef = doc(db, "customers", firebaseUser.uid);
        await setDoc(custDocRef, {
          uid: firebaseUser.uid,
          fullName: firebaseUser.displayName || 'عميل إينرجو',
          email: firebaseUser.email || '',
          authProvider: 'google',
          updatedAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        }, { merge: true });
      } catch (custErr) {
        console.warn("Customer sync notice:", custErr);
      }

      return finalUser;
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        console.info("Google Sign In popup was closed or cancelled by the user.");
        return null;
      }
      throw err;
    } finally {
      authOperationRef.current = false;
    }
  };

  const updateUserProfile = async (data: Partial<User>) => {
    if (!user) return;
    const safeData: Partial<User> = { ...data };
    if (user.type !== 'admin') {
      delete (safeData as any).type;
      delete (safeData as any).verified;
      delete (safeData as any).rejected;
      delete (safeData as any).uid;
    }

    const updatedUser = { ...user, ...safeData };
    setUser(updatedUser);

    try {
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        ...safeData,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (user.type === 'customer') {
        const custDocRef = doc(db, "customers", user.uid);
        await setDoc(custDocRef, {
          fullName: safeData.name || safeData.nameAr || user.name,
          phoneNumber: safeData.phone || user.phone || '',
          governorate: safeData.governorate || user.governorate || 'القاهرة',
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      console.error("Error updating user document in Firestore:", err);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    await signOut(auth);
    safeLocalStorage.removeItem("enerjoo_mock_auth_uid");
    safeLocalStorage.removeItem("enerjoo_mock_user_data");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      register, 
      login, 
      resetPassword,
      signInWithGoogle, 
      updateUserProfile, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
