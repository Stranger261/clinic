export const safe = (
  error: { code?: string; message: string },
  fallback: string,
) => (error.code === "P0001" ? error.message : fallback);
