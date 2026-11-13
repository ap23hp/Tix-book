import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata: Metadata = {
  title: "Tixbook | Event tickets",
  description:
    "Browse upcoming comedy, music, business and workshop events, and book your ticket on Tixbook.",
};

const logo = "font-display font-extrabold [font-variation-settings:'wdth'_75] tracking-tight text-ink";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-page text-ink font-sans"
      >
        {/* Skip link: first thing keyboard users reach */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-surface"
        >
          Skip to main content
        </a>

        <header className="border-b border-line">
          <div className="mx-auto w-full max-w-300 px-6 py-4">
            <Link href="/" className={`text-2xl ${logo}`}>
              tixbook<span className="text-accent">.</span>
            </Link>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-300 flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-ink-muted">
            <span className={`text-lg ${logo}`}>
              tixbook<span className="text-accent">.</span>
            </span>
            <p>
              Built by Apra Khanna{" "}
              <a
                href="https://github.com/ap23hp/tix-book"
                className="ml-3 text-ink underline underline-offset-4"
              >
                GitHub
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}