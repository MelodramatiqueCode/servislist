"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "@/lib/search";

type SearchResponse = {
  commands: SearchHit[];
  tickets: SearchHit[];
  stores: SearchHit[];
  devices: SearchHit[];
};

export function CommandTrigger() {
  return (
    <button type="button" className="cmd-bar" data-open-cmd="true">
      <span>⌕</span>
      <span>Napíš príkaz alebo hľadaj… „Leles“, „nový ticket“, „výjazd zajtra“</span>
      <span className="k">⌘K</span>
    </button>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setQ("");
    setData(null);
    setActive(0);
  }

  function openPalette() {
    setOpen(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") close();
    }
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-open-cmd]")) {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        setData((await res.json()) as SearchResponse);
        setActive(0);
      } catch {
        /* ignore abort */
      }
    }, q ? 120 : 0);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [open, q]);

  const hits = useMemo(() => {
    if (!data) return [];
    return [...data.commands, ...data.tickets, ...data.stores, ...data.devices];
  }, [data]);

  function go(href: string) {
    close();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="cmd-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="cmd-dialog" role="dialog" aria-label="Hľadanie">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hľadaj ticket, prevádzku, zariadenie alebo príkaz…"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((n) => Math.min(n + 1, Math.max(hits.length - 1, 0)));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => Math.max(n - 1, 0));
            }
            if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              go(hits[active].href);
            }
          }}
        />
        <div className="cmd-hits">
          {hits.length === 0 ? (
            <div className="cmd-hit">
              {q.trim() ? "Nič sa nenašlo." : "Začni písať, alebo vyber príkaz."}
            </div>
          ) : (
            hits.map((hit, i) => (
              <Link
                key={`${hit.kind}-${hit.id}`}
                href={hit.href}
                className="cmd-hit"
                data-on={i === active}
                onClick={() => close()}
              >
                <b>{hit.title}</b>
                {hit.hint ? <small>{hit.hint}</small> : null}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
