export {
  createHttpClient,
  type HttpClient,
  type HttpClientOptions,
} from "./adapters/http-client.js";
export {
  createOpenAIEmbeddingAdapter,
  type OpenAIEmbeddingAdapterOptions,
} from "./adapters/openai-embedding.js";
export {
  createOpenRouterAdapter,
  type OpenRouterAdapterOptions,
} from "./adapters/openrouter.js";
export {
  createRetrievalAdapter,
  type RetrievalAdapterOptions,
} from "./adapters/retrieval.js";
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
export {
  type Adapter,
  type AdapterResult,
  createGateway,
  type GatewayDeps,
  type GatewayEventStore,
  type GatewayLangfuse,
  type ModelGateway,
  type TraceHandle,
} from "./gateway.js";
export {
  pipeStructuredOutput,
  type StructuredOutputContext,
  type StructuredOutputResult,
} from "./structured-output.js";
