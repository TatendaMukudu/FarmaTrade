import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">FarmaTrade</h1>
      <p className="max-w-md text-muted-fg">
        The digital operating layer for farm owners who don&apos;t work the
        land themselves.
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-control border border-black px-4 py-2 text-sm font-medium"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
