'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Button } from '@/components/ui/button';
import { BookOpen, User, LogOut, Upload, Menu, X, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Prefetch common routes for faster navigation
    if (typeof window !== 'undefined') {
      router.prefetch('/browse');
      router.prefetch('/upload');
      router.prefetch('/profile');
      router.prefetch('/leaderboard');
    }
  }, [router]);

  // Show nav items once auth check is done
  const isReady = !loading;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <nav className="bg-white/95 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 shadow-sm" role="navigation" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo - Enhanced Branding */}
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="NoteMitra Home">
            {/* Premium Logo SVG */}
            <div className="relative">
              <svg 
                className="w-9 h-9 md:w-10 md:h-10 transition-transform duration-300 group-hover:scale-105" 
                viewBox="0 0 48 48" 
                fill="none"
                aria-hidden="true"
              >
                {/* Book base */}
                <defs>
                  <linearGradient id="bookGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#6366F1" />
                  </linearGradient>
                  <linearGradient id="pageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#EEF2FF" />
                    <stop offset="100%" stopColor="#E0E7FF" />
                  </linearGradient>
                </defs>
                
                {/* Open book shape */}
                <path 
                  d="M6 12C6 10.8954 6.89543 10 8 10H20C22.2091 10 24 11.7909 24 14V38C24 36.8954 23.1046 36 22 36H8C6.89543 36 6 35.1046 6 34V12Z" 
                  fill="url(#bookGradient)"
                />
                <path 
                  d="M42 12C42 10.8954 41.1046 10 40 10H28C25.7909 10 24 11.7909 24 14V38C24 36.8954 24.8954 36 26 36H40C41.1046 36 42 35.1046 42 34V12Z" 
                  fill="url(#bookGradient)"
                />
                
                {/* Book pages highlight */}
                <path 
                  d="M8 12H18C20.2091 12 22 13.7909 22 16V36H8V12Z" 
                  fill="url(#pageGradient)"
                  opacity="0.5"
                />
                <path 
                  d="M40 12H30C27.7909 12 26 13.7909 26 16V36H40V12Z" 
                  fill="url(#pageGradient)"
                  opacity="0.5"
                />
                
                {/* Note lines */}
                <line x1="10" y1="18" x2="18" y2="18" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="10" y1="23" x2="16" y2="23" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="10" y1="28" x2="17" y2="28" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
                
                <line x1="30" y1="18" x2="38" y2="18" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="32" y1="23" x2="38" y2="23" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="31" y1="28" x2="38" y2="28" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
                
                {/* Center binding */}
                <path d="M24 10V38" stroke="#4F46E5" strokeWidth="2" />
                
                {/* Sparkle/star accent */}
                <circle cx="38" cy="8" r="2" fill="#FBBF24" />
                <path d="M38 5V11M35 8H41" stroke="#FBBF24" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            
            {/* Brand Name */}
            <div className="flex flex-col">
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
                NoteMitra
              </span>
              <span className="text-[9px] md:text-[10px] text-gray-500 font-medium -mt-0.5 tracking-wide hidden sm:block">
                STUDENT NOTES PLATFORM
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6" role="menubar">
            {isReady && user && (
              <>
                <Link href="/browse" className="text-gray-700 hover:text-blue-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1" role="menuitem">
                  Browse Notes
                </Link>
                <Link href="/upload" className="text-gray-700 hover:text-blue-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1" role="menuitem">
                  Upload
                </Link>
                <Link href="/leaderboard" className="text-gray-700 hover:text-blue-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1" role="menuitem">
                  Leaderboard
                </Link>
                <Link href="/about" className="text-gray-700 hover:text-blue-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1" role="menuitem">
                  About
                </Link>
                {(user as any).isAdmin && (
                  <Link href="/admin" className="text-yellow-600 hover:text-yellow-700 transition font-medium flex items-center focus:outline-none focus:ring-2 focus:ring-yellow-500 rounded px-2 py-1" role="menuitem" aria-label="Admin Panel">
                    <Shield className="w-4 h-4 mr-1" aria-hidden="true" />
                    Admin Panel
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {isReady && user ? (
              <>
                <Link href="/profile">
                  <Button variant="ghost" size="sm">
                    <User className="mr-2 h-4 w-4" />
                    {user.name}
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </>
            ) : isReady ? (
              <>
                <Link href="/auth/signin">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/signup">
                  <Button size="sm">
                    Create Account
                  </Button>
                </Link>
              </>
            ) : null}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-gray-700" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6 text-gray-700" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div 
        id="mobile-menu" 
        className={`md:hidden bg-white border-t border-gray-200 overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        role="menu"
      >
        <div className="px-4 py-4 space-y-3">
            {isReady && user && (
              <>
                <Link
                  href="/browse"
                  className="block text-gray-700 hover:text-blue-600 transition py-2 px-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={closeMobileMenu}
                  role="menuitem"
                >
                  Browse Notes
                </Link>
                <Link
                  href="/upload"
                  className="block text-gray-700 hover:text-blue-600 transition py-2 px-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={closeMobileMenu}
                  role="menuitem"
                >
                  Upload
                </Link>
                <Link
                  href="/leaderboard"
                  className="block text-gray-700 hover:text-blue-600 transition py-2 px-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={closeMobileMenu}
                  role="menuitem"
                >
                  Leaderboard
                </Link>
                <Link
                  href="/about"
                  className="block text-gray-700 hover:text-blue-600 transition py-2 px-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={closeMobileMenu}
                  role="menuitem"
                >
                  About
                </Link>
                {(user as any).isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center text-yellow-600 hover:text-yellow-700 transition font-medium py-2 px-3 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    onClick={closeMobileMenu}
                    role="menuitem"
                    aria-label="Admin Panel"
                  >
                    <Shield className="w-4 h-4 mr-2" aria-hidden="true" />
                    Admin Panel
                  </Link>
                )}
              </>
            )}
            <div className="pt-3 border-t border-gray-200 space-y-2">
              {isReady && user ? (
                <>
                  <Link href="/profile" onClick={closeMobileMenu}>
                    <Button variant="ghost" size="sm" className="w-full min-h-[44px] touch-target" aria-label={`Profile: ${user.name}`}>
                      <User className="mr-2 h-4 w-4" aria-hidden="true" />
                      {user.name}
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-h-[44px] touch-target"
                    onClick={() => {
                      logout();
                      closeMobileMenu();
                    }}
                    aria-label="Logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                    Logout
                  </Button>
                </>
              ) : isReady ? (
                <>
                  <Link href="/auth/signin" onClick={closeMobileMenu}>
                    <Button variant="ghost" size="sm" className="w-full min-h-[44px] touch-target">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/auth/signup" onClick={closeMobileMenu}>
                    <Button size="sm" className="w-full min-h-[44px] touch-target">
                      Create Account
                    </Button>
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>
    </nav>
  );
}
