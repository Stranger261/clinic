"use client";

import { buttonClass } from "@/constants/ui";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted">
          An unexpected problem happened. Please try again.
        </p>
        <button onClick={reset} className={buttonClass()}>
          Try again
        </button>
      </div>
    </main>
  );
}
