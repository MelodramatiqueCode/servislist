import type { Metadata } from "next";
import { Source_Sans_3, Syne } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ServisList — servisné tickety",
  description:
    "Jednoduchý ticketing pre servis zariadení. Zadávaj problémy, sleduj stav a poznámky ako v to-do liste.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="sk"
      className={`${syne.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="site-header">
          <div className="shell flex items-center justify-between gap-4 py-3.5">
            <Link href="/" className="brand">
              Servis<span>List</span>
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/" className="btn btn-ghost">
                Tickety
              </Link>
              <Link href="/zariadenia" className="btn btn-ghost">
                Zariadenia
              </Link>
              <Link href="/novy" className="btn btn-primary">
                + Nový problém
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 py-8 md:py-10">{children}</main>
        <footer className="shell pb-8 pt-2 text-sm text-[var(--ink-soft)]">
          ServisList — ticketing pre servisákov. Problémy ako to-do list.
        </footer>
      </body>
    </html>
  );
}
