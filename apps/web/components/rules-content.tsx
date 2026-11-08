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
            <h2>Five cards. Nine spaces.</h2>
            <p>
              You and your opponent each start with five cards. Take turns placing one card in any
              empty cell. A randomly chosen player goes first.
            </p>
          </div>
        </div>
        <div className="rule-intro">
          <span className="step-number">02</span>
          <div>
            <h2>Higher numbers capture.</h2>
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
            <h2>Control the board. Count your hand.</h2>
            <p>
              The match ends after nine placements. Every card you control counts for one point,
              including the unplayed card in hand. The scores always add up to 10. More points wins;
              5–5 is a draw.
            </p>
          </div>
        </div>
        <h2 className="special-heading">Change the rules. Change your strategy.</h2>
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
          Same and Plus are evaluated together before captures. Special captures resolve first, then
          ordinary captures from the placed card, then combo chains. The practice presets enable
          Combo with Same and Plus.
        </p>
        <h2 className="special-heading">Choose your table.</h2>
        <article className="elemental-rule">
          <h3>Elemental</h3>
          <p>
            Marked cells match one of eight elements. A matching card gains +1 on every side; a
            different element or no affinity loses 1. Neutral cells do nothing. Same, Plus, ordinary
            and Combo comparisons all use the adjusted values displayed on the cards. Board cards
            display their adjusted values. Cell and card icons show each element, with a +1 or −1
            badge for the active modifier.
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
              Three Open, Same, Plus and Combo. No card trade. Use Play unranked or join its queue
              in the lobby list.
            </p>
          </article>
          <article>
            <h3>Ranked</h3>
            <p>
              Closed hands, Same, Plus, Combo and Trade One. The winner selects one card from the
              loser’s original five-card deck, including its unplayed card. A draw trades nothing.
              Forfeiting still loses a card.
            </p>
          </article>
          <article>
            <h3>Draft</h3>
            <p>
              A separate rated queue. Three temporary five-card boosters open automatically, one at
              a time. Each contains three random cards, one guaranteed 3★+ and one guaranteed 4★+,
              with a 5% Holo chance per card. Choose five of the 15 cards before the three-minute
              draft deadline. Up to one 5★ and one 4★, or two 4★ without a 5★. Three Open, Same,
              Plus and Combo; no trade. Unlocked picks are completed automatically at timeout. These
              cards never enter your collection.
            </p>
          </article>
          <article>
            <h3>Roulette & custom</h3>
            <p>
              Roulette has its own queue and draws a compatible set of rules at match start. Custom
              tables combine visibility, Same, Plus and Random. Random draws a legal deck from your
              available owned cards. Custom tables appear together in the filterable lobby list.
            </p>
          </article>
        </div>
        <p className="rule-note">
          Online turns last 60 seconds. A missed turn plays automatically; three missed turns
          forfeit. Trade One selection lasts two minutes, then a losing card is chosen
          automatically. A deck contains five different cards: at most one 5★ and one 4★, or two 4★
          if it has no 5★. Local bots are clearly labeled [BOT] and use the same rules and inventory
          transfers.
        </p>
      </div>
    </LocaleView>
  );
}
