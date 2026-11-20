"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const navLinks = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Departments", href: "#departments" },
  { label: "FAQ", href: "#faq" },
];

export default function NavbarLinks() {
  const [activeLink, setActiveLink] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  const displayedLink = hoveredLink ?? activeLink;

  useEffect(() => {
    let frame = 0;

    const updateActiveLink = () => {
      cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        // Activation line below the sticky navbar.
        const activationPoint = Math.min(
          window.innerHeight * 0.35,
          window.innerHeight - 100,
        );

        let currentSection: string | null = null;

        for (const item of navLinks) {
          const section = document.querySelector<HTMLElement>(item.href);

          if (!section) continue;

          const rect = section.getBoundingClientRect();

          if (rect.top <= activationPoint && rect.bottom > activationPoint) {
            currentSection = item.href;
            break;
          }
        }

        setActiveLink(currentSection);
      });
    };

    updateActiveLink();

    window.addEventListener("scroll", updateActiveLink, {
      passive: true,
    });

    window.addEventListener("resize", updateActiveLink);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveLink);
      window.removeEventListener("resize", updateActiveLink);
    };
  }, []);

  return (
    <div
      className="hidden items-center gap-2 md:flex"
      onMouseLeave={() => setHoveredLink(null)}
    >
      {navLinks.map((item) => {
        const isActive = displayedLink === item.href;

        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={activeLink === item.href ? "location" : undefined}
            onMouseEnter={() => setHoveredLink(item.href)}
            className={`relative isolate rounded-full px-5 py-2.5 text-[15px] font-medium transition-colors duration-200 ${
              isActive
                ? "text-brand-800"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="nav-active-indicator"
                className="absolute inset-0 -z-10 rounded-full border border-brand-200/70 bg-brand-100/70"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 35,
                  mass: 0.7,
                }}
              />
            )}

            {item.label}
          </a>
        );
      })}
    </div>
  );
}
