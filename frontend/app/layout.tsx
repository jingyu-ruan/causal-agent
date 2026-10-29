import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://causal-agent-sage.vercel.app"),
  title: {
    default: "Causal Agent | Research Workspace",
    template: "%s · Causal Agent",
  },
  description: "A research workspace for auditable causal decisions. Design a study, prepare evidence, and inspect reproducible results.",
  openGraph: {
    title: "Causal Agent",
    description: "From a causal question to an evidence-based decision.",
    type: "website",
    images: [{ url: "/og-causal-decision-v3.png", width: 1733, height: 907, alt: "Causal Agent conversation and execution workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Causal Agent",
    description: "From a causal question to an evidence-based decision.",
    images: ["/og-causal-decision-v3.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/inter-latin-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/geist-latin-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
