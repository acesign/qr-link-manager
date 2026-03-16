import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  allowedActionOrigins: [
    "*.myshopify.com",
    "xframesign.com",
    "*.xframesign.com",
  ],
} satisfies Config;