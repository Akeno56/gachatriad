import type { BetterAuthOptions } from 'better-auth';
export function socialProviders(): NonNullable<BetterAuthOptions['socialProviders']> {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)
    providers.discord = {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      mapProfileToUser: (p) => ({
        name: Array.from(p.global_name || p.username || 'Player')
          .slice(0, 32)
          .join(''),
        email: p.email || `discord-${p.id}@discord.gachatriad.invalid`,
        emailVerified: !!p.email && p.verified === true,
      }),
    };
  return providers;
}
