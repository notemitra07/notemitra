'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { adminAPI } from '@/lib/api';
import { ArrowLeft, Trash2, FileText, Eye, Download } from 'lucide-react';

interface Note {
  id: string;
  _id?: string;
  title: string;
  description?: string;
  subject: string;
  semester: string;
  module: string;
  branch: string;
  userName: string;
  views: number;
  downloads: number;
  upvotes: number;
  downvotes: number;
  isReported: boolean;
  reportReason?: string;
  createdAt: string;
}

export default function NotesManagement() {
  const router = useRouter();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/admin/login');
      return;
    }

    if (!(user as any).isAdmin) {
      router.push('/browse');
      return;
    }

    loadNotes();
  }, [user, router]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getNotes();
      setNotes(response.data.notes);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone!')) return;

    try {
      setDeleteLoading(noteId);
      await adminAPI.deleteNote(noteId);
      await loadNotes();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error deleting note');
    } finally {
      setDeleteLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header skeleton */}
          <div className="mb-8">
            <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-4"></div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
          </div>
          {/* Notes grid skeleton */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-xl shadow-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="h-3 w-full bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Content Moderation</h1>
            <p className="text-gray-600">Total Notes: {notes.length}</p>
          </div>

          {/* Notes Grid */}
          <div className="grid grid-cols-1 gap-4">
            {notes.map((note) => {
              const noteId = note._id || note.id;
              const isDeleting = deleteLoading === noteId;

              return (
                <div
                  key={noteId}
                  className={`bg-white rounded-lg shadow-sm p-6 border ${
                    note.isReported ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">{note.title}</h3>
                        {note.isReported && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                            Reported
                          </span>
                        )}
                      </div>

                      {note.description && (
                        <p className="text-gray-600 text-sm mb-3">{note.description}</p>
                      )}

                      {note.isReported && note.reportReason && (
                        <div className="mb-3 p-3 bg-red-100 border border-red-200 rounded">
                          <p className="text-sm text-red-800">
                            <strong>Report Reason:</strong> {note.reportReason}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                          {note.subject}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                          Sem {note.semester}
                        </span>
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                          {note.branch}
                        </span>
                        <span>By: {note.userName}</span>
                        <span className="flex items-center">
                          <Eye className="w-4 h-4 mr-1" />
                          {note.views}
                        </span>
                        <span className="flex items-center">
                          <Download className="w-4 h-4 mr-1" />
                          {note.downloads}
                        </span>
                        <span>❤️ {note.upvotes}</span>
                      </div>

                      <div className="text-xs text-gray-500 mt-2">
                        Uploaded: {new Date(note.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(noteId)}
                      disabled={isDeleting}
                      className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {notes.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No notes found</p>
            </div>
          )}
        </div>
      </div>
  );
}
