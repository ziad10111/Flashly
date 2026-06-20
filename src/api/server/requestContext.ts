import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  requestId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <TResult>(
  context: RequestContext,
  action: () => TResult,
) => requestContextStorage.run(context, action);

export const getCurrentRequestId = () => requestContextStorage.getStore()?.requestId;
