import { after } from "next/server";

/**
 * Run work after the HTTP response is sent on Vercel/Next.
 * Outside a request (tests, scripts) the work is awaited so side effects
 * still complete and assertions see them.
 */
export function afterResponse(work: () => Promise<unknown> | unknown) {
  const run = async () => {
    try {
      await work();
    } catch {
      /* side effects must not fail the caller */
    }
  };

  const onPlatform = Boolean(process.env.VERCEL || process.env.NEXT_RUNTIME);
  if (onPlatform) {
    try {
      after(run);
      return;
    } catch {
      /* not inside a Next request — fall through */
    }
  }

  return run();
}
