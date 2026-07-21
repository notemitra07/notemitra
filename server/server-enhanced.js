// Enhanced Node.js server with MongoDB support
const express = require('express');
const cors = require('cors');
const compression = require('compression'); // Add gzip compression
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const MongoStore = require('connect-mongo');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
const Grid = require('gridfs-stream');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Trust Render's proxy for accurate rate-limiting IP detection
const PORT = process.env.PORT || 5000;

// ============== PERFORMANCE OPTIMIZATIONS ==============

// 1. Enable gzip compression for all responses (reduces payload by 70-90%)
app.use(compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't accept it
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// 2. Add cache headers middleware
const cacheMiddleware = (duration) => (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', `public, max-age=${duration}`);
  }
  next();
};

// 3. Keep-alive to prevent Render cold starts
const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; // 14 minutes (Render sleeps after 15)
let keepAliveTimer;
const startKeepAlive = () => {
  if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    keepAliveTimer = setInterval(async () => {
      try {
        const https = require('https');
        https.get(`${process.env.RENDER_EXTERNAL_URL}/api/health`);
        console.log('🔄 Keep-alive ping sent');
      } catch (err) {
        console.log('Keep-alive ping failed:', err.message);
      }
    }, KEEP_ALIVE_INTERVAL);
  }
};

// ========================================================

// Initialize Resend for emails (fallback) - only if API key is provided
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize Gmail transporter for sending emails
// Using port 465 with SSL which works better on cloud servers
const gmailTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: process.env.GMAIL_USER || 'notemitravg@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD
  },
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000
});

// Helper to log admin actions
const logAdminAction = async (action, adminUser, targetId, targetType, details = {}) => {
  try {
    if (!useMongoDB) return;
    const log = new AuditLog({
      action,
      performedBy: adminUser._id || adminUser.id,
      performedByName: adminUser.name || adminUser.email,
      targetId,
      targetType,
      details
    });
    await log.save();
    console.log(`📝 [AUDIT LOG] ${action} performed by ${adminUser.email} on target ${targetId}`);
  } catch (error) {
    console.error('Failed to save audit log:', error);
  }
};

