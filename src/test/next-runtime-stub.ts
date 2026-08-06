// Shared fake for the pieces of the Next.js request runtime (cookies,
// headers, redirect, revalidatePath) that Server Actions rely on but that
// only exist inside an actual request — vitest calls them as plain
// functions outside of Next entirely. One implementation, wired into every
// Server Action integration test the same way via `vi.mock`, rather than
// each test file inventing its own.
class FakeCookieStore {
  private store = new Map<string, string>();

  get(name: string) {
    return this.store.has(name) ? { name, value: this.store.get(name)! } : undefined;
  }
  set(name: string, value: string) {
    this.store.set(name, value);
  }
  delete(name: string) {
    this.store.delete(name);
  }
  clear() {
    this.store.clear();
  }
}

export const fakeCookies = new FakeCookieStore();
export const fakeRequestHeaders = new Map<string, string>();

// `redirect()` normally throws a special Next-internal signal that the
// framework catches to actually perform the redirect. Outside Next, we
// throw our own recognizable signal so a test can assert "this action tried
// to redirect to X" via `.rejects.toThrow(RedirectSignal)` / catching it.
export class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

export function resetNextRuntime() {
  fakeCookies.clear();
  fakeRequestHeaders.clear();
}
