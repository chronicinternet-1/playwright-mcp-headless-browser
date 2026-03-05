import { env } from 'cloudflare:workers';
import { createMcpAgent } from '@cloudflare/playwright-mcp';

export const PlaywrightMCP = createMcpAgent(env.BROWSER);

// Fixed session ID so all connections share the same browser instance.
// This allows mcporter (which creates a new SSE connection per call)
// to maintain browser state across multiple tool invocations.
const SHARED_SESSION_ID = 'shared-browser';

/**
 * Rewrite the incoming request URL so that every SSE or Streamable-HTTP
 * connection is routed to the *same* Durable Object instance.
 *
 * The Cloudflare Agents SDK uses `idFromName("sse:${sessionId}")` to
 * pick the DO.  By injecting a constant `sessionId` query-param we
 * guarantee that consecutive `mcporter call` invocations (each of which
 * opens a brand-new SSE connection) all land on the same DO and
 * therefore share the same Playwright browser context.
 */
function withSharedSession(request: Request): Request {
  const url = new URL(request.url);
  // Only inject when the caller did not already supply one.
  if (!url.searchParams.has('sessionId')) {
    url.searchParams.set('sessionId', SHARED_SESSION_ID);
  }
  return new Request(url.toString(), request);
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);

    switch (pathname) {
      case '/sse':
      case '/sse/message':
        return PlaywrightMCP.serveSSE('/sse').fetch(
          withSharedSession(request), env, ctx
        );
      case '/mcp':
        return PlaywrightMCP.serve('/mcp').fetch(
          withSharedSession(request), env, ctx
        );
      default:
        return new Response('Not Found', { status: 404 });
    }
  },
};
