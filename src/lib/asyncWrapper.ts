/**
 * Safely resolves a promise, catching errors to prevent app crashes.
 * Returns a tuple of [error, data].
 */
import { Alert } from "react-native";
export async function safeAwait<T, E = Error>(
  promise: Promise<T>,
): Promise<[E, null] | [null, T]> {
  try {
    const data = await promise;
    return [null, data];
  } catch (error) {
    console.error("Async Operation Failed:", error);
    return [error as E, null];
  }
}

// For a single critical write: returns true on success, shows an alert + returns false on failure.
export async function trySave<T>(
  promise: Promise<T>,
  failMessage = "Could not save. Please try again.",
): Promise<boolean> {
  const [error] = await safeAwait(promise);
  if (error) {
    Alert.alert("Save failed", failMessage);
    return false;
  }
  return true;
}

// For a read with a fallback: returns the data or the fallback, never throws.
export async function safeRead<T>(
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  const [error, data] = await safeAwait(promise);
  return error || data == null ? fallback : data;
}