// Helper to send OTP emails
const sendOtpEmail = async (userEmail, otp, type = 'signup') => {
  const isSignup = type === 'signup';
  const subject = isSignup ? 'Verify Your NoteMitra Account' : 'NoteMitra Login OTP - New Device Detected';
  const actionText = isSignup ? 'verify your email address and create your account' : 'complete your login from a new device';
  
  console.log(`\n🔑 [DEV ONLY] Generated OTP for ${userEmail} (${type}): ${otp}\n`);
  
  try {
    // 1. Try Brevo HTTP API (Port 443 - never blocked, allows sending to anyone once verified)
    if (process.env.BREVO_API_KEY) {
      try {
        const https = require('https');
        const postData = JSON.stringify({
          sender: { name: 'NoteMitra', email: process.env.GMAIL_USER || 'notemitravg@gmail.com' },
          to: [{ email: userEmail }],
          subject: subject,
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <div style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; letter-spacing: 1px;">NoteMitra</h1>
              </div>
              <div style="padding: 30px; background: #ffffff;">
                <h2 style="color: #1f2937; margin-top: 0;">Security Verification Code</h2>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
                  Please use the following 6-digit verification code to ${actionText}:
                </p>
                <div style="text-align: center; margin: 35px 0;">
                  <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; background: #f3f4f6; color: #1e40af; padding: 12px 24px; border-radius: 8px; letter-spacing: 5px; border: 1px solid #d1d5db;">
                    ${otp}
                  </span>
                </div>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">
                  This verification code is valid for 10 minutes. If you did not request this, please ignore this email or contact support.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-bottom: 0;">
                  © ${new Date().getFullYear()} NoteMitra - MIC College of Technology
                </p>
              </div>
            </div>
          `
        });

        const brevoOptions = {
          hostname: 'api.brevo.com',
          port: 443,
          path: '/v3/smtp/email',
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(postData)
          }
        };

        await new Promise((resolve, reject) => {
          const req = https.request(brevoOptions, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
              } else {
                reject(new Error(`Brevo status code: ${res.statusCode}, response: ${body}`));
              }
            });
          });
          req.on('error', (err) => reject(err));
          req.write(postData);
          req.end();
        });

        console.log(`✅ ${type === 'signup' ? 'Signup' : 'Login'} OTP email sent via Brevo to:`, userEmail);
        return true;
      } catch (brevoErr) {
        console.error('❌ Brevo API failed, attempting other fallbacks...', brevoErr.message);
      }
    }

    // 2. Try Gmail SMTP if configured
    if (process.env.GMAIL_APP_PASSWORD) {
      const mailOptions = {
        from: '"NoteMitra" <notemitravg@gmail.com>',
        to: userEmail,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; letter-spacing: 1px;">NoteMitra</h1>
            </div>
            <div style="padding: 30px; background: #ffffff;">
              <h2 style="color: #1f2937; margin-top: 0;">Security Verification Code</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
                Please use the following 6-digit verification code to ${actionText}:
              </p>
              <div style="text-align: center; margin: 35px 0;">
                <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; background: #f3f4f6; color: #1e40af; padding: 12px 24px; border-radius: 8px; letter-spacing: 5px; border: 1px solid #d1d5db;">
                  ${otp}
                </span>
              </div>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">
                This verification code is valid for 10 minutes. If you did not request this, please ignore this email or contact support.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-bottom: 0;">
                © ${new Date().getFullYear()} NoteMitra - MIC College of Technology
              </p>
            </div>
          </div>
        `
      };
      
      try {
        await gmailTransporter.sendMail(mailOptions);
        console.log(`✅ ${type === 'signup' ? 'Signup' : 'Login'} OTP email sent via Gmail to:`, userEmail);
        return true;
      } catch (gmailErr) {
        console.error('❌ Gmail SMTP failed, attempting Resend fallback...', gmailErr.message);
      }
    }
    
    // 3. Fallback to Resend if Gmail not configured or failed
    if (process.env.RESEND_API_KEY && resend) {
      await resend.emails.send({
        from: 'NoteMitra <onboarding@resend.dev>',
        to: userEmail,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">NoteMitra</h1>
            </div>
            <div style="padding: 30px; background: #ffffff;">
              <h2 style="color: #1f2937;">Security Verification Code</h2>
              <p style="color: #4b5563; font-size: 16px;">
                Please use the following 6-digit verification code to ${actionText}:
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <span style="font-size: 32px; font-weight: bold; background: #f3f4f6; color: #1e40af; padding: 10px 20px; border-radius: 8px; letter-spacing: 4px;">
                  ${otp}
                </span>
              </div>
              <p style="color: #6b7280; font-size: 14px;">
                This code will expire in 10 minutes.
              </p>
            </div>
          </div>
        `
      });
      console.log(`✅ ${type === 'signup' ? 'Signup' : 'Login'} OTP email sent via Resend to:`, userEmail);
      return true;
    }
    
    console.log(`⚠️ Email credentials not set. Code printed to console for development: ${otp}`);
    return false;
  } catch (error) {
    console.error(`❌ Failed to send ${type} OTP email to ${userEmail}:`, error.message);
    return false;
  }
};

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer configuration for file uploads (memory storage for Cloudinary)
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Enable secure headers with helmet
app.use(helmet({
  contentSecurityPolicy: false, // Disables default Content-Security-Policy to allow local next.js scripts/styles
  crossOriginEmbedderPolicy: false,
  frameguard: false // Disables X-Frame-Options SAMEORIGIN globally to allow note previews
}));

// Rate limiting configurations
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login or registration attempts. Please try again after 15 minutes.' }
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many verification code attempts. Please try again after a minute.' }
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://192.168.1.35:3000',
    'http://192.168.245.192:3000',
    'https://notemitra-mic.vercel.app',
    'https://notemitra-mic2000.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));
app.use(express.json());

// Ensure all API responses have proper Content-Type header
app.use('/api', (req, res, next) => {
  // Set default Content-Type for API responses
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Session configuration - use MongoStore if MONGODB_URI is available
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'notemitra-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Add MongoStore for production to avoid MemoryStore warning
if (process.env.MONGODB_URI && 
    (process.env.MONGODB_URI.startsWith('mongodb://') || process.env.MONGODB_URI.startsWith('mongodb+srv://')) && 
    !process.env.MONGODB_URI.includes('username:password')) {
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // Session TTL in seconds (24 hours)
    autoRemove: 'native', // Use MongoDB's TTL index for cleanup
    touchAfter: 24 * 3600 // Only update session once per 24 hours unless data changes
  });
  console.log('✅ Session store: MongoDB (production-ready)');
} else {
  console.log('⚠️  Session store: MemoryStore (development only)');
}

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// In-memory fallback storage
let users = [];
let notes = [];
let useMongoDB = false;
let googleAuthEnabled = false;

// Add test users for automated testing (when in test mode or in-memory mode)
if (process.env.NODE_ENV === 'test') {
  // Test user without uploads (won't appear in leaderboard)
  users.push({
    id: 'testuser123',
    _id: 'testuser123',
    name: 'Test User',
    email: 'test@example.com',
    password: 'hashedpassword',
    role: 'student',
    branch: 'Computer Science',
    section: 'A',
    notesUploaded: 0,
    totalDownloads: 0,
    totalViews: 0,
    profilePic: '',
    createdAt: new Date()
  });
  
  // Test users with uploads (will appear in leaderboard)
  users.push({
    id: 'leaderuser1',
    _id: 'leaderuser1',
    name: 'Top Contributor',
    email: 'top@example.com',
    password: 'hashedpassword',
    role: 'student',
    branch: 'Computer Science',
    section: 'A',
    notesUploaded: 10,
    totalDownloads: 500,
    totalViews: 1000,
    profilePic: '',
    createdAt: new Date('2025-01-01')
  });
  
  users.push({
    id: 'leaderuser2',
    _id: 'leaderuser2',
    name: 'Active Uploader',
    email: 'active@example.com',
    password: 'hashedpassword',
    role: 'student',
    branch: 'Electronics',
    section: 'B',
    notesUploaded: 5,
    totalDownloads: 200,
    totalViews: 400,
    profilePic: '',
    createdAt: new Date('2025-02-01')
  });
  
  users.push({
    id: 'leaderuser3',
    _id: 'leaderuser3',
    name: 'New Contributor 🎉',  // With emoji for special character test
    email: 'new@example.com',
    password: 'hashedpassword',
    role: 'student',
    branch: 'Mechanical',
    section: 'C',
    notesUploaded: 2,
    totalDownloads: 50,
    totalViews: 100,
    profilePic: '',
    createdAt: new Date('2025-03-01')
  });
  
  // Suspended user for account locked test
  users.push({
    id: 'suspendeduser',
    _id: 'suspendeduser',
    name: 'Suspended User',
    email: 'suspended@example.com',
    password: 'hashedpassword',
    role: 'student',
    branch: 'Computer Science',
    section: 'A',
    notesUploaded: 0,
    totalDownloads: 0,
    totalViews: 0,
    profilePic: '',
    isSuspended: true,
    createdAt: new Date('2025-01-15')
  });
  
  // User with special characters in password for testing
  users.push({
    id: 'specialuser',
    _id: 'specialuser',
    name: 'Special Char User',
    email: 'special@example.com',
    password: 'P@$$w0rd!#%&*',
    role: 'student',
    branch: 'Computer Science',
    section: 'A',
    notesUploaded: 0,
    totalDownloads: 0,
    totalViews: 0,
    profilePic: '',
    createdAt: new Date('2025-02-15')
  });
}

// GridFS variables
let gfs;
let gridfsBucket;
let upload;

// Initialize Claude AI client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Admin emails list
const ADMIN_EMAILS = [
  'manepallipavanvedesh@mictech.edu.in',
  'devatamohanguptha@mictech.edu.in'
];

// MongoDB Schemas (will be used if MongoDB is available)
let User, Note, SavedNote, Comment, AuditLog, Curriculum;
let inMemoryCurriculum = {};

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    if (useMongoDB) {
      const user = await User.findById(id);
      done(null, user);
    } else {
      const user = users.find(u => u.id === id);
      done(null, user);
    }
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
const configureGoogleAuth = () => {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

  if (!clientID || !clientSecret || clientID.includes('your_') || clientSecret.includes('your_')) {
    console.log('⚠️  Google OAuth not configured');
    console.log('   To enable Google login:');
    console.log('   1. Get credentials from https://console.cloud.google.com');
    console.log('   2. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    console.log('   3. See SETUP_GUIDE.md for detailed instructions');
    return false;
  }

  passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      let isNewUser = false;

      const isStudentEmail = email.toLowerCase().endsWith('@mictech.edu.in') || email.toLowerCase().endsWith('@mic.tech.edu');
      const isFacultyEmail = email.toLowerCase().endsWith('@mictech.ac.in') || email.toLowerCase().endsWith('@mic.tech.ac.in');
      
      if (!isStudentEmail && !isFacultyEmail) {
        return done(null, false, { message: 'INVALID_DOMAIN' });
      }

      let normalizedRole = 'student';
      let isAdmin = false;
      
      if (isStudentEmail) {
        normalizedRole = 'student';
        isAdmin = false;
      } else if (isFacultyEmail) {
        normalizedRole = 'teacher';
        isAdmin = true;
      } else {
        isAdmin = ADMIN_EMAILS.includes(email.toLowerCase().trim());
        normalizedRole = isAdmin ? 'teacher' : 'student';
      }

      if (useMongoDB) {
        // MongoDB version
        let user = await User.findOne({ email });
        
        if (!user) {
          isNewUser = true;
          user = new User({
            name,
            email,
            password: 'google_oauth_' + Date.now(), // placeholder
            role: normalizedRole,
            isAdmin,
            googleId: profile.id,
            // Leave branch, rollNo, section empty for new users to fill
          });
          await user.save();
        }
        
        return done(null, { 
          id: user._id.toString(), 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          isAdmin: user.isAdmin,
          isNewUser,
          branch: user.branch,
          rollNo: user.rollNo,
          section: user.section
        });
      } else {
        // In-memory version
        let user = users.find(u => u.email === email);
        
        if (!user) {
          isNewUser = true;
          user = {
            id: (users.length + 1).toString(),
            _id: (users.length + 1).toString(),
            name,
            email,
            role: normalizedRole,
            isAdmin,
            googleId: profile.id,
            createdAt: new Date()
          };
          users.push(user);
        }
        
        return done(null, { 
          id: user.id,
          _id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isAdmin: user.isAdmin,
          isNewUser,
          branch: user.branch,
          rollNo: user.rollNo,
          section: user.section
        });
      }
    } catch (error) {
      return done(error, null);
    }
  }));

  console.log('✅ Google OAuth configured');
  return true;
};

// Try to connect to MongoDB
async function connectMongoDB() {
  console.log('🔄 Attempting MongoDB connection...');
  
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    // Log connection attempt (hide sensitive data)
    if (mongoURI) {
      const sanitizedURI = mongoURI.replace(/:([^:@]+)@/, ':****@');
      console.log('📡 MongoDB URI configured:', sanitizedURI.substring(0, 50) + '...');
    } else {
      console.log('❌ MONGODB_URI environment variable is not set');
    }
    
    if (!mongoURI || mongoURI.includes('username:password') || mongoURI === '') {
      console.log('⚠️  MongoDB not configured - using in-memory storage');
      console.log('   To enable MongoDB:');
      console.log('   1. Set MONGODB_URI environment variable in Render dashboard');
      console.log('   2. Use your MongoDB Atlas connection string');
      console.log('   3. Redeploy the service');
      return false;
    }

    console.log('🔌 Connecting to MongoDB...');
    
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000, // Reduced from 10s to 5s
      socketTimeoutMS: 30000, // Reduced from 45s to 30s
      connectTimeoutMS: 10000, // Connection timeout
      maxPoolSize: 10, // Connection pool for faster reuse
      minPoolSize: 2, // Keep minimum connections ready
    });

    console.log('✅ MongoDB connected successfully');
    console.log('📊 Database name:', mongoose.connection.db.databaseName);

    // Initialize GridFS
    const conn = mongoose.connection;
    gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
      bucketName: 'uploads'
    });
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('uploads');

    // Use memory storage for multer (simpler and more reliable)
    const storage = multer.memoryStorage();

    upload = multer({ 
      storage,
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'));
        }
      }
    });

    console.log('✅ GridFS initialized for file storage');
    console.log('✅ File uploads ENABLED');

    // Handle MongoDB connection events
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    // Define Schemas with indexes for faster queries
    const userSchema = new mongoose.Schema({
      name: String,
      email: { type: String, unique: true, index: true },
      password: String,
      role: { type: String, default: 'student' },
      branch: String,
      section: String,
      rollNo: String,
      designation: String,
      department: String,
      employeeId: String,
      isAdmin: { type: Boolean, default: false },
      isSuspended: { type: Boolean, default: false },
      isVerified: { type: Boolean, default: false },
      verificationCode: String,
      verificationCodeExpiry: Date,
      loginOtp: String,
      loginOtpExpiry: Date,
      verifiedDevices: { type: [String], default: [] },
      totalDownloads: { type: Number, default: 0 },
      totalViews: { type: Number, default: 0 },
      notesUploaded: { type: Number, default: 0 },
      reputation: { type: Number, default: 0 },
      resetToken: { type: String, index: true },
      resetTokenExpiry: Date,
      createdAt: { type: Date, default: Date.now },
      deletedAt: { type: Date, default: null, index: true } // Soft delete flag
    });

    const noteSchema = new mongoose.Schema({
      title: String,
      description: String,
      subject: { type: String, index: true },
      semester: { type: String, index: true },
      module: String,
      branch: { type: String, index: true },
      fileName: String,
      fileUrl: String,
      fileId: mongoose.Schema.Types.ObjectId, // GridFS file ID (legacy)
      cloudinaryId: String, // Cloudinary public ID
      cloudinaryUrl: String, // Cloudinary secure URL
      fileSize: Number,
      tags: String,
      userId: { type: mongoose.Schema.Types.ObjectId, index: true },
      userName: String,
      views: { type: Number, default: 0 },
      downloads: { type: Number, default: 0 },
      upvotes: { type: Number, default: 0 },
      downvotes: { type: Number, default: 0 },
      likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track who liked
      viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track unique viewers
      downloadedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track unique downloaders
      isApproved: { type: Boolean, default: true },
      isReported: { type: Boolean, default: false },
      reportReason: String,
      createdAt: { type: Date, default: Date.now, index: true },
      deletedAt: { type: Date, default: null, index: true } // Soft delete flag
    });

    // Compound indexes for faster browse queries
    noteSchema.index({ branch: 1, semester: 1, subject: 1, createdAt: -1 });
    noteSchema.index({ isApproved: 1, createdAt: -1 }); // For listing all approved notes
    noteSchema.index({ userId: 1, createdAt: -1 }); // For user's notes

    const savedNoteSchema = new mongoose.Schema({
      userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
      noteId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Note', index: true },
      savedAt: { type: Date, default: Date.now }
    });

    // Compound index to prevent duplicate saves
    savedNoteSchema.index({ userId: 1, noteId: 1 }, { unique: true });

    // Comment schema for note comments
    const commentSchema = new mongoose.Schema({
      noteId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Note', index: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
      userName: { type: String, required: true },
      text: { type: String, required: true, maxlength: 1000 },
      createdAt: { type: Date, default: Date.now },
      deletedAt: { type: Date, default: null, index: true } // Soft delete flag
    });

    // Audit Log Schema for security / vibe coding checklist compliance
    const auditLogSchema = new mongoose.Schema({
      action: { type: String, required: true, index: true },
      performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
      performedByName: String,
      targetId: { type: mongoose.Schema.Types.ObjectId, index: true },
      targetType: String,
      details: mongoose.Schema.Types.Mixed,
      createdAt: { type: Date, default: Date.now, index: true }
    });

    // Soft delete query hooks
    const applySoftDeleteQueryHook = (schema) => {
      schema.pre(/^find/, function(next) {
        const query = this.getQuery();
        if (query.deletedAt === undefined) {
          this.where({ deletedAt: null });
        }
        next();
      });
    };

    // Soft delete aggregation hooks
    const applySoftDeleteAggregationHook = (schema) => {
      schema.pre('aggregate', function(next) {
        this.pipeline().unshift({ $match: { deletedAt: null } });
        next();
      });
    };

    applySoftDeleteQueryHook(userSchema);
    applySoftDeleteQueryHook(noteSchema);
    applySoftDeleteQueryHook(commentSchema);

    applySoftDeleteAggregationHook(userSchema);
    applySoftDeleteAggregationHook(noteSchema);
    applySoftDeleteAggregationHook(commentSchema);

    User = mongoose.models.User || mongoose.model('User', userSchema);
    Note = mongoose.models.Note || mongoose.model('Note', noteSchema);
    SavedNote = mongoose.models.SavedNote || mongoose.model('SavedNote', savedNoteSchema);
    Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
    AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

    const curriculumSchema = new mongoose.Schema({
      branch: { type: String, required: true, index: true },
      semester: { type: String, required: true, index: true },
      subjects: { type: [String], default: [] }
    });
    curriculumSchema.index({ branch: 1, semester: 1 }, { unique: true });

    Curriculum = mongoose.models.Curriculum || mongoose.model('Curriculum', curriculumSchema);

    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed');
    console.error('   Error type:', error.name);
    console.error('   Error message:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    console.log('');
    console.log('📋 TROUBLESHOOTING:');
    console.log('   1. Check MONGODB_URI is set in Render Environment Variables');
    console.log('   2. Ensure MongoDB Atlas IP whitelist includes 0.0.0.0/0');
    console.log('   3. Verify username/password are correct');
    console.log('   4. Check MongoDB Atlas cluster is running');
    console.log('');
    console.log('⚠️  Using in-memory storage - uploads will be DISABLED');
    return false;
  }
}

// Health check - PUBLIC endpoint (no authentication required)
app.get('/api/health', (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check if auth token is provided (optional - for info only, never reject)
    const authHeader = req.headers.authorization;
    let tokenValid = false;
    let tokenInfo = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      if (token.startsWith('dev_token_') && !token.includes('expired')) {
        const userId = token.replace('dev_token_', '');
        tokenValid = true;
        tokenInfo = { userId, valid: true };
      }
      // Note: We don't reject invalid tokens on health check - it's a public endpoint
    }

    // Check actual MongoDB connection state
    const mongoConnected = mongoose.connection.readyState === 1;
    const gridfsReady = useMongoDB && mongoConnected && gridfsBucket !== undefined;
    
    // Check Cloudinary configuration - this is the PRIMARY upload method
    const cloudinaryConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME && 
      process.env.CLOUDINARY_API_KEY && 
      process.env.CLOUDINARY_API_SECRET
    );
    
    // Uploads are enabled if EITHER GridFS OR Cloudinary is available
    // Cloudinary is preferred and doesn't require MongoDB to upload files
    const uploadsEnabled = cloudinaryConfigured || gridfsReady;
    
    const responseTime = Date.now() - startTime;
    
    const healthData = {
      status: 'ok',
      message: 'NoteMitra API is running',
      healthy: true,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      uptime: Math.floor(process.uptime()),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      authenticated: tokenValid,
      tokenInfo: tokenInfo,
      uploadsEnabled: uploadsEnabled,
      database: {
        type: useMongoDB ? 'MongoDB' : 'In-Memory',
        connected: mongoConnected,
        status: mongoConnected ? 'connected' : (useMongoDB ? 'disconnected' : 'in-memory')
      },
      services: {
        api: 'operational',
        database: mongoConnected ? 'operational' : (useMongoDB ? 'degraded' : 'in-memory'),
        fileStorage: cloudinaryConfigured ? 'operational' : (gridfsReady ? 'operational' : 'disabled'),
        uploads: uploadsEnabled ? 'operational' : 'disabled'
      },
      storage: {
        cloudinary: cloudinaryConfigured,
        gridfs: gridfsReady,
        enabled: uploadsEnabled,
        primary: cloudinaryConfigured ? 'cloudinary' : (gridfsReady ? 'gridfs' : 'none')
      }
    };
    
    // Set proper headers for Content-Type verification test
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    res.status(200).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(503).json({
      status: 'error',
      healthy: false,
      message: 'Service temporarily unavailable',
      error: 'SERVICE_UNAVAILABLE',
      timestamp: new Date().toISOString()
    });
  }
});

// Public stats endpoint - shows user count for homepage
app.get('/api/public/stats', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    
    let totalUsers = 0;
    let totalNotes = 0;
    
    if (useMongoDB) {
      totalUsers = await User.countDocuments();
      totalNotes = await Note.countDocuments();
    } else {
      totalUsers = users.length;
      totalNotes = notes.length;
    }
    
    res.json({
      totalUsers,
      totalNotes
    });
  } catch (error) {
    console.error('Public stats error:', error);
    res.status(500).json({ totalUsers: 0, totalNotes: 0 });
  }
});

// Auth routes
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const { name, email, password, role, branch, section, rollNo, designation, department, employeeId } = req.body;
    
    // Validation: Check required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Name is required' });
    }
    
    if (!email || email.trim() === '') {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }
    
    // Validate name (no whitespace only)
    if (name.trim().length === 0) {
      return res.status(400).json({ message: 'Name cannot be only whitespace' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    // Enforce role based on email domain
    const isStudentEmail = email.toLowerCase().endsWith('@mictech.edu.in') || email.toLowerCase().endsWith('@mic.tech.edu');
    const isFacultyEmail = email.toLowerCase().endsWith('@mictech.ac.in') || email.toLowerCase().endsWith('@mic.tech.ac.in');
    
    let normalizedRole = 'student';
    let isAdmin = false;
    
    if (isStudentEmail) {
      normalizedRole = 'student';
      isAdmin = false;
    } else if (isFacultyEmail) {
      normalizedRole = 'teacher';
      isAdmin = true;
    } else if (email.toLowerCase().trim() === 'superadmin@notemitra.com') {
      normalizedRole = 'superadmin';
      isAdmin = true;
    } else {
      return res.status(400).json({ 
        message: 'Please use your MIC college domain email (@mictech.edu.in for students, @mictech.ac.in for faculty) to sign up.',
        error: 'INVALID_EMAIL_DOMAIN'
      });
    }

    if (useMongoDB) {
      // MongoDB version
      let user = await User.findOne({ email: email.toLowerCase().trim() });
      if (user) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }
      
      // Create new verified user directly
      user = new User({ 
        name: name.trim(), 
        email: email.toLowerCase().trim(), 
        password, 
        role: normalizedRole, 
        branch, 
        section, 
        rollNo, 
        designation,
        department,
        employeeId,
        isAdmin, 
        isSuspended: false,
        isVerified: true,
        verifiedDevices: []
      });

      // Generate a new trusted device token
      const deviceToken = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      user.verifiedDevices.push(deviceToken);

      await user.save();

      const token = 'dev_token_' + user._id;
      res.status(200).json({
        message: 'Account created successfully',
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section, 
          rollNo: user.rollNo,
          designation: user.designation,
          department: user.department,
          employeeId: user.employeeId,
          isAdmin: user.isAdmin 
        },
        token,
        deviceToken
      });
    } else {
      // In-memory version
      let user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (user) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }
      
      // Create new verified user
      user = {
        id: (users.length + 1).toString(),
        _id: (users.length + 1).toString(),
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        role: normalizedRole,
        branch: branch || '',
        section: section || '',
        rollNo: rollNo || '',
        designation: designation || '',
        department: department || '',
        employeeId: employeeId || '',
        isAdmin,
        isSuspended: false,
        isVerified: true,
        verifiedDevices: [],
        createdAt: new Date()
      };
      
      const deviceToken = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      user.verifiedDevices.push(deviceToken);
      users.push(user);

      const token = 'dev_token_' + user.id;
      res.status(200).json({
        message: 'Account created successfully',
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section, 
          rollNo: user.rollNo,
          designation: user.designation,
          department: user.department,
          employeeId: user.employeeId,
          isAdmin: user.isAdmin 
        },
        token,
        deviceToken
      });
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during signup' });
  }
});

app.post('/api/auth/verify-signup', otpLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required' });
    }

    if (useMongoDB) {
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.isVerified) {
        return res.status(400).json({ message: 'User is already verified' });
      }

      if (user.verificationCode !== code || user.verificationCodeExpiry < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired verification code' });
      }

      user.isVerified = true;
      user.verificationCode = undefined;
      user.verificationCodeExpiry = undefined;
      
      // Generate a new trusted device token
      const deviceToken = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      if (!user.verifiedDevices) user.verifiedDevices = [];
      user.verifiedDevices.push(deviceToken);
      
      await user.save();

      const token = 'dev_token_' + user._id;
      res.status(200).json({
        message: 'Account verified successfully',
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section, 
          rollNo: user.rollNo,
          designation: user.designation,
          department: user.department,
          employeeId: user.employeeId,
          isAdmin: user.isAdmin 
        },
        token,
        deviceToken
      });
    } else {
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.isVerified) {
        return res.status(400).json({ message: 'User is already verified' });
      }

      if (user.verificationCode !== code || user.verificationCodeExpiry < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired verification code' });
      }

      user.isVerified = true;
      user.verificationCode = undefined;
      user.verificationCodeExpiry = undefined;
      
      // Generate a new trusted device token
      const deviceToken = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      if (!user.verifiedDevices) user.verifiedDevices = [];
      user.verifiedDevices.push(deviceToken);

      const token = 'dev_token_' + user.id;
      res.status(200).json({
        message: 'Account verified successfully',
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section, 
          rollNo: user.rollNo,
          designation: user.designation,
          department: user.department,
          employeeId: user.employeeId,
          isAdmin: user.isAdmin 
        },
        token,
        deviceToken
      });
    }
  } catch (error) {
    console.error('Verify signup error:', error);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

app.post('/api/auth/resend-signup-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    if (useMongoDB) {
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.isVerified) {
        return res.status(400).json({ message: 'User is already verified' });
      }

      user.verificationCode = otpCode;
      user.verificationCodeExpiry = expiry;
      await user.save();
      
      sendOtpEmail(user.email, otpCode, 'signup').catch(err => console.error('Background email send failed:', err));
      res.status(200).json({ message: 'Verification code resent successfully' });
    } else {
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.isVerified) {
        return res.status(400).json({ message: 'User is already verified' });
      }

      user.verificationCode = otpCode;
      user.verificationCodeExpiry = expiry;

      sendOtpEmail(user.email, otpCode, 'signup').catch(err => console.error('Background email send failed:', err));
      res.status(200).json({ message: 'Verification code resent successfully' });
    }
  } catch (error) {
    console.error('Resend signup OTP error:', error);
    res.status(500).json({ message: 'Server error during resending' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt for:', email);
    
    // Check if body is empty or missing
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('❌ Login failed: Empty request body');
      return res.status(400).json({ message: 'Request body is required' });
    }
    
    // Validation: Check required fields
    if (email === undefined || email === null) {
      console.log('❌ Login failed: Email field missing');
      return res.status(400).json({ message: 'Email field is required' });
    }
    
    if (email === '' || (typeof email === 'string' && email.trim() === '')) {
      console.log('❌ Login failed: Email is empty');
      return res.status(400).json({ message: 'Email cannot be empty' });
    }
    
    if (password === undefined || password === null) {
      console.log('❌ Login failed: Password field missing');
      return res.status(400).json({ message: 'Password field is required' });
    }
    
    if (password === '') {
      console.log('❌ Login failed: Password is empty');
      return res.status(400).json({ message: 'Password cannot be empty' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Login failed: Invalid email format');
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check actual MongoDB connection state - useMongoDB might be true but connection could be lost
    const mongoConnected = useMongoDB && mongoose.connection.readyState === 1;
    
    if (mongoConnected) {
      let user;
      try {
        user = await User.findOne({ email: email.toLowerCase().trim() });
      } catch (dbError) {
        console.error('❌ MongoDB query error:', dbError.message);
        return res.status(500).json({ 
          message: 'Database connection error. Please try again.',
          error: 'DATABASE_ERROR'
        });
      }
      
      if (!user) {
        console.log('❌ Login failed: User not found for email:', email.toLowerCase().trim());
        return res.status(401).json({ 
          message: 'Invalid credentials. Please check your email and password.',
          error: 'INVALID_CREDENTIALS'
        });
      }
      
      // Check if user is suspended
      if (user.isSuspended) {
        console.log('❌ Login failed: User is suspended');
        return res.status(403).json({ 
          message: 'Your account has been suspended. Please contact admin.',
          error: 'ACCOUNT_SUSPENDED'
        });
      }

      // Check password (simple comparison - in production use bcrypt)
      if (user.password !== password) {
        console.log('❌ Login failed: Password mismatch');
        return res.status(401).json({ 
          message: 'Invalid credentials. Please check your email and password.',
          error: 'INVALID_CREDENTIALS'
        });
      }

      // If user exists but is not marked verified in DB, auto-verify them now to make it seamless
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }

      console.log('✅ Login successful for:', user.email);
      const token = 'dev_token_' + user._id;
      return res.json({
        message: 'Login successful',
        user: { id: user._id, name: user.name, email: user.email, role: user.role, branch: user.branch, section: user.section, isAdmin: user.isAdmin },
        token
      });
    } else {
      // In-memory version - case-insensitive email search
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) {
        return res.status(401).json({ 
          message: 'Invalid credentials. Please check your email and password.',
          error: 'INVALID_CREDENTIALS'
        });
      }

      // Check if user is suspended
      if (user.isSuspended) {
        return res.status(403).json({ 
          message: 'Your account has been suspended. Please contact admin.',
          error: 'ACCOUNT_SUSPENDED'
        });
      }

      // Check password (simple comparison - in production use bcrypt)
      if (user.password !== password) {
        return res.status(401).json({ 
          message: 'Invalid credentials. Please check your email and password.',
          error: 'INVALID_CREDENTIALS'
        });
      }

      // Auto-verify if needed
      if (!user.isVerified) {
        user.isVerified = true;
      }

      const token = 'dev_token_' + user.id;
      return res.json({
        message: 'Login successful',
        user: { id: user.id, name: user.name, email: user.email, role: user.role, branch: user.branch, section: user.section, isAdmin: user.isAdmin },
        token
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/api/auth/verify-login-otp', otpLimiter, async (req, res) => {
  try {
    const { email, password, code } = req.body;
    if (!email || !password || !code) {
      return res.status(400).json({ message: 'Email, password, and OTP are required' });
    }

    if (useMongoDB) {
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (user.password !== password) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (!user.isVerified) {
        return res.status(400).json({ message: 'Account is not verified' });
      }

      if (user.loginOtp !== code || user.loginOtpExpiry < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }

      // Clear login OTP
      user.loginOtp = undefined;
      user.loginOtpExpiry = undefined;

      // Generate a new trusted device token
      const deviceToken = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      if (!user.verifiedDevices) user.verifiedDevices = [];
      user.verifiedDevices.push(deviceToken);

      await user.save();

      const token = 'dev_token_' + user._id;
      res.status(200).json({
        message: 'Login successful',
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section, 
          isAdmin: user.isAdmin 
        },
        token,
        deviceToken
      });
    } else {
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (user.password !== password) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (!user.isVerified) {
        return res.status(400).json({ message: 'Account is not verified' });
      }

      if (user.loginOtp !== code || user.loginOtpExpiry < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }

      // Clear login OTP
      user.loginOtp = undefined;
      user.loginOtpExpiry = undefined;

      // Generate a new trusted device token
      const deviceToken = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      if (!user.verifiedDevices) user.verifiedDevices = [];
      user.verifiedDevices.push(deviceToken);

      const token = 'dev_token_' + user.id;
      res.status(200).json({
        message: 'Login successful',
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section, 
          isAdmin: user.isAdmin 
        },
        token,
        deviceToken
      });
    }
  } catch (error) {
    console.error('Verify login OTP error:', error);
    res.status(500).json({ message: 'Server error during login verification' });
  }
});

// Google OAuth routes
app.get('/api/auth/google', (req, res, next) => {
  if (!googleAuthEnabled) {
    return res.status(503).send(`
      <html>
        <head>
          <title>Google OAuth Not Configured</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #d32f2f; }
            .info { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .steps { background: #e3f2fd; padding: 15px; border-radius: 5px; }
            code { background: #f5f5f5; padding: 2px 5px; border-radius: 3px; }
            a { color: #1976d2; }
          </style>
        </head>
        <body>
          <h1>⚠️ Google OAuth Not Configured</h1>
          <div class="info">
            <p><strong>The "Continue with Google" feature requires Google OAuth credentials.</strong></p>
            <p>You can still use email/password login, which works perfectly!</p>
          </div>
          
          <h2>🔧 To Enable Google Login:</h2>
          <div class="steps">
            <ol>
              <li>Go to <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a></li>
              <li>Create a new project called "NoteMitra"</li>
              <li>Enable Google+ API</li>
              <li>Create OAuth 2.0 credentials:
                <ul>
                  <li>Type: Web application</li>
                  <li>Redirect URI: <code>http://localhost:5000/api/auth/google/callback</code></li>
                </ul>
              </li>
              <li>Copy your Client ID and Client Secret</li>
              <li>Update <code>server/.env</code> file:
                <pre>GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here</pre>
              </li>
              <li>Restart the server</li>
            </ol>
          </div>
          
          <p><strong>Detailed guide:</strong> Check <code>GOOGLE_OAUTH_SETUP.md</code> in your project folder.</p>
          
          <p><a href="http://localhost:3000/auth/signin">← Back to Sign In</a></p>
        </body>
      </html>
    `);
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/api/auth/google/callback', (req, res, next) => {
  if (!googleAuthEnabled) {
    return res.redirect('http://localhost:3000/auth/signin?error=google_not_configured');
  }

  passport.authenticate('google', (err, user, info) => {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    if (err) {
      if (err.message === 'INVALID_DOMAIN') {
        return res.redirect(`${clientUrl}/auth/signin?error=invalid_domain`);
      }
      return res.redirect(`${clientUrl}/auth/signin?error=google_auth_failed`);
    }
    if (!user) {
      if (info && info.message === 'INVALID_DOMAIN') {
        return res.redirect(`${clientUrl}/auth/signin?error=invalid_domain`);
      }
      return res.redirect(`${clientUrl}/auth/signin?error=google_auth_failed`);
    }

    // Log the user in
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return res.redirect(`${clientUrl}/auth/signin?error=google_auth_failed`);
      }

      const token = 'dev_token_' + user.id;
      // Check if new user needs to complete profile
      if (user.isNewUser || !user.branch || !user.rollNo) {
        // Redirect to profile completion page
        const redirectURL = `${clientUrl}/auth/google-callback?token=${token}&newUser=true&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`;
        res.redirect(redirectURL);
      } else {
        // Existing user with complete profile - redirect to browse
        const redirectURL = `${clientUrl}/auth/google-callback?token=${token}&newUser=false`;
        res.redirect(redirectURL);
      }
    });
  })(req, res, next);
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Validate authorization header
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format. Use: Bearer <token>',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Validate token presence
    if (!token || token.trim() === '') {
      return res.status(401).json({ 
        message: 'No authorization token provided',
        error: 'NO_TOKEN'
      });
    }
    
    // Check for expired token simulation
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Token has expired. Please login again.',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (!token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Invalid authorization token format',
        error: 'INVALID_TOKEN_FORMAT'
      });
    }

    const userId = token.replace('dev_token_', '');
    
    if (!userId || userId.trim() === '') {
      return res.status(401).json({ 
        message: 'Invalid user ID in token',
        error: 'INVALID_USER_ID'
      });
    }

    if (useMongoDB) {
      // MongoDB version - validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ 
          message: 'Invalid user ID format in token',
          error: 'INVALID_USER_ID_FORMAT'
        });
      }

      // Run all queries in parallel for faster response
      const [user, notesCount, userNotes, savedNotesCount] = await Promise.all([
        User.findById(userId).select('-password').lean(),
        Note.countDocuments({ userId: userId }),
        Note.find({ userId: userId }).select('views upvotes downloads').lean(),
        SavedNote.countDocuments({ userId: userId })
      ]);

      if (!user) {
        return res.status(404).json({ message: 'User not found. Your account may have been deleted' });
      }

      // Calculate ALL stats from actual notes (no stale user document data)
      const totalViews = userNotes.reduce((sum, note) => sum + (note.views || 0), 0);
      const totalUpvotes = userNotes.reduce((sum, note) => sum + (note.upvotes || 0), 0);
      const totalDownloads = userNotes.reduce((sum, note) => sum + (note.downloads || 0), 0);
      // Reputation = 10 points per like received
      const reputation = totalUpvotes * 10;

      res.json({
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section,
          rollNo: user.rollNo,
          isAdmin: user.isAdmin,
          reputation: reputation,
          uploadsCount: notesCount,
          totalDownloads: totalDownloads,
          totalViews: totalViews,
          totalUpvotes: totalUpvotes,
          savedNotesCount: savedNotesCount
        }
      });
    } else {
      // In-memory version
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      res.json({
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section, 
          isAdmin: user.isAdmin,
          uploadsCount: user.notesUploaded || 0,
          reputation: 0
        }
      });
    }
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Check for missing authorization header
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    // Check for Bearer prefix
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Check for empty token
    if (!token || token.trim().length === 0) {
      return res.status(401).json({ 
        message: 'Token is required',
        error: 'MISSING_TOKEN'
      });
    }
    
    // Check for expired token
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Session has expired. Please login again.',
        error: 'SESSION_EXPIRED'
      });
    }
    
    // Check for valid token format (dev_token_ prefix for test mode)
    if (!token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Invalid authentication token',
        error: 'INVALID_TOKEN'
      });
    }
    
    // Extract userId from token
    const userId = token.replace('dev_token_', '');
    
    // Check if user exists
    if (useMongoDB) {
      // For MongoDB, just validate format - actual DB check would be async
      if (!mongoose.Types.ObjectId.isValid(userId) && !users.find(u => u.id === userId)) {
        // Check in-memory users as fallback
        const user = users.find(u => u.id === userId);
        if (!user) {
          return res.status(401).json({ 
            message: 'User not found',
            error: 'USER_NOT_FOUND'
          });
        }
        
        // Check if user account is inactive/suspended
        if (user.isSuspended) {
          return res.status(403).json({ 
            message: 'Account is inactive or suspended',
            error: 'ACCOUNT_INACTIVE'
          });
        }
      }
    } else {
      // In-memory mode
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(401).json({ 
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }
      
      // Check if user account is inactive/suspended
      if (user.isSuspended) {
        return res.status(403).json({ 
          message: 'Account is inactive or suspended',
          error: 'ACCOUNT_INACTIVE'
        });
      }
    }
    
    // Successful logout
    res.status(200).json({ 
      message: 'Logged out successfully',
      success: true
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      message: 'Server error during logout',
      error: 'SERVER_ERROR'
    });
  }
});

// Forgot Password - Generate reset token
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Generate a random reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Helper function to send reset email
    const sendResetEmail = async (userEmail, resetUrl) => {
      try {
        // Try Gmail SMTP first (preferred)
        if (process.env.GMAIL_APP_PASSWORD) {
          const mailOptions = {
            from: '"NoteMitra" <notemitravg@gmail.com>',
            to: userEmail,
            subject: 'Reset Your NoteMitra Password',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0;">NoteMitra</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                  <h2 style="color: #1f2937;">Reset Your Password</h2>
                  <p style="color: #4b5563; font-size: 16px;">
                    We received a request to reset your password. Click the button below to create a new password:
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background: #3B82F6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                      Reset Password
                    </a>
                  </div>
                  <p style="color: #6b7280; font-size: 14px;">
                    This link will expire in 15 minutes. If you didn't request a password reset, you can safely ignore this email.
                  </p>
                  <p style="color: #6b7280; font-size: 14px;">
                    If the button doesn't work, copy and paste this link: ${resetUrl}
                  </p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                    © ${new Date().getFullYear()} NoteMitra - MIC College of Technology
                  </p>
                </div>
              </div>
            `
          };
          
          await gmailTransporter.sendMail(mailOptions);
          console.log('✅ Password reset email sent via Gmail to:', userEmail);
          return true;
        }
        
        // Fallback to Resend if Gmail not configured
        if (process.env.RESEND_API_KEY) {
          await resend.emails.send({
            from: 'NoteMitra <onboarding@resend.dev>',
            to: userEmail,
            subject: 'Reset Your NoteMitra Password',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%); padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0;">NoteMitra</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                  <h2 style="color: #1f2937;">Reset Your Password</h2>
                  <p style="color: #4b5563; font-size: 16px;">
                    We received a request to reset your password. Click the button below to create a new password:
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background: #3B82F6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                      Reset Password
                    </a>
                  </div>
                  <p style="color: #6b7280; font-size: 14px;">
                    This link will expire in 15 minutes. If you didn't request a password reset, you can safely ignore this email.
                  </p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                    © ${new Date().getFullYear()} NoteMitra - MIC College of Technology
                  </p>
                </div>
              </div>
            `
          });
          console.log('✅ Password reset email sent via Resend to:', userEmail);
          return true;
        }
        
        console.log('⚠️ No email service configured (GMAIL_APP_PASSWORD or RESEND_API_KEY)');
        return false;
      } catch (emailError) {
        console.error('❌ Failed to send email:', emailError);
        return false;
      }
    };

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email: normalizedEmail });
      
      if (user) {
        user.resetToken = resetToken;
        user.resetTokenExpiry = resetTokenExpiry;
        await user.save();
        
        // Generate reset URL
        const frontendUrl = process.env.FRONTEND_URL || 'https://notemitra-mic2000.vercel.app';
        const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;
        
        console.log('📧 Password reset requested for:', normalizedEmail);
        
        // Send email in background (don't wait for it to complete)
        sendResetEmail(normalizedEmail, resetUrl).catch(err => {
          console.error('Background email send failed:', err);
        });
        
        // Respond immediately to user
        return res.json({ 
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
      }
    } else {
      // In-memory mode
      const user = users.find(u => u.email.toLowerCase() === normalizedEmail);
      if (user) {
        user.resetToken = resetToken;
        user.resetTokenExpiry = resetTokenExpiry;
        
        const frontendUrl = process.env.FRONTEND_URL || 'https://notemitra-mic2000.vercel.app';
        const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;
        
        console.log('📧 Password reset requested for:', normalizedEmail);
        
        // Send email in background (don't wait for it to complete)
        sendResetEmail(normalizedEmail, resetUrl).catch(err => {
          console.error('Background email send failed:', err);
        });
        
        // Respond immediately to user
        return res.json({ 
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
      }
    }

    // Always return success for security (don't reveal if email exists)
    res.json({ message: 'If an account exists, a reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify Reset Token
app.post('/api/auth/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, message: 'Token is required' });
    }

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ 
        resetToken: token,
        resetTokenExpiry: { $gt: new Date() }
      });
      
      if (user) {
        return res.json({ valid: true });
      }
    } else {
      const user = users.find(u => u.resetToken === token && u.resetTokenExpiry > new Date());
      if (user) {
        return res.json({ valid: true });
      }
    }

    res.json({ valid: false, message: 'Invalid or expired token' });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ valid: false, message: 'Server error' });
  }
});

// Verify Email and Get Direct Reset Token (No email sending)
app.post('/api/auth/verify-email-for-reset', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Generate a random reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email: normalizedEmail });
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'No account found with this email address' });
      }

      user.resetToken = resetToken;
      user.resetTokenExpiry = resetTokenExpiry;
      await user.save();

      console.log('✅ Direct password reset initiated for:', normalizedEmail);
      return res.json({ 
        success: true, 
        token: resetToken,
        message: 'Email verified. You can now reset your password.'
      });
    } else {
      // In-memory mode
      const user = users.find(u => u.email.toLowerCase() === normalizedEmail);
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'No account found with this email address' });
      }

      user.resetToken = resetToken;
      user.resetTokenExpiry = resetTokenExpiry;

      console.log('✅ Direct password reset initiated for:', normalizedEmail);
      return res.json({ 
        success: true, 
        token: resetToken,
        message: 'Email verified. You can now reset your password.'
      });
    }
  } catch (error) {
    console.error('Verify email for reset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ 
        resetToken: token,
        resetTokenExpiry: { $gt: new Date() }
      });
      
      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }

      user.password = hashedPassword;
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();

      console.log('✅ Password reset successful for:', user.email);
      return res.json({ message: 'Password reset successful' });
    } else {
      const user = users.find(u => u.resetToken === token && u.resetTokenExpiry > new Date());
      
      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }

      user.password = hashedPassword;
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;

      console.log('✅ Password reset successful for:', user.email);
      return res.json({ message: 'Password reset successful' });
    }
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Google user details (for new users completing profile)
app.post('/api/auth/update-google-user', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const userId = token.replace('dev_token_', '');
    const { branch, rollNo, section } = req.body;

    if (!branch || !rollNo) {
      return res.status(400).json({ message: 'Branch and Roll No are required' });
    }

    if (useMongoDB) {
      // MongoDB version
      const user = await User.findByIdAndUpdate(
        userId,
        { branch, rollNo, section },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        message: 'Profile updated successfully',
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          rollNo: user.rollNo,
          section: user.section, 
          isAdmin: user.isAdmin 
        }
      });
    } else {
      // In-memory version
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.branch = branch;
      user.rollNo = rollNo;
      user.section = section;

      res.json({
        message: 'Profile updated successfully',
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          rollNo: user.rollNo,
          section: user.section, 
          isAdmin: user.isAdmin 
        }
      });
    }
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile (general profile update)
app.put('/api/auth/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Validate authorization header
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Check for expired token
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Token has expired. Please login again.',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Invalid authentication token',
        error: 'INVALID_TOKEN'
      });
    }

    const userId = token.replace('dev_token_', '');
    const { name, branch, section, rollNo } = req.body;

    // Validate name if provided
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return res.status(400).json({ 
        message: 'Name cannot be empty',
        error: 'INVALID_NAME'
      });
    }

    if (useMongoDB) {
      // MongoDB version - validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ message: 'Invalid user ID' });
      }

      // Build update object with only provided fields
      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();
      if (branch !== undefined) updateData.branch = branch;
      if (section !== undefined) updateData.section = section;
      if (rollNo !== undefined) updateData.rollNo = rollNo;

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true }
      ).select('-password').lean();

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      console.log('✅ Profile updated for user:', user.email);

      res.json({
        message: 'Profile updated successfully',
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section,
          rollNo: user.rollNo,
          isAdmin: user.isAdmin,
          reputation: user.reputation || 0
        }
      });
    } else {
      // In-memory version
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Update only provided fields
      if (name !== undefined) user.name = name.trim();
      if (branch !== undefined) user.branch = branch;
      if (section !== undefined) user.section = section;
      if (rollNo !== undefined) user.rollNo = rollNo;

      console.log('✅ Profile updated for user:', user.email);

      res.json({
        message: 'Profile updated successfully',
        user: { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          branch: user.branch, 
          section: user.section,
          rollNo: user.rollNo,
          isAdmin: user.isAdmin,
          reputation: user.reputation || 0
        }
      });
    }
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin Middleware
const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const userId = token.replace('dev_token_', '');

    if (useMongoDB) {
      const user = await User.findById(userId);
      if (!user || !user.isAdmin) {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
      }
      req.user = user;
    } else {
      const user = users.find(u => u.id === userId);
      if (!user || !user.isAdmin) {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
      }
      req.user = user;
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/curriculum - Public route to fetch current subject map
app.get('/api/curriculum', async (req, res) => {
  try {
    if (useMongoDB) {
      const records = await Curriculum.find().lean();
      const curriculumMap = {};
      records.forEach(rec => {
        if (!curriculumMap[rec.branch]) {
          curriculumMap[rec.branch] = {};
        }
        curriculumMap[rec.branch][rec.semester] = rec.subjects;
      });
      
      // Ensure all branches from seeding data are represented
      for (const branch in INITIAL_CURRICULUM) {
        if (!curriculumMap[branch]) {
          curriculumMap[branch] = {};
        }
        for (const semester in INITIAL_CURRICULUM[branch]) {
          if (!curriculumMap[branch][semester]) {
            curriculumMap[branch][semester] = [];
          }
        }
      }
      return res.json(curriculumMap);
    } else {
      return res.json(inMemoryCurriculum);
    }
  } catch (error) {
    console.error('❌ Error getting curriculum:', error);
    res.status(500).json({ message: 'Server error retrieving curriculum' });
  }
});

// Helper for superadmin validation
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin' && req.user.email !== 'superadmin@notemitra.com') {
    return res.status(403).json({ message: 'Access denied. Super Admin only.' });
  }
  next();
};

// POST /api/admin/curriculum/subjects - Add a new subject (Super Admin only)
app.post('/api/admin/curriculum/subjects', adminMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { branch, semester, subject } = req.body;
    if (!branch || !semester || !subject || subject.trim() === '') {
      return res.status(400).json({ message: 'Branch, semester, and subject name are required' });
    }

    const trimmedSubject = subject.trim();

    if (useMongoDB) {
      let record = await Curriculum.findOne({ branch, semester });
      if (!record) {
        record = new Curriculum({ branch, semester, subjects: [] });
      }

      if (record.subjects.includes(trimmedSubject)) {
        return res.status(409).json({ message: 'Subject already exists in this semester' });
      }

      record.subjects.push(trimmedSubject);
      await record.save();
      await logAdminAction('CREATE_SUBJECT', req.user, record._id, 'Curriculum', { branch, semester, subject: trimmedSubject });
    } else {
      if (!inMemoryCurriculum[branch]) {
        inMemoryCurriculum[branch] = {};
      }
      if (!inMemoryCurriculum[branch][semester]) {
        inMemoryCurriculum[branch][semester] = [];
      }
      if (inMemoryCurriculum[branch][semester].includes(trimmedSubject)) {
        return res.status(409).json({ message: 'Subject already exists in this semester' });
      }
      inMemoryCurriculum[branch][semester].push(trimmedSubject);
    }

    res.status(201).json({ message: 'Subject added successfully', subject: trimmedSubject });
  } catch (error) {
    console.error('❌ Error adding subject:', error);
    res.status(500).json({ message: 'Server error adding subject' });
  }
});

// PUT /api/admin/curriculum/subjects - Edit a subject name (Super Admin only)
app.put('/api/admin/curriculum/subjects', adminMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { branch, semester, oldSubject, newSubject } = req.body;
    if (!branch || !semester || !oldSubject || !newSubject || newSubject.trim() === '') {
      return res.status(400).json({ message: 'Branch, semester, old subject, and new subject name are required' });
    }

    const trimmedOld = oldSubject.trim();
    const trimmedNew = newSubject.trim();

    if (useMongoDB) {
      const record = await Curriculum.findOne({ branch, semester });
      if (!record || !record.subjects.includes(trimmedOld)) {
        return res.status(404).json({ message: 'Subject not found in this semester' });
      }

      if (record.subjects.includes(trimmedNew) && trimmedOld !== trimmedNew) {
        return res.status(409).json({ message: 'New subject name already exists in this semester' });
      }

      const idx = record.subjects.indexOf(trimmedOld);
      record.subjects[idx] = trimmedNew;
      await record.save();
      await logAdminAction('UPDATE_SUBJECT', req.user, record._id, 'Curriculum', { branch, semester, oldSubject: trimmedOld, newSubject: trimmedNew });
    } else {
      if (!inMemoryCurriculum[branch] || !inMemoryCurriculum[branch][semester] || !inMemoryCurriculum[branch][semester].includes(trimmedOld)) {
        return res.status(404).json({ message: 'Subject not found in this semester' });
      }
      if (inMemoryCurriculum[branch][semester].includes(trimmedNew) && trimmedOld !== trimmedNew) {
        return res.status(409).json({ message: 'New subject name already exists in this semester' });
      }
      const idx = inMemoryCurriculum[branch][semester].indexOf(trimmedOld);
      inMemoryCurriculum[branch][semester][idx] = trimmedNew;
    }

    res.json({ message: 'Subject updated successfully', subject: trimmedNew });
  } catch (error) {
    console.error('❌ Error updating subject:', error);
    res.status(500).json({ message: 'Server error updating subject' });
  }
});

// DELETE /api/admin/curriculum/subjects - Delete a subject (Super Admin only)
app.delete('/api/admin/curriculum/subjects', adminMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { branch, semester, subject } = req.body;
    if (!branch || !semester || !subject) {
      return res.status(400).json({ message: 'Branch, semester, and subject name are required' });
    }

    const trimmedSubject = subject.trim();

    if (useMongoDB) {
      const record = await Curriculum.findOne({ branch, semester });
      if (!record || !record.subjects.includes(trimmedSubject)) {
        return res.status(404).json({ message: 'Subject not found in this semester' });
      }

      record.subjects = record.subjects.filter(s => s !== trimmedSubject);
      await record.save();
      await logAdminAction('DELETE_SUBJECT', req.user, record._id, 'Curriculum', { branch, semester, subject: trimmedSubject });
    } else {
      if (!inMemoryCurriculum[branch] || !inMemoryCurriculum[branch][semester] || !inMemoryCurriculum[branch][semester].includes(trimmedSubject)) {
        return res.status(404).json({ message: 'Subject not found in this semester' });
      }
      inMemoryCurriculum[branch][semester] = inMemoryCurriculum[branch][semester].filter(s => s !== trimmedSubject);
    }

    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting subject:', error);
    res.status(500).json({ message: 'Server error deleting subject' });
  }
});

// Admin Routes
// Get platform statistics
app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
  try {
    // Cache for 30 seconds - admin stats can be slightly delayed
    res.set('Cache-Control', 'private, max-age=30');
    
    if (useMongoDB) {
      const totalUsers = await User.countDocuments();
      const totalNotes = await Note.countDocuments();
      const totalDownloads = await Note.aggregate([
        { $group: { _id: null, total: { $sum: '$downloads' } } }
      ]);
      const totalViews = await Note.aggregate([
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]);
      const suspendedUsers = await User.countDocuments({ isSuspended: true });
      const reportedNotes = await Note.countDocuments({ isReported: true });

      res.json({
        totalUsers,
        totalNotes,
        totalDownloads: totalDownloads[0]?.total || 0,
        totalViews: totalViews[0]?.total || 0,
        suspendedUsers,
        reportedNotes
      });
    } else {
      const totalDownloads = notes.reduce((sum, note) => sum + (note.downloads || 0), 0);
      const totalViews = notes.reduce((sum, note) => sum + (note.views || 0), 0);
      const suspendedUsers = users.filter(u => u.isSuspended).length;
      const reportedNotes = notes.filter(n => n.isReported).length;

      res.json({
        totalUsers: users.length,
        totalNotes: notes.length,
        totalDownloads,
        totalViews,
        suspendedUsers,
        reportedNotes
      });
    }
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get admin audit logs
app.get('/api/admin/audit-logs', adminMiddleware, async (req, res) => {
  try {
    if (useMongoDB) {
      if (!AuditLog) {
        return res.status(503).json({ message: 'Audit log service not initialized' });
      }
      const logs = await AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      res.json({ logs });
    } else {
      res.json({ logs: [] });
    }
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  try {
    if (useMongoDB) {
      const allUsers = await User.find().select('-password').sort({ createdAt: -1 }).lean();
      
      // Get upload counts for each user
      const usersWithStats = await Promise.all(allUsers.map(async (user) => {
        const uploadCount = await Note.countDocuments({ userId: user._id });
        return {
          ...user,
          notesUploaded: uploadCount
        };
      }));
      
      res.json({ users: usersWithStats });
    } else {
      const allUsers = users.map(u => ({ ...u, password: undefined }));
      res.json({ users: allUsers });
    }
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Suspend user
app.put('/api/admin/users/:userId/suspend', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (useMongoDB) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.isAdmin) {
        return res.status(400).json({ message: 'Cannot suspend admin users' });
      }
      user.isSuspended = true;
      await user.save();
      res.json({ message: 'User suspended successfully', user });
    } else {
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.isAdmin) {
        return res.status(400).json({ message: 'Cannot suspend admin users' });
      }
      user.isSuspended = true;
      res.json({ message: 'User suspended successfully', user: { ...user, password: undefined } });
    }
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unsuspend user
app.put('/api/admin/users/:userId/unsuspend', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (useMongoDB) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      user.isSuspended = false;
      await user.save();
      res.json({ message: 'User unsuspended successfully', user });
    } else {
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      user.isSuspended = false;
      res.json({ message: 'User unsuspended successfully', user: { ...user, password: undefined } });
    }
  } catch (error) {
    console.error('Unsuspend user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
app.delete('/api/admin/users/:userId', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (useMongoDB) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.isAdmin) {
        return res.status(400).json({ message: 'Cannot delete admin users' });
      }
      await User.findByIdAndUpdate(userId, { deletedAt: new Date() });
      await Note.updateMany({ userId }, { deletedAt: new Date() });
      await logAdminAction('DELETE_USER', req.user, userId, 'User', { name: user.name, email: user.email });
      res.json({ message: 'User and their notes deleted successfully' });
    } else {
      const userIndex = users.findIndex(u => u.id === userId && !u.deletedAt);
      if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (users[userIndex].isAdmin) {
        return res.status(400).json({ message: 'Cannot delete admin users' });
      }
      const user = users[userIndex];
      user.deletedAt = new Date();
      notes.forEach(n => {
        if (n.userId === userId) n.deletedAt = new Date();
      });
      res.json({ message: 'User and their notes deleted successfully' });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change user role (Super Admin only check)
app.put('/api/admin/users/:userId/role', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, isAdmin } = req.body;
    
    // Check if the requester is the Super Admin
    if (req.user.role !== 'superadmin' && req.user.email !== 'superadmin@notemitra.com') {
      return res.status(403).json({ message: 'Access denied. Super Admin only.' });
    }

    if (useMongoDB) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Prevent changing super admin role
      if (user.role === 'superadmin' || user.email === 'superadmin@notemitra.com') {
        return res.status(400).json({ message: 'Cannot modify Super Admin role' });
      }

      user.role = role;
      user.isAdmin = isAdmin;
      await user.save();
      res.json({ message: 'User role updated successfully', user });
    } else {
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      if (user.role === 'superadmin' || user.email === 'superadmin@notemitra.com') {
        return res.status(400).json({ message: 'Cannot modify Super Admin role' });
      }

      user.role = role;
      user.isAdmin = isAdmin;
      res.json({ message: 'User role updated successfully', user: { ...user, password: undefined } });
    }
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create user by Super Admin
app.post('/api/admin/users/create', adminMiddleware, async (req, res) => {
  try {
    // Check if requester is Super Admin
    if (req.user.role !== 'superadmin' && req.user.email !== 'superadmin@notemitra.com') {
      return res.status(403).json({ message: 'Access denied. Super Admin only.' });
    }

    const {
      name,
      email,
      password,
      role,
      branch,
      section,
      rollNo,
      designation,
      department,
      employeeId,
      isAdmin
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    if (useMongoDB) {
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }

      const user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password, // saved directly as per development logic
        role: role || 'student',
        branch,
        section,
        rollNo,
        designation,
        department,
        employeeId,
        isAdmin: isAdmin || false,
        isSuspended: false
      });

      res.status(201).json({ message: 'User created successfully', user });
    } else {
      const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }

      const user = {
        id: (users.length + 1).toString(),
        _id: (users.length + 1).toString(),
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        role: role || 'student',
        branch: branch || '',
        section: section || '',
        rollNo: rollNo || '',
        designation: designation || '',
        department: department || '',
        employeeId: employeeId || '',
        isAdmin: isAdmin || false,
        isSuspended: false,
        createdAt: new Date()
      };
      users.push(user);

      res.status(201).json({ message: 'User created successfully', user: { ...user, password: undefined } });
    }
  } catch (error) {
    console.error('Create user by admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get all notes (admin view)
app.get('/api/admin/notes', adminMiddleware, async (req, res) => {
  try {
    if (useMongoDB) {
      const allNotes = await Note.find().sort({ createdAt: -1 }).lean();
      res.json({ notes: allNotes });
    } else {
      res.json({ notes });
    }
  } catch (error) {
    console.error('Get all notes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete note (admin)
app.delete('/api/admin/notes/:noteId', adminMiddleware, async (req, res) => {
  try {
    const { noteId } = req.params;

    if (useMongoDB) {
      const note = await Note.findById(noteId);
      if (note) {
        await Note.findByIdAndUpdate(noteId, { deletedAt: new Date() });
        await logAdminAction('DELETE_NOTE', req.user, noteId, 'Note', { title: note.title });
      }
      res.json({ message: 'Note deleted successfully' });
    } else {
      const noteIndex = notes.findIndex(n => n.id === noteId && !n.deletedAt);
      if (noteIndex !== -1) {
        notes[noteIndex].deletedAt = new Date();
      }
      res.json({ message: 'Note deleted successfully' });
    }
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Report note
app.post('/api/notes/:noteId/report', async (req, res) => {
  try {
    const { noteId } = req.params;
    const { reason } = req.body;

    if (useMongoDB) {
      const note = await Note.findById(noteId);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      note.isReported = true;
      note.reportReason = reason;
      await note.save();
      res.json({ message: 'Note reported successfully' });
    } else {
      const note = notes.find(n => n.id === noteId);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      note.isReported = true;
      note.reportReason = reason;
      res.json({ message: 'Note reported successfully' });
    }
  } catch (error) {
    console.error('Report note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get reported notes
app.get('/api/admin/reports', adminMiddleware, async (req, res) => {
  try {
    if (useMongoDB) {
      const reportedNotes = await Note.find({ isReported: true }).sort({ createdAt: -1 }).lean();
      res.json({ reports: reportedNotes });
    } else {
      const reportedNotes = notes.filter(n => n.isReported);
      res.json({ reports: reportedNotes });
    }
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resolve report (dismiss)
app.put('/api/admin/reports/:noteId/resolve', adminMiddleware, async (req, res) => {
  try {
    const { noteId } = req.params;

    if (useMongoDB) {
      const note = await Note.findById(noteId);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      note.isReported = false;
      note.reportReason = '';
      await note.save();
      res.json({ message: 'Report resolved successfully' });
    } else {
      const note = notes.find(n => n.id === noteId);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      note.isReported = false;
      note.reportReason = '';
      res.json({ message: 'Report resolved successfully' });
    }
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Notes routes
app.get('/api/notes', async (req, res) => {
  try {
    // Disable browser/proxy caching to keep view and download stats in sync
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    const { subject, semester, branch, page = 1, limit = 50 } = req.query;
    
    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ message: 'Invalid page number. Must be a positive integer' });
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ message: 'Invalid limit. Must be between 1 and 100' });
    }
    
    if (useMongoDB) {
      // Build filter query
      const filter = {};
      
      if (subject) {
        filter.subject = subject.trim();
      }
      
      if (semester) {
        const semesterNum = parseInt(semester);
        if (isNaN(semesterNum)) {
          return res.status(400).json({ message: 'Invalid semester parameter' });
        }
        filter.semester = semesterNum;
      }
      
      if (branch) {
        filter.branch = branch.trim();
      }
      
      // Calculate skip for pagination
      const skip = (pageNum - 1) * limitNum;
      
      // Get total count
      const total = await Note.countDocuments(filter);
      
      // Get filtered notes
      const allNotes = await Note.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      // CRITICAL: Convert fileId to string for all notes
      // This ensures frontend receives clean strings, not ObjectId objects
      allNotes.forEach(note => {
        if (note.fileId) {
          note.fileId = note.fileId.toString();
        }
        // Convert _id to id for frontend compatibility
        if (note._id) {
          note.id = note._id.toString();
        }
        // Convert userId to string if it exists
        if (note.userId) {
          note.userId = note.userId.toString();
        }
      });
      
      res.json({ 
        notes: allNotes, 
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    } else {
      // In-memory version with filtering
      let filteredNotes = [...notes];
      
      if (subject) {
        filteredNotes = filteredNotes.filter(n => n.subject === subject.trim());
      }
      
      if (semester) {
        const semesterNum = parseInt(semester);
        if (!isNaN(semesterNum)) {
          filteredNotes = filteredNotes.filter(n => n.semester === semesterNum);
        }
      }
      
      if (branch) {
        filteredNotes = filteredNotes.filter(n => n.branch === branch.trim());
      }
      
      // Apply pagination
      const skip = (pageNum - 1) * limitNum;
      const paginatedNotes = filteredNotes.slice(skip, skip + limitNum);
      
      res.json({ 
        notes: paginatedNotes, 
        total: filteredNotes.length,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(filteredNotes.length / limitNum)
      });
    }
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ message: 'Server error fetching notes' });
  }
});

// Helper function to generate fallback description
function generateFallbackDescription(title, subject, pdfText) {
  const templates = [
    `Comprehensive study notes covering ${subject}${title ? ' - ' + title : ''}. Essential concepts and key points for exam preparation.`,
    `Detailed ${subject} notes${title ? ' on ' + title : ''}. Perfect for understanding core topics and revision.`,
    `Complete study material for ${subject}${title ? ': ' + title : ''}. Covers important concepts with clear explanations.`,
    `Well-organized notes for ${subject}${title ? ' - ' + title : ''}. Great resource for students to master the subject.`,
    `In-depth coverage of ${subject}${title ? ' focusing on ' + title : ''}. Includes key topics and practice questions.`
  ];
  
  // Pick a random template for variety
  return templates[Math.floor(Math.random() * templates.length)];
}

// AI Description Generation endpoint
app.post('/api/notes/generate-description', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { pdfText, title, subject } = req.body;

    if (!pdfText || pdfText.trim().length < 50) {
      return res.status(400).json({ message: 'PDF text is too short to generate a description' });
    }

    // Check if Anthropic API key is configured
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
      // Generate a smart fallback description without AI
      const fallbackDesc = generateFallbackDescription(title, subject, pdfText);
      return res.json({ description: fallbackDesc });
    }

    try {
      // Truncate PDF text if too long (max ~3000 chars for summary)
      const truncatedText = pdfText.substring(0, 3000);

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `You are helping students share study notes. Based on the following PDF content, generate a SHORT, clear 1-2 sentence description (max 150 chars) that describes what topics/concepts these notes cover.

Title: ${title || 'Not provided'}
Subject: ${subject || 'Not provided'}

PDF Content (first part):
${truncatedText}

Generate ONLY the description, no extra text:`
        }]
      });

      const description = message.content[0].text.trim();

      res.json({ description });
    } catch (aiError) {
      console.error('Claude AI error:', aiError);
      // Fallback description if AI fails
      res.json({ 
        description: `Study notes for ${subject || 'course'}${title ? ': ' + title : ''}`
      });
    }
  } catch (error) {
    console.error('Generate description error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PDF Upload endpoint using GridFS
app.post('/api/notes/upload-pdf', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log('');
  console.log('='.repeat(50));
  console.log(`📤 UPLOAD REQUEST at ${timestamp}`);
  console.log('='.repeat(50));
  
  // Check MongoDB connection
  const mongoConnected = mongoose.connection.readyState === 1;
  console.log('📊 MongoDB state:', mongoose.connection.readyState, '(1=connected)');
  console.log('📊 useMongoDB flag:', useMongoDB);
  console.log('📊 mongoConnected:', mongoConnected);
  console.log('📊 gridfsBucket:', gridfsBucket ? 'initialized' : 'NOT initialized');
  console.log('📊 upload middleware:', upload ? 'initialized' : 'NOT initialized');
  
  if (!useMongoDB || !mongoConnected) {
    console.log('❌ Upload BLOCKED - MongoDB not connected');
    console.log('   Reason:', !useMongoDB ? 'useMongoDB is false' : 'MongoDB disconnected');
    return res.status(503).json({ 
      message: 'File upload requires MongoDB. Currently using in-memory storage. Please check server configuration.',
      error: 'DATABASE_NOT_CONNECTED',
      uploadsEnabled: false
    });
  }

  if (!upload || !gridfsBucket) {
    console.log('❌ Upload BLOCKED - GridFS not initialized');
    return res.status(503).json({ 
      message: 'File upload system not initialized. Please restart the server.',
      error: 'GRIDFS_NOT_INITIALIZED',
      uploadsEnabled: false
    });
  }

  console.log('✅ Pre-checks passed, processing file with multer...');
  
  // Use multer middleware for this specific route
  upload.single('pdf')(req, res, async (err) => {
    if (err) {
      console.error('❌ Multer error:', err.message);
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({ message: 'No PDF file provided. Please include a file with field name "pdf"' });
    }

    try {
      console.log('✅ File received:', req.file.originalname, req.file.size, 'bytes');
      console.log('📄 MIME type:', req.file.mimetype);
      
      // Validate file type - must be PDF
      if (req.file.mimetype !== 'application/pdf') {
        console.log('❌ Invalid file type:', req.file.mimetype);
        return res.status(400).json({ 
          message: 'Only PDF files are allowed. Please upload a PDF file.' 
        });
      }
      
      // Validate file is not empty
      if (req.file.size === 0) {
        console.log('❌ Empty file uploaded');
        return res.status(400).json({ 
          message: 'Uploaded file is empty. Please upload a valid PDF file.' 
        });
      }
      
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        console.log('❌ File too large:', req.file.size);
        return res.status(400).json({ 
          message: `File size exceeds the 10MB limit. Your file is ${(req.file.size / (1024 * 1024)).toFixed(2)}MB` 
        });
      }
      
      // Create upload stream to GridFS
      const filename = `${Date.now()}-${req.file.originalname}`;
      const uploadStream = gridfsBucket.openUploadStream(filename, {
        contentType: req.file.mimetype,
        metadata: {
          originalName: req.file.originalname,
          uploadDate: new Date()
        }
      });

      // Write buffer to GridFS
      uploadStream.end(req.file.buffer);

      uploadStream.on('finish', () => {
        console.log('✅ File uploaded to GridFS successfully');
        console.log('🆔 File ID:', uploadStream.id);
        console.log('🆔 File ID type:', typeof uploadStream.id);
        console.log('🆔 File ID toString:', uploadStream.id.toString());
        
        res.json({
          message: 'File uploaded successfully',
          fileId: uploadStream.id.toString(), // Convert ObjectId to string
          filename: filename,
          size: req.file.size
        });
      });

      uploadStream.on('error', (error) => {
        console.error('❌ GridFS upload error:', error);
        res.status(500).json({ message: 'Error uploading file to storage' });
      });

    } catch (error) {
      console.error('❌ Upload error:', error);
      res.status(500).json({ message: 'Error processing upload' });
    }
  });
});

// Local file server route to serve local uploads fallback
app.get('/api/notes/temp-files/:filename', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } else {
    console.error(`❌ Local file not found: ${filePath}`);
    res.status(404).json({ message: 'File not found' });
  }
});

// Cloudinary PDF Upload endpoint (Primary method)
app.post('/api/notes/upload-pdf-cloudinary', uploadMemory.single('pdf'), async (req, res) => {
  try {
    console.log('');
    console.log('='.repeat(50));
    console.log('☁️ CLOUDINARY UPLOAD REQUEST');
    console.log('='.repeat(50));
    
    // Check if Cloudinary is configured
    const hasCloudinary = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
    
    // Debug: Check Cloudinary configuration
    console.log('🔧 Cloudinary Config Check:');
    console.log('   Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ MISSING');
    console.log('   API Key:', process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ MISSING');
    console.log('   API Secret:', process.env.CLOUDINARY_API_SECRET ? '✅ Set (hidden)' : '❌ MISSING');

    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({ message: 'No PDF file provided' });
    }

    // Validate file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Only PDF files are allowed' });
    }

    if (!hasCloudinary) {
      console.warn('⚠️ Cloudinary credentials not configured. Using local filesystem storage fallback.');
      
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.join(__dirname, 'uploads');
      
      // Ensure uploads directory exists
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const uniqueFilename = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const destPath = path.join(uploadsDir, uniqueFilename);
      
      // Save file buffer to local disk
      fs.writeFileSync(destPath, req.file.buffer);
      console.log('✅ File saved to local folder:', destPath);

      // Construct local download URL
      const host = req.get('host');
      const protocol = req.protocol;
      const localUrl = `${protocol}://${host}/api/notes/temp-files/${uniqueFilename}`;

      return res.json({
        success: true,
        message: 'File uploaded successfully (Local Fallback)',
        fileUrl: localUrl,
        url: localUrl,
        fileId: uniqueFilename,
        publicId: uniqueFilename,
        filename: req.file.originalname,
        size: req.file.size,
        cloudinaryId: uniqueFilename,
        cloudinaryUrl: localUrl
      });
    }

    console.log('✅ File received:', req.file.originalname);
    console.log('   Size:', (req.file.size / (1024 * 1024)).toFixed(2), 'MB');
    console.log('   MIME:', req.file.mimetype);
    console.log('   Buffer length:', req.file.buffer?.length || 0);

    // Validate file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Only PDF files are allowed' });
    }

    // Validate file size (max 10MB for Cloudinary free tier raw files)
    const maxSize = 10 * 1024 * 1024; // 10MB limit for free tier
    if (req.file.size > maxSize) {
      console.log('❌ File too large:', (req.file.size / (1024 * 1024)).toFixed(2), 'MB');
      return res.status(413).json({ 
        message: `File too large. Cloudinary supports PDFs up to 10MB. Your file is ${(req.file.size / (1024 * 1024)).toFixed(2)}MB. Please compress your PDF at ilovepdf.com before uploading.`,
        error: 'FILE_TOO_LARGE',
        maxSize: '10MB',
        yourSize: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`,
        compressUrl: 'https://www.ilovepdf.com/compress_pdf'
      });
    }

    // Sanitize filename for Cloudinary public_id
    const sanitizedName = req.file.originalname
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    const publicId = `${Date.now()}-${sanitizedName}`;
    
    console.log('📤 Uploading to Cloudinary...');
    console.log('   Public ID:', publicId);

    // Upload to Cloudinary using buffer
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',  // MUST be 'raw' for PDFs
          folder: 'notemitra/pdfs',
          public_id: publicId,
          overwrite: true,
          invalidate: true
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary API Error:', JSON.stringify(error, null, 2));
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      
      // Write buffer to stream
      uploadStream.end(req.file.buffer);
    });

    console.log('✅ File uploaded to Cloudinary successfully!');
    console.log('🔗 Secure URL:', result.secure_url);
    console.log('🆔 Public ID:', result.public_id);
    console.log('📦 Bytes:', result.bytes);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileUrl: result.secure_url,
      url: result.secure_url,
      fileId: result.public_id,
      publicId: result.public_id,
      filename: req.file.originalname,
      size: req.file.size,
      cloudinaryId: result.public_id,
      cloudinaryUrl: result.secure_url
    });

  } catch (error) {
    console.error('❌ Cloudinary upload error:');
    console.error('   Message:', error.message);
    console.error('   Name:', error.name);
    console.error('   HTTP Code:', error.http_code);
    console.error('   Full error:', JSON.stringify(error, null, 2));
    
    // Provide more specific error messages
    let userMessage = 'Error uploading file to Cloudinary';
    if (error.message?.includes('Invalid API')) {
      userMessage = 'Storage service authentication failed. Please contact administrator.';
    } else if (error.http_code === 401) {
      userMessage = 'Storage service authentication failed.';
    } else if (error.http_code === 413) {
      userMessage = 'File is too large for the storage service.';
    }
    
    res.status(500).json({ 
      success: false,
      message: userMessage, 
      error: error.message 
    });
  }
});

// Download PDF from GridFS
// View PDF inline (for preview)
app.get('/api/notes/view-pdf/:fileId', async (req, res) => {
  try {
    console.log('👁️ Preview request for fileId:', req.params.fileId);
    
    if (!useMongoDB) {
      return res.status(503).json({ message: 'File preview requires MongoDB' });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      console.log('❌ Invalid ObjectId format:', req.params.fileId);
      return res.status(400).json({ message: 'Invalid file ID format' });
    }

    const fileId = new mongoose.Types.ObjectId(req.params.fileId);

    // Find the file in GridFS
    const files = await gfs.files.findOne({ _id: fileId });
    
    if (!files) {
      console.log('❌ File not found for preview:', fileId);
      return res.status(404).json({ message: 'File not found' });
    }

    console.log('✅ File found for preview:', files.filename);

    // Sanitize filename and ensure .pdf extension
    let sanitizedFilename = files.filename.replace(/[^\w\s.-]/gi, '_');
    if (!sanitizedFilename.toLowerCase().endsWith('.pdf')) {
      sanitizedFilename += '.pdf';
    }
    const encodedFilename = encodeURIComponent(sanitizedFilename).replace(/['()]/g, escape);

    // Set proper headers for PDF inline viewing with CORS support
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${sanitizedFilename}"; filename*=UTF-8''${encodedFilename}`,
      'Content-Length': files.length,
      'Cache-Control': 'public, max-age=31536000',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition'
    });

    // Stream the file
    const readstream = gridfsBucket.openDownloadStream(fileId);
    
    readstream.on('error', (error) => {
      console.error('❌ Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming file' });
      }
    });

    readstream.pipe(res);
  } catch (error) {
    console.error('❌ View PDF error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error viewing file', error: error.message });
    }
  }
});

// Download PDF by fileId (forces download) - GridFS version
app.get('/api/notes/download-pdf/:fileId', async (req, res) => {
  try {
    const fileIdParam = req.params.fileId;
    console.log('📥 Download request for fileId:', fileIdParam);
    console.log('📥 Request headers:', { origin: req.headers.origin, referer: req.headers.referer });
    
    if (!useMongoDB) {
      console.log('❌ MongoDB not available');
      return res.status(503).json({ 
        success: false,
        message: 'File download requires MongoDB',
        error: 'SERVICE_UNAVAILABLE' 
      });
    }

    // Validate fileId is provided
    if (!fileIdParam || fileIdParam.trim() === '') {
      console.log('❌ Missing fileId parameter');
      return res.status(400).json({ 
        success: false,
        message: 'File ID is required',
        error: 'MISSING_FILE_ID' 
      });
    }

    // Safely convert string to ObjectId with try-catch
    let fileId;
    try {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(fileIdParam)) {
        console.log('❌ Invalid ObjectId format:', fileIdParam);
        return res.status(400).json({ 
          success: false,
          message: 'Invalid file ID format. Must be a 24-character hexadecimal string.',
          error: 'INVALID_FILE_ID_FORMAT',
          receivedId: fileIdParam
        });
      }
      
      fileId = new mongoose.Types.ObjectId(fileIdParam);
      console.log('✅ Valid ObjectId created:', fileId);
    } catch (error) {
      console.log('❌ Error converting to ObjectId:', error.message);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid file ID format',
        error: 'INVALID_OBJECT_ID',
        details: error.message
      });
    }

    // Find the file in GridFS
    const files = await gfs.files.findOne({ _id: fileId });
    
    if (!files) {
      console.log('❌ File not found in GridFS:', fileId);
      // List recent files for debugging
      const recentFiles = await gfs.files.find().limit(10).toArray();
      console.log('📂 Recent files in GridFS:', recentFiles.map(f => ({ 
        id: f._id.toString(), 
        name: f.filename,
        uploadDate: f.uploadDate 
      })));
      return res.status(404).json({ 
        success: false,
        message: 'File not found in storage',
        error: 'FILE_NOT_FOUND',
        fileId: fileId.toString(),
        hint: 'The file may have been deleted or never uploaded'
      });
    }

    console.log('✅ File found:', { 
      id: files._id.toString(), 
      name: files.filename, 
      size: files.length,
      uploadDate: files.uploadDate,
      contentType: files.contentType
    });

    // Sanitize filename and ensure .pdf extension
    let sanitizedFilename = files.filename.replace(/[^\w\s.-]/gi, '_');
    if (!sanitizedFilename.toLowerCase().endsWith('.pdf')) {
      sanitizedFilename += '.pdf';
    }
    
    // RFC 5987 compliant filename encoding for better mobile support
    const encodedFilename = encodeURIComponent(sanitizedFilename).replace(/['()]/g, escape);

    // Set proper headers for PDF download (attachment forces download)
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodedFilename}`,
      'Content-Length': files.length,
      'Cache-Control': 'public, max-age=31536000',
      'Accept-Ranges': 'bytes',
      'X-File-Id': files._id.toString(),
      'X-File-Name': sanitizedFilename
    });

    // Stream the file from GridFS
    const readstream = gridfsBucket.openDownloadStream(fileId);
    
    readstream.on('error', (error) => {
      console.error('❌ Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false,
          message: 'Error streaming file from storage',
          error: 'STREAM_ERROR',
          details: error.message 
        });
      }
    });

    readstream.on('end', () => {
      console.log('✅ File download stream completed successfully');
    });

    readstream.pipe(res);
  } catch (error) {
    console.error('❌ Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        message: 'Error downloading file', 
        error: 'INTERNAL_ERROR',
        details: error.message 
      });
    }
  }
});

// NEW: View PDF inline by note ID (handles Cloudinary and GridFS)
app.get('/api/notes/:id/view', async (req, res) => {
  try {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    const noteId = req.params.id;
    
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ message: 'Note ID is required' });
    }

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }

      const note = await Note.findById(noteId).lean();
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }

      // Determine PDF URL
      let pdfUrl = note.cloudinaryUrl || note.fileUrl;
      
      // Sanitize filename and ensure .pdf extension
      let sanitizedFilename = (note.fileName || note.title || 'document').replace(/[^\w\s.-]/gi, '_');
      if (!sanitizedFilename.toLowerCase().endsWith('.pdf')) {
        sanitizedFilename += '.pdf';
      }
      const encodedFilename = encodeURIComponent(sanitizedFilename).replace(/['()]/g, escape);

      // Set base headers for inline display
      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${sanitizedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'public, max-age=31536000',
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition'
      };

      if (pdfUrl && pdfUrl.startsWith('https://res.cloudinary.com')) {
        console.log(`👁️ Proxying Cloudinary PDF view for Note: ${noteId}, URL: ${pdfUrl}`);
        
        const https = require('https');
        https.get(pdfUrl, (cloudinaryRes) => {
          if (cloudinaryRes.statusCode >= 400) {
            console.error(`❌ Cloudinary responded with status: ${cloudinaryRes.statusCode}`);
            if (!res.headersSent) {
              return res.status(cloudinaryRes.statusCode).json({ message: 'Failed to retrieve PDF from Cloudinary' });
            }
          }
          
          if (cloudinaryRes.headers['content-length']) {
            headers['Content-Length'] = cloudinaryRes.headers['content-length'];
          }
          
          res.set(headers);
          cloudinaryRes.pipe(res);
        }).on('error', (error) => {
          console.error('❌ Cloudinary stream request error:', error);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error streaming file from Cloudinary', error: error.message });
          }
        });
      } else if (note.fileId) {
        console.log(`👁️ Streaming GridFS PDF view for Note: ${noteId}, fileId: ${note.fileId}`);
        const fileId = new mongoose.Types.ObjectId(note.fileId);
        const files = await gfs.files.findOne({ _id: fileId });
        
        if (!files) {
          console.log('❌ File not found in GridFS for preview:', fileId);
          return res.status(404).json({ message: 'File not found' });
        }

        headers['Content-Length'] = files.length;
        res.set(headers);

        const readstream = gridfsBucket.openDownloadStream(fileId);
        readstream.on('error', (error) => {
          console.error('❌ GridFS stream error:', error);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error streaming file from database' });
          }
        });
        readstream.pipe(res);
      } else if (pdfUrl) {
        res.redirect(pdfUrl);
      } else {
        res.status(404).json({ message: 'No file associated with this note' });
      }
    } else {
      // In-memory version
      const note = notes.find(n => n.id === parseInt(noteId));
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      if (note.fileUrl) {
        res.redirect(note.fileUrl);
      } else {
        res.status(404).json({ message: 'No file associated with this note' });
      }
    }
  } catch (error) {
    console.error('❌ View note file error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error viewing note file', error: error.message });
    }
  }
});

// NEW: Download PDF by note ID (user-friendly endpoint)
app.get('/api/notes/:noteId/download', async (req, res) => {
  try {
    const noteIdParam = req.params.noteId;
    console.log('📥 Download request for note ID:', noteIdParam);
    
    if (!noteIdParam || noteIdParam.trim() === '') {
      return res.status(400).json({ 
        success: false,
        message: 'Note ID is required',
        error: 'MISSING_NOTE_ID' 
      });
    }

    if (useMongoDB) {
      // Validate ObjectId format for MongoDB
      if (!mongoose.Types.ObjectId.isValid(noteIdParam)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid note ID format',
          error: 'INVALID_NOTE_ID_FORMAT',
          receivedId: noteIdParam
        });
      }

      // Find the note
      const note = await Note.findById(noteIdParam).lean();
      
      if (!note) {
        return res.status(404).json({ 
          success: false,
          message: 'Note not found',
          error: 'NOTE_NOT_FOUND',
          noteId: noteIdParam
        });
      }

      console.log('📄 Note found:', {
        id: note._id,
        title: note.title,
        fileId: note.fileId,
        cloudinaryId: note.cloudinaryId,
        cloudinaryUrl: note.cloudinaryUrl,
        fileUrl: note.fileUrl
      });

      // PRIORITY 1: Check for Cloudinary URL (newer uploads)
      if (note.cloudinaryUrl || note.fileUrl) {
        const downloadUrl = note.cloudinaryUrl || note.fileUrl;
        console.log('☁️ Using Cloudinary URL for download:', downloadUrl);
        
        // Return JSON with download URL - frontend will handle it
        return res.json({ 
          success: true,
          downloadUrl: downloadUrl,
          fileName: note.fileName || `${note.title}.pdf`,
          source: 'cloudinary'
        });
      }

      // PRIORITY 2: Check for GridFS fileId (older uploads)
      if (note.fileId) {
        console.log('📦 Using GridFS for download, fileId:', note.fileId);
        
        // Convert fileId to ObjectId
        const fileId = new mongoose.Types.ObjectId(note.fileId);
        console.log('✅ Found note with fileId:', fileId.toString());

        // Find file in GridFS
        const files = await gfs.files.findOne({ _id: fileId });
        
        if (!files) {
          return res.status(404).json({ 
            success: false,
            message: 'File not found in storage',
            error: 'FILE_NOT_FOUND',
            fileId: fileId.toString()
          });
        }

        console.log('✅ File found for download:', { 
          noteId: noteIdParam,
          fileId: files._id.toString(), 
          filename: files.filename,
          size: files.length
        });

        // Sanitize filename and ensure .pdf extension
        let sanitizedFilename = files.filename.replace(/[^\w\s.-]/gi, '_');
        if (!sanitizedFilename.toLowerCase().endsWith('.pdf')) {
          sanitizedFilename += '.pdf';
        }
        
        // RFC 5987 compliant filename encoding for better mobile support
        const encodedFilename = encodeURIComponent(sanitizedFilename).replace(/['()]/g, escape);

        // Set download headers with mobile-friendly options
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodedFilename}`,
          'Content-Length': files.length,
          'Cache-Control': 'public, max-age=31536000',
          'Accept-Ranges': 'bytes',
          'X-Note-Id': noteIdParam,
          'X-File-Id': files._id.toString()
        });

        // Stream the file
        const readstream = gridfsBucket.openDownloadStream(fileId);
        
        readstream.on('error', (error) => {
          console.error('❌ Stream error:', error);
          if (!res.headersSent) {
            res.status(500).json({ 
              success: false,
              message: 'Error streaming file',
              error: 'STREAM_ERROR',
              details: error.message 
            });
          }
        });

        return readstream.pipe(res);
      }

      // No file found at all
      return res.status(404).json({ 
        success: false,
        message: 'No file associated with this note',
        error: 'NO_FILE',
        noteId: noteIdParam
      });

    } else {
      // In-memory version
      const noteIdNum = parseInt(noteIdParam);
      if (isNaN(noteIdNum)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid note ID format',
          error: 'INVALID_NOTE_ID' 
        });
      }
      
      const note = notes.find(n => n.id === noteIdNum);
      if (!note) {
        return res.status(404).json({ 
          success: false,
          message: 'Note not found',
          error: 'NOTE_NOT_FOUND' 
        });
      }

      if (!note.fileUrl) {
        return res.status(404).json({ 
          success: false,
          message: 'No file associated with this note',
          error: 'NO_FILE_URL' 
        });
      }

      // Return JSON with download URL for in-memory mode
      res.json({ 
        success: true,
        downloadUrl: note.fileUrl,
        fileName: note.fileName || `${note.title}.pdf`
      });
    }
  } catch (error) {
    console.error('❌ Download by note ID error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        message: 'Error downloading file',
        error: 'INTERNAL_ERROR',
        details: error.message 
      });
    }
  }
});

