'use client';
import { LocaleView, LanguageSelector } from './i18n';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RetroAudio, type Sound, type MusicScene } from '../lib/audio';
import { SessionProvider, AccountMenu } from './session';
import { ServerConnection } from './server-connection';
import { FirstDuelTutorial } from './tutorial';
import { StarterBoosters } from './starter-boosters';
import { useSession } from './session';
import { assetPath } from '../lib/connection';
import { RankedWarning } from './ranked-warning';
import { SocialPanel } from './social-panel';
import { SocialProvider } from './social-state';
import { ActiveBattleReminder } from './active-battle-reminder';
const AudioContext = createContext<(sound: Sound) => void>(() => {});
const MusicSceneContext = createContext<(scene: MusicScene) => void>(() => {});
export const useGameAudio = () => useContext(AudioContext);
export const useMusicScene = () => useContext(MusicSceneContext);
export function GameShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const audio = useRef<RetroAudio | null>(null);
  const musicWanted = useRef(true);
  const [music, setMusic] = useState(true);
  const [musicVolume, setMusicVolume] = useState(50),
    [sfxVolume, setSfxVolume] = useState(50);
  const [sfx, setSfx] = useState(true);
  const [crt, setCrt] = useState(true);
  const [effects, setEffects] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const outside = (e: PointerEvent) => {
      if (!settingsRoot.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [settingsOpen]);
  const getAudio = useCallback(() => {
    if (!audio.current) audio.current = new RetroAudio();
    return audio.current;
  }, []);
  const changeMusicScene = useCallback(
    (scene: MusicScene) => {
      getAudio().setScene(scene);
    },
    [getAudio],
  );
  const play = useCallback(
    (sound: Sound) => {
      try {
        getAudio().play(sound);
      } catch {
        /* Gameplay remains available without Web Audio. */
      }
    },
    [getAudio],
  );
  useEffect(() => {
    try {
      setCrt(localStorage.getItem('triad-crt') !== 'off');
      setEffects(localStorage.getItem('triad-effects') !== 'off');
      const enabled = localStorage.getItem('triad-sfx') !== 'off';
      setSfx(enabled);
      getAudio().setSfx(enabled);
      const readVolume = (key: string) => {
        const saved = localStorage.getItem(key),
          value = saved === null ? 50 : Number(saved);
        return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
      };
      const mv = readVolume('triad-music-volume'),
        sv = readVolume('triad-sfx-volume');
      setMusicVolume(mv);
      setSfxVolume(sv);
      getAudio().setMusicVolume(mv / 100);
      getAudio().setSfxVolume(sv / 100);
      musicWanted.current = localStorage.getItem('triad-music') !== 'off';
      setMusic(musicWanted.current);
    } catch {
      /* Preferences are optional. */
    }
    const visibility = () => audio.current?.setVisible(!document.hidden);
    const fullscreen = () => setFullScreen(!!document.fullscreenElement);
    const unlockMusic = () => {
      if (!musicWanted.current || document.hidden) return;
      try {
        getAudio().setMusic(true);
        document.removeEventListener('pointerdown', unlockMusic, true);
        document.removeEventListener('keydown', unlockMusic, true);
      } catch {
        setNotice('Audio is unavailable in this browser.');
      }
    };
    document.addEventListener('pointerdown', unlockMusic, true);
    document.addEventListener('keydown', unlockMusic, true);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', fullscreen);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreen);
      document.removeEventListener('pointerdown', unlockMusic, true);
      document.removeEventListener('keydown', unlockMusic, true);
      audio.current?.dispose();
      audio.current = null;
    };
  }, [getAudio]);
  function toggleMusic() {
    const enabled = !music;
    musicWanted.current = enabled;
    setMusic(enabled);
    try {
      localStorage.setItem('triad-music', enabled ? 'on' : 'off');
    } catch {}
    try {
      getAudio().setMusic(enabled);
    } catch {
      setNotice('Audio is unavailable in this browser.');
    }
  }
  function toggleSfx() {
    const enabled = !sfx;
    getAudio().setSfx(enabled);
    setSfx(enabled);
    if (enabled) play('menu');
    try {
      localStorage.setItem('triad-sfx', enabled ? 'on' : 'off');
    } catch {}
  }
  function toggleCrt() {
    setCrt(!crt);
    try {
      localStorage.setItem('triad-crt', crt ? 'off' : 'on');
    } catch {}
    play('menu');
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice('Fullscreen is unavailable. You can still play in this window.');
    }
  }
  return (
    <LocaleView>
      <SessionProvider>
        <AudioContext.Provider value={play}>
          <MusicSceneContext.Provider value={changeMusicScene}>
            <div
              className={`game-shell ${crt ? 'crt-enabled' : ''} ${effects ? 'effects-animated' : ''}`}
            >
              <a className="skip-link" href="#main">
                Skip to content
              </a>
              <div className="screen-grain" aria-hidden="true" />
              <header className="system-bar">
                <Link href="/" className="system-brand" aria-label="Gacha Triad home">
                  <img
                    src={assetPath('/assets/ui/triad-logo.webp')}
                    alt="Gacha Triad"
                    draggable={false}
                  />
                </Link>
                <nav aria-label="Main navigation">
                  {[
                    { href: '/', label: 'Play' },
                    { href: '/cards', label: 'Cards' },
                    { href: '/lobbies', label: 'Lobbies' },
                    { href: '/collection', label: 'Collection' },
                    { href: '/market', label: 'Trades' },
                    { href: '/boosters', label: 'Boosters' },
                    { href: '/ladder', label: 'Ladder' },
                    { href: '/rules', label: 'Rulebook' },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={pathname === item.href ? 'page' : undefined}
                      onClick={() => play('menu')}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div className="system-controls">
                  <nav className="player-navigation" aria-label="Player navigation">
                    {[
                      { href: '/profile', label: 'Profile' },
                      { href: '/achievements', label: 'Achievements' },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={pathname === item.href ? 'page' : undefined}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                  <Wallet />
                  <LanguageSelector />
                  <AccountMenu />
                </div>
              </header>
              <div ref={settingsRoot} className="settings-dock">
                <button
                  className="outline-button settings-cog"
                  aria-label="Game settings"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
                    <path
                      d="m9 2-.6 2.4-2 .9-2.3-.7-2 3.5L4 9.7v2.6l-1.9 1.6 2 3.5 2.3-.7 2 .9L9 20h4l.6-2.4 2-.9 2.3.7 2-3.5-1.9-1.6V9.7l1.9-1.6-2-3.5-2.3.7-2-.9L13 2Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx="11"
                      cy="11"
                      r="3.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
                {settingsOpen && (
                  <aside
                    className="menu-window settings-panel"
                    role="dialog"
                    aria-label="Game settings"
                  >
                    <div className="settings-heading">
                      <h2>Settings</h2>
                      <button
                        className="text-button"
                        onClick={() => setSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        ×
                      </button>
                    </div>
                    <div className="settings-buttons">
                      {' '}
                      <button
                        className="server-control"
                        onClick={() => {
                          setSettingsOpen(false);
                          window.dispatchEvent(new Event('triad:connection-settings'));
                        }}
                      >
                        Server
                      </button>
                      <button
                        aria-label={`Music ${music ? 'on' : 'off'}`}
                        aria-pressed={music}
                        onClick={toggleMusic}
                      >
                        ♫ <span>MUSIC</span> {music ? 'ON' : 'OFF'}
                      </button>
                      <button
                        aria-label={`Sound effects ${sfx ? 'on' : 'off'}`}
                        aria-pressed={sfx}
                        onClick={toggleSfx}
                      >
                        ♪ <span>SFX</span> {sfx ? 'ON' : 'OFF'}
                      </button>
                      <button
                        aria-label={`CRT filter ${crt ? 'on' : 'off'}`}
                        aria-pressed={crt}
                        onClick={toggleCrt}
                      >
                        <span>CRT</span> {crt ? 'ON' : 'OFF'}
                      </button>
                      <div className="volume-controls">
                        <h3>Volume &amp; effects</h3>
                        <div className="menu-window volume-panel">
                          <label className="effects-setting">
                            <input
                              type="checkbox"
                              checked={effects}
                              onChange={(e) => {
                                setEffects(e.target.checked);
                                try {
                                  localStorage.setItem(
                                    'triad-effects',
                                    e.target.checked ? 'on' : 'off',
                                  );
                                } catch {}
                              }}
                            />
                            Animate Holo &amp; CRT
                          </label>
                          <label>
                            Music volume <output>{musicVolume}%</output>
                            <input
                              aria-label="Music volume"
                              type="range"
                              min="0"
                              max="100"
                              value={musicVolume}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setMusicVolume(value);
                                getAudio().setMusicVolume(value / 100);
                                try {
                                  localStorage.setItem('triad-music-volume', String(value));
                                } catch {}
                              }}
                            />
                          </label>
                          <label>
                            Sound effects volume <output>{sfxVolume}%</output>
                            <input
                              aria-label="Sound effects volume"
                              type="range"
                              min="0"
                              max="100"
                              value={sfxVolume}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setSfxVolume(value);
                                getAudio().setSfxVolume(value / 100);
                                try {
                                  localStorage.setItem('triad-sfx-volume', String(value));
                                } catch {}
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <button
                        className="fullscreen-control"
                        aria-label={fullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                        onClick={toggleFullscreen}
                      >
                        ⛶
                      </button>
                    </div>
                  </aside>
                )}
              </div>
              <main id="main">
                <ServerConnection>
                  <SocialProvider>
                    <StarterBoosters />
                    {children}
                    <FirstDuelTutorial />
                    <RankedWarning />
                    <ActiveBattleReminder />
                    <SocialPanel />
                  </SocialProvider>
                </ServerConnection>
              </main>
              <div className="system-message" role="status">
                {notice}
              </div>
              <div className="crt-overlay" aria-hidden="true" />
            </div>
          </MusicSceneContext.Provider>
        </AudioContext.Provider>
      </SessionProvider>
    </LocaleView>
  );
}
function Wallet() {
  const { profile } = useSession();
  return profile ? (
    <Link className="wallet" href="/boosters" aria-label={`${profile.prisms} Stellar Prisms`}>
      ◇ {profile.prisms}
    </Link>
  ) : null;
}
