// import { useState } from "react"; // No longer needed here
import { Geist, Geist_Mono } from "next/font/google";
// import Link from "next/link"; // No longer needed here if header handles all nav
import { Toaster } from "@/components/ui/sonner"; // Import Toaster
import "./globals.css";
import { ThemeProvider } from "next-themes"; // Import ThemeProvider
import { ToastHandler } from "../components/ui/toast-handler";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Add h-full to html and body for flex layout to work correctly
    <html lang="en" className="h-full" suppressHydrationWarning>
      {/* Removed whitespace here */}
      <body
        // Make body a flex column that fills height
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground flex flex-col h-full`} // Use theme variables for bg/text
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {/* Use the new AppHeader component */}
          {/* Main content area that grows to fill available space */}
          <main className="flex-grow">{children}</main>
          {/* Footer */}
          <Toaster richColors /> {/* Ensure Toaster is still here */}
          <ToastHandler />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
