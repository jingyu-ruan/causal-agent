import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://causal-agent-capstone.rjy020128.chatgpt.site"),
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
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
