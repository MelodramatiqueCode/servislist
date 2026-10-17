export function DlFileLink({
  url,
  name,
  className,
}: {
  url?: string;
  name?: string;
  className?: string;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={className ?? "font-semibold underline underline-offset-2"}
    >
      {name?.trim() || "Doklad"}
    </a>
  );
}
