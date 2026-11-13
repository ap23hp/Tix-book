export default function Home() {
  return (
    <main className="p-8">
      <h1 className="font-display text-display-lg font-extrabold [font-variation-settings:'wdth'_75] text-ink">
        Upcoming events
      </h1>
      <p className="mt-4 text-accent font-mono text-label uppercase tracking-widest">
        Next up
      </p>
      <div className="mt-6 w-64 h-32 bg-surface rounded-ticket shadow-ticket" />
    </main>
  );
}
