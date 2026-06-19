export {
  createHttpClient,
  type HttpClient,
  type HttpClientOptions,
} from "./adapters/http-client.js";
export {
  createRegistry,
  defaultRoutes,
  type GatewayRegistry,
  loadRegistryFromEnv,
  modelRoleEnvVar,
} from "./default-routes.js";
export {
  GatewayConfigError,
  OutputSchemaRejectedError,
  RecordedFixtureNotFoundError,
  RetryExhaustedError,
  RouteNotFoundError,
} from "./errors.js";
export type { ModelGateway } from "./gateway.js";
