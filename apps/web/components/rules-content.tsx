import { LocaleView } from './i18n';
import { RuleAnimation } from './rule-animation';
import { VisibilityExample } from './visibility-example';
export function RulesContent() {
  return (
    <LocaleView>
      <div className="rules-content">
        <div className="rule-intro">
          <span className="step-number">01</span>
          <div>
            <h2>Taking turns</h2>
            <p>
              You and your opponent each start with five cards. Take turns placing one card in any
              empty cell. A randomly chosen player goes first.
            </p>
          </div>
        </div>
        <div className="rule-intro">
          <span className="step-number">02</span>
          <div>
            <h2>Capturing cards</h2>
            <p>
              Each card has a top, right, bottom, and left value. When you place a card, its sides
              challenge the touching sides of adjacent cards. A strictly higher value captures an
              enemy card. Equal values do not capture under the basic rules. A means 10.
            </p>
            <div className="capture-example">
              <span className="example-card mint">
                YOUR CARD <b>7 →</b>
              </span>
              <span className="example-versus">beats</span>
              <span className="example-card rose">
                <b>← 4</b> OPPONENT
              </span>
            </div>
          </div>
        </div>
        <div className="rule-intro">
          <span className="step-number">03</span>
          <div>
            <h2>Scoring</h2>
            <p>
              The match ends after nine placements. Every card you control counts for one point,
              including the unplayed card in hand. The scores always add up to 10. More points wins;
              5–5 is a draw.
            </p>
          </div>
        </div>
        <h2 className="special-heading">Rules</h2>
        <div className="rule-grid">
          <article>
            <span className="rule-icon">◎</span>
            <h3>All Open</h3>
            <p>
              Both five-card hands are visible. Closed hands hide unplayed cards; Three Open reveals
              three randomly chosen cards in each hand at the start and keeps the other two hidden.
            </p>
            <VisibilityExample />
          </article>
          <article>
            <span className="rule-icon">＝</span>
            <h3>Same</h3>
            <p>
              Match the touching values on at least two adjacent cards to capture the matching enemy
              cards. Friendly cards can help make the match.
            </p>
            <small>Example: 4 meets 4, and 7 meets 7.</small>
            <RuleAnimation rule="same" />
          </article>
          <article>
            <span className="rule-icon">＋</span>
            <h3>Plus</h3>
            <p>
              Add each touching pair. If at least two pairs have equal sums, capture the matching
              enemy cards. Friendly cards count here, too.
            </p>
            <small>Example: 3 + 6 = 5 + 4.</small>
            <RuleAnimation rule="plus" />
          </article>
          <article>
            <span className="rule-icon">⤳</span>
            <h3>Combo</h3>
            <p>
              Cards captured by Same or Plus attack adjacent enemy cards using the normal
              higher-value rule. Each new combo capture can continue the chain. Ordinary captures do
              not start combos.
            </p>
            <RuleAnimation rule="combo" />
          </article>
        </div>
        <p className="rule-note">
          Same and Plus check the board before any cards change ownership. Special captures resolve
          first, then ordinary captures, then Combo chains.
        </p>
        <h2 className="special-heading">Modes and card transfers</h2>
        <article className="elemental-rule">
          <h3>Elemental</h3>
          <p>
            Marked cells match one of eight elements. A matching card gains +1 on every side; a
            different element or no affinity loses 1. Neutral cells do nothing. Same, Plus, ordinary
            and Combo comparisons all use the adjusted values displayed on the cards. Cell and card
            icons show each element, with a +1 or −1 badge for the active modifier.
          </p>
        </article>
        <p className="rule-note">
          Custom Trade One requires Closed visibility with Same, Plus and Combo enabled. Extra rules
          may be added.
        </p>
        <div className="rule-grid">
          <article>
            <h3>Unranked</h3>
            <p>
              Three Open, Same, Plus and Combo. No card trade or rating change. Start matchmaking
              from Play; you can meet another player or a populated bot.
            </p>
          </article>
          <article>
            <h3>Ranked</h3>
            <p>
              Closed hands, Same, Plus, Combo and Trade One. The winner selects one card from the
              loser’s original five-card deck, including its unplayed card. A draw trades nothing.
              Forfeiting still loses a card.
            </p>
            <p>
              The queue searches for humans. While waiting, you can choose a practice bot. Practice
              games never change Elo.
            </p>
          </article>
          <article>
            <h3>Draft</h3>
            <p>
              Three temporary boosters open automatically. Each contains three random cards, one 3★+
              and one 4★+, with 5% Holo per card. Choose five of the fifteen cards within three
              minutes; remaining picks are completed automatically at the deadline. Three Open,
              Same, Plus and Combo; no trade. These cards never enter your collection.
            </p>
            <p>
              The queue searches for humans. While waiting, you can choose a practice bot. Practice
              games never change Elo.
            </p>
          </article>
          <article>
            <h3>Roulette & custom</h3>
            <p>
              Roulette has its own queue and draws a compatible set of rules at match start. Custom
              tables combine visibility, Same, Plus, Combo, Elemental and Random. Random draws a
              legal deck from your available owned cards. Custom tables appear together in the
              filterable lobby list.
            </p>
          </article>
        </div>
        <h2 className="special-heading">Decks and timers</h2>
        <ul className="rule-checklist">
          <li>
            A deck contains five different characters: at most one 5★ and one 4★, or two 4★ without
            a 5★.
          </li>
          <li>
            Each Holographic copy has one permanent +1 side bonus, assigned when acquired. No side
            can exceed A.
          </li>
          <li>
            Turns last 60 seconds. Your first missed turn auto-plays a card. Miss your next turn too
            and you forfeit. A manual move resets this warning.
          </li>
          <li>
            Disconnecting for 120 seconds forfeits. During Draft, 120 seconds without revealing or
            choosing cards also forfeits.
          </li>
          <li>
            Trade One selection lasts two minutes. If the winner does not choose, a losing card is
            selected automatically. Both players must wait for this transfer before another match.
          </li>
        </ul>
        <p className="rule-note">
          Ranked and Draft use separate Season 0 ratings. Only games between human players change
          Elo. Practice bots are labeled [BOT].
        </p>
      </div>
    </LocaleView>
  );
}
