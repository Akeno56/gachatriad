import type { Sql } from './database';
/** Remove an exact finish from the saved deck only when its last owned copy is gone. */
export async function pruneDeck(sql: Sql, profileId: string) {
  const [changed] = await sql<{ default_deck: string[]; avatar_card: string | null }>(
    `UPDATE profiles p SET default_deck=coalesce((SELECT jsonb_agg(card ORDER BY position)
    FROM jsonb_array_elements_text(p.default_deck) WITH ORDINALITY AS d(card,position)
    WHERE EXISTS(SELECT 1 FROM inventory i WHERE i.profile_id=p.id AND i.card_id=d.card AND i.quantity>0)),'[]'::jsonb),
    avatar_card=CASE WHEN EXISTS(SELECT 1 FROM inventory i WHERE i.profile_id=p.id AND i.card_id=p.avatar_card AND i.quantity>0) THEN p.avatar_card ELSE NULL END
    WHERE p.id=$1 AND (
      EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.default_deck) AS d(card)
        WHERE NOT EXISTS(SELECT 1 FROM inventory i WHERE i.profile_id=p.id AND i.card_id=d.card AND i.quantity>0))
      OR (p.avatar_card IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory i WHERE i.profile_id=p.id AND i.card_id=p.avatar_card AND i.quantity>0))
    ) RETURNING default_deck,avatar_card`,
    [profileId],
  );
  return changed;
}
