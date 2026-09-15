"use client";

import { deleteVyjazdAction } from "@/lib/actions";

export function DeleteVyjazdButton({ id }: { id: string }) {
  return (
    <form
      action={deleteVyjazdAction}
      onSubmit={(e) => {
        if (!window.confirm("Naozaj zmazať tento výjazd? Akcia je nezvratná.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn btn-ghost w-full"
        style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
      >
        Zmazať výjazd
      </button>
    </form>
  );
}
