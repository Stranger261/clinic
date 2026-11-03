import type { MetadataRoute } from "next";

// Let search engines index the landing page, but not the app screens behind sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/doctor", "/book", "/appointments", "/login", "/auth"] },
  };
}
