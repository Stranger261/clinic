import Link from "next/link";
import Logo from "@/components/logo";
import SafeImage from "@/components/safe-image";
import { ButtonLink, Card } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { BRAND, SERVICES } from "@/lib/brand";
import { demoEnabled } from "@/lib/demo";
import { liftClass } from "@/constants";
import Faq from "@/components/faq";
import { FAQ, FEATURES, STEPS } from "@/constants";

const dashboardFor = (role: string) =>
  role === "admin" ? "/admin" : role === "doctor" ? "/doctor" : "/book";

export default async function Home() {
  const profile = await getProfile();
  const demo = demoEnabled();
  const primaryHref = profile ? dashboardFor(profile.role) : "/login";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label={`${BRAND.name} home`}>
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
            <a href="#departments" className="hover:text-ink">
              Departments
            </a>
            <a href="#faq" className="hover:text-ink">
              FAQ
            </a>
          </div>
          <ButtonLink href={primaryHref}>
            {profile ? "Go to your account" : demo ? "Try the demo" : "Sign in"}
          </ButtonLink>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="text-sm font-semibold text-brand-700">
              {BRAND.tagline}
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Book your clinic visit in a few clicks.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Find an open time, tell your doctor why you are coming, and manage
              everything online.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={primaryHref}>
                {profile
                  ? "Book an appointment"
                  : demo
                    ? "Try the demo"
                    : "Book an appointment"}
              </ButtonLink>
              <ButtonLink href="#how" variant="secondary">
                See how it works
              </ButtonLink>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-4/3 overflow-hidden rounded-3xl bg-linear-to-br from-brand-100 via-brand-200 to-brand-300 shadow-lg">
              <SafeImage
                src="/images/hero.jpg"
                alt="A calm, welcoming clinic reception"
                priority
              />
            </div>
            <div className="absolute -bottom-5 left-5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-md">
              <p className="font-semibold">Free cancellation</p>
              <p className="text-muted">Up to 24 hours before your visit</p>
            </div>
          </div>
        </section>

        <section
          id="how"
          className="scroll-mt-20 border-y border-line bg-surface"
        >
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-3xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-1 text-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} lift>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-muted">{f.text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="departments"
          className="scroll-mt-20 border-y border-line bg-surface"
        >
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-3xl font-semibold tracking-tight">
              Our departments
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map((s) => (
                <div
                  key={s.title}
                  className={`rounded-2xl border border-transparent bg-brand-50 p-5 ${liftClass}`}
                >
                  <h3 className="font-semibold text-brand-800">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-8">
            <Faq items={FAQ} />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="rounded-3xl bg-brand-600 px-8 py-12 text-center text-white">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready when you are
            </h2>
            <p className="mx-auto mt-3 max-w-md text-brand-100">
              Find a time that works for you in under a minute.
            </p>
            <div className="mt-6">
              <Link
                href={primaryHref}
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                {profile
                  ? "Book an appointment"
                  : demo
                    ? "Try the demo"
                    : "Sign in to book"}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-2 max-w-md">
              This is a demo project with fake data. It is not a real clinic, so
              please do not enter real personal or medical information.
            </p>
          </div>
          <p>
            {BRAND.email} · {BRAND.phone}
          </p>
        </div>
      </footer>
    </>
  );
}
