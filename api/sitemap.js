module.exports = (req, res) => {
  const urls = [
    { loc: 'https://koleso.live/',                          priority: '1.0', changefreq: 'weekly'  },
    { loc: 'https://koleso.live/pricing',                   priority: '0.9', changefreq: 'monthly' },
    { loc: 'https://koleso.live/terms',                     priority: '0.5', changefreq: 'yearly'  },
    { loc: 'https://koleso.live/blog/',                     priority: '0.8', changefreq: 'weekly'  },
    { loc: 'https://koleso.live/blog/koleso-zhyttya',       priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://koleso.live/blog/postijjna-vtoma',      priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://koleso.live/blog/life-score',           priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://koleso.live/blog/12-sfer-zhyttya',       priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://koleso.live/blog/sfera-finansy',         priority: '0.7', changefreq: 'monthly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.end(xml);
};
