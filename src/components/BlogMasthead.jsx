import React from 'react';
import styles from './BlogMasthead.module.css';

/**
 * Blog masthead — the blog.fibe.gg signature. A "live transmission" header:
 * a blinking dispatch dot, the wordmark, and a phosphor signal line with a
 * scanning sweep. Distinct from the family's other hero motifs (helix /
 * terminal / beacon / mesh); evokes a feed that's broadcasting.
 */
export default function BlogMasthead() {
  return (
    <header className={styles.masthead}>
      <span className={styles.eyebrow}>
        <span className={styles.dot} aria-hidden="true" />
        Dispatches
      </span>
      <h1 className={styles.title}>Fibe Blog</h1>
      <p className={styles.tagline}>
        Updates, guides, and engineering notes from the workshop.
      </p>
      <div className={styles.signal} aria-hidden="true">
        <span className={styles.scan} />
      </div>
    </header>
  );
}
