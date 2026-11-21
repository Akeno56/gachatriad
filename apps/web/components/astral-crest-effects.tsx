import { ASTRAL_REWARDS, type ProfileBanner } from '@gacha-triad/shared/customization';

export function AstralCrestEffects({ bannerId }: { bannerId?: ProfileBanner }) {
  if (bannerId !== ASTRAL_REWARDS.banner.id) return null;
  return (
    <span className="astral-crest-effects" aria-hidden="true">
      <span className="astral-crest-ray" />
      <span className="astral-crest-comet" />
      <span className="astral-crest-comet" />
    </span>
  );
}
