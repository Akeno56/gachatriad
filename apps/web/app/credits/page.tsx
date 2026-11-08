'use client';
import { LocaleView } from '../../components/i18n';
export default function Credits() {
  return (
    <LocaleView>
      <div className="content-page credits-page">
        <div className="eyebrow">THE PEOPLE BEHIND THE CARDS</div>
        <h1>Credits</h1>
        <section className="menu-window">
          <h2>Character artwork & research</h2>
          <p>
            Character portraits, original rarity, elements and tier-list research were imported from
            the locally supplied{' '}
            <a href="https://www.prydwen.gg/" target="_blank" rel="noreferrer">
              Prydwen
            </a>{' '}
            pages. Thank you to Prydwen and its contributors.
          </p>
          <p>
            Epic Seven and Star Savior artwork, original metadata and tier-list research were
            imported from user-supplied{' '}
            <a href="https://www.hideoutgacha.com/" target="_blank" rel="noreferrer">
              Hideout Guides
            </a>{' '}
            pages. Thank you to Hideout Guides and its contributors. Epic Seven’s default PvP tiers
            reflect RTA pick frequency; this is retained as context in our scoring report.
          </p>
          <p>
            Genshin Impact, Honkai: Star Rail and Zenless Zone Zero © HoYoverse. Wuthering Waves ©
            Kuro Games. Arknights: Endfield © HYPERGRYPH / GRYPHLINE. Neverness to Everness © Hotta
            Studio / Perfect World Games. Epic Seven and Star Savior artwork belongs to their
            respective owners. All character artwork belongs to its respective owners.
          </p>
          <p>
            Gacha Triad is an unofficial fan project. Card values and cross-game element conversions
            are our own game balance.
          </p>
        </section>
        <section className="menu-window">
          <h2>Music</h2>
          <p>
            <a href="https://ocremix.org/remix/OCR04441" target="_blank" rel="noreferrer">
              Final Fantasy VIII “Queen of Cards” OC ReMix
            </a>{' '}
            by{' '}
            <a
              href="https://ocremix.org/artist/14064/glacialspoon"
              target="_blank"
              rel="noreferrer"
            >
              GlacialSpoon
            </a>{' '}
            (2023), supplied by the project owner. Original music composed by Nobuo Uematsu, ©
            Square.
          </p>
          <p>
            Battle music: the recording above. Menu music: Final Fantasy VIII “Shuffle or Boogie
            (Ambient Remix) — Hands of Fate,” supplied by the project owner. Original composition by
            Nobuo Uematsu, © Square. The supplied recordings remain intact; playback uses fades and
            end-to-start crossfades. Sound effects are synthesized locally.
          </p>
        </section>
        <section className="menu-window">
          <h2>Rules & inspiration</h2>
          <p>
            Triple Triad originates in Final Fantasy VIII, © Square Enix. Draft and Three Open
            references:{' '}
            <a href="https://na.finalfantasyxiv.com/lodestone/playguide/contentsguide/goldsaucer/tripletriad/">
              Final Fantasy XIV play guide
            </a>
            . Further rule and achievement inspiration:{' '}
            <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=2935597806">
              Steam community guide
            </a>
            . CRT presentation inspiration:{' '}
            <a href="https://triple-triad.jamiepates.com/">Jamie Pates’ Triple Triad</a>.
          </p>
          <p>
            Fonts: Rajdhani and VT323, distributed under the SIL Open Font License. No AI-generated
            character illustrations or backgrounds are used.
          </p>
        </section>
      </div>
    </LocaleView>
  );
}
