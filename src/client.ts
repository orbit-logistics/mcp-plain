import { PlainClient } from "@team-plain/typescript-sdk";

let client: PlainClient | null = null;

/**
 * Get the Plain client instance.
 * Creates a singleton instance using the PLAIN_API_KEY environment variable.
 */
export const getPlainClient = (): PlainClient => {
  if (client) {
    return client;
  }

  const apiKey = process.env.PLAIN_API_KEY;

  if (!apiKey) {
    throw new Error("PLAIN_API_KEY environment variable is required");
  }

  client = new PlainClient({ apiKey });
  return client;
};

/**
 * Reset the client instance (useful for testing).
 */
export const resetPlainClient = (): void => {
  client = null;
};
