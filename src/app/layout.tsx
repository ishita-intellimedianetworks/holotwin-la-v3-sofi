import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// LA2028 wayfinding overlay type system (from the HoloTwin Overlays design):
// Saira drives the "octagonal LA28-style" display / UI text (titles, labels,
// numbers, buttons), Barlow carries the body / descriptions.
//
// SELF-HOSTED (next/font/local, files in ./fonts) — next/font/google fetched
// these from Google Fonts at compile time, which stalled `next dev` for minutes
// on this network (3s timeout × 3 retries per file, dozens of files). The woff2
// latin subsets live in the repo instead, so compiles never touch the network.
// (Geist / Geist Mono / Bodoni Moda were dropped entirely: components-v5/styles.css
// overrides their variables to system fonts with !important, so they were
// downloaded but never rendered; globals.css now defines those variables as
// system stacks.)
const saira = localFont({
  // Variable font — one file covers all the weights the overlays use.
  src: "./fonts/saira-latin.woff2",
  weight: "300 700",
  variable: "--font-saira",
  display: "swap",
});

const barlow = localFont({
  src: [
    { path: "./fonts/barlow-latin-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/barlow-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/barlow-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/barlow-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/barlow-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HoloTwin Visualisation",
};

// Without width=device-width iOS uses a 980px virtual viewport and applies a
// 300ms tap delay to all touch events regardless of touch-action CSS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${saira.variable} ${barlow.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
