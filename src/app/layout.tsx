"use client"; // Required for AppHeader which uses client hooks

import type { Metadata } from "next";
// import { useState } from "react"; // No longer needed here
import { Geist, Geist_Mono } from "next/font/google";
// import Link from "next/link"; // No longer needed here if header handles all nav
import { Toaster } from "@/components/ui/sonner"; // Import Toaster
import "./globals.css";
import { AppHeader } from "@/components/layout/header"; // Import AppHeader
import { ThemeProvider } from "next-themes"; // Import ThemeProvider

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Removed

  // const toggleMobileMenu = () => { // Removed
  //   setIsMobileMenuOpen(!isMobileMenuOpen);
  // };

  // // Close menu when a link is clicked (optional but good UX)
  // const handleMobileLinkClick = () => { // Removed
  //   setIsMobileMenuOpen(false);
  // };

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
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppHeader /> {/* Use the new AppHeader component */}
          {/* Main content area that grows to fill available space */}
          <main className="flex-grow container mx-auto px-4 py-8">
            {children}
          </main>
          {/* Footer */}
          <footer className="py-6 px-4 border-t border-border bg-card text-card-foreground flex-shrink-0">
            {" "}
            {/* Use theme variables */}
            <div className="container mx-auto text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} AnonChat MBTI. All rights reserved.
            </div>
          </footer>
          <Toaster richColors /> {/* Ensure Toaster is still here */}
        </ThemeProvider>
      </body>
    </html>
  );
}
