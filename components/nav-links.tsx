"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  // A section home like /admin must match exactly, or it would stay highlighted on every sub-page.
  const isActive = (href: string) => {
    const hasChild = links.some(
      (o) => o.href !== href && o.href.startsWith(`${href}/`),
    );
    return hasChild
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
