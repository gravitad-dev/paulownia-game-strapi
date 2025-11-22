export function makeDailyReward(day: number, type: 'coins' | 'tickets', amount: number) {
  return { id: day, day, rewardType: type, rewardAmount: amount, image: null, name: `Day ${day}` }
}

export function makeUserDailyReward(userId: number, reward: any, claimedAt: Date) {
  return { id: `${userId}-${reward.day}-${claimedAt.getTime()}`, users_permissions_user: userId, daily_reward: reward, claimed: true, claimedAt }
}

export function makePlayerStat(userId: number, coins = 0, tickets = 0, coinsEarned = 0, ticketsEarned = 0) {
  return { id: `ps-${userId}`, users_permissions_user: userId, coins, tickets, coinsEarned, ticketsEarned }
}

export function makeAchievement(
  id: number,
  title: string,
  targetType: 'gamesWon' | 'dailyLogin' | 'xp' | 'score' | 'time',
  goalAmount: number,
  rewardType: 'coins' | 'tickets',
  rewardAmount: number,
  options: { isActive?: boolean; visibleToUser?: boolean; description?: string } = {}
) {
  return {
    id,
    uuid: `achievement-${id}`,
    title,
    description: options.description || `Complete ${title}`,
    targetType,
    goalAmount,
    rewardType,
    rewardAmount,
    isActive: options.isActive ?? true,
    visibleToUser: options.visibleToUser ?? true,
    image: null as null | { id: number; url: string; name: string },
  }
}

export function makeUserAchievement(
  userId: number,
  achievement: any,
  options: {
    completed?: boolean;
    claimed?: boolean;
    currentProgress?: number;
    obtainedAt?: Date | null;
    claimedAt?: Date | null;
  } = {}
) {
  return {
    id: `${userId}-${achievement.id}`,
    uuid: `user-achievement-${userId}-${achievement.id}`,
    users_permissions_user: userId,
    achievement,
    completed: options.completed ?? false,
    claimed: options.claimed ?? false,
    currentProgress: options.currentProgress ?? 0,
    obtainedAt: options.obtainedAt ?? null,
    claimedAt: options.claimedAt ?? null,
  }
}