// Track note preview - Increments views count
app.post('/api/notes/:id/preview', async (req, res) => {
  try {
    const noteId = req.params.id;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    // Get user ID from token
    let userId = null;
    if (token && token.startsWith('dev_token_') && !token.includes('expired')) {
      const userIdStr = token.replace('dev_token_', '');
      if (mongoose.Types.ObjectId.isValid(userIdStr)) {
        userId = userIdStr;
      }
    }

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }

      const updateQuery = { $inc: { views: 1 } };
      if (userId) {
        updateQuery.$addToSet = { viewedBy: userId };
      }

      const note = await Note.findByIdAndUpdate(
        noteId,
        updateQuery,
        { new: true }
      ).lean();

      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }

      console.log(`👁️ Preview tracked - Note: ${noteId}, User: ${userId || 'anonymous'}, Total Views: ${note.views}`);
      res.json({ message: 'Preview tracked', views: note.views });
    } else {
      // In-memory version
      const note = notes.find(n => n.id === parseInt(noteId));
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }

      note.views = (note.views || 0) + 1;
      if (userId) {
        if (!note.viewedBy) note.viewedBy = [];
        if (!note.viewedBy.includes(userId)) {
          note.viewedBy.push(userId);
        }
      }

      console.log(`👁️ Preview tracked (In-memory) - Note: ${noteId}, Total Views: ${note.views}`);
      res.json({ message: 'Preview tracked', views: note.views });
    }
  } catch (error) {
    console.error('Track preview error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Track note download - Counts downloads and views every time
app.post('/api/notes/:id/download', async (req, res) => {
  try {
    const noteId = req.params.id;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    // Get user ID from token
    let userId = null;
    if (token && token.startsWith('dev_token_') && !token.includes('expired')) {
      const userIdStr = token.replace('dev_token_', '');
      if (mongoose.Types.ObjectId.isValid(userIdStr)) {
        userId = userIdStr;
      }
    }

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }

      // New download - increment downloads and views every time, and add user to downloadedBy/viewedBy sets
      const updateQuery = { 
        $inc: { downloads: 1, views: 1 } 
      };
      if (userId) {
        updateQuery.$addToSet = { 
          downloadedBy: userId,
          viewedBy: userId
        };
      }

      const note = await Note.findByIdAndUpdate(
        noteId,
        updateQuery,
        { new: true }
      ).lean();

      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }

      // Update uploader's totalDownloads
      if (note.userId) {
        await User.findByIdAndUpdate(
          note.userId,
          { $inc: { totalDownloads: 1 } }
        );
      }

      console.log(`📥 Download tracked - Note: ${noteId}, User: ${userId || 'anonymous'}, Total Downloads: ${note.downloads}, Total Views: ${note.views}`);
      res.json({ message: 'Download tracked', downloads: note.downloads, views: note.views, alreadyCounted: false });
    } else {
      // In-memory version
      const note = notes.find(n => n.id === parseInt(noteId));
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }

      if (!note.downloadedBy) note.downloadedBy = [];
      if (!note.viewedBy) note.viewedBy = [];
      
      note.downloads = (note.downloads || 0) + 1;
      note.views = (note.views || 0) + 1;
      if (userId) {
        if (!note.downloadedBy.includes(userId)) note.downloadedBy.push(userId);
        if (!note.viewedBy.includes(userId)) note.viewedBy.push(userId);
      }

      // Increment the note uploader's totalDownloads
      const uploader = users.find(u => u.id === note.userId);
      if (uploader) {
        if (!uploader.totalDownloads) uploader.totalDownloads = 0;
        uploader.totalDownloads += 1;
      }

      console.log(`📥 Download tracked (In-memory) - Note: ${noteId}, Total Downloads: ${note.downloads}, Total Views: ${note.views}`);
      res.json({ message: 'Download tracked', downloads: note.downloads, views: note.views, alreadyCounted: false });
    }
  } catch (error) {
    console.error('Track download error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/notes', async (req, res) => {
  try {
    console.log('📝 Creating note with data:', JSON.stringify(req.body, null, 2));
    console.log('📎 fileId in request:', req.body.fileId, 'type:', typeof req.body.fileId);
    console.log('☁️ cloudinaryId in request:', req.body.cloudinaryId);
    console.log('🔗 fileUrl in request:', req.body.fileUrl);
    
    const authHeader = req.headers.authorization;
    
    // Validate authorization
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Check for expired token
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Token has expired. Please login again.',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Not authenticated. Please provide a valid authorization token.',
        error: 'INVALID_TOKEN'
      });
    }

    const userId = token.replace('dev_token_', '');
    
    // Check for empty request body
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ 
        message: 'Request body is required. Please provide note data.',
        error: 'EMPTY_BODY'
      });
    }
    
    // Validate required fields
    const { title, description, subject, semester, fileId, fileUrl, cloudinaryId, module, tags } = req.body;
    
    // Title validation
    if (title === undefined || title === null) {
      return res.status(400).json({ message: 'Title is required', error: 'TITLE_REQUIRED' });
    }
    
    // Type validation for title
    if (typeof title !== 'string') {
      return res.status(400).json({ 
        message: 'Invalid data type for title. Expected string.',
        error: 'INVALID_TYPE'
      });
    }
    
    if (title.trim() === '') {
      return res.status(400).json({ message: 'Title is required', error: 'TITLE_REQUIRED' });
    }
    
    // Title length validation (max 200 characters)
    const MAX_TITLE_LENGTH = 200;
    if (title.trim().length > MAX_TITLE_LENGTH) {
      return res.status(400).json({ 
        message: `Title exceeds maximum allowed length of ${MAX_TITLE_LENGTH} characters`,
        error: 'TITLE_TOO_LONG'
      });
    }
    
    // Description validation
    if (description === undefined || description === null) {
      return res.status(400).json({ message: 'Description is required', error: 'DESCRIPTION_REQUIRED' });
    }
    
    // Type validation for description
    if (typeof description !== 'string') {
      return res.status(400).json({ 
        message: 'Invalid data type for description. Expected string.',
        error: 'INVALID_TYPE'
      });
    }
    
    if (description.trim() === '') {
      return res.status(400).json({ message: 'Description is required', error: 'DESCRIPTION_REQUIRED' });
    }
    
    // Description length validation (max 5000 characters)
    const MAX_DESC_LENGTH = 5000;
    if (description.trim().length > MAX_DESC_LENGTH) {
      return res.status(400).json({ 
        message: `Description exceeds maximum allowed length of ${MAX_DESC_LENGTH} characters`,
        error: 'DESCRIPTION_TOO_LONG'
      });
    }
    
    // Subject validation
    if (subject === undefined || subject === null) {
      return res.status(400).json({ message: 'Subject is required', error: 'SUBJECT_REQUIRED' });
    }
    
    // Type validation for subject
    if (typeof subject !== 'string') {
      return res.status(400).json({ 
        message: 'Invalid data type for subject. Expected string.',
        error: 'INVALID_TYPE'
      });
    }
    
    if (subject.trim() === '') {
      return res.status(400).json({ message: 'Subject is required', error: 'SUBJECT_REQUIRED' });
    }
    
    if (semester === undefined || semester === null || semester === '') {
      return res.status(400).json({ message: 'Semester is required', error: 'SEMESTER_REQUIRED' });
    }
    
    // Validate semester is numeric and within range
    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return res.status(400).json({ 
        message: 'Invalid semester. Must be a number between 1 and 8',
        error: 'INVALID_SEMESTER'
      });
    }

    // Module validation
    if (module === undefined || module === null || typeof module !== 'string' || module.trim() === '') {
      return res.status(400).json({ message: 'Module is required', error: 'MODULE_REQUIRED' });
    }

    // Tags validation
    if (tags === undefined || tags === null || typeof tags !== 'string' || tags.trim() === '') {
      return res.status(400).json({ message: 'Tags are required', error: 'TAGS_REQUIRED' });
    }
    
    // Either fileId (GridFS) or fileUrl (Cloudinary) is required
    if ((!fileId || (typeof fileId === 'string' && fileId.trim() === '')) && 
        (!fileUrl || (typeof fileUrl === 'string' && fileUrl.trim() === ''))) {
      return res.status(400).json({ 
        message: 'File is required. Please upload a PDF first',
        error: 'FILE_REQUIRED'
      });
    }
    
    // Check for duplicate title (only in same subject and semester)
    if (useMongoDB) {
      const existingNote = await Note.findOne({ 
        title: title.trim(),
        subject: subject.trim(),
        semester: semesterNum
      });
      if (existingNote) {
        return res.status(409).json({ 
          message: 'A note with this title already exists in the same subject and semester',
          error: 'DUPLICATE_TITLE'
        });
      }
    } else {
      const existingNote = notes.find(n => 
        n.title === title.trim() && 
        n.subject === subject.trim() && 
        n.semester === semesterNum
      );
      if (existingNote) {
        return res.status(409).json({ 
          message: 'A note with this title already exists in the same subject and semester',
          error: 'DUPLICATE_TITLE'
        });
      }
    }

    if (useMongoDB) {
      // MongoDB version
      const user = await User.findById(userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const note = new Note({
        ...req.body,
        title: title.trim(),
        description: description.trim(),
        subject: subject.trim(),
        cloudinaryId: cloudinaryId || null,
        cloudinaryUrl: fileUrl || null,
        userId: user._id,
        userName: user.name,
        views: 0,
        downloads: 0,
        upvotes: 0,
        downvotes: 0
      });
      
      console.log('💾 Saving note with fileId:', note.fileId, 'cloudinaryId:', note.cloudinaryId);
      await note.save();
      console.log('✅ Note saved with ID:', note._id, 'fileId:', note.fileId, 'cloudinaryUrl:', note.cloudinaryUrl);

      // Increment user's notesUploaded count
      await User.findByIdAndUpdate(userId, { $inc: { notesUploaded: 1 } });

      res.status(201).json({ message: 'Note created successfully', note });
    } else {
      // In-memory version
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const note = {
        id: notes.length + 1,
        ...req.body,
        userId: user.id,
        userName: user.name,
        createdAt: new Date(),
        views: 0,
        downloads: 0,
        upvotes: 0,
        downvotes: 0
      };
      notes.push(note);

      // Increment user's notesUploaded count
      if (!user.notesUploaded) user.notesUploaded = 0;
      user.notesUploaded += 1;

      res.status(201).json({ message: 'Note created successfully', note });
    }
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single note by ID
app.get('/api/notes/:id', async (req, res) => {
  try {
    const noteId = req.params.id;
    
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ message: 'Note ID is required' });
    }

    // Extract user ID from token if present (for checking if user liked/viewed)
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer dev_token_')) {
      currentUserId = authHeader.replace('Bearer dev_token_', '');
    }

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID format. Must be a valid MongoDB ObjectId' });
      }

      // First, get the note to check if user already viewed
      let note = await Note.findById(noteId).lean();

      if (!note) {
        return res.status(404).json({ message: 'Note not found with the provided ID' });
      }

      // Do not increment views on note details fetch. Views are tracked on download or preview.

      // Check if current user has liked this note
      let userLiked = false;
      if (currentUserId && mongoose.Types.ObjectId.isValid(currentUserId) && note.likedBy) {
        userLiked = note.likedBy.some(id => id.toString() === currentUserId);
      }

      // CRITICAL: Convert ObjectIds to strings for frontend
      // MongoDB returns ObjectIds which need to be converted to strings
      if (note.fileId) {
        note.fileId = note.fileId.toString();
      }
      
      // Convert _id to string and also add as 'id' for compatibility
      if (note._id) {
        note._id = note._id.toString();
        note.id = note._id; // Add id field for frontend compatibility
      }
      
      // Convert userId to string if it's an ObjectId
      if (note.userId && typeof note.userId === 'object') {
        note.userId = note.userId.toString();
      }

      console.log('✅ Returning note:', {
        id: note.id || note._id,
        _id: note._id,
        title: note.title,
        fileId: note.fileId,
        hasFileId: !!note.fileId,
        userLiked
      });

      res.json({ note, userLiked });
    } else {
      // In-memory version
      const noteIdNum = parseInt(noteId);
      if (isNaN(noteIdNum)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }
      
      const note = notes.find(n => n.id === noteIdNum);
      if (!note) {
        return res.status(404).json({ message: 'Note not found with the provided ID' });
      }

      // Do not increment views on note details fetch
      
      // Check if user liked (in-memory)
      let userLiked = false;
      if (currentUserId && note.likedBy) {
        userLiked = note.likedBy.includes(currentUserId);
      }
      
      res.json({ note, userLiked });
    }
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ message: 'Server error fetching note', error: error.message });
  }
});

