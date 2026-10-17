"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandPalette } from "./command-palette";

const NAV = [
  { href: "/", label: "Tickety", icon: "▤", exact: true },
  { href: "/prevadzky", label: "Prevádzky", icon: "⌂" },
  { href: "/zariadenia", label: "Zariadenia", icon: "⦿" },
  { href: "/vyjazdy", label: "Výjazdy", icon: "⇢" },
  { href: "/sklad", label: "Sklad", icon: "▦" },
] as const;

function navOn(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname() || "/";
  return (
    <header className="site-header">
      <div className="shell">
        <Link href="/" className="brand">
          <i>▶</i>Servis<span>List</span>
        </Link>
        <nav className="top-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-on={navOn(pathname, item.href, "exact" in item && item.exact)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href="/prevadzky/nova" className="btn btn-outline whitespace-nowrap">
            + Nová prevádzka
          </Link>
          <Link href="/novy" className="btn btn-primary whitespace-nowrap">
            + Nový problém
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MobileChrome() {
  const pathname = usePathname() || "/";
  return (
    <>
      <Link href="/novy" className="fab" aria-label="Nový problém">
        +
      </Link>
      <nav className="tabbar" aria-label="Hlavná navigácia">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-on={navOn(pathname, item.href, "exact" in item && item.exact)}
          >
            <b>{item.icon}</b>
            {item.label}
          </Link>
        ))}
      </nav>
      <CommandPalette />
    </>
  );
}
