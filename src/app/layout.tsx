"use client"; // Required for useState and onClick

import type { Metadata } from "next";
import { useState } from "react"; // Import useState
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner"; // Import Toaster
import "./globals.css";

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Close menu when a link is clicked (optional but good UX)
  const handleMobileLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    // Add h-full to html and body for flex layout to work correctly
    <html lang="en" className="h-full">
      <body
        // Make body a flex column that fills height
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col h-full`}
      >
        {/* Responsive Navbar - Remains sticky */}
        <div className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:border-border/60 dark:bg-zinc-900/95 flex-shrink-0">
          {" "}
          {/* Added flex-shrink-0 */}
          {/* Adjusted container padding for mobile */}
          <div className="container mx-auto flex h-14 max-w-screen-2xl items-center px-4 md:px-6">
            {/* App Title/Logo - Ensure it's always visible */}
            <Link href="/" className="mr-auto flex items-center space-x-2">
              {/* You could add an SVG logo here */}
              <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400">
                MBTI Chat
              </span>
            </Link>

            {/* Desktop Navigation Links (Hidden on small screens) */}
            <nav className="hidden flex-1 items-center justify-end space-x-6 text-sm font-medium md:flex">
              <Link
                href="/"
                className="transition-colors hover:text-foreground/80 text-foreground/60 dark:hover:text-foreground/90 dark:text-foreground/70"
              >
                Home
              </Link>
              <Link
                href="/profile"
                className="transition-colors hover:text-foreground/80 text-foreground/60 dark:hover:text-foreground/90 dark:text-foreground/70"
              >
                Profile
              </Link>
              <Link
                href="/find-chat"
                className="transition-colors hover:text-foreground/80 text-foreground/60 dark:hover:text-foreground/90 dark:text-foreground/70"
              >
                Find Chat
              </Link>
              {/* Consider adding Login/Logout conditionally here later */}
            </nav>

            {/* Mobile Menu Button (Visible on small screens) */}
            {/* Add client-side logic to toggle a mobile menu */}
            <button
              onClick={toggleMobileMenu} // Add onClick handler
              className="ml-4 flex items-center justify-center rounded-md p-2 text-foreground/60 hover:text-foreground/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 md:hidden"
              aria-label="Toggle Menu" // Add aria-label for accessibility
            >
              {/* Change icon based on state (optional) */}
              {isMobileMenuOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg> // Close Icon
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <line x1="4" x2="20" y1="12" y2="12"></line>
                  <line x1="4" x2="20" y1="6" y2="6"></line>
                  <line x1="4" x2="20" y1="18" y2="18"></line>
                </svg> // Hamburger Icon
              )}
              {/* <svg
                xmlns="http://www.w3.org/2000/svg" // Original hamburger icon kept for reference
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
              <span className="sr-only">Toggle Menu</span> */}
            </button>
          </div>
          {/* Mobile Menu container, conditionally rendered */}
          {isMobileMenuOpen && (
            <div className="absolute top-full left-0 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:border-border/60 dark:bg-zinc-900/95 p-4 md:hidden">
              <nav className="flex flex-col space-y-4 text-sm font-medium">
                <Link
                  href="/"
                  onClick={handleMobileLinkClick} // Close menu on click
                  className="transition-colors hover:text-foreground/80 text-foreground/60 dark:hover:text-foreground/90 dark:text-foreground/70"
                >
                  Home
                </Link>
                <Link
                  href="/profile"
                  onClick={handleMobileLinkClick} // Close menu on click
                  className="transition-colors hover:text-foreground/80 text-foreground/60 dark:hover:text-foreground/90 dark:text-foreground/70"
                >
                  Profile
                </Link>
                <Link
                  href="/find-chat"
                  onClick={handleMobileLinkClick} // Close menu on click
                  className="transition-colors hover:text-foreground/80 text-foreground/60 dark:hover:text-foreground/90 dark:text-foreground/70"
                >
                  Find Chat
                </Link>
                {/* Add Login/Logout link here if needed */}
              </nav>
            </div>
          )}
        </div>
        {/* Removed padding, allow children to control */}
        {children}
        <Toaster /> {/* Add Toaster here */}
      </body>
    </html>
  );
}