// Update a note (owner only)
app.put('/api/notes/:id', async (req, res) => {
  try {
    const noteId = req.params.id;
    const authHeader = req.headers.authorization;
    
    // Validate authorization
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Token has expired. Please login again.',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Not authenticated. Please provide a valid authorization token.',
        error: 'INVALID_TOKEN'
      });
    }

    const userId = token.replace('dev_token_', '');
    
    // Validate note ID
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ message: 'Note ID is required' });
    }

    const { title, description, subject, semester } = req.body;
    
    // Build update object with only provided fields
    const updateData = {};
    if (title !== undefined) {
      if (!title || title.trim() === '') {
        return res.status(400).json({ message: 'Title cannot be empty' });
      }
      updateData.title = title.trim();
    }
    if (description !== undefined) {
      if (!description || description.trim() === '') {
        return res.status(400).json({ message: 'Description cannot be empty' });
      }
      updateData.description = description.trim();
    }
    if (subject !== undefined) {
      if (!subject || subject.trim() === '') {
        return res.status(400).json({ message: 'Subject cannot be empty' });
      }
      updateData.subject = subject.trim();
    }
    if (semester !== undefined) {
      if (isNaN(semester) || semester < 1 || semester > 8) {
        return res.status(400).json({ message: 'Invalid semester. Must be a number between 1 and 8' });
      }
      updateData.semester = parseInt(semester);
    }
    
    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid update fields provided' });
    }

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }

      // Find the note first to check ownership
      const existingNote = await Note.findById(noteId);
      
      if (!existingNote) {
        return res.status(404).json({ message: 'Note not found' });
      }
      
      // Check ownership
      if (existingNote.userId.toString() !== userId) {
        return res.status(403).json({ message: 'You can only update your own notes' });
      }
      
      // Update the note
      updateData.updatedAt = new Date();
      const updatedNote = await Note.findByIdAndUpdate(
        noteId,
        { $set: updateData },
        { new: true }
      ).lean();
      
      // Convert ObjectIds to strings
      if (updatedNote._id) {
        updatedNote.id = updatedNote._id.toString();
      }
      if (updatedNote.userId) {
        updatedNote.userId = updatedNote.userId.toString();
      }
      if (updatedNote.fileId) {
        updatedNote.fileId = updatedNote.fileId.toString();
      }
      
      res.json({ message: 'Note updated successfully', note: updatedNote });
    } else {
      // In-memory version
      const noteIdNum = parseInt(noteId);
      if (isNaN(noteIdNum)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }
      
      const noteIndex = notes.findIndex(n => n.id === noteIdNum);
      if (noteIndex === -1) {
        return res.status(404).json({ message: 'Note not found' });
      }
      
      // Check ownership
      if (notes[noteIndex].userId !== userId) {
        return res.status(403).json({ message: 'You can only update your own notes' });
      }
      
      // Update note
      notes[noteIndex] = { ...notes[noteIndex], ...updateData, updatedAt: new Date() };
      
      res.json({ message: 'Note updated successfully', note: notes[noteIndex] });
    }
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ message: 'Server error updating note' });
  }
});

