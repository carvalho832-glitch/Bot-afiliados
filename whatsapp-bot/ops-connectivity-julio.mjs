const base = 'https://bot.achoulevoubot.uk';
for (const path of ['/status', '/queue', '/settings']) {
  const response = await fetch(base + path, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  console.log(path, response.status, text.slice(0, 1000));
}
