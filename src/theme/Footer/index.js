import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

const SOCIAL_LINKS = [
  {
    id: 'slack',
    label: 'Slack',
    href: 'https://fibegg.slack.com',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52ZM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313ZM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834ZM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312ZM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834ZM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312ZM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52ZM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313Z" />
      </svg>
    ),
  },
  {
    id: 'buttondown',
    label: 'Newsletter (Buttondown)',
    href: 'https://buttondown.com/Fibe',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4.236-8 4.764-8-4.764V6h16zm0 9.764H4V10.6l8 4.764 8-4.764z" />
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'GitHub',
    href: 'https://github.com/fibegg',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12Z" />
      </svg>
    ),
  },
  {
    id: 'rumble',
    label: 'Rumble',
    href: 'https://rumble.com/user/fibegg',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M12.005 0C5.378 0 0 5.378 0 12.005 0 18.633 5.378 24 12.005 24 18.633 24 24 18.633 24 12.005 24 5.378 18.633 0 12.005 0Zm-1.36 6.295 6.4 3.71c1.226.71 1.226 2.46 0 3.17l-6.4 3.71c-1.23.715-2.77-.16-2.77-1.585V7.88c0-1.425 1.54-2.3 2.77-1.585Z" />
      </svg>
    ),
  },
  {
    id: 'nostr',
    label: 'Nostr · Yakihonne',
    href: 'https://yakihonne.com/profile/nprofile1qqs25g4up29vzql954hkr2nn582rl674p32kks43chvdwdzv9w2lq6sh8zynj',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm-2.43 6.18c2.05 0 3.7 1.65 3.7 3.7v.36h2.06c.65 0 1.18.53 1.18 1.18v6.6h-2v-6h-1.24v.76c0 1.05-.36 1.93-1.04 2.55-.68.62-1.55.94-2.6.94-.45 0-.86-.06-1.23-.18v2.13h-2V9.88c0-2.05 1.65-3.7 3.17-3.7Zm.02 2c-.92 0-1.67.74-1.67 1.66v3.34c.37.27.84.43 1.43.43.58 0 1.05-.16 1.4-.46.34-.3.51-.7.51-1.2v-2.1c0-.92-.75-1.67-1.67-1.67Z" />
      </svg>
    ),
  },
  {
    id: 'email',
    label: 'Email',
    href: 'mailto:support@fibe.gg',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.73 0 3.41-.43 4.89-1.24l-.74-1.36c-1.27.69-2.69 1.05-4.15 1.05-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8v.86c0 .69-.62 1.39-1.31 1.39-.69 0-1.19-.7-1.19-1.39V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.5V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
      </svg>
    ),
  },
];

const LEGAL_LINKS = [
  {label: 'Terms of Service', href: 'https://tos.fibe.gg/'},
  {label: 'Privacy Policy', href: 'https://privacy.fibe.gg/'},
];

const FAMILY_LINKS = [
  {name: 'fibe.gg', href: 'https://fibe.gg/'},
  {name: 'why', href: 'https://why.fibe.gg/'},
  {name: 'where', href: 'https://where.fibe.gg/'},
  {name: 'when', href: 'https://when.fibe.gg/'},
  {name: 'whats', href: 'https://whats.fibe.gg/'},
  {name: 'faq', href: 'https://faq.fibe.gg/'},
  {name: 'blog', href: 'https://blog.fibe.gg/', current: true},
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={`footer footer--dark ${styles.footer}`} role="contentinfo">
      <div className={`container ${styles.inner}`}>
        <nav className={styles.family} aria-label="The Fibe family of sites">
          {FAMILY_LINKS.map((link, i) => (
            <React.Fragment key={link.name}>
              {i > 0 && (
                <span className={styles.familySep} aria-hidden="true">·</span>
              )}
              <Link
                href={link.href}
                className={styles.familyLink}
                aria-current={link.current ? 'page' : undefined}
                rel={link.current ? undefined : 'noopener'}
              >
                {link.name}
              </Link>
            </React.Fragment>
          ))}
        </nav>

        <nav className={styles.socialRow} aria-label="Fibe on social platforms">
          {SOCIAL_LINKS.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className={styles.socialIcon}
              aria-label={`Fibe on ${link.label}`}
              title={link.label}
              target={link.href.startsWith('http') ? '_blank' : undefined}
              rel={link.href.startsWith('http') ? 'me noopener noreferrer' : undefined}
            >
              {link.icon}
            </Link>
          ))}
        </nav>

        <div className={styles.support} role="note">
          <span className={styles.flag} aria-hidden="true">🇺🇦</span>
          <span className={styles.supportText}>
            <strong>Support Ukraine.</strong>{' '}
            <span className={styles.supportSub}>russia is a terrorist state.</span>
          </span>
        </div>

        <div className={styles.legalRow}>
          {LEGAL_LINKS.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && (
                <span className={styles.separator} aria-hidden="true">·</span>
              )}
              <Link href={item.href} className={styles.legalLink}>
                {item.label}
              </Link>
            </React.Fragment>
          ))}
        </div>

        <div className={styles.copyright}>
          © {year} fibe.gg — All rights reserved.
        </div>
      </div>
    </footer>
  );
}
