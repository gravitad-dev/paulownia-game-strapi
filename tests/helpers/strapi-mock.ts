export function createStrapiMock(): any {
  const entityService: any = {
    findMany: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
  const dbQueryMap = new Map<string, any>()
  const query = jest.fn((uid: string) => {
    if (!dbQueryMap.has(uid)) {
      dbQueryMap.set(uid, { findOne: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn(), createMany: jest.fn() })
    }
    return dbQueryMap.get(uid)
  })

  return {
    entityService,
    db: { query }
  }
}