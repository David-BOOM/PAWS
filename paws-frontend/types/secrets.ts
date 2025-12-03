export type SecretsShape = {
  llm?: {
    host?: string;
    model?: string;
    temperature?: number;
  };
  wifi?: {
    ssid?: string;
    password?: string;
  };
  server?: {
    host?: string;
    port?: number;
  };
};
