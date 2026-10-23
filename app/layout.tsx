import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { Shell } from "@/components/shell";
import { ensureSchema } from "@/lib/db";
import { getLastSync } from "@/lib/data";
import "./globals.css";

const body = Manrope({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});

const display = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "NAVI CS2",
  description: "Мобільний дашборд NAVI CS2: сезон 2026, шанс серії і пульс публічних дописів.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4ecdf",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let syncedAt: string | null = null;
  let dbError: string | null = null;
  try {
    await ensureSchema();
    syncedAt = await getLastSync();
  } catch {
    dbError = "База недоступна. Перевір DATABASE_URL і що Postgres запущений.";
  }

  return (
    <html lang="uk" className={`${body.variable} ${display.variable}`}>
      <body>
        <Shell syncedAt={syncedAt} dbError={dbError}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