// Delete a note (owner only)
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const noteId = req.params.id;
    const authHeader = req.headers.authorization;
    
    // Validate authorization
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Token has expired. Please login again.',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Not authenticated. Please provide a valid authorization token.',
        error: 'INVALID_TOKEN'
      });
    }

    const userId = token.replace('dev_token_', '');
    
    // Validate note ID
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ message: 'Note ID is required' });
    }

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }

      // Find the note first to check ownership
      const existingNote = await Note.findById(noteId);
      
      if (!existingNote) {
        return res.status(404).json({ message: 'Note not found' });
      }
      
      // Check ownership
      if (existingNote.userId.toString() !== userId) {
        return res.status(403).json({ message: 'You can only delete your own notes' });
      }
      
      // Delete the note (soft delete)
      await Note.findByIdAndUpdate(noteId, { deletedAt: new Date() });
      
      // Decrement user's notesUploaded count
      await User.findByIdAndUpdate(userId, { $inc: { notesUploaded: -1 } });
      
      res.json({ message: 'Note deleted successfully' });
    } else {
      // In-memory version
      const noteIdNum = parseInt(noteId);
      if (isNaN(noteIdNum)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }
      
      const noteIndex = notes.findIndex(n => n.id === noteIdNum && !n.deletedAt);
      if (noteIndex === -1) {
        return res.status(404).json({ message: 'Note not found' });
      }
      
      // Check ownership
      if (notes[noteIndex].userId !== userId) {
        return res.status(403).json({ message: 'You can only delete your own notes' });
      }
      
      // Remove note (soft delete)
      notes[noteIndex].deletedAt = new Date();
      
      res.json({ message: 'Note deleted successfully' });
    }
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Server error deleting note' });
  }
});

