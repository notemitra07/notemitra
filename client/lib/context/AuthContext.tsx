'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  section?: string;
  branch?: string;
  profilePic?: string;
  reputation: number;
  uploadsCount: number;
  isVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password?: string) => Promise<any>;
  signup: (data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    section?: string;
    branch?: string;
    rollNo?: string;
    designation?: string;
    department?: string;
    employeeId?: string;
  }) => Promise<any>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  completeAuth: (user: any, token: string, deviceToken?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check if we're on the client side
      if (typeof window === 'undefined') {
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Try to get current user with stored token
      const response = await authAPI.getCurrentUser();
      setUser(response.data.user);
      
      // Also update stored user data
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
    } catch (error: any) {
      console.error('Auth check failed:', error);
      
      // Only clear token if it's definitively invalid (not just network error)
      const status = error?.response?.status;
      const errorCode = error?.response?.data?.error;
      
      // Clear ONLY on definitive token invalidity (401 with specific error codes)
      // Don't clear on network errors, server errors, or timeouts
      if (status === 401 && (
        errorCode === 'INVALID_TOKEN_FORMAT' ||
        errorCode === 'TOKEN_EXPIRED' ||
        errorCode === 'NO_TOKEN' ||
        errorCode === 'INVALID_USER_ID'
      )) {
        console.log('Token is invalid, clearing auth state');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } else if (status === 404) {
        // User not found - account deleted
        console.log('User not found, clearing auth state');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } else {
        // For network errors, server errors, etc., try to use cached user data
        const cachedUser = localStorage.getItem('user');
        if (cachedUser) {
          try {
            setUser(JSON.parse(cachedUser));
            console.log('Using cached user data due to network/server error');
          } catch (e) {
            console.error('Failed to parse cached user');
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const completeAuth = (user: any, token: string, deviceToken?: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      if (deviceToken) {
        localStorage.setItem('deviceToken', deviceToken);
      }
    }
    setUser(user);
  };

  const login = async (email: string, password?: string) => {
    // If only one argument (token), treat as token-based login
    if (!password && email) {
      const token = email;
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
      }
      // Fetch user data with the token
      const response = await authAPI.getCurrentUser();
      setUser(response.data.user);
      return response.data;
    }
    
    // Normal email/password login
    let storedDeviceToken = undefined;
    if (typeof window !== 'undefined') {
      storedDeviceToken = localStorage.getItem('deviceToken') || undefined;
    }

    const response = await authAPI.login({ 
      email, 
      password: password!,
      deviceToken: storedDeviceToken
    });
    
    const { user, token, requiresVerification, otpRequired } = response.data;

    if (requiresVerification || otpRequired) {
      return response.data;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }
    setUser(user);
    return response.data;
  };

  const signup = async (data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    section?: string;
    branch?: string;
    rollNo?: string;
    designation?: string;
    department?: string;
    employeeId?: string;
  }) => {
    const response = await authAPI.signup(data);
    const { user, token, requiresVerification } = response.data;

    if (requiresVerification) {
      return response.data;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }
    setUser(user);
    return response.data;
  };

  const logout = async () => {
    try {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
          await authAPI.logout(token);
        }
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      setUser(null);
      // Redirect to home page after logout
      router.push('/');
    }
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data.user);
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  };

  // Provide auth context directly without mounted gate
  // The loading state from checkAuth() properly reflects the real state
  const contextValue = {
    user,
    loading,
    login,
    signup,
    logout,
    refreshUser,
    setUser,
    completeAuth,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
