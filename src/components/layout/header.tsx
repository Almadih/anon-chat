"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Menu,
  MessageSquareText,
  UserCircle,
  LogIn,
  LogOut,
  Search,
  MessageCircle,
  MessageSquare,
  User as UserIcon,
  Home,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const navigationItems = [
  {
    name: "Home",
    href: "/",
    icon: Home,
  },
  {
    name: "Find Chat",
    href: "/find-chat",
    icon: Search,
  },
  {
    name: "Profile",
    href: "/profile",
    icon: UserIcon,
  },
];

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      setIsAuthLoading(true);
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setIsAuthLoading(false);
    };
    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener.subscription?.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login"); // Redirect to login after logout
  };

  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              AnonChat
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 ml-8">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "relative px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-purple-50",
                      isActive
                        ? "text-purple-700 bg-gradient-to-r from-purple-50 to-pink-50 hover:text-purple-900"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.name}
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-6 h-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full" />
                    )}
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center space-x-1 ml-8">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "relative p-2 transition-all duration-200",
                      isActive
                        ? "text-purple-700 bg-gradient-to-r from-purple-50 to-pink-50 hover:text-purple-900"
                        : "text-gray-600 hover:text-gray-900 hover:bg-purple-50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-4 h-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full" />
                    )}
                  </Button>
                </Link>
              );
            })}
          </div>

          <div className="ml-auto">
            <Button
              className="cursor-pointer"
              variant="outline"
              onClick={handleLogout}
            >
              Logout
              <LogOut />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
