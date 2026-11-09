import Link from 'next/link';
import { LocaleView } from '../../components/i18n';
export default function Privacy() {
  return (
    <LocaleView>
      <article className="content-page privacy-page">
        <h1>Playtest privacy</h1>
        <p>
          Gacha Triad stores your account, collection, currency, matches, chat messages, friends and
          playtest reports so the game can work across sessions.
        </p>
        <h2>Signing in</h2>
        <p>
          Email/password accounts store a password hash. Google and Discord sign-in share a provider
          identifier and basic profile information with the game. The game never receives your
          Google or Discord password. Provider access tokens are encrypted in server storage.
        </p>
        <h2>Network information</h2>
        <p>
          Registered-account IP addresses are recorded for the one-account-per-network rule and
          abuse investigations. They are visible only to administrators. Feedback rate limits use a
          protected network hash.
        </p>
        <h2>Public and private information</h2>
        <p>
          Your player profile, rating and public chat are visible to other players. Private and
          battle chats are available to their participants. Server administrators can moderate the
          game and review reported problems. Feedback reports and admin notes are not public.
        </p>
        <h2>Reports and diagnostics</h2>
        <p>
          Reports contain the text you send. Optional diagnostics include the page, game version,
          browser, recent request timings and audio loading state. Passwords, session tokens and
          form contents are not collected in these diagnostics.
        </p>
        <h2>Account deletion</h2>
        <p>
          Use Feedback / Report a bug to contact the server operator about your data or request
          account deletion. Unused guest accounts expire after seven days. Deletion removes private
          account data; completed duels and trades may retain an anonymized player reference. Server
          backups follow the operator’s backup retention schedule.
        </p>
        <Link className="outline-button" href="/">
          Back to game
        </Link>
      </article>
    </LocaleView>
  );
}
