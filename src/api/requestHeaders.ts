export type ApiRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const methodsWithoutJsonContentType = new Set<ApiRequestMethod>(["GET"]);

export const shouldUseJsonContentType = ({
  hasBody,
  method,
}: {
  hasBody: boolean;
  method: ApiRequestMethod;
}) => hasBody || !methodsWithoutJsonContentType.has(method);

export const createApiRequestHeaders = ({
  authToken,
  hasBody,
  headers,
  method,
}: {
  authToken?: string | null;
  hasBody: boolean;
  headers?: HeadersInit;
  method: ApiRequestMethod;
}) => {
  const nextHeaders = new Headers(headers);

  nextHeaders.set("Accept", "application/json");

  if (hasBody || (!nextHeaders.has("Content-Type") && shouldUseJsonContentType({ hasBody, method }))) {
    nextHeaders.set("Content-Type", "application/json");
  }

  if (authToken) {
    nextHeaders.set("Authorization", `Bearer ${authToken}`);
  }

  return nextHeaders;
};
