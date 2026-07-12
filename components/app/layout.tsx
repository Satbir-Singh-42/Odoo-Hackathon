import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AssetFlow — IT Asset Management",
    template: "%s | AssetFlow",
  },
  description:
    "Enterprise IT Asset Management — track, allocate, and maintain all your hardware, software, and networking assets.",
  keywords: ["asset management", "IT assets", "inventory", "allocations", "maintenance"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          {children}
          <Toaster
            position="top-right"
            offset="75px"
            richColors
            closeButton
            expand={true}
            duration={4000}
            visibleToasts={5}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
