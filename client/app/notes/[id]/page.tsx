'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Download,
  Eye,
  Heart,
  MessageSquare,
  Calendar,
  User,
  FileText,
  Flag,
  Share2,
  Bookmark,
  BookmarkCheck,
  Send,
  Edit,
  Trash2,
  Loader2,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';
import { notesAPI } from '@/lib/api';

interface Note {
  id?: number | string;
  _id?: string;
  title: string;
  description: string;
  subject: string;
  semester: string;
  module: string;
  branch: string;
  userName: string;
  userId: number | string;
  views: number;
  downloads: number;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  fileUrl?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  cloudinaryId?: string;
  cloudinaryUrl?: string;
}

interface Comment {
  _id: string;
  text: string;
  userName: string;
  userId: string;
  createdAt: string;
}

// Toast Notification Component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  const icons = {
    success: <Check className="w-4 h-4 text-green-600" />,
    error: <X className="w-4 h-4 text-red-600" />,
    info: <Check className="w-4 h-4 text-blue-600" />,
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${colors[type]} animate-in slide-in-from-bottom-2 duration-300`}>
      {icons[type]}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// Report Modal Component
function ReportModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = [
    'Inappropriate content',
    'Copyright violation',
    'Spam or misleading',
    'Wrong category',
    'Duplicate content',
    'Other',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    await onSubmit(reason);
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Report this note</h3>
            <p className="text-sm text-gray-500">Help keep the community safe</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-2 mb-4">
            {reasons.map((r) => (
              <label key={r} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${reason === r ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="text-red-500"
                />
                <span className="text-sm text-gray-700">{r}</span>
              </label>
            ))}
          </div>

          {reason === 'Other' && (
            <textarea
              placeholder="Describe the issue..."
              className="w-full p-3 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={3}
              onChange={(e) => setReason(e.target.value)}
            />
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!reason.trim() || submitting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Report'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const noteId = params?.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (noteId) {
      fetchNoteDetails();
      if (user) checkIfSaved();
    }
  }, [noteId, user]);

  const fetchNoteDetails = async () => {
    try {
      setLoading(true);
      const noteResponse = await notesAPI.getNoteById(noteId);
      const fetchedNote = noteResponse.data.note;
      const userLiked = noteResponse.data.userLiked;

      if (fetchedNote) {
        if (fetchedNote._id && !fetchedNote.id) {
          fetchedNote.id = fetchedNote._id;
        }
      }

      setNote(fetchedNote);
      setIsLiked(userLiked || false);

      try {
        const commentsResponse = await notesAPI.getComments(noteId);
        setComments(commentsResponse.data.comments || []);
      } catch {
        setComments([]);
      }
    } catch (error) {
      console.error('Failed to fetch note:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkIfSaved = async () => {
    if (!user) return;
    try {
      const response = await notesAPI.checkIfSaved(noteId);
      setIsSaved(response.data.saved);
    } catch {}
  };

  const handleDownload = async () => {
    if (!note || isDownloading) return;
    setIsDownloading(true);

    try {
      const downloadNoteId = note._id || note.id || noteId;
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const downloadUrl = `${apiBase}/notes/${String(downloadNoteId).trim()}/download`;

      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/pdf, application/json' }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Error ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      let blobUrl: string;
      let filename = note.fileName || `${note.title}.pdf`;
      if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
      filename = filename.replace(/[<>:"/\\|?*]/g, '_');

      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (!data.downloadUrl) throw new Error('No download URL returned');
        const pdfResp = await fetch(data.downloadUrl);
        if (!pdfResp.ok) throw new Error('Failed to fetch PDF from URL');
        const blob = await pdfResp.blob();
        blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      } else {
        const blob = await response.blob();
        if (blob.size === 0) throw new Error('Downloaded file is empty');
        const disposition = response.headers.get('content-disposition');
        if (disposition) {
          const match = disposition.match(/filename="?([^"]+)"?/);
          if (match?.[1]) filename = match[1];
        }
        blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      }

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(blobUrl); }, 5000);

      // Track and update local count
      try {
        await notesAPI.trackDownload(String(downloadNoteId));
        setNote(prev => prev ? { ...prev, downloads: prev.downloads + 1, views: prev.views + 1 } : prev);
      } catch {}

      showToast('PDF downloaded successfully!', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Download failed';
      showToast(`Download failed: ${msg}`, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePreview = () => {
    if (!note) return;
    const noteIdToUse = note._id || note.id || noteId;
    router.push(`/notes/${noteIdToUse}/preview`);
  };

  const handleLike = async () => {
    if (!user) { router.push('/auth/signin'); return; }
    if (!note || isLiking) return;

    setIsLiking(true);
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setNote(prev => prev ? { ...prev, upvotes: wasLiked ? prev.upvotes - 1 : prev.upvotes + 1 } : prev);

    try {
      const response = await notesAPI.voteNote(noteId, 'upvote');
      if (response.data.note) {
        setNote(prev => prev ? { ...prev, upvotes: response.data.note.upvotes } : prev);
        setIsLiked(response.data.userLiked ?? !wasLiked);
      }
    } catch {
      setIsLiked(wasLiked);
      setNote(prev => prev ? { ...prev, upvotes: wasLiked ? prev.upvotes + 1 : prev.upvotes - 1 } : prev);
    } finally {
      setIsLiking(false);
    }
  };

  const handleSaveToggle = async () => {
    if (!user) { router.push('/auth/signin'); return; }
    setSavingNote(true);
    try {
      if (isSaved) {
        await notesAPI.unsaveNote(noteId);
        setIsSaved(false);
        showToast('Note removed from saved', 'info');
      } else {
        await notesAPI.saveNote(noteId);
        setIsSaved(true);
        showToast('Note saved to your collection!', 'success');
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        setIsSaved(true);
      } else {
        showToast('Failed to save note. Please try again.', 'error');
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: note?.title, text: note?.description, url });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard!', 'success');
      } catch {
        showToast('Could not copy link', 'error');
      }
    }
  };

  const handleReport = async (reason: string) => {
    if (!user) { router.push('/auth/signin'); return; }
    try {
      await notesAPI.reportNote(noteId, reason);
      showToast('Report submitted. Thank you!', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to submit report';
      showToast(msg, 'error');
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { router.push('/auth/signin'); return; }
    if (!commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await notesAPI.addComment(noteId, commentText.trim());
      if (response.data.comment) {
        setComments(prev => [response.data.comment, ...prev]);
        setNote(prev => prev ? { ...prev } : prev);
      }
      setCommentText('');
      showToast('Comment posted!', 'success');
    } catch {
      showToast('Failed to post comment. Please try again.', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await notesAPI.deleteComment(commentId);
      setComments(prev => prev.filter(c => c._id !== commentId));
      showToast('Comment deleted', 'info');
    } catch {
      showToast('Failed to delete comment', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Note not found</h2>
          <p className="text-gray-600 mb-4">The note you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/browse')}>Browse Notes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-4 sm:py-8">
      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={handleReport}
        />
      )}

      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Back Button */}
        <button
          onClick={() => router.push('/browse')}
          className="text-blue-600 hover:text-blue-700 mb-4 sm:mb-6 flex items-center gap-2 text-sm sm:text-base"
        >
          ← Back to Browse
        </button>

        {/* Note Header */}
        <div className="bg-white rounded-2xl shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4 sm:mb-6">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">{note.title}</h1>
              <p className="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4">{note.description}</p>

              {/* Metadata Badges */}
              <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                <span className="bg-blue-100 text-blue-800 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium">
                  {note.subject}
                </span>
                <span className="bg-purple-100 text-purple-800 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium">
                  Semester {note.semester}
                </span>
                <span className="bg-green-100 text-green-800 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium">
                  {note.branch}
                </span>
                {note.module && (
                  <span className="bg-orange-100 text-orange-800 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium">
                    {note.module}
                  </span>
                )}
              </div>

              {/* Author and Date */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{note.userName}</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons (top-right) */}
            <div className="flex flex-row md:flex-col gap-2 flex-wrap">
              <Button onClick={handlePreview} variant="outline" className="flex items-center gap-2 text-sm">
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Preview PDF</span>
                <span className="sm:hidden">Preview</span>
              </Button>
              <Button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 text-sm"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{isDownloading ? 'Downloading...' : 'Download PDF'}</span>
                <span className="sm:hidden">{isDownloading ? '...' : 'Download'}</span>
              </Button>
              <Button
                onClick={handleSaveToggle}
                disabled={savingNote}
                variant={isSaved ? 'default' : 'outline'}
                className={`flex items-center gap-2 text-sm ${isSaved ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
              >
                {savingNote ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isSaved ? (
                  <BookmarkCheck className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
                {savingNote ? 'Saving...' : isSaved ? 'Saved' : 'Save'}
              </Button>
              <div className="text-xs sm:text-sm text-gray-500 text-center w-full md:w-auto">
                {note.fileSize ? `${(note.fileSize / (1024 * 1024)).toFixed(2)} MB` : ''}
              </div>
            </div>
          </div>

          {/* Stats and Action Row */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-4 pt-4 border-t border-gray-100">
            {/* Stats */}
            <div className="flex items-center gap-5 text-gray-500 text-sm">
              <div className="flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                <span className="font-semibold text-gray-700">{note.views}</span>
                <span>views</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                <span className="font-semibold text-gray-700">{note.downloads}</span>
                <span>downloads</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" />
                <span className="font-semibold text-gray-700">{comments.length}</span>
                <span>comments</span>
              </div>
            </div>

            {/* Interactive Buttons */}
            <div className="flex items-center gap-2">
              {/* Like */}
              <button
                onClick={handleLike}
                disabled={isLiking}
                title={isLiked ? 'Unlike' : 'Like'}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95 border ${
                  isLiked
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-red-200 hover:bg-red-50'
                } ${isLiking ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Heart
                  className={`w-5 h-5 transition-all duration-200 ${isLiked ? 'fill-red-500 text-red-500 scale-110' : ''}`}
                />
                <span className="font-semibold text-sm">{note.upvotes}</span>
              </button>

              {/* Save (icon button) */}
              <button
                onClick={handleSaveToggle}
                disabled={savingNote}
                title={isSaved ? 'Unsave' : 'Save'}
                className={`p-2 rounded-xl border transition-all duration-200 ${
                  isSaved
                    ? 'bg-blue-50 border-blue-200 text-blue-600'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-blue-50'
                }`}
              >
                {savingNote ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSaved ? (
                  <BookmarkCheck className="w-5 h-5" />
                ) : (
                  <Bookmark className="w-5 h-5" />
                )}
              </button>

              {/* Share */}
              <button
                onClick={handleShare}
                title="Share"
                className="p-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-200"
              >
                <Share2 className="w-5 h-5" />
              </button>

              {/* Report */}
              {user && (
                <button
                  onClick={() => setShowReportModal(true)}
                  title="Report"
                  className="p-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-all duration-200"
                >
                  <Flag className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Comments Section */}
        <div className="bg-white rounded-2xl shadow-md p-4 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">
            Comments ({comments.length})
          </h2>

          {/* Add Comment */}
          {user ? (
            <form onSubmit={handleSubmitComment} className="mb-6">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm sm:text-base resize-none"
              />
              <div className="flex justify-end mt-2">
                <Button
                  type="submit"
                  disabled={submittingComment || !commentText.trim()}
                  className="text-sm sm:text-base"
                >
                  {submittingComment ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Post Comment
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-center">
              <p className="text-gray-600 mb-3 text-sm sm:text-base">Sign in to leave a comment</p>
              <Button onClick={() => router.push('/auth/signin')}>Sign In</Button>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-3">
            {comments.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No comments yet. Be the first to comment!</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment._id}
                  className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900 text-sm">{comment.userName}</span>
                        <span className="text-gray-400 text-xs ml-2">
                          {new Date(comment.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {user && (user.id === comment.userId || (user as any).isAdmin) && (
                      <button
                        className="text-gray-300 hover:text-red-500 p-1 transition flex-shrink-0"
                        title="Delete comment"
                        onClick={() => handleDeleteComment(comment._id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed pl-10">{comment.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
