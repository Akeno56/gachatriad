'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_CARDS, SIDE_NAMES } from '@gacha-triad/shared';
import type { ProfileView } from '@gacha-triad/shared/platform';
import {
  ASTRAL_REWARDS,
  COSMETIC_STYLES,
  type CustomizationView,
  type ProfileCustomization,
  type PortraitFrame,
  type FeaturedMode,
} from '@gacha-triad/shared/customization';
import { api, ApiError } from '../lib/platform';
import { Button, GameDialog, Tabs } from './ui';
import { Avatar } from './avatar';
import { AstralCrestEffects } from './astral-crest-effects';
import { ProfileCardPicker } from './profile-card-picker';
import { AppearanceChoices } from './appearance-settings';
import { LocaleView, NoTranslate } from './i18n';
import { useSession } from './session';
const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));
const comparable = (settings: ProfileCustomization) =>
  JSON.stringify({
    ...settings,
    featuredCards: settings.featuredCards.filter(Boolean),
    featuredAchievements: settings.featuredAchievements.filter(Boolean),
  });
export function ProfileEditor({
  profile,
  initialTab = 'identity',
  onClose,
  onSaved,
}: {
  profile: ProfileView;
  initialTab?: 'identity' | 'frames' | 'banners';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { refreshProfile } = useSession();
  const [data, setData] = useState<CustomizationView | null>(null),
    [draft, setDraft] = useState<ProfileCustomization | null>(null),
    [tab, setTab] = useState<string>(initialTab),
    [previewCrest, setPreviewCrest] = useState(false),
    [previewFrameMotion, setPreviewFrameMotion] = useState(false),
    [cardPicker, setCardPicker] = useState<'portrait' | number | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(false),
    [discard, setDiscard] = useState<'close' | 'reload' | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null),
    confirm = useRef<HTMLHeadingElement>(null),
    pickerTrigger = useRef<HTMLButtonElement>(null),
    lock = useRef(false);
  useEffect(() => {
    let active = true;
    setError('');
    void api<CustomizationView>('/profile/customization')
      .then((v) => {
        if (active) {
          setData(v);
          setDraft(v.settings);
          setReload(false);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [profile.id, loadRevision]);
  const dirty = !!draft && !!data && comparable(draft) !== comparable(data.settings);
  const showCrestPreview = tab === 'banners' && previewCrest;
  const showFramePreview = tab === 'frames' && previewFrameMotion;
  const previewBanner = showCrestPreview ? ASTRAL_REWARDS.banner.id : draft?.bannerId;
  const previewFrame = showFramePreview ? ASTRAL_REWARDS.frame.id : draft?.frameId;
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  const owned = useMemo(
    () =>
      ALL_CARDS.filter((c) => (profile.inventory[c.id]?.quantity ?? 0) > 0).sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      ),
    [profile.inventory],
  );
  function field<K extends keyof ProfileCustomization>(key: K, value: ProfileCustomization[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  function slot(key: 'featuredCards' | 'featuredAchievements', index: number, value: string) {
    if (!draft) return;
    const values = Array.from({ length: 3 }, (_, i) => draft[key][i] ?? '');
    values[index] = value;
    field(key, values);
  }
  async function save() {
    if (!draft || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/profile/customization', {
        ...draft,
        featuredCards: draft.featuredCards.filter(Boolean),
        featuredAchievements: draft.featuredAchievements.filter(Boolean),
      });
      await refreshProfile();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setReload(e instanceof ApiError && e.status === 409);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (!busy) {
      if (dirty) setDiscard('close');
      else onClose();
    }
  }
  function openCardPicker(target: 'portrait' | number, trigger: HTMLButtonElement) {
    pickerTrigger.current = trigger;
    setCardPicker(target);
  }
  function closeCardPicker() {
    setCardPicker(null);
    requestAnimationFrame(() => pickerTrigger.current?.focus({ preventScroll: true }));
  }
  const card = draft?.avatarCardId ? byId.get(draft.avatarCardId) : null;
  const showcaseSlot = typeof cardPicker === 'number' ? cardPicker : null;
  const tabs = [
    { value: 'identity', label: 'Identity' },
    { value: 'showcases', label: 'Showcases' },
    { value: 'frames', label: 'Portrait frames' },
    ...(data?.settings.bannerId ? [{ value: 'banners', label: 'Banners' }] : []),
  ];
  return (
    <LocaleView>
      <GameDialog
        open
        onClose={close}
        labelledBy="profile-editor-title"
        className="profile-customizer"
        initialFocus={heading}
        dismissible={!busy}
      >
        <header className="customizer-heading">
          <h2 id="profile-editor-title" ref={heading} tabIndex={-1}>
            Customize profile
          </h2>
        </header>
        <Tabs
          label="Profile settings"
          value={tab}
          onChange={setTab}
          panelId="profile-editor-panel"
          items={tabs}
        />
        {error && (
          <div className="customizer-error" role="alert">
            {error}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => (dirty ? setDiscard('reload') : setLoadRevision((n) => n + 1))}
            >
              {reload ? 'Reload saved profile' : 'Try again'}
            </Button>
          </div>
        )}
        {!data || !draft ? (
          <p role="status">Loading profile settings…</p>
        ) : (
          <>
            <div
              className={`customizer-layout tab-${tab}`}
              data-astral-motion={showCrestPreview || showFramePreview || undefined}
            >
              <div
                id="profile-editor-panel"
                role="tabpanel"
                aria-label={tabs.find(({ value }) => value === tab)?.label}
              >
                {tab === 'identity' && (
                  <div className="identity-fields">
                    <div className="profile-card-field">
                      <span>Profile card</span>
                      <button
                        type="button"
                        className="outline-button profile-card-trigger"
                        aria-label="Choose profile card"
                        aria-haspopup="dialog"
                        disabled={busy}
                        onClick={(event) => openCardPicker('portrait', event.currentTarget)}
                      >
                        <Avatar card={card} name={profile.name} decorative />
                        <span>
                          {card ? <NoTranslate>{card.name}</NoTranslate> : 'Default emblem'}
                          {card?.finish === 'holo' && (
                            <small>{`· Holo +1 ${SIDE_NAMES[card.holoBonusSide ?? 0]}`}</small>
                          )}
                        </span>
                        <span aria-hidden="true">▸</span>
                      </button>
                    </div>
                    <label>
                      Equipped title
                      <select
                        name="profile-title"
                        value={draft.titleId ?? ''}
                        disabled={busy}
                        onChange={(e) => field('titleId', e.target.value || null)}
                      >
                        <option value="">No title</option>
                        {data.titles
                          .filter((t) => t.unlocked)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="bio-field">
                      Bio
                      <textarea
                        name="profile-bio"
                        aria-label="Bio"
                        rows={3}
                        maxLength={320}
                        value={draft.bio}
                        disabled={busy}
                        aria-describedby="bio-counter"
                        onChange={(e) =>
                          field('bio', Array.from(e.target.value).slice(0, 160).join(''))
                        }
                      />
                      <small id="bio-counter">{Array.from(draft.bio).length}/160</small>
                    </label>
                    <label>
                      Featured format
                      <select
                        name="featured-mode"
                        value={draft.featuredMode}
                        disabled={busy}
                        onChange={(e) => field('featuredMode', e.target.value as FeaturedMode)}
                      >
                        <option value="ranked">Ranked</option>
                        <option value="ranked-random">Ranked Random</option>
                        <option value="draft">Draft</option>
                        <option value="shared-draft">Shared Draft</option>
                      </select>
                    </label>
                  </div>
                )}
                {tab === 'showcases' && (
                  <div className="showcase-fields">
                    <fieldset>
                      <legend>Card showcase</legend>
                      {[0, 1, 2].map((index) => {
                        const featured = byId.get(draft.featuredCards[index]);
                        const label = `Showcase card ${index + 1}`;
                        return (
                          <div className="profile-card-field" key={index}>
                            <span>{label}</span>
                            <button
                              type="button"
                              className="outline-button profile-card-trigger"
                              aria-label={label}
                              aria-haspopup="dialog"
                              disabled={busy}
                              onClick={(event) => openCardPicker(index, event.currentTarget)}
                            >
                              {featured ? (
                                <Avatar card={featured} name={featured.name} decorative />
                              ) : (
                                <span className="showcase-card-empty" aria-hidden="true">
                                  +
                                </span>
                              )}
                              <span>
                                {featured ? <NoTranslate>{featured.name}</NoTranslate> : 'None'}
                                {featured?.finish === 'holo' && (
                                  <small>{`· Holo +1 ${SIDE_NAMES[featured.holoBonusSide ?? 0]}`}</small>
                                )}
                              </span>
                              <span aria-hidden="true">▸</span>
                            </button>
                          </div>
                        );
                      })}
                    </fieldset>
                    <fieldset>
                      <legend>Achievement showcase</legend>
                      {[0, 1, 2].map((i) => (
                        <label key={i}>
                          {`Showcase achievement ${i + 1}`}
                          <select
                            name={`showcase-achievement-${i}`}
                            value={draft.featuredAchievements[i] ?? ''}
                            disabled={busy}
                            onChange={(e) => slot('featuredAchievements', i, e.target.value)}
                          >
                            <option value="">None</option>
                            {data.achievements
                              .filter(
                                (a) =>
                                  !draft.featuredAchievements.includes(a.id) ||
                                  draft.featuredAchievements[i] === a.id,
                              )
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    </fieldset>
                  </div>
                )}
                {tab === 'frames' && (
                  <div className="frame-picker" role="group" aria-label="Portrait frames">
                    {data.frames.some((frame) => frame.id === ASTRAL_REWARDS.frame.id) && (
                      <Button
                        className="astral-frame-preview-button"
                        aria-pressed={previewFrameMotion}
                        disabled={busy}
                        onClick={() => setPreviewFrameMotion((active) => !active)}
                      >
                        Play Astral frame animation
                      </Button>
                    )}
                    {data.frames.map((frame) => (
                      <button
                        type="button"
                        key={frame.id}
                        className={`frame-choice ${draft.frameId === frame.id ? 'is-selected' : ''} ${frame.unlocked ? '' : 'is-locked'}`}
                        aria-label={`${frame.name} portrait frame`}
                        aria-describedby={`frame-requirement-${frame.id}`}
                        aria-pressed={draft.frameId === frame.id}
                        aria-disabled={!frame.unlocked || busy}
                        onClick={() => {
                          if (frame.unlocked && !busy) {
                            setPreviewFrameMotion(false);
                            field('frameId', frame.id as PortraitFrame);
                          }
                        }}
                      >
                        <Avatar card={card} name={profile.name} frameId={frame.id} />
                        <strong>{frame.name}</strong>
                        <span>
                          {frame.unlocked
                            ? draft.frameId === frame.id
                              ? 'Selected'
                              : 'Unlocked'
                            : 'Locked'}
                        </span>
                        <small id={`frame-requirement-${frame.id}`}>{frame.requirement}</small>
                      </button>
                    ))}
                  </div>
                )}
                {tab === 'banners' && draft.bannerId && (
                  <>
                    <AppearanceChoices
                      label="Profile banner"
                      name="profile-banner"
                      choices={data.banners ?? COSMETIC_STYLES}
                      value={draft.bannerId}
                      disabled={busy}
                      onChange={(style) => {
                        setPreviewCrest(false);
                        field('bannerId', style);
                      }}
                      preview={(style) => (
                        <span
                          className="appearance-banner-preview"
                          data-profile-banner={style}
                          aria-hidden="true"
                        >
                          <AstralCrestEffects bannerId={style} />
                        </span>
                      )}
                    />
                    {data.banners?.some(
                      (banner) => banner.id === ASTRAL_REWARDS.banner.id && !banner.unlocked,
                    ) && (
                      <p className="cosmetic-requirement">{ASTRAL_REWARDS.banner.requirement}</p>
                    )}
                    {data.banners?.some((banner) => banner.id === ASTRAL_REWARDS.banner.id) && (
                      <Button
                        aria-pressed={previewCrest}
                        disabled={busy}
                        onClick={() => setPreviewCrest((active) => !active)}
                      >
                        Play Astral Crest animation
                      </Button>
                    )}
                  </>
                )}
              </div>
              <aside
                className="menu-window profile-editor-preview"
                aria-label="Profile preview"
                data-profile-banner={previewBanner}
              >
                <AstralCrestEffects bannerId={previewBanner} />
                <span className="profile-preview-label">Preview</span>
                <Avatar card={card} name={profile.name} frameId={previewFrame} />
                <h3>
                  <NoTranslate>{profile.name}</NoTranslate>
                </h3>
                {draft.titleId && (
                  <p className="profile-title">
                    {data.titles.find((t) => t.id === draft.titleId)?.name}
                  </p>
                )}
                {draft.bio && (
                  <p className="profile-bio">
                    <NoTranslate>{draft.bio}</NoTranslate>
                  </p>
                )}
                {draft.featuredCards.some(Boolean) && (
                  <div className="preview-showcase">
                    {draft.featuredCards.filter(Boolean).map((id) => (
                      <Avatar key={id} card={byId.get(id)} name={byId.get(id)?.name ?? ''} />
                    ))}
                  </div>
                )}
              </aside>
            </div>
            <footer className="customizer-footer">
              <Button variant="ghost" disabled={busy} onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" busy={busy} disabled={!dirty} onClick={() => void save()}>
                Save profile
              </Button>
            </footer>
          </>
        )}
      </GameDialog>
      {cardPicker !== null && draft && (
        <ProfileCardPicker
          variant={showcaseSlot === null ? 'portrait' : 'showcase'}
          cards={
            showcaseSlot === null
              ? owned
              : owned.filter(
                  (card) =>
                    !draft.featuredCards.includes(card.id) ||
                    draft.featuredCards[showcaseSlot] === card.id,
                )
          }
          selected={
            showcaseSlot === null ? draft.avatarCardId : draft.featuredCards[showcaseSlot] || null
          }
          onChoose={(id) => {
            if (showcaseSlot === null) field('avatarCardId', id);
            else slot('featuredCards', showcaseSlot, id ?? '');
            closeCardPicker();
          }}
          onClose={closeCardPicker}
        />
      )}
      <GameDialog
        open={!!discard}
        onClose={() => setDiscard(null)}
        labelledBy="profile-discard-title"
        className="profile-discard-dialog"
        initialFocus={confirm}
      >
        <h2 ref={confirm} id="profile-discard-title" tabIndex={-1}>
          Unsaved profile changes
        </h2>
        <div className="result-actions">
          <Button onClick={() => setDiscard(null)}>Keep editing</Button>
          <Button
            variant="primary"
            onClick={() => {
              const target = discard;
              setDiscard(null);
              if (target === 'close') onClose();
              else setLoadRevision((n) => n + 1);
            }}
          >
            Discard changes
          </Button>
        </div>
      </GameDialog>
    </LocaleView>
  );
}
