import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-3xl font-extrabold">Ticket sa nenašiel</h1>
      <p className="text-[var(--ink-soft)]">
        Možno bol odstránený alebo máš zlý odkaz.
      </p>
      <Link href="/" className="btn btn-primary">
        Späť na zoznam
      </Link>
    </div>
  );
}
