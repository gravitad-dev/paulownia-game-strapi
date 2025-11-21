export function makeDailyReward(day: number, type: 'coins' | 'tickets', amount: number) {
  return { id: day, day, rewardType: type, rewardAmount: amount, image: null, name: `Day ${day}` }
}

export function makeUserDailyReward(userId: number, reward: any, claimedAt: Date) {
  return { id: `${userId}-${reward.day}-${claimedAt.getTime()}`, users_permissions_user: userId, daily_reward: reward, claimed: true, claimedAt }
}

export function makePlayerStat(userId: number, coins = 0, tickets = 0, coinsEarned = 0, ticketsEarned = 0) {
  return { id: `ps-${userId}`, users_permissions_user: userId, coins, tickets, coinsEarned, ticketsEarned }
}