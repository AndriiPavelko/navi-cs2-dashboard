import Link from "next/link";

export default function NotFound() {
  return (
    <section className="hero empty-hero">
      <h2>Такої сторінки немає</h2>
      <p>
        <Link href="/">На головну</Link>
      </p>
    </section>
  );
}
