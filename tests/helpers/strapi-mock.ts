export function createStrapiMock(): any {
  const entityService: any = {
    findMany: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const dbQueryMap = new Map<string, any>();
  const query = jest.fn((uid: string) => {
    if (!dbQueryMap.has(uid)) {
      dbQueryMap.set(uid, {
        findOne: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => ({
          id: 1,
          uuid: "mock-uuid",
          rewardStatus: "available",
          claimed: false,
          obtainedAt: new Date(),
          claimedAt: new Date(),
          ...data,
        })),
        update: jest.fn(({ data }) => ({
          id: 1,
          ...data,
        })),
        delete: jest.fn(),
      });
    }
    return dbQueryMap.get(uid);
  });

  const metadata = {
    get: jest.fn(() => ({ tableName: "mock_table" })),
  };

  // Defined here to be exposed/modifiable
  const trxSelect = jest.fn().mockResolvedValue([
    {
      id: 1,
      tickets: 1000,
      coins: 1000000, // High default to avoid "insufficient funds" in general tests
      tickets_spent: 0,
      tickets_earned: 0,
      coins_earned: 0,
      coins_spent: 0,
    },
  ]);
  const trxUpdate = jest.fn();
  const trxIncrement = jest.fn();
  const trxWhere = jest.fn().mockReturnThis();

  const transaction = jest.fn(async (cb) => {
    const trx = jest.fn((tableName) => ({
      where: trxWhere,
      forUpdate: jest.fn().mockReturnThis(),
      select: trxSelect,
      update: trxUpdate,
      increment: trxIncrement,
    }));
    return await cb({ trx });
  });

  return {
    entityService,
    db: {
      query,
      metadata,
      transaction,
      // Helper to access internal mocks in tests
      mockTrx: {
        select: trxSelect,
        update: trxUpdate,
        increment: trxIncrement,
        where: trxWhere,
      },
    },
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    plugin: jest.fn(() => ({
      service: jest.fn(),
    })),
  };
}
