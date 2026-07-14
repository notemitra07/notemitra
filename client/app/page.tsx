'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpen, Upload, Users, Sparkles, TrendingUp, Shield, Search, Download, MessageSquare, Mail, Phone, User } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import HeroBackground from '@/components/HeroBackground';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);

  // Redirect logged-in users to browse page
  useEffect(() => {
    if (!loading && user) {
      router.replace('/browse');
    }
  }, [user, loading, router]);

  useEffect(() => {
    // Fetch real user count from backend
    const fetchStats = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
        const res = await fetch(`${apiUrl}/api/public/stats`);
        if (res.ok) {
          const data = await res.json();
          setUserCount(data.totalUsers);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };
    fetchStats();
  }, []);

  const handleExploreClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      setShowAuthModal(true);
    } else {
      router.push('/browse');
    }
  };

  // Only show loading spinner when auth check is in progress
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50/50 via-white to-purple-50/50">
        <div className="text-center">
          <div className="relative mb-4">
            <div className="w-12 h-12 rounded-full border-4 border-blue-100 mx-auto"></div>
            <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-blue-600 mx-auto animate-spin"></div>
          </div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect logged-in users (after loading is done)
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50/50 via-white to-purple-50/50">
        <div className="text-center">
          <div className="relative mb-4">
            <div className="w-12 h-12 rounded-full border-4 border-blue-100 mx-auto"></div>
            <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-blue-600 mx-auto animate-spin"></div>
          </div>
          <p className="text-gray-500 text-sm">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[550px] md:min-h-[650px] flex items-center justify-center py-16 md:py-24 px-4 overflow-hidden">
        {/* Animated Background */}
        <HeroBackground />
        
        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto w-full">
          <div className="text-center max-w-3xl mx-auto px-2">
            {/* Badge - Only show when user count is loaded */}
            {userCount !== null && userCount > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100/80 backdrop-blur-sm rounded-full mb-4 md:mb-6">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-xs md:text-sm font-medium text-blue-700">
                  Trusted by {userCount} Student{userCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            {/* Main Headline - Mobile optimized */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-4 md:mb-6 leading-tight tracking-tight">
              Your Academic Success
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
                Starts Here
              </span>
            </h1>
            
            {/* Subtitle - Clear and concise */}
            <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 md:mb-8 leading-relaxed max-w-2xl mx-auto">
              Share, discover, and ace your exams with{' '}
              <strong className="text-gray-900 font-semibold">NoteMitra</strong> — 
              the platform where students help students succeed.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
              <Link href="/auth/signup" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto text-base md:text-lg px-6 md:px-8 py-5 md:py-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5">
                  Get Started Free
                </Button>
              </Link>
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full sm:w-auto text-base md:text-lg px-6 md:px-8 py-5 md:py-6 border-2 border-gray-200 bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:border-gray-300 shadow-sm transition-all duration-300"
                onClick={handleExploreClick}
              >
                <Search className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                Explore Notes
              </Button>
            </div>
            
            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 mt-8 md:mt-10 text-xs md:text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Verified Notes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-500" />
                <span>Active Community</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Download className="w-4 h-4 text-purple-500" />
                <span>Free Downloads</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 md:py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 md:mb-16">
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2 md:mb-4">
              Why Choose NoteMitra?
            </h2>
            <p className="text-sm md:text-xl text-gray-600 max-w-2xl mx-auto">
              Built by students, for students - with powerful features to enhance your learning experience
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
            <FeatureCard
              icon={<Upload className="h-12 w-12 text-blue-600" />}
              title="Easy Note Uploads"
              description="Upload and share your study notes in PDF format. Help your peers while building your reputation."
            />
            <FeatureCard
              icon={<Search className="h-12 w-12 text-purple-600" />}
              title="Smart Search & Filters"
              description="Find exactly what you need with advanced filters by subject, semester, branch, module, and tags."
            />
            <FeatureCard
              icon={<Download className="h-12 w-12 text-green-600" />}
              title="Quick Downloads"
              description="Access high-quality notes instantly. Download verified study materials with a single click."
            />
            <FeatureCard
              icon={<MessageSquare className="h-12 w-12 text-indigo-600" />}
              title="Interactive Comments"
              description="Engage with content through comments. Ask questions, share insights, and collaborate with peers."
            />
            <FeatureCard
              icon={<TrendingUp className="h-12 w-12 text-orange-600" />}
              title="Voting & Rankings"
              description="Upvote quality content. The best notes rise to the top through community validation."
            />
            <FeatureCard
              icon={<Shield className="h-12 w-12 text-red-600" />}
              title="Reputation System"
              description="Build your academic profile. Earn reputation points for quality contributions and engagement."
            />
          </div>
        </div>
      </section>

      {/* Stats Section - REMOVED */}

      {/* CTA Section - Compact & Clean */}
      <section className="py-10 md:py-14 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white relative">
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Join NoteMitra Today
          </h2>
          <p className="text-sm md:text-base mb-5 opacity-90">
            Start sharing and discovering quality academic notes
          </p>
          <div className="flex flex-row gap-3 justify-center items-center">
            <Link href="/auth/signup" className="inline-block">
              <Button size="default" variant="ghost" className="!bg-white !text-blue-700 hover:!bg-gray-100 font-bold px-5 md:px-6 py-2.5 shadow-lg min-w-[140px]">
                Create Account
              </Button>
            </Link>
            <Link href="/auth/signin" className="inline-block">
              <Button size="default" variant="ghost" className="!bg-transparent !border-2 !border-white !text-white hover:!bg-white/20 font-semibold px-5 md:px-6 py-2.5 min-w-[100px]">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Us Section */}
      <section className="py-16 md:py-24 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Contact Us
            </h2>
            <p className="text-lg md:text-xl text-gray-600">
              Have questions? We're here to help!
            </p>
          </div>
          
          {/* Contact Cards Container - Always side by side */}
          <div className="grid grid-cols-2 gap-3 md:gap-6">
            {/* Contact 1 */}
            <div className="group relative">
              {/* Gradient glow effect */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 rounded-2xl opacity-75 group-hover:opacity-100 blur-sm transition duration-300"></div>
              <div className="relative bg-white p-3 md:p-5 rounded-2xl shadow-xl transform transition-all duration-300 md:hover:-translate-y-1 md:hover:shadow-2xl">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg mb-2 md:mb-3">
                    <User className="h-6 w-6 md:h-7 md:w-7 text-white" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-gray-900 truncate w-full">M. Pavan Vedesh</h3>
                </div>
                
                <div className="mt-3 space-y-2">
                  <a href="mailto:pavanmanepalli521@gmail.com" className="flex items-center gap-2 text-xs md:text-sm text-gray-600 hover:text-blue-600 transition-colors group/link">
                    <div className="p-1 md:p-1.5 bg-blue-50 rounded-lg group-hover/link:bg-blue-100 transition-colors flex-shrink-0">
                      <Mail className="h-3 w-3 md:h-4 md:w-4 text-blue-600" />
                    </div>
                    <span className="truncate">pavanmanepalli521@gmail.com</span>
                  </a>
                  <a href="tel:+919391781748" className="flex items-center gap-2 text-xs md:text-sm text-gray-600 hover:text-blue-600 transition-colors group/link">
                    <div className="p-1 md:p-1.5 bg-blue-50 rounded-lg group-hover/link:bg-blue-100 transition-colors flex-shrink-0">
                      <Phone className="h-3 w-3 md:h-4 md:w-4 text-blue-600" />
                    </div>
                    <span>+91 93917 81748</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Contact 2 */}
            <div className="group relative">
              {/* Gradient glow effect */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 rounded-2xl opacity-75 group-hover:opacity-100 blur-sm transition duration-300"></div>
              <div className="relative bg-white p-3 md:p-5 rounded-2xl shadow-xl transform transition-all duration-300 md:hover:-translate-y-1 md:hover:shadow-2xl">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center shadow-lg mb-2 md:mb-3">
                    <User className="h-6 w-6 md:h-7 md:w-7 text-white" />
                  </div>
                  <h3 className="text-sm md:text-lg font-bold text-gray-900 truncate w-full">D. Mohan Gupta</h3>
                </div>
                
                <div className="mt-3 space-y-2">
                  <a href="mailto:mohangupta16@gmail.com" className="flex items-center gap-2 text-xs md:text-sm text-gray-600 hover:text-purple-600 transition-colors group/link">
                    <div className="p-1 md:p-1.5 bg-purple-50 rounded-lg group-hover/link:bg-purple-100 transition-colors flex-shrink-0">
                      <Mail className="h-3 w-3 md:h-4 md:w-4 text-purple-600" />
                    </div>
                    <span className="truncate">mohangupta16@gmail.com</span>
                  </a>
                  <a href="tel:+918790965198" className="flex items-center gap-2 text-xs md:text-sm text-gray-600 hover:text-purple-600 transition-colors group/link">
                    <div className="p-1 md:p-1.5 bg-purple-50 rounded-lg group-hover/link:bg-purple-100 transition-colors flex-shrink-0">
                      <Phone className="h-3 w-3 md:h-4 md:w-4 text-purple-600" />
                    </div>
                    <span>+91 87909 65198</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Sign In Required</h3>
            <p className="text-gray-600 mb-6">
              Please create an account or sign in to explore and download notes.
            </p>
            <div className="space-y-3">
              <Link href="/auth/signup" className="block">
                <Button size="lg" className="w-full">
                  Create Account
                </Button>
              </Link>
              <Link href="/auth/signin" className="block">
                <Button size="lg" variant="outline" className="w-full">
                  Sign In
                </Button>
              </Link>
              <Button 
                size="lg" 
                variant="ghost" 
                className="w-full" 
                onClick={() => setShowAuthModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <BookOpen className="h-6 w-6 text-blue-500" />
                <span className="text-xl font-bold text-white">NoteMitra</span>
              </div>
              <p className="text-sm text-gray-400">
                Your trusted platform for sharing and discovering high-quality academic notes.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/" className="hover:text-blue-400 transition">Home</Link></li>
                <li><Link href="/about" className="hover:text-blue-400 transition">About Us</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Account</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/auth/signin" className="hover:text-blue-400 transition">Sign In</Link></li>
                <li><Link href="/auth/signup" className="hover:text-blue-400 transition">Create Account</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Features</h3>
              <ul className="space-y-2 text-sm">
                <li className="text-gray-400">Note Sharing</li>
                <li className="text-gray-400">Smart Search</li>
                <li className="text-gray-400">Community Voting</li>
                <li className="text-gray-400">Reputation System</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2025 NoteMitra. Built with ❤️ for students by students.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 md:p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 bg-white">
      <div className="mb-2 md:mb-4 [&>svg]:h-8 [&>svg]:w-8 md:[&>svg]:h-12 md:[&>svg]:w-12">{icon}</div>
      <h3 className="text-sm md:text-xl font-semibold text-gray-900 mb-1 md:mb-2">{title}</h3>
      <p className="text-xs md:text-base text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}
