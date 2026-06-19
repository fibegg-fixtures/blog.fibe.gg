import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Fibe Blog',
  tagline: 'Updates, guides, and engineering notes from Fibe',
  favicon: 'img/favicon.ico',

  headTags: [
    { tagName: 'link', attributes: { rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: '/img/fibe.svg' } },
    { tagName: 'link', attributes: { rel: 'apple-touch-icon', sizes: '180x180', href: '/img/apple-touch-icon.png' } },
    { tagName: 'link', attributes: { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/img/icon-192.png' } },
    { tagName: 'link', attributes: { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/img/icon-512.png' } },
    { tagName: 'link', attributes: { rel: 'manifest', href: '/site.webmanifest' } },
    { tagName: 'link', attributes: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
    { tagName: 'link', attributes: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' } },
    { tagName: 'link', attributes: { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Play:wght@400;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap' } },
    { tagName: 'meta', attributes: { name: 'theme-color', content: '#191c14' } },
    { tagName: 'meta', attributes: { property: 'og:site_name', content: 'Fibe' } },
    { tagName: 'meta', attributes: { property: 'og:type', content: 'website' } },
    { tagName: 'meta', attributes: { name: 'twitter:card', content: 'summary_large_image' } },
  ],

  future: {
    v4: true,
  },

  url: 'https://blog.fibe.gg',
  baseUrl: '/',

  organizationName: 'fibegg',
  projectName: 'blog',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    localeConfigs: {
      en: { label: 'English' },
    },
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: false,
        blog: {
          routeBasePath: '/',
          showReadingTime: true,
          blogTitle: 'Fibe Blog',
          blogDescription: 'Updates, guides, and engineering notes from Fibe',
          blogSidebarTitle: 'Recent posts',
          blogSidebarCount: 10,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],




  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      metadata: [
        { name: 'description', content: 'Updates, guides, and insights from the fibe.gg team.' },
        { name: 'keywords', content: 'Fibe, fibe.gg, blog, Docker environments, AI agents, dev environments, Marquees' },
        { name: 'author', content: 'Fibe' },
        { name: 'robots', content: 'index, follow, max-image-preview:large' },
      ],
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      navbar: {
        title: 'Fibe',
        logo: {
          alt: 'Fibe',
          src: 'img/logo.png',
          width: 28,
          height: 28,
        },
        items: [
          // GitHub + fibe.gg now live in the footer; the navbar keeps only the
          // gold "fibe →" CTA on the right.
          {
            href: 'https://fibe.gg/',
            label: 'fibe →',
            position: 'right',
            className: 'navbar__fibe-cta',
          },
        ],
      },
      footer: {
        // Footer is rendered by the swizzled component at src/theme/Footer/index.js.
        style: 'dark',
        copyright: `© ${new Date().getFullYear()} fibe.gg — All rights reserved.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
