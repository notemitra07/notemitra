import axios from 'axios';

// Detect if accessing from local network
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === '192.168.1.35' || hostname === '192.168.245.192') {
      return `http://${hostname}:5000/api`;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
};

const API_URL = getApiUrl();

// Create axios instance with optimized settings
const api = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 2 minute timeout for uploads
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    // If sending FormData, remove the default Content-Type header
    // to let the browser set it with the correct boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - DO NOT auto-redirect on 401
// Let the AuthContext handle auth state to avoid logout loops
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Just pass through the error, let components handle it
    // This prevents aggressive token clearing that causes login loops
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
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
  }) => api.post('/auth/signup', data),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),

  getCurrentUser: () => api.get('/auth/me'),

  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (data: { token: string; password: string; confirmPassword?: string }) =>
    api.post('/auth/reset-password', data),

  verifyResetToken: (token: string) =>
    api.post('/auth/verify-reset-token', { token }),

  verifyEmailForReset: (email: string) =>
    api.post('/auth/verify-email-for-reset', { email }),

  updateProfile: (data: { name?: string; branch?: string; section?: string; rollNo?: string }) =>
    api.put('/auth/profile', data),
};

// Notes API
export const notesAPI = {
  uploadPDF: (formData: FormData, onUploadProgress?: (progressEvent: any) => void) => {
    console.log('📡 API Base URL:', API_URL);
    console.log('📡 Full URL:', `${API_URL}/notes/upload-pdf-cloudinary`);
    // Use Cloudinary upload endpoint with progress tracking
    return api.post('/notes/upload-pdf-cloudinary', formData, {
      timeout: 180000, // 3 minute timeout for uploads
      onUploadProgress: onUploadProgress,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Fallback to GridFS if needed
  uploadPDFGridFS: (formData: FormData, onUploadProgress?: (progressEvent: any) => void) => {
    return api.post('/notes/upload-pdf', formData, {
      timeout: 180000,
      onUploadProgress: onUploadProgress,
    });
  },

  getUploadUrl: (data: {
    fileName: string;
    fileType: string;
    fileSize: number;
  }) => api.post('/notes/upload-url', data),

  createNote: (data: {
    title: string;
    description?: string;
    subject: string;
    semester: string;
    module: string;
    branch: string;
    section?: string;
    fileUrl: string;
    fileId?: string;
    cloudinaryId?: string;
    fileSize: number;
    pages?: number;
  }) => api.post('/notes', data),

  generateDescription: (data: {
    pdfText: string;
    title?: string;
    subject?: string;
  }) => api.post('/notes/generate-description', data),

  getNotes: (params?: {
    subject?: string;
    semester?: string;
    module?: string;
    branch?: string;
    uploaderRole?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) => api.get('/notes', { params }),

  getNoteById: (id: string) => api.get(`/notes/${id}`),

  getDownloadUrl: (id: string) => api.get(`/notes/${id}/download`),
  
  // Download file by note ID - returns blob or JSON with downloadUrl
  downloadNote: async (id: string) => {
    const response = await fetch(`${API_URL}/notes/${id}/download`, {
      method: 'GET',
      headers: {
        'Accept': 'application/pdf, application/json',
      },
    });
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Download failed: ${response.status}`);
      }
      throw new Error(`Download failed with status: ${response.status}`);
    }
    
    return response;
  },

  voteNote: (id: string, voteType: 'upvote' | 'downvote') =>
    api.post(`/notes/${id}/vote`, { voteType }),

  saveNote: (id: string) => api.post(`/notes/${id}/save`),
  
  unsaveNote: (id: string) => api.delete(`/notes/${id}/save`),

  getSavedNotes: () => api.get('/notes/saved/list'),

  checkIfSaved: (id: string) => api.get(`/notes/${id}/saved`),

  trackDownload: (id: string) => api.post(`/notes/${id}/download`),

  trackPreview: (id: string) => api.post(`/notes/${id}/preview`),

  deleteNote: (id: string) => api.delete(`/notes/${id}`),

  reportNote: (id: string, reason: string) =>
    api.post(`/notes/${id}/report`, { reason }),

  // Comments
  getComments: (noteId: string) => api.get(`/notes/${noteId}/comments`),
  
  addComment: (noteId: string, text: string) => 
    api.post(`/notes/${noteId}/comments`, { text }),
  
  deleteComment: (commentId: string) => api.delete(`/comments/${commentId}`),
};

// Leaderboard API
export const leaderboardAPI = {
  getLeaderboard: () => api.get('/leaderboard'),
};

// Admin API
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),

  getUsers: () => api.get('/admin/users'),

  suspendUser: (userId: string) => api.put(`/admin/users/${userId}/suspend`),

  unsuspendUser: (userId: string) => api.put(`/admin/users/${userId}/unsuspend`),

  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),

  getNotes: () => api.get('/admin/notes'),

  deleteNote: (noteId: string) => api.delete(`/admin/notes/${noteId}`),

  getReports: () => api.get('/admin/reports'),

  resolveReport: (noteId: string) => api.put(`/admin/reports/${noteId}/resolve`),

  changeUserRole: (userId: string, data: { role: string; isAdmin: boolean }) =>
    api.put(`/admin/users/${userId}/role`, data),

  createUser: (data: any) =>
    api.post('/admin/users/create', data),
};
