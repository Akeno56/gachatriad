export function allowedOrigins() {
  return [
    ...new Set(
      [
        process.env.CLIENT_ORIGIN || 'http://127.0.0.1:3000',
        ...(process.env.ALLOWED_ORIGINS || '').split(','),
        ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
      ]
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => new URL(x).origin),
    ),
  ];
}
