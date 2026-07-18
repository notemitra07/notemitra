'use client';

import { useEffect, useState } from 'react';
import { leaderboardAPI } from '@/lib/api';
import { Trophy, Medal, Award, TrendingUp } from 'lucide-react';

interface LeaderboardUser {
  name: string;
  totalDownloads: number;
  notesUploaded: number;
  avgDownloads: number;
  joinDate: string;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await leaderboardAPI.getLeaderboard();
      setLeaderboard(response.data.leaderboard);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-8 h-8 text-yellow-500" />;
      case 1:
        return <Medal className="w-8 h-8 text-gray-400" />;
      case 2:
        return <Award className="w-8 h-8 text-amber-600" />;
      default:
        return <div className="w-8 h-8 flex items-center justify-center text-gray-500 font-bold text-lg">#{index + 1}</div>;
    }
  };

  const getRankEmoji = (index: number) => {
    switch (index) {
      case 0:
        return '🥇';
      case 1:
        return '🥈';
      case 2:
        return '🥉';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-6 sm:py-8 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Skeleton Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="h-10 w-64 bg-gray-200 rounded-lg mx-auto mb-4 animate-pulse"></div>
            <div className="h-6 w-96 max-w-full bg-gray-200 rounded mx-auto animate-pulse"></div>
          </div>
          {/* Skeleton Cards */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-5 w-40 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 w-24 bg-gray-200 rounded"></div>
                  </div>
                  <div className="flex gap-4">
                    <div className="h-10 w-20 bg-gray-200 rounded"></div>
                    <div className="h-10 w-20 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-6 sm:py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-purple-600" />
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Top Contributors
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto px-4">
            Students who share the most valuable notes. Upload quality content to climb the leaderboard!
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm sm:text-base">
            {error}
          </div>
        )}

        {leaderboard.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 sm:p-12 text-center">
            <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-lg sm:text-xl text-gray-600">No users on the leaderboard yet.</p>
            <p className="text-gray-500 mt-2 text-sm sm:text-base">Be the first to upload notes and gain popularity!</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {leaderboard.map((user, index) => (
              <div
                key={index}
                className={`bg-white rounded-xl shadow-lg p-4 sm:p-6 transition-all hover:scale-[1.01] sm:hover:scale-[1.02] hover:shadow-xl ${
                  index === 0 ? 'border-4 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50' :
                  index === 1 ? 'border-4 border-gray-300 bg-gradient-to-r from-gray-50 to-slate-50' :
                  index === 2 ? 'border-4 border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50' :
                  'border border-gray-200'
                }`}
              >
                {/* Mobile Layout */}
                <div className="flex flex-col sm:hidden">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0">
                      {getRankIcon(index)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-800 truncate">
                        {getRankEmoji(index)} {user.name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        First upload: {new Date(user.joinDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-blue-50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-blue-600">{user.totalDownloads}</div>
                      <div className="text-[10px] text-gray-600">Downloads</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-purple-600">{user.notesUploaded}</div>
                      <div className="text-[10px] text-gray-600">Uploaded</div>
                    </div>
                    <div className="bg-pink-50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-pink-600">{user.avgDownloads.toFixed(1)}</div>
                      <div className="text-[10px] text-gray-600">Avg/Note</div>
                    </div>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden sm:flex items-center gap-6">
                  {/* Rank Icon */}
                  <div className="flex-shrink-0">
                    {getRankIcon(index)}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-gray-800 truncate">
                        {getRankEmoji(index)} {user.name}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      First upload: {new Date(user.joinDate).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-4 md:gap-6 text-center">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-xl md:text-2xl font-bold text-blue-600">
                        {user.totalDownloads}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Total Downloads
                      </div>
                    </div>

                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xl md:text-2xl font-bold text-purple-600">
                        {user.notesUploaded}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Notes Uploaded
                      </div>
                    </div>

                    <div className="bg-pink-50 rounded-lg p-3">
                      <div className="text-xl md:text-2xl font-bold text-pink-600">
                        {user.avgDownloads.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Avg per Note
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Card */}
        <div className="mt-6 sm:mt-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-4 sm:p-6 text-white">
          <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">How Rankings Work</h3>
          <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm list-disc pl-5">
            <li><strong>Total Downloads:</strong> More downloads = higher rank</li>
            <li><strong>Average Downloads per Note:</strong> Quality matters! (ties broken by avg)</li>
            <li><strong>Upload Date:</strong> Earlier uploads win ties</li>
            <li>Upload clear, useful notes to gain popularity and climb the leaderboard!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
