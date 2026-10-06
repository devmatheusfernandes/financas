import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { BarraOffline, RegistrarServiceWorker } from "@/components/offline";
import { ThemeSync } from "@/components/theme";
import { themeInitScript } from "@/components/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle financeiro",
  description: "Planilha de finanças da família, com budget e lançamentos por IA.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finanças", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1211" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: o script abaixo põe a classe "dark" no <html> antes do React hidratar
    <html lang="pt-BR" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full font-sans">
        <ThemeSync />
        <RegistrarServiceWorker />
        <BarraOffline />
        {children}
      </body>
    </html>
  );
}
