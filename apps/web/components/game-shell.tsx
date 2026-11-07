'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RetroAudio, type Sound } from '../lib/audio';
import { SessionProvider, AccountMenu } from './session';
import { ServerConnection } from './server-connection';
import { FirstDuelTutorial } from './tutorial';
const AudioContext = createContext<(sound: Sound) => void>(() => {});
export const useGameAudio = () => useContext(AudioContext);
export function GameShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const audio = useRef<RetroAudio | null>(null);
  const musicWanted = useRef(false);
  const [music, setMusic] = useState(false);
  const [sfx, setSfx] = useState(true);
  const [crt, setCrt] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [notice, setNotice] = useState('');
  const getAudio = useCallback(() => {
    if (!audio.current) audio.current = new RetroAudio();
    return audio.current;
  }, []);
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
      const enabled = localStorage.getItem('triad-sfx') !== 'off';
      setSfx(enabled);
      getAudio().setSfx(enabled);
      musicWanted.current = localStorage.getItem('triad-music') === 'on';
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
    <SessionProvider>
      <AudioContext.Provider value={play}>
        <div className={`game-shell ${crt ? 'crt-enabled' : ''}`}>
          <div className="screen-grain" aria-hidden="true" />
          <header className="system-bar">
            <Link href="/" className="system-brand" aria-label="Gacha Triad home">
              GT<span>GACHA TRIAD</span>
            </Link>
            <nav aria-label="Main navigation">
              {[
                { href: '/', label: 'Solo battle' },
                { href: '/cards', label: 'Cards' },
                { href: '/lobbies', label: 'Lobbies' },
                { href: '/collection', label: 'Collection' },
                { href: '/market', label: 'Trades' },
                { href: '/achievements', label: 'Achievements' },
                { href: '/profile', label: 'Profile' },
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
              <AccountMenu />
              <button
                className="server-control"
                onClick={() => window.dispatchEvent(new Event('triad:connection-settings'))}
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
              <button
                className="fullscreen-control"
                aria-label={fullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                onClick={toggleFullscreen}
              >
                ⛶
              </button>
            </div>
          </header>
          <main id="main">
            <ServerConnection>
              {children}
              <FirstDuelTutorial />
            </ServerConnection>
          </main>
          <div className="system-message" role="status">
            {notice}
          </div>
          <div className="crt-overlay" aria-hidden="true" />
        </div>
      </AudioContext.Provider>
    </SessionProvider>
  );
}
