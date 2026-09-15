import type { ReactNode } from "react";

export function MapsNavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ?? "text-sm font-semibold text-[var(--teal)]"
      }
    >
      {children}
    </a>
  );
}