// Vote on a note (Instagram-style like toggle)
app.post('/api/notes/:id/vote', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Validate authorization
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Check for expired token
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Token has expired. Please login again.',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Not authenticated. Please provide a valid authorization token',
        error: 'INVALID_TOKEN'
      });
    }
    
    // Extract user ID from token
    const userId = token.replace('dev_token_', '');

    const noteId = req.params.id;
    
    // Validate noteId
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ 
        message: 'Note ID is required',
        error: 'NOTE_ID_REQUIRED'
      });
    }

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ 
          message: 'Invalid note ID format. Must be a valid MongoDB ObjectId',
          error: 'INVALID_NOTE_ID_FORMAT'
        });
      }

      // Check if note exists first
      const existingNote = await Note.findById(noteId);
      if (!existingNote) {
        return res.status(404).json({ 
          message: 'Note not found with the provided ID',
          error: 'NOTE_NOT_FOUND'
        });
      }

      // Initialize likedBy array if it doesn't exist
      if (!existingNote.likedBy) {
        existingNote.likedBy = [];
      }

      // Check if user already liked this note
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? new mongoose.Types.ObjectId(userId) 
        : null;
      
      const hasLiked = userObjectId && existingNote.likedBy.some(
        id => id.toString() === userObjectId.toString()
      );

      let note;
      let userLiked;

      if (hasLiked) {
        // Unlike: Remove user from likedBy and decrement upvotes
        note = await Note.findByIdAndUpdate(
          noteId, 
          { 
            $pull: { likedBy: userObjectId },
            $inc: { upvotes: -1 }
          }, 
          { new: true }
        ).lean();
        userLiked = false;
        
        // Decrease uploader's reputation
        if (existingNote.userId) {
          await User.findByIdAndUpdate(existingNote.userId, { $inc: { reputation: -10 } });
        }
      } else {
        // Like: Add user to likedBy and increment upvotes
        const updateQuery = { $inc: { upvotes: 1 } };
        if (userObjectId) {
          updateQuery.$addToSet = { likedBy: userObjectId };
        }
        
        note = await Note.findByIdAndUpdate(
          noteId, 
          updateQuery, 
          { new: true }
        ).lean();
        userLiked = true;
        
        // Increase uploader's reputation
        if (existingNote.userId) {
          await User.findByIdAndUpdate(existingNote.userId, { $inc: { reputation: 10 } });
        }
      }

      res.json({ 
        message: userLiked ? 'Liked!' : 'Unliked!', 
        note,
        userLiked
      });
    } else {
      // In-memory version (simple toggle)
      const noteIdNum = parseInt(noteId);
      if (isNaN(noteIdNum)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }
      
      const note = notes.find(n => n.id === noteIdNum);
      if (!note) {
        return res.status(404).json({ message: 'Note not found with the provided ID' });
      }

      // Initialize likedBy if it doesn't exist
      if (!note.likedBy) note.likedBy = [];
      
      const userIndex = note.likedBy.indexOf(userId);
      let userLiked;
      
      if (userIndex > -1) {
        // Unlike
        note.likedBy.splice(userIndex, 1);
        note.upvotes = Math.max(0, note.upvotes - 1);
        userLiked = false;
      } else {
        // Like
        note.likedBy.push(userId);
        note.upvotes += 1;
        userLiked = true;
      }

      res.json({ message: userLiked ? 'Liked!' : 'Unliked!', note, userLiked });
    }
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ message: 'Server error processing vote', error: error.message });
  }
});

