import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Brands Club | Picking inteligente",
  description: "Genera cortes de picking por cliente sin dividir números de pedido.",
  icons: {
    icon: "/the-brands-club.jpg",
    shortcut: "/the-brands-club.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          fontFamily:
            'var(--font-geist-sans), "Inter", "Segoe UI", system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
