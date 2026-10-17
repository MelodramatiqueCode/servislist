import { kontrolaLoginAction } from "@/lib/actions";

export function KontrolaLocked({
  configured,
  error,
}: {
  configured: boolean;
  error?: string;
}) {
  return (
    <div className="shell detail-page max-w-md space-y-6">
      <div>
        <div className="label">🛡 Admin · len Martin</div>
        <h1 className="mt-2 text-3xl font-extrabold">Kontrola</h1>
        <p className="text-[var(--ink-soft)]">
          {configured
            ? "Zadaj heslo. Ostaneš prihlásený 30 dní."
            : "Heslo ešte nie je nastavené. Martin musí pridať KONTROLA_PASSWORD vo Vercel (Environment Variables) a spraviť Redeploy."}
        </p>
      </div>
      {configured ? (
        <form action={kontrolaLoginAction} className="panel space-y-4 p-5">
          <div className="field">
            <label htmlFor="password">Heslo</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error === "1" ? (
            <p className="text-sm text-[var(--danger)]">Nesprávne heslo.</p>
          ) : null}
          {error === "limit" ? (
            <p className="text-sm text-[var(--danger)]">
              Príliš veľa pokusov. Skús znova o chvíľu.
            </p>
          ) : null}
          <button className="btn btn-primary w-full" type="submit">
            Odomknúť
          </button>
        </form>
      ) : (
        <div className="panel p-5 text-sm text-[var(--ink-soft)]">
          Prístup je zamietnutý, kým heslo nie je nastavené.
        </div>
      )}
    </div>
  );
}