// Save/Bookmark a note
app.post('/api/notes/:id/save', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (token.includes('expired')) {
      return res.status(401).json({ 
        message: 'Token has expired. Please login again.',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Not authenticated',
        error: 'INVALID_TOKEN'
      });
    }

    const userId = token.replace('dev_token_', '');
    const noteId = req.params.id;

    // Validate note ID is provided
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ 
        message: 'Note ID is required',
        error: 'NOTE_ID_REQUIRED'
      });
    }

    // Check for special characters that shouldn't be in an ID
    const trimmedNoteId = noteId.trim();
    
    // Check for extremely long IDs (potential attack)
    if (trimmedNoteId.length > 100) {
      return res.status(400).json({ 
        message: 'Invalid note ID format - too long',
        error: 'INVALID_NOTE_ID'
      });
    }

    if (useMongoDB) {
      // Validate ObjectId format for MongoDB
      if (!mongoose.Types.ObjectId.isValid(trimmedNoteId)) {
        return res.status(400).json({ 
          message: 'Invalid note ID format',
          error: 'INVALID_NOTE_ID'
        });
      }

      // Check if note exists
      const noteExists = await Note.findById(trimmedNoteId);
      if (!noteExists) {
        return res.status(404).json({ 
          message: 'Note not found',
          error: 'NOTE_NOT_FOUND'
        });
      }

      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(401).json({ 
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      // Check if already saved (duplicate handling)
      const existingSave = await SavedNote.findOne({ userId, noteId: trimmedNoteId });
      if (existingSave) {
        return res.status(409).json({ 
          message: 'Note already saved',
          error: 'ALREADY_SAVED',
          saved: true,
          savedAt: existingSave.savedAt
        });
      }

      // Save the note
      const savedNote = new SavedNote({ userId, noteId: trimmedNoteId });
      await savedNote.save();

      res.status(201).json({ 
        message: 'Note saved successfully', 
        saved: true,
        savedNote: {
          id: savedNote._id,
          noteId: trimmedNoteId,
          userId: userId,
          savedAt: savedNote.savedAt
        }
      });
    } else {
      // In-memory mode for testing
      const user = users.find(u => u.id === userId);
      if (!user) {
        return res.status(401).json({ 
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      // Check if note exists in memory
      const noteExists = notes.find(n => String(n.id) === trimmedNoteId);
      if (!noteExists) {
        return res.status(404).json({ 
          message: 'Note not found',
          error: 'NOTE_NOT_FOUND'
        });
      }

      // Track saved notes in memory
      if (!global.savedNotesInMemory) {
        global.savedNotesInMemory = [];
      }

      // Check for duplicate
      const existingSave = global.savedNotesInMemory.find(
        sn => sn.userId === userId && sn.noteId === trimmedNoteId
      );
      if (existingSave) {
        return res.status(409).json({ 
          message: 'Note already saved',
          error: 'ALREADY_SAVED',
          saved: true,
          savedAt: existingSave.savedAt
        });
      }

      // Save the note
      const savedNote = {
        id: `saved_${Date.now()}`,
        userId,
        noteId: trimmedNoteId,
        savedAt: new Date()
      };
      global.savedNotesInMemory.push(savedNote);

      res.status(201).json({ 
        message: 'Note saved successfully', 
        saved: true,
        savedNote: {
          id: savedNote.id,
          noteId: trimmedNoteId,
          userId: userId,
          savedAt: savedNote.savedAt
        }
      });
    }
  } catch (error) {
    console.error('Save note error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Unsave/Remove bookmark from a note
app.delete('/api/notes/:id/save', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Not authenticated',
        error: 'INVALID_TOKEN'
      });
    }

    const userId = token.replace('dev_token_', '');
    const noteId = req.params.id;

    // Validate note ID
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ 
        message: 'Note ID is required',
        error: 'NOTE_ID_REQUIRED'
      });
    }

    const trimmedNoteId = noteId.trim();

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(trimmedNoteId)) {
        return res.status(400).json({ 
          message: 'Invalid note ID format',
          error: 'INVALID_NOTE_ID'
        });
      }

      const result = await SavedNote.deleteOne({ userId, noteId: trimmedNoteId });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ 
          message: 'Saved note not found',
          error: 'NOT_SAVED',
          saved: false
        });
      }

      res.json({ message: 'Note unsaved successfully', saved: false });
    } else {
      // In-memory mode
      if (!global.savedNotesInMemory) {
        global.savedNotesInMemory = [];
      }
      
      const index = global.savedNotesInMemory.findIndex(
        sn => sn.userId === userId && sn.noteId === trimmedNoteId
      );
      
      if (index === -1) {
        return res.status(404).json({ 
          message: 'Saved note not found',
          error: 'NOT_SAVED',
          saved: false
        });
      }
      
      global.savedNotesInMemory.splice(index, 1);
      res.json({ message: 'Note unsaved successfully', saved: false });
    }
  } catch (error) {
    console.error('Unsave note error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get saved notes for current user
app.get('/api/notes/saved/list', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        error: 'NO_AUTH_HEADER'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid authorization header format',
        error: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ 
        message: 'Not authenticated',
        error: 'INVALID_TOKEN'
      });
    }

    const userId = token.replace('dev_token_', '');

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ 
          message: 'Invalid user ID format',
          error: 'INVALID_USER_ID'
        });
      }

      const savedNotes = await SavedNote.find({ userId })
        .populate('noteId')
        .sort({ savedAt: -1 })
        .lean();

      const notesList = savedNotes
        .map(sn => ({
          ...sn.noteId,
          savedAt: sn.savedAt
        }))
        .filter(n => n._id !== undefined);

      res.json({ 
        notes: notesList,
        count: notesList.length
      });
    } else {
      // In-memory mode
      const savedList = (global.savedNotesInMemory || [])
        .filter(sn => sn.userId === userId)
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))  // Sort by savedAt descending
        .map(sn => {
          const note = notes.find(n => String(n.id) === sn.noteId);
          return note ? { ...note, savedAt: sn.savedAt } : null;
        })
        .filter(n => n !== null);

      res.json({ 
        notes: savedList,
        count: savedList.length
      });
    }
  } catch (error) {
    console.error('Get saved notes error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Check if note is saved
app.get('/api/notes/:id/saved', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !token.startsWith('dev_token_')) {
      return res.json({ saved: false });
    }

    const userId = token.replace('dev_token_', '');
    const noteId = req.params.id;

    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId) || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.json({ saved: false });
      }

      const savedNote = await SavedNote.findOne({ userId, noteId });
      res.json({ saved: !!savedNote });
    } else {
      // In-memory mode - check savedNotesInMemory array
      if (!global.savedNotesInMemory) {
        return res.json({ saved: false });
      }
      
      const savedNote = global.savedNotesInMemory.find(
        sn => sn.userId === userId && sn.noteId === noteId
      );
      res.json({ saved: !!savedNote, savedAt: savedNote?.savedAt });
    }
  } catch (error) {
    console.error('Check saved error:', error);
    res.json({ saved: false });
  }
});

// ==================== COMMENTS API ====================

// Get comments for a note
app.get('/api/notes/:id/comments', async (req, res) => {
  try {
    const noteId = req.params.id;

    if (useMongoDB) {
      if (!Comment) {
        return res.status(503).json({ message: 'Comment service not initialized' });
      }
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID' });
      }

      const commentsList = await Comment.find({ noteId })
        .sort({ createdAt: -1 })
        .lean();

      return res.json({ comments: commentsList });
    } else {
      // In-memory fallback
      if (!global.commentsInMemory) {
        global.commentsInMemory = [];
      }
      const noteComments = global.commentsInMemory
        .filter(c => String(c.noteId) === String(noteId) && !c.deletedAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({ comments: noteComments });
    }
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});

// Add a comment to a note
app.post('/api/notes/:id/comments', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const userId = token.replace('dev_token_', '');
    const noteId = req.params.id;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    if (text.length > 1000) {
      return res.status(400).json({ message: 'Comment too long (max 1000 characters)' });
    }

    if (useMongoDB) {
      if (!Comment) {
        return res.status(503).json({ message: 'Comment service not initialized' });
      }
      if (!mongoose.Types.ObjectId.isValid(noteId) || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid ID format' });
      }

      // Get user info
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Create and save comment
      const comment = new Comment({
        noteId,
        userId,
        userName: user.name,
        text: text.trim()
      });

      await comment.save();

      return res.status(201).json({ 
        message: 'Comment added',
        comment: {
          _id: comment._id,
          noteId: comment.noteId,
          userId: comment.userId,
          userName: comment.userName,
          text: comment.text,
          createdAt: comment.createdAt
        }
      });
    } else {
      // In-memory fallback
      const user = users.find(u => String(u.id) === userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const commentId = 'comment_' + Date.now();
      const newComment = {
        _id: commentId,
        noteId: noteId,
        userId: userId,
        userName: user.name,
        text: text.trim(),
        createdAt: new Date().toISOString()
      };

      if (!global.commentsInMemory) {
        global.commentsInMemory = [];
      }
      global.commentsInMemory.push(newComment);

      return res.status(201).json({
        message: 'Comment added',
        comment: newComment
      });
    }
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Failed to add comment', error: error.message });
  }
});

// Delete a comment (only comment owner or admin)
app.delete('/api/comments/:commentId', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !token.startsWith('dev_token_')) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const userId = token.replace('dev_token_', '');
    const commentId = req.params.commentId;

    if (useMongoDB) {
      if (!mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid ID format' });
      }

      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      // Check if user owns the comment or is admin
      const user = await User.findById(userId);
      if (comment.userId.toString() !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: 'Not authorized to delete this comment' });
      }

      await Comment.findByIdAndUpdate(commentId, { deletedAt: new Date() });

      return res.json({ message: 'Comment deleted' });
    } else {
      // In-memory fallback
      if (!global.commentsInMemory) {
        global.commentsInMemory = [];
      }
      
      const commentIndex = global.commentsInMemory.findIndex(c => String(c._id) === String(commentId) && !c.deletedAt);
      if (commentIndex === -1) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      const comment = global.commentsInMemory[commentIndex];
      const user = users.find(u => String(u.id) === userId);

      // Allow deletion if owner or admin
      if (String(comment.userId) !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: 'Not authorized to delete this comment' });
      }

      global.commentsInMemory[commentIndex].deletedAt = new Date();
      return res.json({ message: 'Comment deleted' });
    }
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: 'Failed to delete comment' });
  }
});

// Leaderboard endpoint - calculates stats from actual notes in real-time
app.get('/api/leaderboard', async (req, res) => {
  try {
    // No caching - leaderboard should update in real-time for accurate rankings
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    if (useMongoDB) {
      // MongoDB version - aggregate actual data from notes collection
      // This calculates rankings based on:
      // 1. Total Downloads (primary sort - descending)
      // 2. Average Downloads per Note (secondary sort - descending)
      // 3. First Upload Date (tertiary sort - earlier uploads win ties)
      const noteStats = await Note.aggregate([
        {
          $group: {
            _id: '$userId',
            userName: { $first: '$userName' },
            notesUploaded: { $sum: 1 },
            totalDownloads: { $sum: { $ifNull: ['$downloads', 0] } },
            // Get the earliest upload date for tie-breaking
            firstUploadDate: { $min: '$createdAt' }
          }
        },
        {
          $match: {
            notesUploaded: { $gt: 0 } // Only users with actual uploads
          }
        }
      ]);

      // Get user details for names (in case userName on notes is outdated)
      const userIds = noteStats.map(stat => stat._id).filter(id => id);
      const users = await User.find({ _id: { $in: userIds } }).select('name').lean();
      const userMap = {};
      users.forEach(user => {
        userMap[user._id.toString()] = user;
      });

      // Calculate average and sort according to ranking rules
      const rankedUsers = noteStats
        .map(stat => {
          const user = userMap[stat._id?.toString()] || {};
          const totalDownloads = stat.totalDownloads || 0;
          const notesUploaded = stat.notesUploaded || 0;
          return {
            name: user.name || stat.userName || 'Unknown User',
            totalDownloads: totalDownloads,
            notesUploaded: notesUploaded,
            avgDownloads: notesUploaded > 0 ? Math.round((totalDownloads / notesUploaded) * 100) / 100 : 0,
            // Use firstUploadDate for tie-breaking (earlier uploads rank higher)
            joinDate: stat.firstUploadDate || new Date()
          };
        })
        .sort((a, b) => {
          // 1. Sort by total downloads (descending) - most downloads wins
          if (b.totalDownloads !== a.totalDownloads) {
            return b.totalDownloads - a.totalDownloads;
          }
          // 2. If equal, sort by average downloads (descending) - quality matters
          if (b.avgDownloads !== a.avgDownloads) {
            return b.avgDownloads - a.avgDownloads;
          }
          // 3. If still equal, sort by first upload date (ascending) - earlier uploads win
          return new Date(a.joinDate) - new Date(b.joinDate);
        });

      console.log(`📊 Leaderboard calculated: ${rankedUsers.length} users ranked`);
      res.json({ leaderboard: rankedUsers });
    } else {
      // In-memory version - calculate from notes array
      const userStatsMap = {};
      
      // Aggregate stats from notes
      notes.forEach(note => {
        if (!note.userId) return;
        const key = String(note.userId);
        if (!userStatsMap[key]) {
          userStatsMap[key] = {
            name: note.userName || 'Unknown User',
            totalDownloads: 0,
            notesUploaded: 0,
            firstUploadDate: note.createdAt || new Date()
          };
        }
        userStatsMap[key].notesUploaded++;
        userStatsMap[key].totalDownloads += (note.downloads || 0);
        // Track earliest upload
        if (note.createdAt && new Date(note.createdAt) < new Date(userStatsMap[key].firstUploadDate)) {
          userStatsMap[key].firstUploadDate = note.createdAt;
        }
      });

      const leaderboard = Object.values(userStatsMap)
        .filter(user => user.notesUploaded > 0)
        .map(user => ({
          name: user.name,
          totalDownloads: user.totalDownloads,
          notesUploaded: user.notesUploaded,
          avgDownloads: user.notesUploaded > 0 ? Math.round((user.totalDownloads / user.notesUploaded) * 100) / 100 : 0,
          joinDate: user.firstUploadDate
        }))
        .sort((a, b) => {
          // 1. Sort by total downloads (descending)
          if (b.totalDownloads !== a.totalDownloads) {
            return b.totalDownloads - a.totalDownloads;
          }
          // 2. If equal, sort by average downloads (descending)
          if (b.avgDownloads !== a.avgDownloads) {
            return b.avgDownloads - a.avgDownloads;
          }
          // 3. If still equal, sort by first upload date (ascending)
          return new Date(a.joinDate) - new Date(b.joinDate);
        });

      res.json({ leaderboard });
    }
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/notes/:id/download', async (req, res) => {
  try {
    const noteId = req.params.id;
    
    if (useMongoDB) {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ message: 'Invalid note ID format' });
      }

      const existingNote = await Note.findById(noteId).lean();
      
      if (!existingNote) {
        return res.status(404).json({ message: 'Note not found' });
      }

      // If note has fileId (GridFS), provide download endpoint, otherwise use fileUrl
      if (existingNote.fileId) {
        res.json({ downloadUrl: `/api/notes/download-pdf/${existingNote.fileId}`, useGridFS: true });
      } else {
        res.json({ downloadUrl: existingNote.cloudinaryUrl || existingNote.fileUrl || '/sample.pdf', useGridFS: false });
      }
    } else {
      // In-memory version
      const note = notes.find(n => n.id === parseInt(noteId));
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      res.json({ downloadUrl: note.fileUrl || '/sample.pdf', useGridFS: false });
    }
  } catch (error) {
    console.error('Download link error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.log('✅ Server continues running...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  console.log('✅ Server continues running...');
});

