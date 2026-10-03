import type { Metadata, Viewport } from "next";
import { Inter, Manrope, Literata } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { SettingsProvider } from "@/components/SettingsProvider";
import { SiteProvider } from "@/components/SiteProvider";
import { ToastProvider } from "@/components/Toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const literata = Literata({ subsets: ["latin"], variable: "--font-literata" });

export const metadata: Metadata = {
  title: "HugoFlow - The Modern Git-based Front-end interface for Hugo",
  description: "A clean, Git-based Front-end interface for Hugo.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#161917" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* display=block: avoids icon ligature names ("arrow_back") flashing as text before the font loads. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet" />
        <script defer src="https://cloud.umami.is/script.js" data-website-id="c3c191eb-fea1-4a59-88cc-2bdfb8f28131"></script>
      </head>
      <body className={`${inter.variable} ${manrope.variable} ${literata.variable} font-sans text-[15px] antialiased min-h-screen flex flex-col`}>
        <AuthProvider>
          <SettingsProvider>
            <SiteProvider>
              <ToastProvider>{children}</ToastProvider>
            </SiteProvider>
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
