import "server-only";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent as HttpAgent, fetch as undiciFetch } from "undici";
import { validateCustomProviderInput } from "@/lib/ai/custom-provider-url";

export function isPublicAgentAddress(address: string) {
  try {
    let parsed = ipaddr.parse(address.replace(/^\[|\]$/gu, ""));
    if (
      parsed.kind() === "ipv6" &&
      (parsed as ipaddr.IPv6).isIPv4MappedAddress()
    )
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateAgentProviderUrl(url: string) {
  const errors = validateCustomProviderInput({
    apiUrl: url,
    apiKey: "validation",
    modelId: "validation",
  });
  if (errors.apiUrl) throw new Error(errors.apiUrl);
  const host = new URL(url).hostname.replace(/^\[|\]$/gu, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (ipaddr.isValid(host) && !isPublicAgentAddress(host))
  ) {
    throw new Error("模型服务地址必须指向公开 HTTPS 服务");
  }
}

export async function resolveAgentAddresses(
  hostname: string,
  resolve = (host: string) => lookup(host, { all: true, verbatim: true }),
) {
  const addresses = await resolve(hostname);
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAgentAddress(item.address))
  )
    throw new Error("AGENT_PRIVATE_ADDRESS_BLOCKED");
  return addresses;
}

// Validation occurs in the socket resolver, not in an earlier DNS preflight.
const dispatcher = new HttpAgent({
  connect: {
    lookup: (hostname, options, callback) => {
      void resolveAgentAddresses(hostname)
        .then((addresses) => {
          if (options.all) callback(null, addresses);
          else {
            const item =
              addresses.find(
                (item) => !options.family || item.family === options.family,
              ) ?? addresses[0];
            callback(null, item.address, item.family);
          }
        })
        .catch((error) => callback(error, []));
    },
  },
});

export function createAgentSafeFetch(
  transport: typeof undiciFetch = undiciFetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    validateAgentProviderUrl(request.url);
    const response = await transport(request.url, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      method: request.method,
      headers: request.headers,
      body: request.body as NonNullable<
        Parameters<typeof undiciFetch>[1]
      >["body"],
      duplex: "half",
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error("模型服务重定向被拒绝，请配置最终 HTTPS 地址");
    }
    return response as unknown as Response;
  };
}
export const agentSafeFetch = createAgentSafeFetch();