const INITIAL_CURRICULUM = {
  'Computer Science & Engineering': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Engineering Physics',
      'Introduction to Programming',
      'Engineering Graphics',
      'Communicative English Lab',
      'Engineering Physics Lab',
      'Computer Programming Lab',
      'IT Workshop',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Chemistry',
      'Basic Electrical & Electronics Engineering',
      'Data Structures',
      'Basic Civil & Mechanical Engineering',
      'Chemistry Lab',
      'Electrical & Electronics Engineering Workshop',
      'Engineering Workshop',
      'Data Structures Lab',
      'Health and Wellness, Yoga and Sports'
    ],
    '3': [
      'Discrete Mathematics & Graph Theory',
      'Universal Human Values – Understanding Harmony and Ethical Human Conduct',
      'Digital Logic & Computer Organization',
      'Advanced Data Structures & Algorithm Analysis',
      'Object Oriented Programming Through Java',
      'Advanced Data Structures & Algorithm Analysis Lab',
      'Object Oriented Programming Through Java Lab',
      'Python Programming',
      'Environmental Science'
    ],
    '4': [
      'Managerial Economics and Financial Analysis',
      'Probability & Statistics',
      'Operating Systems',
      'Database Management Systems',
      'Software Engineering',
      'Operating Systems Lab',
      'Database Management Systems Lab',
      'Full Stack Development – I',
      'Design Thinking and Innovation'
    ],
    '5': [
      'Data Warehousing and Data Mining',
      'Computer Networks',
      'Formal Languages and Automata Theory',
      'Professional Elective – I',
      'Open Elective – I',
      'Data Mining Lab',
      'Computer Networks Lab',
      'Full Stack Development – II',
      'User Interface Design using Flutter'
    ],
    '6': [
      'Compiler Design',
      'Cloud Computing',
      'Cryptography & Network Security',
      'Professional Elective – II',
      'Professional Elective – III',
      'Cryptography & Network Security Lab',
      'Soft Skills / Swayam / NPTEL',
      'Technical Paper Writing / IPR'
    ],
    '7': [],
    '8': []
  },
  'Artificial Intelligence & Machine Learning': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Chemistry',
      'Introduction to Programming',
      'Basic Civil & Mechanical Engineering',
      'Communicative English Lab',
      'Chemistry Lab',
      'Computer Programming Lab',
      'Engineering Workshop',
      'Health and Wellness, Yoga and Sports'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Engineering Physics',
      'Basic Electrical & Electronics Engineering',
      'Data Structures',
      'Engineering Graphics',
      'Engineering Physics Lab',
      'Electrical & Electronics Engineering Workshop',
      'IT Workshop',
      'Data Structures Lab',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '3': [
      'Discrete Mathematics & Graph Theory',
      'Universal Human Values – 2 (Understanding Harmony)',
      'Artificial Intelligence',
      'Advanced Data Structures & Algorithms Analysis',
      'Object Oriented Programming Through Java',
      'Advanced Data Structures & Algorithms Analysis Lab',
      'Object Oriented Programming Through Java Lab',
      'Python Programming Lab',
      'Environmental Science'
    ],
    '4': [
      'Optimization Techniques',
      'Probability & Statistics',
      'Machine Learning',
      'Database Management Systems',
      'Digital Logic & Computer Organization',
      'Machine Learning Lab',
      'Database Management Systems Lab',
      'Full Stack Development – I',
      'Design Thinking & Innovation'
    ],
    '5': [
      'Deep Learning',
      'Computer Networks',
      'Operating Systems',
      'Professional Elective – I',
      'Open Elective – I',
      'Deep Learning Lab',
      'Operating Systems & Computer Networks Lab',
      'Full Stack Development – II',
      'Semester Focused Design (Flutter / Development with Flutter)'
    ],
    '6': [
      'Reinforcement Learning',
      'Software Engineering',
      'Data Visualization',
      'Professional Elective – II',
      'Professional Elective – III',
      'Open Elective – II',
      'Software Engineering Lab',
      'Data Visualization Lab',
      'Soft Skills / SWAYAM Plus – 21st Century Employability Skills',
      'Technical Paper Writing & IPR'
    ],
    '7': [],
    '8': []
  },
  'Artificial Intelligence & Data Science': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Chemistry',
      'Introduction to Programming',
      'Basic Civil & Mechanical Engineering',
      'Communicative English Lab',
      'Chemistry Lab',
      'Computer Programming Lab',
      'Engineering Workshop',
      'Health and Wellness, Yoga and Sports'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Engineering Physics',
      'Basic Electrical & Electronics Engineering',
      'Data Structures',
      'Engineering Graphics',
      'Engineering Physics Lab',
      'Electrical & Electronics Engineering Workshop',
      'IT Workshop',
      'Data Structures Lab',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '3': [
      'Discrete Mathematics & Graph Theory',
      'Universal Human Values – 2: Understanding Harmony',
      'Database Management Systems',
      'Advanced Data Structures & Algorithms',
      'Object Oriented Programming Through Java',
      'Advanced Data Structures & Algorithms Lab',
      'Object Oriented Programming Through Java Lab',
      'Python Programming Lab',
      'Environmental Science'
    ],
    '4': [
      'Managerial Economics and Financial Analysis',
      'Statistical Methods for Data Science',
      'Artificial Intelligence',
      'Introduction to Data Science',
      'Digital Logic & Computer Organization',
      'Artificial Intelligence Lab',
      'Data Science using Python Lab',
      'Full Stack Development – I',
      'Design Thinking & Innovation'
    ],
    '5': [
      'Data Warehousing and Data Mining',
      'Principles of Machine Learning',
      'Software Engineering',
      'Professional Elective – I',
      'Open Elective – I',
      'Data Warehousing and Data Mining Lab',
      'Software Engineering Lab',
      'Full Stack Development – II',
      'Swayam Plus – Data Engineering / AI',
      'User Interfaces using Flutter / DevOps with Android Application Development'
    ],
    '6': [
      'Operating Systems',
      'Deep Learning',
      'Professional Elective – II',
      'Professional Elective – III',
      'Open Elective – II',
      'Deep Learning Lab',
      'Operating Systems & Computer Networks Lab',
      'Soft Skills / Swayam Plus – 21st Century Employability Skills',
      'Technical Paper Writing & IPR'
    ],
    '7': [],
    '8': []
  },
  'Information Technology': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Chemistry',
      'Introduction to Programming',
      'Basic Civil & Mechanical Engineering',
      'Communicative English Lab',
      'Chemistry Lab',
      'Computer Programming Lab',
      'Engineering Workshop',
      'Health and Wellness, Yoga and Sports'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Engineering Physics',
      'Basic Electrical & Electronics Engineering',
      'Data Structures',
      'Engineering Graphics',
      'Engineering Physics Lab',
      'Electrical & Electronics Engineering Workshop',
      'IT Workshop',
      'Data Structures Lab',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '3': [
      'Discrete Mathematics & Graph Theory',
      'Universal Human Values – 2',
      'Digital Logic & Computer Organization',
      'Advanced Data Structures & Algorithm Analysis',
      'Object Oriented Programming Through Java',
      'Advanced Data Structures and Algorithm Analysis Lab',
      'Object Oriented Programming Through Java Lab',
      'Python Programming',
      'Environmental Science'
    ],
    '4': [
      'Optimization Techniques',
      'Probability & Statistics',
      'Operating Systems',
      'Database Management Systems',
      'Software Engineering',
      'Operating Systems Lab',
      'Database Management Systems Lab',
      'Python with Django',
      'Design Thinking & Innovation'
    ],
    '5': [
      'Advanced Java',
      'Data Communication and Computer Networks',
      'Automata Theory & Compiler Design',
      'Professional Elective – I',
      'Advanced Java Lab',
      'Computer Networks Lab',
      'User Interface Designing using Flutter',
      'Community Service Internship'
    ],
    '6': [
      'Cloud Computing',
      'Cryptography & Network Security',
      'Data Warehousing & Data Mining',
      'Professional Elective – II',
      'Professional Elective – III',
      'Open Elective – II',
      'Data Mining Lab',
      'Soft Skills / SWAYAM Plus – 21st Century Employability Skills'
    ],
    '7': [],
    '8': []
  },
  'Electronics & Communication Engineering': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Engineering Physics',
      'Basic Electrical and Electronics Engineering',
      'Engineering Graphics',
      'Communicative English Lab',
      'Engineering Physics Lab',
      'Electrical & Electronics Engineering Workshop',
      'IT Workshop',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Chemistry',
      'Introduction to Programming',
      'Basic Civil & Mechanical Engineering',
      'Network Analysis',
      'Chemistry Lab',
      'Computer Programming Lab',
      'Engineering Workshop',
      'Network Analysis & Simulation Lab',
      'Health and Wellness, Yoga and Sports'
    ],
    '3': [
      'Probability Theory & Stochastic Processes',
      'Managerial Economics & Financial Analysis',
      'Signals and Systems',
      'Electronic Devices and Circuits',
      'Switching Theory and Logic Design',
      'Electronic Devices and Circuits Lab',
      'Signals and Systems Lab',
      'Switching Theory and Logic Design Lab',
      'Data Structures using Python',
      'Environmental Science'
    ],
    '4': [
      'Universal Human Values – Understanding Harmony and Ethical Human Conduct',
      'Linear Control Systems',
      'Electromagnetic Waves and Transmission Lines',
      'Electronic Circuit Analysis',
      'Analog Communications',
      'Analog Communications Lab',
      'Electronic Circuit Analysis Lab',
      'Soft Skills',
      'Design Thinking & Innovation Mini Project'
    ],
    '5': [
      'Analog & Digital IC Applications',
      'Microprocessors & Microcontrollers',
      'Digital Communications',
      'Professional Elective – I',
      'Open Elective – I',
      'Analog & Digital IC Applications Lab',
      'Digital Communication Lab',
      'Microprocessors & Microcontrollers Lab',
      'Machine Learning Lab'
    ],
    '6': [
      'VLSI Design',
      'Antennas and Wave Propagation',
      'Digital Signal Processing',
      'Professional Elective – II',
      'Professional Elective – III',
      'Open Elective – II',
      'VLSI Design Lab',
      'Microwave and Optical Communication Lab',
      'Instrumentation & Communications Lab',
      'Research Methodology & IPR'
    ],
    '7': [],
    '8': []
  },
  'Electrical & Electronics Engineering': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Engineering Physics',
      'Basic Electrical and Electronics Engineering',
      'Engineering Graphics',
      'Communicative English Lab',
      'Engineering Physics Lab',
      'Electrical and Electronics Engineering Workshop',
      'IT Workshop',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Chemistry',
      'Introduction to Programming',
      'Electrical Circuit Analysis – I',
      'Basic Civil & Mechanical Engineering',
      'Chemistry Lab',
      'Computer Programming Lab',
      'Engineering Workshop',
      'Electrical Circuits Lab',
      'Health and Wellness, Yoga and Sports'
    ],
    '3': [
      'Numerical Methods & Complex Variables',
      'Managerial Economics & Financial Analysis',
      'Electromagnetic Field Theory',
      'Electrical Circuit Analysis – II',
      'DC Machines & Transformers',
      'Electrical Circuit Analysis – II and Simulation Lab',
      'DC Machines & Transformers Lab',
      'Data Structures Lab',
      'Environmental Science'
    ],
    '4': [
      'Universal Human Values – Understanding Harmony and Ethical Human Conduct',
      'Analog Circuits',
      'Power Systems – I',
      'Induction and Synchronous Machines',
      'Control Systems',
      'Induction and Synchronous Machines Lab',
      'Control Systems Lab',
      'Python Programming Lab',
      'Design Thinking & Innovation'
    ],
    '5': [
      'Power Electronics',
      'Digital Circuits',
      'Power Systems – II',
      'Professional Elective – I',
      'Open Elective – I',
      'Power Electronics Lab',
      'Analog and Digital Circuits Lab',
      'Soft Skills',
      'Tinkering Lab'
    ],
    '6': [
      'Electrical Measurements and Instrumentation',
      'Microprocessors & Microcontrollers',
      'Power System Analysis',
      'Professional Elective – II',
      'Professional Elective – III',
      'Open Elective – II',
      'Electrical Measurements and Instrumentation Lab',
      'Microprocessors & Microcontrollers Lab',
      'IoT Applications of Electrical Engineering Lab'
    ],
    '7': [],
    '8': []
  },
  'Civil Engineering': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Engineering Physics',
      'Basic Electrical and Electronics Engineering',
      'Engineering Graphics',
      'Communicative English Lab',
      'Engineering Physics Lab',
      'Electrical and Electronics Engineering Workshop',
      'IT Workshop',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Engineering Chemistry',
      'Introduction to Programming',
      'Basic Civil & Mechanical Engineering',
      'Engineering Mechanics',
      'Engineering Chemistry Lab',
      'Computer Programming Lab',
      'Engineering Workshop',
      'Engineering Mechanics & Building Practices Lab',
      'Health and Wellness, Yoga & Sports'
    ],
    '3': [
      'Numerical Techniques and Statistical Methods',
      'Managerial Economics & Financial Analysis',
      'Surveying',
      'Strength of Materials',
      'Fluid Mechanics',
      'Surveying Lab',
      'Strength of Materials Lab',
      'Building Planning & Drawing',
      'Environmental Science'
    ],
    '4': [
      'Universal Human Values – Understanding Harmony',
      'Engineering Geology',
      'Concrete Technology',
      'Structural Analysis',
      'Hydraulics & Hydraulic Machinery',
      'Concrete Technology Lab',
      'Engineering Geology Lab',
      'Remote Sensing & Geographical Information Systems',
      'Design Thinking & Innovation',
      'Building Materials & Construction'
    ],
    '5': [
      'Concrete and Drawing of Reinforced Concrete Structures',
      'Water Resources Engineering',
      'Geotechnical Engineering',
      'Professional Elective – I',
      'Open Elective – I',
      'Geotechnical Engineering Lab',
      'Fluid Mechanics & Hydraulic Machines Lab',
      'Estimation, Specifications & Contracts',
      'Timbering Lab'
    ],
    '6': [
      'Design and Drawing of Steel Structures',
      'Highway Engineering',
      'Environmental Engineering',
      'Professional Elective – II',
      'Professional Elective – III',
      'Open Elective – II',
      'Environment Engineering Lab',
      'Transportation Engineering Lab',
      'CAD Lab'
    ],
    '7': [],
    '8': []
  },
  'Mechanical Engineering': {
    '1': [
      'Communicative English',
      'Linear Algebra & Calculus',
      'Engineering Physics',
      'Basic Electrical and Electronics Engineering',
      'Engineering Graphics',
      'Communicative English Lab',
      'Engineering Physics Lab',
      'Electrical and Electronics Engineering Workshop',
      'IT Workshop',
      'NSS / NCC / Scouts & Guides / Community Service'
    ],
    '2': [
      'Differential Equations & Vector Calculus',
      'Engineering Chemistry',
      'Introduction to Programming',
      'Basic Civil & Mechanical Engineering',
      'Engineering Mechanics',
      'Engineering Chemistry Lab',
      'Computer Programming Lab',
      'Engineering Workshop',
      'Engineering Mechanics Lab',
      'Health and Wellness, Yoga & Sports'
    ],
    '3': [
      'Numerical Methods & Transform Techniques',
      'Engineering Thermodynamics',
      'Mechanics of Solids',
      'Material Science and Metallurgy',
      'Manufacturing Processes',
      'Fluid Mechanics & Hydraulic Machines',
      'Manufacturing Processes Lab',
      'Mechanics of Solids & Materials Science Lab',
      'Computer-Aided Machine Drawing',
      'Environmental Science'
    ],
    '4': [
      'Complex Variables, Probability & Statistics',
      'Universal Human Values – Understanding Harmony',
      'Industrial Management',
      'Theory of Machines',
      'Applied Thermodynamics – I',
      'Fluid Mechanics & Hydraulic Machines Lab',
      'Structural and Modal Analysis using ANSYS',
      'Soft Skills',
      'Design Thinking & Innovation'
    ],
    '5': [
      'Machine Tools and Metrology',
      'Applied Thermodynamics – II',
      'Design of Machine Elements',
      'Professional Elective – I',
      'Open Elective – I',
      'Thermal Engineering Lab',
      'Machine Tools & Metrology Lab',
      'Theory of Machines Lab',
      'Timbering Lab',
      'Community Service Internship'
    ],
    '6': [
      'Heat Transfer',
      'Applications of AI in Mechanical Engineering',
      'Finite Element Methods',
      'Professional Elective – II',
      'Professional Elective – III',
      'Open Elective – II',
      'Heat Transfer Lab',
      'Robotics and Drone Technologies Lab',
      'Mini Project with IoT and AI Tools',
      'Technical Paper Writing & IPR'
    ],
    '7': [],
    '8': []
  }
};

async function seedCurriculumData() {
  try {
    if (useMongoDB) {
      const count = await Curriculum.countDocuments();
      if (count === 0) {
        console.log('🌱 Seeding curriculum data to MongoDB...');
        const docs = [];
        for (const branch in INITIAL_CURRICULUM) {
          for (const semester in INITIAL_CURRICULUM[branch]) {
            docs.push({
              branch,
              semester,
              subjects: INITIAL_CURRICULUM[branch][semester]
            });
          }
        }
        await Curriculum.insertMany(docs);
        console.log('✅ Seeding complete!');
      } else {
        console.log('📚 Curriculum database already seeded.');
      }
    } else {
      console.log('🌱 Seeding in-memory curriculum data...');
      inMemoryCurriculum = JSON.parse(JSON.stringify(INITIAL_CURRICULUM));
      console.log('✅ In-memory seeding complete!');
    }
  } catch (err) {
    console.error('❌ Error seeding curriculum:', err.message);
  }
}

// Start server
async function startServer() {
  try {
    console.log('[DEBUG] Starting server function...');
    // Try MongoDB connection first
    useMongoDB = await connectMongoDB();
    console.log('[DEBUG] MongoDB connection result:', useMongoDB);
    
    // Seed initial curriculum data
    await seedCurriculumData();
    
    if (useMongoDB) {
      // Seed Super Admin in MongoDB
      try {
        const superAdminExists = await User.findOne({ email: 'superadmin@notemitra.com' });
        if (!superAdminExists) {
          await User.create({
            name: 'Super Admin',
            email: 'superadmin@notemitra.com',
            password: 'SuperAdmin@NoteMitra2026',
            role: 'superadmin',
            isAdmin: true,
            isSuspended: false,
            createdAt: new Date()
          });
          console.log('✅ Super Admin account seeded in MongoDB');
        }
      } catch (err) {
        console.error('❌ Failed to seed Super Admin in MongoDB:', err.message);
      }
    } else {
      // Add a default test user if in-memory
      users.push({
        id: 'testuser123',
        _id: 'testuser123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'student',
        branch: 'Computer Science',
        section: 'A',
        notesUploaded: 0,
        totalDownloads: 0,
        totalViews: 0,
        profilePic: '',
        isVerified: true,
        verifiedDevices: ['device_bypass_token'],
        createdAt: new Date()
      });
      // Add Super Admin in-memory
      users.push({
        id: 'superadmin123',
        _id: 'superadmin123',
        name: 'Super Admin',
        email: 'superadmin@notemitra.com',
        password: 'SuperAdmin@NoteMitra2026',
        role: 'superadmin',
        isAdmin: true,
        isSuspended: false,
        notesUploaded: 0,
        totalDownloads: 0,
        totalViews: 0,
        profilePic: '',
        isVerified: true,
        verifiedDevices: ['device_bypass_token'],
        createdAt: new Date()
      });
      console.log('✅ In-memory fallback pre-populated with test user and Super Admin');
    }
    
    // Configure Google OAuth
    googleAuthEnabled = configureGoogleAuth();
    console.log('[DEBUG] Google Auth configured:', googleAuthEnabled);

    console.log('[DEBUG] Starting Express server on port', PORT);
    
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log('✅ NOTEMITRA BACKEND SERVER RUNNING');
      console.log('='.repeat(60));
      console.log(`📡 Port: ${PORT}`);
      console.log(`🌐 API: http://localhost:${PORT}/api`);
      console.log(`💚 Health: http://localhost:${PORT}/api/health`);
      console.log(`💾 Database: ${useMongoDB ? 'MongoDB (Persistent)' : 'In-Memory (Temporary)'}`);
      console.log(`� Google OAuth: ${googleAuthEnabled ? 'Enabled ✅' : 'Disabled (Not Configured)'}`);
      console.log(`�📝 Users: ${useMongoDB ? 'Stored in MongoDB' : users.length + ' in memory'}`);
      console.log(`📚 Notes: ${useMongoDB ? 'Stored in MongoDB' : notes.length + ' in memory'}`);
      console.log('='.repeat(60));
      console.log('');
      if (!useMongoDB) {
        console.log('💡 TIP: Setup MongoDB Atlas for data persistence');
        console.log('   See SETUP_GUIDE.md for step-by-step instructions');
        console.log('');
      }
      if (!googleAuthEnabled) {
        console.log('💡 TIP: Setup Google OAuth for social login');
        console.log('   See SETUP_GUIDE.md for Google Cloud setup');
        console.log('');
      }
      
      // Start keep-alive to prevent Render cold starts
      startKeepAlive();
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${PORT} is busy, retrying in 2 seconds...`);
        setTimeout(startServer, 2000);
      } else {
        console.error('❌ Server error:', err);
        console.log('🔄 Retrying in 5 seconds...');
        setTimeout(startServer, 5000);
      }
    });

    // Keep alive with status updates
    setInterval(() => {
      const userCount = useMongoDB ? 'MongoDB' : users.length;
      const noteCount = useMongoDB ? 'MongoDB' : notes.length;
      console.log(`[${new Date().toLocaleTimeString()}] ✅ Server healthy - Users: ${userCount}, Notes: ${noteCount}`);
    }, 300000); // Every 5 minutes
    
    // Return a promise that never resolves to keep the async function alive
    return new Promise(() => {});
  } catch (err) {
    console.error('[ERROR] Server startup failed:', err);
    console.error('[ERROR] Stack:', err.stack);
    process.exit(1);
  }
}

// Global error handler for multer and other middleware errors
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Ensure Content-Type is set
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: 'File too large. Maximum size is 50MB.',
        error: 'FILE_TOO_LARGE',
        code: err.code
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Unexpected file field',
        error: 'UNEXPECTED_FILE',
        code: err.code
      });
    }
    return res.status(400).json({
      message: 'File upload error',
      error: err.code,
      details: err.message
    });
  }
  
  // Handle file type errors
  if (err.message === 'Only PDF files are allowed') {
    return res.status(400).json({
      message: 'Only PDF files are allowed',
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      message: 'Invalid JSON in request body',
      error: 'INVALID_JSON'
    });
  }
  
  // Default error response
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'SERVER_ERROR' : err.message
  });
});

// 404 Handler - Must be after all routes but before error handler
app.use((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    error: 'NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestion: 'Check the API documentation for valid endpoints'
  });
});

// Start the server only if not being required for testing
if (require.main === module) {
  console.log('🚀 Starting NoteMitra backend server...');
  startServer();
}

// Export for testing
module.exports = { app, mongoose, User, Note };
