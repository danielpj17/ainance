import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Resolve the directory of this config file to use as the Turbopack root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    // Ensure Turbopack uses this project as the root, not parent directories
    root: __dirname,
  },
};

export default nextConfig;
