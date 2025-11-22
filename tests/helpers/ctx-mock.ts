export type Ctx = {
  state: { user?: any }
  send: (body: any) => any
  badRequest: (msg: string, data?: any) => any
  unauthorized: (msg: string, data?: any) => any
  notFound: (msg: string, data?: any) => any
  request?: any
  query?: any
}

export function mockCtx(user?: any): Ctx {
  return {
    state: { user },
    send: (body: any) => body,
    badRequest: (msg: string, data?: any) => ({ status: 400, message: msg, data }),
    unauthorized: (msg: string, data?: any) => ({ status: 401, message: msg, data }),
    notFound: (msg: string, data?: any) => ({ status: 404, message: msg, data })
  }
}