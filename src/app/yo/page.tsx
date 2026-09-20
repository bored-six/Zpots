"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuth } from "@/components/AuthProvider";
import Bilingual from "@/components/Bilingual";
import ClipboardShell from "@/components/ClipboardShell";
import { getMyProfile } from "@/lib/profiles-repo";

/**
 * `/yo` never renders its own profile UI -- it is a pure signed-in redirect
 * to `/u/<my handle>` (the profile page, owned by a different wave, is
 * where avatar/counts/grid actually live). Signed-out visitors get the same
 * inline sign-in gate shape as the Settings page's signed-out view, rather
 * than the in-map `SignInPrompt` modal, since there is no map gesture to
 * dismiss back into here.
 */
export default function YoPage() {
  const { status } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (status !== "signed-in" || hasRedirected.current) return;

    let isMounted = true;
    getMyProfile().then((profile) => {
      if (!isMounted || !profile) return;
      hasRedirected.current = true;
      router.replace(`/u/${profile.handle}`);
    });

    return () => {
      isMounted = false;
    };
  }, [status, router]);

  return (
    <ClipboardShell>
      {status === "loading" && (
        <p className="text-sm text-ink/70">
          <Bilingual k="loading" />
        </p>
      )}

      {status === "signed-out" && (
        <div className="flex flex-col gap-3">
          <h1
            className="text-xl font-semibold text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <Bilingual k="signInFirst" />
          </h1>
          <Link
            href="/login?next=/yo"
            className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded bg-terracotta px-4 py-2 text-sm font-bold text-cream hover:bg-terracotta-deep"
          >
            Sign in
          </Link>
        </div>
      )}
    </ClipboardShell>
  );
}
