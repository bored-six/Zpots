"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import Bilingual from "@/components/Bilingual";
import {
  CameraIcon,
  MapIcon,
  MeIcon,
  PeopleIcon,
  SpotsIcon,
  type NavIconProps,
} from "@/components/icons/nav-icons";
import { bilingualLabel } from "@/lib/copy";

interface TabItem {
  href: string;
  copyKey: "spots" | "miMapa" | "gente" | "yo";
  Icon: ComponentType<NavIconProps>;
}

// social-spots.md UI spec ("Navigation"): Spots, Mi mapa, camera (center),
// Gente, Yo -- the camera tab is rendered separately (below) so it can sit
// visually raised between these two halves on the phone bottom bar.
const LEADING_TABS: TabItem[] = [
  { href: "/", copyKey: "spots", Icon: SpotsIcon },
  { href: "/mapa", copyKey: "miMapa", Icon: MapIcon },
];

const TRAILING_TABS: TabItem[] = [
  { href: "/gente", copyKey: "gente", Icon: PeopleIcon },
  { href: "/yo", copyKey: "yo", Icon: MeIcon },
];

const TAB_LINK_CLASS =
  "flex flex-1 flex-col items-center justify-center gap-1 border-t-[3px] px-1 py-2 text-center " +
  "lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:border-t-0 lg:border-l-[3px] lg:px-6 lg:py-3";

function TabLink({ item, isActive }: { item: TabItem; isActive: boolean }) {
  const { Icon } = item;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={`${TAB_LINK_CLASS} ${isActive ? "border-teal text-teal" : "border-transparent text-stone-deep hover:text-ink"}`}
    >
      <Icon size={22} />
      <span className="text-[11px] leading-tight lg:text-sm">
        <Bilingual k={item.copyKey} />
      </span>
    </Link>
  );
}

/**
 * Phone (< 1024px): a fixed bottom bar. Desktop (>= 1024px): a fixed left
 * rail with the wordmark on top. Both are the same five links laid out with
 * responsive Tailwind classes on one markup tree (never two parallel copies
 * of the nav), so exactly one element ever matches a given link's
 * accessible name regardless of viewport.
 */
export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-stone bg-cream-deep lg:inset-y-0 lg:left-0 lg:right-auto lg:h-auto lg:w-24 lg:flex-col lg:items-stretch lg:border-t-0 lg:border-r"
    >
      <p
        className="hidden shrink-0 px-6 py-6 text-lg tracking-wide text-ink lg:block"
        style={{ fontFamily: "var(--font-wordmark)" }}
      >
        Zpots
      </p>

      {LEADING_TABS.map((item) => (
        <TabLink key={item.href} item={item} isActive={pathname === item.href} />
      ))}

      <Link
        href="/post"
        aria-label={bilingualLabel("addSpot")}
        aria-current={pathname === "/post" ? "page" : undefined}
        className="flex flex-1 items-center justify-center lg:flex-none lg:justify-start lg:px-6 lg:py-3"
      >
        <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-cream shadow-md lg:mt-0 lg:h-11 lg:w-11">
          <CameraIcon size={26} />
        </span>
      </Link>

      {TRAILING_TABS.map((item) => (
        <TabLink key={item.href} item={item} isActive={pathname === item.href} />
      ))}
    </nav>
  );
}
