import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Medal, Heart } from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { format, startOfDay, endOfDay, subDays, addDays } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

interface UserRanking {
  id: string;
  first_name: string;
  last_name: string;
  profile_name: string;
  total_workouts: number;
  total_score: number;
  daily_score: number;
  likes: number;
  hasLiked: boolean;
}

export function UserRankings() {
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { user } = useAuth();

  useEffect(() => {
    async function fetchRankings() {
      try {
        setLoading(true);
        const todayStart = startOfDay(selectedDate).toISOString();
        const todayEnd = endOfDay(selectedDate).toISOString();

        // Fetch workout logs for the selected date
        const { data, error } = await supabase
          .from('profiles')
          .select(`
            id,
            first_name,
            last_name,
            profile_name,
            workout_logs (
              total,
              completed_at
            )
          `)
          .order('id', { ascending: false });

        if (error) {
          console.error('Supabase error:', error);
          return;
        }

        // Aggregate scores for each user
        const userStats = await Promise.all(
          data.map(async (profile) => {
            const { data: likesData, error: likesError } = await supabase
              .from('likes')
              .select('count', { count: 'exact' })
              .eq('profile_id', profile.id);

            if (likesError) {
              console.error('Error fetching likes:', likesError);
              return null; // Skip this profile if there's an error fetching likes
            }

            const likes = likesData ? likesData[0]?.count || 0 : 0;

            // Filter workout logs for the selected date
            const dailyWorkouts = profile.workout_logs?.filter(log => {
              const completedAt = new Date(log.completed_at);
              return completedAt >= new Date(todayStart) && completedAt <= new Date(todayEnd);
            }) || [];

            const dailyScore = dailyWorkouts.reduce((sum, log) => sum + (log.total || 0), 0);

            return {
              id: profile.id,
              first_name: profile.first_name || '',
              last_name: profile.last_name || '',
              profile_name: profile.profile_name || '',
              total_workouts: profile.workout_logs?.length || 0,
              total_score: profile.workout_logs?.reduce((sum, log) => sum + (log.total || 0), 0) || 0,
              daily_score: dailyScore,
              likes: likes,
              hasLiked: false,
            };
          })
        );

        // Filter out any null profiles due to errors
        const validUserStats = userStats.filter(stat => stat !== null) as UserRanking[];

        // Sort users by daily_score in descending order
        const sortedRankings = validUserStats.sort((a, b) => b.daily_score - a.daily_score).slice(0, 10);

        setRankings(sortedRankings);
      } catch (error) {
        console.error('Error fetching rankings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRankings();
  }, [selectedDate]);

  const handlePrevDay = () => {
    setSelectedDate(prevDate => subDays(prevDate, 1));
  };

  const handleNextDay = () => {
    setSelectedDate(prevDate => addDays(prevDate, 1));
  };

  const handleLike = async (profileId: string) => {
    if (!user) {
      alert('You must be logged in to like a score.');
      return;
    }

    try {
      // Optimistically update the UI
      setRankings(prevRankings =>
        prevRankings.map(ranking =>
          ranking.id === profileId
            ? { ...ranking, likes: ranking.likes + 1, hasLiked: true }
            : ranking
        )
      );

      // Send like to Supabase
      const { error } = await supabase
        .from('likes')
        .insert([
          {
            user_id: user.id,
            profile_id: profileId,
            date: new Date().toISOString(),
          }
        ]);

      if (error) {
        console.error('Error liking profile:', error);
        // Revert the UI update if there was an error
        setRankings(prevRankings =>
          prevRankings.map(ranking =>
            ranking.id === profileId
              ? { ...ranking, likes: ranking.likes - 1, hasLiked: false }
              : ranking
          )
        );
        alert('Failed to like profile. Please try again.');
      }
    } catch (error) {
      console.error('Error liking profile:', error);
      alert('Failed to like profile. Please try again.');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="bg-white dark:bg-darkBackground dark:text-gray-100 dark:text-gray-200 rounded-lg shadow-md p-6 transition-all duration-300">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold dark:text-gray-100 mb-2">User Rankings</h2>
          <p className="text-sm text-gray-500">Results for {format(selectedDate, 'PPP')}</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handlePrevDay}
            className="dark:bg-gray-700 hover:bg-gray-200 px-3 py-1 rounded"
          >
            Previous
          </button>
          <button
            onClick={handleNextDay}
            className="dark:bg-gray-700 hover:bg-gray-200 px-3 py-1 rounded"
          >
            Next
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {rankings.map((user, index) => (
          <div
            key={user.id}
            className="flex items-center justify-between p-4 dark:bg-gray-800 rounded-lg"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                {index === 0 ? (
                  <Trophy className="h-6 w-6 text-yellow-500" />
                ) : index === 1 ? (
                  <Medal className="h-6 w-6 text-gray-400" />
                ) : index === 2 ? (
                  <Medal className="h-6 w-6 text-amber-600" />
                ) : (
                  <span className="w-6 text-center font-medium text-gray-500">
                    {index + 1}
                  </span>
                )}
              </div>
              <div>
                <p className="font-medium dark:text-gray-100">
                  {user.profile_name || `${user.first_name} ${user.last_name}`}
                </p>
                <p className="text-sm text-gray-500">
                  {user.total_workouts} workouts completed
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-indigo-600 font-medium">
                {user.daily_score} points
              </span>
              <button
                onClick={() => handleLike(user.id)}
                disabled={user.hasLiked}
                className="ml-2 text-gray-500 hover:text-red-600 focus:outline-none"
              >
                <Heart
                  className={`h-5 w-5 ${user.hasLiked ? 'text-red-600' : ''}`}
                />
                <span className="ml-1">{user.likes}</span>
              </button>
            </div>
          </div>
        ))}

        {rankings.length === 0 && (
          <p className="text-center text-gray-500 py-4">
            No rankings available for {format(selectedDate, 'PPP')}
          </p>
        )}
      </div>
    </div>
  );
}

