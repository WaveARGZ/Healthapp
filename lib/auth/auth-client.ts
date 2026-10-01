/**
 * Authentication seam. Implement this interface with Amazon Cognito later;
 * the current MVP intentionally uses route-only demo actions.
 */
export interface AuthClient {
  signIn(input: { email: string; password: string }): Promise<void>;
  signUp(input: { name: string; email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
}
