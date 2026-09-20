import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "@/lib/copy";

/**
 * social-spots.md Testing section: "AppNav.test.tsx (routes only)" -- this
 * only checks that the five nav items point at the right routes and that
 * the current route is marked accessibly (aria-current), never spacing,
 * colors, or the "3px vinta rule" active-state styling.
 */

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

beforeEach(() => {
  pathname = "/";
});

async function renderAppNav() {
  const AppNav = (await import("@/components/AppNav")).default;
  return render(<AppNav />);
}

describe("AppNav -- routes", () => {
  it("links Spots to /", async () => {
    await renderAppNav();

    expect(screen.getByRole("link", { name: new RegExp(COPY.spots.en, "i") })).toHaveAttribute("href", "/");
  });

  it("links Mi mapa to /mapa", async () => {
    await renderAppNav();

    expect(screen.getByRole("link", { name: new RegExp(COPY.miMapa.en, "i") })).toHaveAttribute("href", "/mapa");
  });

  it("links Gente to /gente", async () => {
    await renderAppNav();

    expect(screen.getByRole("link", { name: new RegExp(COPY.gente.en, "i") })).toHaveAttribute("href", "/gente");
  });

  it("links Yo to /yo", async () => {
    await renderAppNav();

    expect(screen.getByRole("link", { name: new RegExp(COPY.yo.en, "i") })).toHaveAttribute("href", "/yo");
  });

  it("has a link to /post for the camera / new-spot action", async () => {
    const { container } = await renderAppNav();

    expect(container.querySelector('a[href="/post"]')).toBeTruthy();
  });

  it("renders exactly 5 nav links (Spots, Mi mapa, post, Gente, Yo)", async () => {
    const { container } = await renderAppNav();

    const hrefs = new Set(
      Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
    );
    expect(hrefs).toEqual(new Set(["/", "/mapa", "/post", "/gente", "/yo"]));
  });
});

describe("AppNav -- active route", () => {
  it("marks the current route's link with aria-current='page'", async () => {
    pathname = "/mapa";
    await renderAppNav();

    expect(screen.getByRole("link", { name: new RegExp(COPY.miMapa.en, "i") })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark a non-current route's link as current", async () => {
    pathname = "/mapa";
    await renderAppNav();

    expect(screen.getByRole("link", { name: new RegExp(COPY.spots.en, "i") })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("Spots is current on the home route", async () => {
    pathname = "/";
    await renderAppNav();

    expect(screen.getByRole("link", { name: new RegExp(COPY.spots.en, "i") })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
