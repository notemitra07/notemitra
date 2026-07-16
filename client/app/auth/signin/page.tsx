'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Mail, Lock, Chrome, Eye, EyeOff, Hash, ShieldCheck } from 'lucide-react';

const ALLOWED_EMAIL_DOMAIN = '@mictech.edu.in';

export default function SignInPage() {
  const router = useRouter();
  const { login, completeAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP Verification States
  const [showOtp, setShowOtp] = useState(false);
  const [requiresSignupVerification, setRequiresSignupVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return false;
    }
    const lowerEmail = email.toLowerCase();
    return (
      lowerEmail === 'superadmin@notemitra.com' ||
      lowerEmail.endsWith('@mictech.edu.in') ||
      lowerEmail.endsWith('@mic.tech.edu') ||
      lowerEmail.endsWith('@mictech.ac.in') ||
      lowerEmail.endsWith('@mic.tech.ac.in') ||
      lowerEmail.endsWith('@example.com')
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email domain
    if (!validateEmail(email)) {
      setError('Please use your college email ending with @mictech.edu.in or @mictech.ac.in');
      return;
    }

    setLoading(true);

    try {
      const res = await login(email.toLowerCase(), password);
      if (res && res.otpRequired) {
        setShowOtp(true);
        setResendTimer(60);
      } else if (res && res.requiresVerification) {
        setRequiresSignupVerification(true);
        setResendTimer(60);
      } else {
        router.push('/browse');
      }
    } catch (err: unknown) {
      console.error('Login error:', err);
      const error = err as { code?: string; message?: string; response?: { status?: number; data?: { message?: string; error?: string } } };
      
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        setError('Cannot connect to server. Please make sure the backend is running.');
      } else if (error.response?.status === 401) {
        // Use server error code for consistent messaging
        const errorCode = error.response?.data?.error;
        if (errorCode === 'INVALID_CREDENTIALS') {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else {
          setError('Invalid email or password. Please try again.');
        }
      } else if (error.response?.status === 403) {
        // Account suspended
        setError(error.response?.data?.message || 'Your account has been suspended. Please contact admin.');
      } else {
        setError(error.response?.data?.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setVerificationLoading(true);
    try {
      const response = await authAPI.verifyLoginOtp({
        email: email.toLowerCase().trim(),
        password,
        code: otpCode
      });
      const { user, token, deviceToken } = response.data;
      completeAuth(user, token, deviceToken);
      router.push('/browse');
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid or expired OTP. Please try again.');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleVerifySignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setVerificationLoading(true);
    try {
      const response = await authAPI.verifySignupCode({
        email: email.toLowerCase().trim(),
        code: otpCode
      });
      const { user, token, deviceToken } = response.data;
      completeAuth(user, token, deviceToken);
      router.push('/browse');
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid or expired code. Please try again.');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleResendLoginOtp = async () => {
    if (resendTimer > 0) return;
    setError('');
    try {
      await login(email.toLowerCase(), password);
      setResendTimer(60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend code. Please try again.');
    }
  };

  const handleResendSignupOtp = async () => {
    if (resendTimer > 0) return;
    setError('');
    try {
      await authAPI.resendSignupOtp({ email: email.toLowerCase().trim() });
      setResendTimer(60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend code. Please try again.');
    }
  };

  const handleGoogleSignIn = () => {
    // Redirect to backend Google OAuth endpoint
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const backendUrl = apiUrl.replace('/api', '');
    window.location.href = `${backendUrl}/api/auth/google`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 sm:p-8">
        {showOtp ? (
          <div>
            <div className="text-center mb-6 animate-fadeIn">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 text-blue-600 animate-pulse">
                <ShieldCheck className="h-10 w-10" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">New Device Security</h1>
              <p className="text-sm sm:text-base text-gray-600">
                Please enter the 6-digit OTP code sent to your email <span className="font-semibold text-gray-800">{email}</span>
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs sm:text-sm animate-fadeIn">
                {error}
              </div>
            )}

            <form onSubmit={handleVerifyLoginOtp} className="space-y-5">
              <div>
                <label htmlFor="loginOtp" className="block text-sm font-medium text-gray-700 mb-2 text-center font-semibold">
                  Enter 6-Digit OTP Code
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="loginOtp"
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-mono text-2xl tracking-[0.5em] text-gray-800"
                    placeholder="000000"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm sm:text-base rounded-lg transition-colors"
                disabled={verificationLoading}
              >
                {verificationLoading ? 'Verifying...' : 'Verify OTP & Sign In'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={handleResendLoginOtp}
                disabled={resendTimer > 0}
                className={`text-sm font-medium transition-colors ${
                  resendTimer > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP Code'}
              </button>
            </div>

            <p className="mt-6 text-center text-sm text-gray-600">
              Not your account?{' '}
              <button
                type="button"
                onClick={() => {
                  setShowOtp(false);
                  setOtpCode('');
                  setError('');
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Cancel
              </button>
            </p>
          </div>
        ) : requiresSignupVerification ? (
          <div>
            <div className="text-center mb-6 animate-fadeIn">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 text-blue-600 animate-pulse">
                <ShieldCheck className="h-10 w-10" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Verify Your Account</h1>
              <p className="text-sm sm:text-base text-gray-600">
                Your account is registered but not verified. We've sent a 6-digit code to <span className="font-semibold text-gray-800">{email}</span>
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs sm:text-sm animate-fadeIn">
                {error}
              </div>
            )}

            <form onSubmit={handleVerifySignupOtp} className="space-y-5">
              <div>
                <label htmlFor="signupOtp" className="block text-sm font-medium text-gray-700 mb-2 text-center font-semibold">
                  Enter 6-Digit Verification Code
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="signupOtp"
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-mono text-2xl tracking-[0.5em] text-gray-800"
                    placeholder="000000"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm sm:text-base rounded-lg transition-colors"
                disabled={verificationLoading}
              >
                {verificationLoading ? 'Verifying...' : 'Verify Code & Sign In'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={handleResendSignupOtp}
                disabled={resendTimer > 0}
                className={`text-sm font-medium transition-colors ${
                  resendTimer > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                {resendTimer > 0 ? `Resend Code in ${resendTimer}s` : 'Resend Verification Code'}
              </button>
            </div>

            <p className="mt-6 text-center text-sm text-gray-600">
              Not your account?{' '}
              <button
                type="button"
                onClick={() => {
                  setRequiresSignupVerification(false);
                  setOtpCode('');
                  setError('');
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Cancel
              </button>
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Welcome Back!</h1>
              <p className="text-sm sm:text-base text-gray-600">Sign in to access your notes</p>
            </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs sm:text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              College Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                placeholder={`your.name${ALLOWED_EMAIL_DOMAIN}`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-12 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link 
              href="/auth/forgot-password" 
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Forgot Password?
            </Link>
          </div>

          <Button type="submit" className="w-full py-2.5 sm:py-2" size="lg" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full mt-4"
            size="lg"
            onClick={handleGoogleSignIn}
          >
            <Chrome className="mr-2 h-5 w-5" />
            Continue with Google
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link href="/auth/signup" className="text-blue-600 hover:text-blue-700 font-medium">
            Create Account
          </Link>
        </p>
          </>
        )}
      </div>
    </div>
  );
}
