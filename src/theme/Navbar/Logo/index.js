import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { useThemeConfig } from '@docusaurus/theme-common';

export default function NavbarLogo() {
  const { navbar: { logo } } = useThemeConfig();
  const logoLink = useBaseUrl(logo?.href || '/');
  const logoSrc = useBaseUrl(logo?.src || '/img/logo.png');
  const logoAlt = logo?.alt || 'Fibe';

  return (
    <Link to={logoLink} className="navbar__brand" aria-label="Fibe blog">
      <img
        className="navbar__brand-mark"
        src={logoSrc}
        alt={logoAlt}
        width={logo?.width || 28}
        height={logo?.height || 28}
      />
      <span className="navbar__brand-word">Fibe</span>
      <span className="navbar__brand-slash" aria-hidden="true">/</span>
      <span className="navbar__brand-sub">blog</span>
    </Link>
  );
}
