// Minimal subset of the GIS (Google Identity Services) token-client surface we use.

export interface GisTokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly scope?: string;
  readonly token_type?: string;
  readonly error?: string;
  readonly error_description?: string;
}

export interface GisTokenClient {
  callback: (resp: GisTokenResponse) => void;
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}

export interface GisTokenClientConfig {
  readonly client_id: string;
  readonly scope: string;
  readonly prompt?: string;
  readonly callback: (resp: GisTokenResponse) => void;
}

export interface GisNamespace {
  readonly accounts: {
    readonly oauth2: {
      initTokenClient(config: GisTokenClientConfig): GisTokenClient;
    };
  };
}

export interface CachedAccessToken {
  readonly accessToken: string;
  readonly expiresAt: number; // epoch ms
}

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}
