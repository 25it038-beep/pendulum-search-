import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getAuthToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  // Keep ID token strictly in memory (never localStorage)
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          tokenRef.current = await nextUser.getIdToken();
        } catch {
          tokenRef.current = null;
        }
      } else {
        tokenRef.current = null;
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      tokenRef.current = await cred.user.getIdToken();
    } catch (err: any) {
      const msg =
        err?.code === 'auth/popup-closed-by-user'
          ? 'Sign-in cancelled.'
          : err?.message || 'Unable to complete Google sign-in.';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    tokenRef.current = null;
    await signOut(auth);
  }, []);

  const getAuthToken = useCallback(async () => {
    if (!auth.currentUser) {
      tokenRef.current = null;
      return null;
    }
    try {
      const fresh = await auth.currentUser.getIdToken();
      tokenRef.current = fresh;
      return fresh;
    } catch {
      return tokenRef.current;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        signInWithGoogle,
        signOutUser,
        getAuthToken
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
