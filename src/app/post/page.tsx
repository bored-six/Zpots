"use client";

import dynamic from "next/dynamic";

import Bilingual from "@/components/Bilingual";
import ClipboardShell from "@/components/ClipboardShell";

// PostFlow's tap map pulls in react-leaflet, which touches `window`, so it
// can only ever load client-side -- this is the ssr:false client boundary
// that makes that legal, since next/dynamic with ssr:false cannot be called
// from a Server Component.
const PostFlow = dynamic(() => import("@/components/PostFlow"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-stone-deep">
      <Bilingual k="loading" />
    </div>
  ),
});

export default function PostPage() {
  return (
    <ClipboardShell>
      <PostFlow />
    </ClipboardShell>
  );
}
