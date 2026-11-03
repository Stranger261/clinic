import Link from "next/link";
import DemoBar from "@/components/demo-bar";
import Logo from "@/components/logo";
import NavLinks from "@/components/nav-links";
import SubmitButton from "@/components/submit-button";
import { signOut } from "@/lib/actions/auth";

export default function AppShell({
  title,
  name,
  links = [],
  children,
}: {
  title: string;
  name: string;
  links?: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-lg bg-surface px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Skip to main content
      </a>
      <DemoBar />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-3">
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-sm sm:block">
              <span className="block font-medium leading-tight">
                {name || "Signed in"}
              </span>
              <span className="block text-xs text-muted">{title}</span>
            </span>
            <form action={signOut}>
              <SubmitButton
                variant="secondary"
                size="sm"
                pendingLabel="Signing out..."
              >
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-5">
          <NavLinks links={links} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 py-8">
        {children}
      </main>
    </>
  );
}
