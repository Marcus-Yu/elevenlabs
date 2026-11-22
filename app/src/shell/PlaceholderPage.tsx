// Stand-in for a feature page that its owning work package has not built yet.
// Shows no data, so nothing on it can be mistaken for a real result.
export function PlaceholderPage({ title, purpose, owner }: { title: string; purpose: string; owner: string }) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-neutral-700">{purpose}</p>
      <p className="text-sm text-neutral-500">Not built yet ({owner}).</p>
    </section>
  );
}
