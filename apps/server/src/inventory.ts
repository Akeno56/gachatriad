import type { Sql } from './database';
/** Remove an exact finish from the saved deck only when its last owned copy is gone. */
export async function pruneDeck(sql: Sql, profileId: string) {
  await sql(
    `UPDATE profiles p SET default_deck=coalesce((SELECT jsonb_agg(card ORDER BY position)
    FROM jsonb_array_elements_text(p.default_deck) WITH ORDINALITY AS d(card,position)
    WHERE EXISTS(SELECT 1 FROM inventory i WHERE i.profile_id=p.id AND i.card_id=d.card AND i.quantity>0)),'[]'::jsonb),
    avatar_card=CASE WHEN EXISTS(SELECT 1 FROM inventory i WHERE i.profile_id=p.id AND i.card_id=p.avatar_card AND i.quantity>0) THEN p.avatar_card ELSE NULL END WHERE p.id=$1`,
    [profileId],
  );
}
