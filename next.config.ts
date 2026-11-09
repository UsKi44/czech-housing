import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The site is private and only listens on 127.0.0.1 (see package.json scripts).
  poweredByHeader: false,
  // Agent instructions live in CLAUDE.md; don't let `next dev` generate an AGENTS.md.
  agentRules: false,
};

export default nextConfig;
