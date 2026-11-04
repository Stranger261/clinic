"use client";

import { buttonClass } from "@/constants";
import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel?: string; // text shown while sending, for example "Booking..."
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  className?: string;
  raw?: boolean; // use className exactly as given, with no button styles
  spinner?: boolean;
  title?: string;
};

// A submit button that disables itself while its form is being sent, so a second click
// (or pressing Enter again) does nothing. It must sit inside the <form>, because
// useFormStatus reads the nearest parent form.
export default function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className = "",
  raw = false,
  spinner = true,
  title,
}: Props) {
  const { pending } = useFormStatus();
  const styles = raw ? className : `${buttonClass(variant, size)} ${className}`;

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      title={title}
      className={`${styles} ${pending ? "cursor-wait opacity-70" : ""}`}
    >
      {pending && spinner && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      className="mr-2 h-4 w-4 animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
