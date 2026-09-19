"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import {
  getSession,
  purgeLegacyLocalData,
  signOut as authSignOut,
  subscribeToAuth,
  toAuthUser,
  type AuthStatus,
  type AuthUser,
} from "@/lib/auth";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

/**
 * Mounted once in layout.tsx around {children}. Initial state is identical
 * on server and client (`loading`, no user) so there is no hydration
 * mismatch; the real session is only read post-mount.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  useEffect(() => {
    let isMounted = true;

    purgeLegacyLocalData();

    getSession()
      .then((session) => {
        if (!isMounted) return;
        setState(
          session
            ? { status: "signed-in", user: toAuthUser(session.user) }
            : { status: "signed-out", user: null },
        );
      })
      .catch(() => {
        if (!isMounted) return;
        setState({ status: "signed-out", user: null });
      });

    const unsubscribe = subscribeToAuth((user) => {
      if (!isMounted) return;
      setState(user ? { status: "signed-in", user } : { status: "signed-out", user: null });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    status: state.status,
    user: state.user,
    signOut: authSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Throws if used outside the provider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth() must be used within an <AuthProvider>.");
  }
  return context;
}
