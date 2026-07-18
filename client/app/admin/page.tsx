'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { adminAPI, curriculumAPI } from '@/lib/api';
import { 
  Users, 
  FileText, 
  Download, 
  Eye, 
  AlertTriangle, 
  UserX, 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Loader2, 
  GraduationCap, 
  Building2, 
  UserPlus,
  Lock,
  Unlock,
  Settings,
  Mail,
  UserCheck
} from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalNotes: number;
  totalDownloads: number;
  totalViews: number;
  suspendedUsers: number;
  reportedNotes: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Super Admin states
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'faculty' | 'logins' | 'curriculum'>('overview');
  const [selectedBranch, setSelectedBranch] = useState<string>('CSE');
  const [selectedDept, setSelectedDept] = useState<string>('CSE');
  const [submittingUser, setSubmittingUser] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
 
  // Curriculum management states
  const [curriculumMap, setCurriculumMap] = useState<any>({});
  const [currBranch, setCurrBranch] = useState<string>('Computer Science & Engineering');
  const [currSem, setCurrSem] = useState<string>('1');
  const [newSubjectName, setNewSubjectName] = useState<string>('');
  const [editingSubject, setEditingSubject] = useState<{ oldName: string; newName: string } | null>(null);
  const [loadingCurriculum, setLoadingCurriculum] = useState<boolean>(false);

  // Create User Form State
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    branch: '',
    section: '',
    rollNo: '',
    designation: '',
    department: '',
    employeeId: '',
    isAdmin: false
  });

  const isSuperAdmin = user?.role === 'superadmin' || user?.email === 'superadmin@notemitra.com';

  const branches = ['CSE', 'AIML', 'AIDS', 'ECE', 'EEE', 'IT', 'CIVIL', 'MECHANICAL'];
  const departments = ['CSE', 'AIML', 'AIDS', 'ECE', 'EEE', 'IT', 'CIVIL', 'MECHANICAL', 'BS&H'];

  useEffect(() => {
    if (!user) {
      router.push('/admin/login');
      return;
    }

    // Check if user is admin or superadmin
    if (!(user as any).isAdmin && user.role !== 'superadmin') {
      router.push('/browse');
      return;
    }

    loadStats();
  }, [user, router]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getStats();
      setStats(response.data);
      
      const isSuper = user?.role === 'superadmin' || user?.email === 'superadmin@notemitra.com';
      if (isSuper) {
        setLoadingUsers(true);
        const usersResponse = await adminAPI.getUsers();
        setUsersList(usersResponse.data.users || []);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
      setLoadingUsers(false);
    }
  };

  const fetchCurriculum = async () => {
    try {
      setLoadingCurriculum(true);
      const response = await curriculumAPI.getCurriculum();
      setCurriculumMap(response.data || {});
    } catch (error) {
      console.error('Error fetching curriculum:', error);
    } finally {
      setLoadingCurriculum(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'curriculum') {
      fetchCurriculum();
    }
  }, [activeTab]);

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) return;
    try {
      await curriculumAPI.addSubject({
        branch: currBranch,
        semester: currSem,
        subject: newSubjectName.trim()
      });
      setNewSubjectName('');
      alert('Subject added successfully!');
      fetchCurriculum();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to add subject');
    }
  };

  const handleEditSubject = async () => {
    if (!editingSubject || !editingSubject.newName.trim()) return;
    try {
      await curriculumAPI.editSubject({
        branch: currBranch,
        semester: currSem,
        oldSubject: editingSubject.oldName,
        newSubject: editingSubject.newName.trim()
      });
      setEditingSubject(null);
      alert('Subject updated successfully!');
      fetchCurriculum();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update subject');
    }
  };

  const handleDeleteSubject = async (subject: string) => {
    if (!confirm(`Are you sure you want to delete "${subject}"? This will remove it from the list of subjects.`)) {
      return;
    }
    try {
      await curriculumAPI.deleteSubject({
        branch: currBranch,
        semester: currSem,
        subject
      });
      alert('Subject deleted successfully!');
      fetchCurriculum();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete subject');
    }
  };

  const handleToggleRole = async (targetUser: any) => {
    try {
      const isCurrentlyAdmin = targetUser.isAdmin;
      const newIsAdmin = !isCurrentlyAdmin;
      // Enforce: student becomes Normal student, teacher/faculty becomes Faculty admin
      const newRole = newIsAdmin ? 'teacher' : 'student';

      if (!confirm(`Are you sure you want to change ${targetUser.name}'s role to ${newIsAdmin ? 'Admin/Faculty' : 'Normal/Student'}?`)) {
        return;
      }

      const targetId = targetUser._id || targetUser.id;
      await adminAPI.changeUserRole(targetId, {
        role: newRole,
        isAdmin: newIsAdmin
      });
      
      alert('User role updated successfully');
      loadStats();
    } catch (error: any) {
      console.error('Error toggling user role:', error);
      alert(error.response?.data?.message || 'Failed to update user role');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
    setSubmittingUser(true);

    try {
      const lowerEmail = newUser.email.toLowerCase().trim();
      const isStudentEmail = lowerEmail.endsWith('@mictech.edu.in') || lowerEmail.endsWith('@mic.tech.edu');
      const isFacultyEmail = lowerEmail.endsWith('@mictech.ac.in') || lowerEmail.endsWith('@mic.tech.ac.in');
      
      if (newUser.role === 'student' && !isStudentEmail) {
        setCreateError('Student emails must end with @mictech.edu.in or @mic.tech.edu');
        setSubmittingUser(false);
        return;
      }
      if ((newUser.role === 'teacher' || newUser.role === 'faculty') && !isFacultyEmail) {
        setCreateError('Faculty emails must end with @mictech.ac.in or @mic.tech.ac.in');
        setSubmittingUser(false);
        return;
      }

      const payload = {
        ...newUser,
        email: lowerEmail,
        isAdmin: newUser.role !== 'student' ? true : newUser.isAdmin
      };

      await adminAPI.createUser(payload);
      
      setCreateSuccess('User login created successfully!');
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: 'student',
        branch: '',
        section: '',
        rollNo: '',
        designation: '',
        department: '',
        employeeId: '',
        isAdmin: false
      });
      
      loadStats();
    } catch (error: any) {
      console.error('Error creating user login:', error);
      setCreateError(error.response?.data?.message || 'Failed to create user login');
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleSuspendUser = async (userId: string, isSuspended: boolean) => {
    try {
      if (isSuspended) {
        await adminAPI.unsuspendUser(userId);
      } else {
        await adminAPI.suspendUser(userId);
      }
      loadStats();
    } catch (error) {
      console.error('Error updating suspension:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently delete this user? This will also delete all their uploaded notes.')) {
      return;
    }
    try {
      await adminAPI.deleteUser(userId);
      loadStats();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  if (loading || !stats) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 sm:pt-20">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
          <div className="mb-6 sm:mb-8">
            <div className="h-8 w-56 bg-gray-200 rounded mb-2 animate-pulse"></div>
            <div className="h-5 w-80 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-gray-200 animate-pulse">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                  <div className="h-4 w-12 bg-gray-200 rounded"></div>
                </div>
                <div className="h-8 w-20 bg-gray-200 rounded mb-1"></div>
                <div className="h-4 w-24 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Filter students in selected branch
  const filteredStudents = usersList.filter(
    u => u.role === 'student' && 
    (u.branch || '').toUpperCase() === selectedBranch.toUpperCase()
  );

  // Filter faculty in selected department
  const filteredFaculty = usersList.filter(
    u => u.role !== 'student' && u.role !== 'superadmin' &&
    (u.department || u.branch || '').toUpperCase() === selectedDept.toUpperCase()
  );

  return (
    <div className="min-h-screen bg-gray-50 pt-16 sm:pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {isSuperAdmin ? 'Super Admin Console' : 'Faculty Admin Dashboard'}
              </h1>
              {isSuperAdmin && (
                <span className="bg-yellow-100 text-yellow-800 text-xs px-2.5 py-1 rounded-full font-semibold border border-yellow-300 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> Super
                </span>
              )}
            </div>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {isSuperAdmin ? 'Supervise student & faculty logins, role mapping, and user databases' : 'Manage notes, reports, and platform statistics'}
            </p>
          </div>
          
          {isSuperAdmin && (
            <div className="flex bg-white rounded-lg p-1 border border-gray-200 self-start shadow-sm">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('students')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'students' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Students Group
              </button>
              <button
                onClick={() => setActiveTab('faculty')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'faculty' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Faculty Group
              </button>
              <button
                onClick={() => setActiveTab('logins')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'logins' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Logins
              </button>
              <button
                onClick={() => setActiveTab('curriculum')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'curriculum' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Curriculum
              </button>
            </div>
          )}
        </div>

        {/* Overview Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 sm:space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Logins</span>
                </div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5">{stats.totalUsers}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Registered Accounts</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-green-50 text-green-600 rounded-lg">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium font-semibold">Study Notes</span>
                </div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5">{stats.totalNotes}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Uploaded Files</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
                    <Download className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Downloads</span>
                </div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5">{stats.totalDownloads}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Global Downloads</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg">
                    <Eye className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Views</span>
                </div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5">{stats.totalViews}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Total Views</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-red-50 text-red-600 rounded-lg">
                    <UserX className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Security</span>
                </div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5">{stats.suspendedUsers}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Suspended Accounts</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-yellow-50 text-yellow-600 rounded-lg">
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Reported Notes</span>
                </div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5">{stats.reportedNotes}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Reported Notes</p>
                </div>
              </div>
            </div>

            {/* Quick Actions / Create User Login Form */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Create Login Console */}
              {isSuperAdmin ? (
                <div className="bg-white rounded-xl shadow-sm p-5 sm:p-6 border border-gray-200 lg:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <UserPlus className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-bold text-gray-900">Create New Login Credentials</h2>
                  </div>

                  <form onSubmit={handleCreateUser} className="space-y-4">
                    {createError && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-lg flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0" /> {createError}
                      </div>
                    )}
                    {createSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm rounded-lg flex items-center gap-2">
                        <Check className="w-4 h-4 shrink-0" /> {createSuccess}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={newUser.name}
                          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-gray-50/50"
                          placeholder="e.g. Dr. John Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-gray-50/50"
                          placeholder="e.g. john@mictech.edu.in"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Password</label>
                        <input
                          type="password"
                          required
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-gray-50/50"
                          placeholder="••••••••"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Account Role</label>
                        <select
                          value={newUser.role}
                          onChange={(e) => setNewUser({ ...newUser, role: e.target.value, isAdmin: e.target.value !== 'student' })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
                        >
                          <option value="student">Student (mictech.edu.in)</option>
                          <option value="teacher">Faculty/Admin (mictech.ac.in)</option>
                        </select>
                      </div>
                    </div>

                    {newUser.role === 'student' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 bg-blue-50/50 border border-blue-100 rounded-lg">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Branch</label>
                          <select
                            value={newUser.branch}
                            onChange={(e) => setNewUser({ ...newUser, branch: e.target.value })}
                            required={newUser.role === 'student'}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
                          >
                            <option value="">Select Branch</option>
                            {branches.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Roll No</label>
                          <input
                            type="text"
                            required={newUser.role === 'student'}
                            value={newUser.rollNo}
                            onChange={(e) => setNewUser({ ...newUser, rollNo: e.target.value })}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
                            placeholder="e.g. 21H71A0501"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Section</label>
                          <input
                            type="text"
                            value={newUser.section}
                            onChange={(e) => setNewUser({ ...newUser, section: e.target.value })}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
                            placeholder="e.g. A"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Department</label>
                          <select
                            value={newUser.department}
                            onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                            required={newUser.role !== 'student'}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
                          >
                            <option value="">Select Dept</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Designation</label>
                          <input
                            type="text"
                            value={newUser.designation}
                            onChange={(e) => setNewUser({ ...newUser, designation: e.target.value })}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
                            placeholder="e.g. Asst. Professor"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Employee ID</label>
                          <input
                            type="text"
                            required={newUser.role !== 'student'}
                            value={newUser.employeeId}
                            onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value })}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-white"
                            placeholder="e.g. EMP402"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={submittingUser}
                        className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                      >
                        {submittingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Create Login Credentials
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    onClick={() => router.push('/admin/users')}
                    className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all text-left group"
                  >
                    <Users className="w-8 h-8 text-blue-600 mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Manage Users</h3>
                    <p className="text-sm text-gray-600">View, suspend, or delete user accounts</p>
                  </button>

                  <button
                    onClick={() => router.push('/admin/notes')}
                    className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:border-green-500 hover:shadow-md transition-all text-left group"
                  >
                    <FileText className="w-8 h-8 text-green-600 mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Moderate Notes</h3>
                    <p className="text-sm text-gray-600">Review and delete inappropriate notes</p>
                  </button>

                  <button
                    onClick={() => router.push('/admin/reports')}
                    className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:border-yellow-500 hover:shadow-md transition-all text-left group"
                  >
                    <AlertTriangle className="w-8 h-8 text-yellow-600 mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">View Reports</h3>
                    <p className="text-sm text-gray-600">Manage reported content and violations</p>
                  </button>
                </div>
              )}

              {/* Rules/Domains Reference Sidebar */}
              <div className="bg-white rounded-xl shadow-sm p-5 sm:p-6 border border-gray-200 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">College Domain Config</h3>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg h-fit">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">Student Domain</h4>
                        <p className="text-xs text-gray-600 mt-0.5">`@mictech.edu.in` · `@mic.tech.edu`</p>
                        <p className="text-[11px] text-gray-500 italic mt-0.5">Normal login access. Restricted from administrative panels.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg h-fit">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">Faculty/Admin Domain</h4>
                        <p className="text-xs text-gray-600 mt-0.5">`@mictech.ac.in` · `@mic.tech.ac.in`</p>
                        <p className="text-[11px] text-gray-500 italic mt-0.5">Admin panel access automatically granted on login.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-indigo-600 font-semibold cursor-pointer hover:underline" onClick={() => setActiveTab('logins')}>
                    <span>View active database logins</span>
                    <span>→</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Students Category View */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-gray-200">
              {branches.map(branch => (
                <button
                  key={branch}
                  onClick={() => setSelectedBranch(branch)}
                  className={`px-4 py-2 text-sm rounded-lg font-bold transition-all border shrink-0 ${
                    selectedBranch === branch 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {branch}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Students ({selectedBranch} Branch)</h3>
                  <p className="text-xs text-gray-500 font-medium">Structured list of registered students in this category</p>
                </div>
                <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-bold border border-indigo-100">
                  {filteredStudents.length} Students
                </span>
              </div>

              {loadingUsers ? (
                <div className="py-12 flex justify-center items-center text-gray-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading students database...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="py-12 text-center text-gray-500 font-medium text-sm">
                  No registered students found in {selectedBranch} category.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 font-semibold bg-gray-50/20">
                        <th className="p-4">Name / Email</th>
                        <th className="p-4">Roll No / Section</th>
                        <th className="p-4">Role / Permissions</th>
                        <th className="p-4">Stats</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredStudents.map((u: any) => (
                        <tr key={u._id || u.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold text-gray-900">{u.name}</div>
                            <div className="text-xs text-gray-500 font-medium">{u.email}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-gray-800 uppercase">{u.rollNo || 'N/A'}</div>
                            <div className="text-xs text-gray-500 font-medium">Sec: {u.section || 'N/A'}</div>
                          </td>
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border bg-blue-50 border-blue-200 text-blue-800">
                              Normal Student
                            </span>
                          </td>
                          <td className="p-4 text-xs font-semibold text-gray-600 space-y-0.5">
                            <div>Notes: {u.notesUploaded || 0}</div>
                            <div>Downloads: {u.totalDownloads || 0}</div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${u.isSuspended ? 'bg-red-500' : 'bg-emerald-500'}`} title={u.isSuspended ? 'Suspended' : 'Active'} />
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <button
                              onClick={() => handleToggleRole(u)}
                              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1.5 rounded-lg border border-indigo-150 transition-all inline-flex items-center gap-1"
                              title="Promote to Faculty Admin"
                            >
                              <Shield className="w-3.5 h-3.5" /> Toggle Role
                            </button>
                            <button
                              onClick={() => handleSuspendUser(u._id || u.id, u.isSuspended)}
                              className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all inline-flex items-center gap-1 ${
                                u.isSuspended 
                                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-150 text-emerald-700' 
                                  : 'bg-orange-50 hover:bg-orange-100 border-orange-150 text-orange-700'
                              }`}
                            >
                              {u.isSuspended ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u._id || u.id)}
                              className="text-xs bg-red-50 hover:bg-red-100 border border-red-150 text-red-700 font-bold px-2.5 py-1.5 rounded-lg transition-all inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Faculty Category View */}
        {activeTab === 'faculty' && (
          <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-gray-200">
              {departments.map(dept => (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`px-4 py-2 text-sm rounded-lg font-bold transition-all border shrink-0 ${
                    selectedDept === dept 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Faculty Members ({selectedDept} Dept)</h3>
                  <p className="text-xs text-gray-500 font-medium">Structured list of registered faculty in this category</p>
                </div>
                <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-bold border border-indigo-100">
                  {filteredFaculty.length} Faculty
                </span>
              </div>

              {loadingUsers ? (
                <div className="py-12 flex justify-center items-center text-gray-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading faculty database...
                </div>
              ) : filteredFaculty.length === 0 ? (
                <div className="py-12 text-center text-gray-500 font-medium text-sm">
                  No registered faculty found in {selectedDept} department.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 font-semibold bg-gray-50/20">
                        <th className="p-4">Name / Email</th>
                        <th className="p-4">Designation / ID</th>
                        <th className="p-4">Role / Permissions</th>
                        <th className="p-4">Stats</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredFaculty.map((u: any) => (
                        <tr key={u._id || u.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold text-gray-900">{u.name}</div>
                            <div className="text-xs text-gray-500 font-medium">{u.email}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-gray-800">{u.designation || 'Faculty'}</div>
                            <div className="text-xs text-gray-500 font-medium">Emp ID: {u.employeeId || 'N/A'}</div>
                          </td>
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-yellow-50 border-yellow-200 text-yellow-800">
                              <Shield className="w-3 h-3 text-yellow-600" /> Faculty Admin
                            </span>
                          </td>
                          <td className="p-4 text-xs font-semibold text-gray-600 space-y-0.5">
                            <div>Notes: {u.notesUploaded || 0}</div>
                            <div>Views: {u.totalViews || 0}</div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${u.isSuspended ? 'bg-red-500' : 'bg-emerald-500'}`} title={u.isSuspended ? 'Suspended' : 'Active'} />
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <button
                              onClick={() => handleToggleRole(u)}
                              className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold px-2.5 py-1.5 rounded-lg border border-orange-150 transition-all inline-flex items-center gap-1"
                              title="Demote to Normal Student"
                            >
                              <UserCheck className="w-3.5 h-3.5" /> Toggle Role
                            </button>
                            <button
                              onClick={() => handleSuspendUser(u._id || u.id, u.isSuspended)}
                              className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all inline-flex items-center gap-1 ${
                                u.isSuspended 
                                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-150 text-emerald-700' 
                                  : 'bg-orange-50 hover:bg-orange-100 border-orange-150 text-orange-700'
                              }`}
                            >
                              {u.isSuspended ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u._id || u.id)}
                              className="text-xs bg-red-50 hover:bg-red-100 border border-red-150 text-red-700 font-bold px-2.5 py-1.5 rounded-lg transition-all inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Logins Tab Content */}
        {activeTab === 'logins' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-900">All Database Logins</h3>
                <p className="text-xs text-gray-500 font-medium">Manage and audit credentials for students, faculty, and admins</p>
              </div>
              <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-bold border border-indigo-100">
                {usersList.length} Logins Total
              </span>
            </div>

            {loadingUsers ? (
              <div className="py-12 flex justify-center items-center text-gray-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading credentials...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 font-semibold bg-gray-50/20">
                      <th className="p-4">User</th>
                      <th className="p-4">Domain / Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Permissions</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {usersList.map((u: any) => {
                      const isSuperUser = u.role === 'superadmin' || u.email === 'superadmin@notemitra.com';
                      return (
                        <tr key={u._id || u.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold text-gray-900">{u.name}</div>
                            <div className="text-xs text-gray-450 font-medium">Joined: {new Date(u.createdAt).toLocaleDateString()}</div>
                          </td>
                          <td className="p-4 font-mono text-xs text-gray-600">
                            {u.email}
                          </td>
                          <td className="p-4 capitalize font-semibold text-gray-700">
                            {u.role === 'teacher' ? 'Faculty' : u.role}
                          </td>
                          <td className="p-4">
                            {isSuperUser ? (
                              <span className="bg-violet-100 text-violet-800 text-[11px] px-2 py-0.5 rounded-full font-bold border border-violet-300 inline-flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-violet-600" /> Super Admin
                              </span>
                            ) : u.isAdmin ? (
                              <span className="bg-yellow-50 text-yellow-800 text-[11px] px-2 py-0.5 rounded-full font-semibold border border-yellow-200 inline-flex items-center gap-0.5">
                                <Shield className="w-3 h-3 text-yellow-600" /> Admin/Faculty
                              </span>
                            ) : (
                              <span className="bg-blue-50 text-blue-800 text-[11px] px-2 py-0.5 rounded-full font-semibold border border-blue-200">
                                Normal Student
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-block w-2 h-2 rounded-full ${u.isSuspended ? 'bg-red-500' : 'bg-emerald-500'}`} />
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {!isSuperUser && (
                              <>
                                <button
                                  onClick={() => handleToggleRole(u)}
                                  className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-300 font-bold px-2.5 py-1.5 rounded-lg transition-all"
                                >
                                  Toggle Role
                                </button>
                                <button
                                  onClick={() => handleSuspendUser(u._id || u.id, u.isSuspended)}
                                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all ${
                                    u.isSuspended 
                                      ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-150 text-emerald-700' 
                                      : 'bg-orange-50 hover:bg-orange-100 border-orange-150 text-orange-700'
                                  }`}
                                >
                                  {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u._id || u.id)}
                                  className="text-xs bg-red-50 hover:bg-red-100 border border-red-150 text-red-700 font-bold px-2.5 py-1.5 rounded-lg transition-all"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
 
        {activeTab === 'curriculum' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Settings className="w-6 h-6 text-indigo-600" />
              Curriculum & Subject Management
            </h2>

            {/* Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                <select
                  value={currBranch}
                  onChange={(e) => setCurrBranch(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-800"
                >
                  <option value="Computer Science & Engineering">Computer Science & Engineering (CSE)</option>
                  <option value="Artificial Intelligence & Machine Learning">Artificial Intelligence & Machine Learning (AIML)</option>
                  <option value="Artificial Intelligence & Data Science">Artificial Intelligence & Data Science (AIDS)</option>
                  <option value="Information Technology">Information Technology (IT)</option>
                  <option value="Electronics & Communication Engineering">Electronics & Communication Engineering (ECE)</option>
                  <option value="Electrical & Electronics Engineering">Electrical & Electronics Engineering (EEE)</option>
                  <option value="Civil Engineering">Civil Engineering</option>
                  <option value="Mechanical Engineering">Mechanical Engineering</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                <select
                  value={currSem}
                  onChange={(e) => setCurrSem(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-800"
                >
                  {['1', '2', '3', '4', '5', '6', '7', '8'].map(sem => (
                    <option key={sem} value={sem}>Semester {sem}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Add Subject Block */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-gray-800 text-sm sm:text-base mb-3">Add New Subject</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="e.g. Theory of Computation"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-800"
                />
                <button
                  onClick={handleAddSubject}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition"
                >
                  Add Subject
                </button>
              </div>
            </div>

            {/* Subjects Table / List */}
            {loadingCurriculum ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <span className="font-bold text-gray-700 text-sm sm:text-base">
                    Subjects ({curriculumMap[currBranch]?.[currSem]?.length || 0})
                  </span>
                  <span className="text-xs text-gray-500 font-semibold">
                    {currBranch} • Semester {currSem}
                  </span>
                </div>
                
                {(!curriculumMap[currBranch]?.[currSem] || curriculumMap[currBranch]?.[currSem]?.length === 0) ? (
                  <div className="p-8 text-center text-gray-500 bg-white">
                    No subjects defined for this semester. Click above to add some!
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 bg-white">
                    {curriculumMap[currBranch][currSem].map((subject: string) => (
                      <div key={subject} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        {editingSubject?.oldName === subject ? (
                          <div className="flex-1 flex gap-2">
                            <input
                              type="text"
                              value={editingSubject.newName}
                              onChange={(e) => setEditingSubject({ ...editingSubject, newName: e.target.value })}
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 text-gray-800"
                            />
                            <button
                              onClick={handleEditSubject}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSubject(null)}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-gray-800 font-medium text-sm sm:text-base">{subject}</span>
                            <div className="flex gap-2">
                              {subject !== 'Assignments' && (
                                <>
                                  <button
                                    onClick={() => setEditingSubject({ oldName: subject, newName: subject })}
                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded font-bold transition"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSubject(subject)}
                                    className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded font-bold transition"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                              {subject === 'Assignments' && (
                                <span className="text-xs text-gray-400 font-medium italic select-none py-1.5">
                                  Default Subject
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
