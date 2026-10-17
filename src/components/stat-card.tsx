import Link from "next/link";
import type { ReactNode } from "react";

export function StatCard({
  href,
  className,
  active,
  children,
}: {
  href: string;
  className: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      data-on={active || undefined}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
