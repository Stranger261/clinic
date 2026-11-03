import Logo from "@/components/logo";
import { ButtonLink } from "@/components/ui";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md space-y-4 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted">The page you are looking for does not exist or has moved.</p>
        <ButtonLink href="/">Back to the home page</ButtonLink>
      </div>
    </main>
  );
}
