#!/usr/bin/env node
/**
 * FREEDAM Discord server setup — via official Discord API with the bot token.
 * Creates roles, channels, permission overwrites, welcome/info posts, invite.
 * Token read from ~/.freedam-secrets/discord-bot.env (never printed).
 * Idempotent-ish: skips existing roles/channels by name.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const GUILD = '1555109550846377994';
const API = 'https://discord.com/api/v10';
const TOKEN = fs.readFileSync(path.join(os.homedir(), '.freedam-secrets/discord-bot.env'), 'utf8')
  .split('\n').find(l => l.startsWith('DISCORD_')).split('=').slice(1).join('=').trim();

const VIEW = 1024n, SEND = 2048n, ADMIN = 8n;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method,
    headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'FREEDAM-DAO setup script (freedamdao.org)' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    if (res.status === 429) { await sleep((json.retry_after_seconds || 1) * 1000 + 200); return api(method, endpoint, body); }
    throw new Error(`${method} ${endpoint} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

const WELCOME_POST = [
  '**Welcome to FREEDAM DAO** \u{1F5FD}',
  'Dissent. Stay Decent. Decentralize.',
  '',
  'FREEDAM is a non-partisan movement building civic governance infrastructure. This is not an investment, not a token sale \u2014 it\u2019s a movement with a member roll that lives on-chain.',
  '',
  '**HOW TO JOIN (about 10 minutes, all free):**',
  '1. Install a wallet \u2014 MetaMask (metamask.io) works on phone or browser',
  '2. Get free testnet ETH: https://www.alchemy.com/faucets/optimism-sepolia (our MVP runs on a test network \u2014 the ETH has no real value)',
  '3. Go to https://www.freedamdao.org/mint, connect your wallet, pick a tier, mint your FRDM-ID',
  '4. You get a permanent Member number. You are now on the founding member roll.',
  '',
  '**GET VERIFIED IN THIS DISCORD:**',
  'DM a mod with your wallet address (or your explorer link from the mint page). We check it on-chain and assign your Member or Leader role. Manual for now, automatic later.',
  '',
  '**GROUND RULES:**',
  '1. Non-partisan at the protocol level. We critique systems \u2014 first-past-the-post, money in politics, executive overreach (any executive, any party). We do not endorse or attack candidates.',
  '2. One person, one membership. The roll is public; sock-puppets get revoked on-chain, permanently.',
  '3. Running a bot or AI agent? Disclose it. Bots aren\u2019t banned \u2014 undisclosed bots are.',
  '4. Stay decent. Dissent hard, attack people never.',
  '5. No financial advice, no token shilling, no recruitment DMs.',
  '',
  '**WHERE THINGS HAPPEN:**',
  '#governance \u2014 proposals & votes \u00B7 #info \u2014 announcements & weekly build log \u00B7 #general \u2014 everything else \u00B7 #memes \u2014 morale',
  '',
  'Constitution: https://github.com/FREEDAM-DAO/DAOv.01/blob/main/governance/CONSTITUTION.md',
  'Code (MIT, fork it): https://github.com/FREEDAM-DAO/DAOv.01',
].join('\n');

const INFO_POST = '**FREEDAM is live on testnet.** \u{1F389}\nThe membership mint is open at https://www.freedamdao.org/mint \u2014 soulbound FRDM-ID, sequential member numbers, donation tiers. Member #1 is the founder; the roll is public and permanent. Weekly build logs post here every Friday.';

async function main() {
  const guild = await api('GET', `/guilds/${GUILD}`);
  console.log('Guild:', guild.name, '| owner:', guild.owner_id);
  const everyoneId = GUILD; // @everyone overwrite uses guild id

  // ---- roles ----
  const existingRoles = await api('GET', `/guilds/${GUILD}/roles`);
  const byName = Object.fromEntries(existingRoles.map(r => [r.name, r]));
  const roleDefs = [
    { name: 'Member', color: 0x00b894, perms: '0' },
    { name: 'Leader', color: 0xfdcb6e, perms: '0' },
    { name: 'Founder', color: 0x6c5ce7, perms: String(ADMIN) },
  ];
  const roles = {};
  for (const def of roleDefs) {
    if (byName[def.name]) { roles[def.name] = byName[def.name]; console.log('role exists:', def.name); }
    else {
      roles[def.name] = await api('POST', `/guilds/${GUILD}/roles`, { name: def.name, color: def.color, permissions: def.perms, hoist: true, mentionable: def.name !== 'Founder' });
      console.log('created role:', def.name, roles[def.name].id);
    }
    await sleep(400);
  }
  // hierarchy note: bot cannot move its own role or the admin Founder role (Discord
  // rule: only roles strictly below the bot's top role are manageable). Founder is
  // admin → bypasses all channel overwrites anyway; display order is cosmetic.
  // Member/Leader rank below bot via id tie-break, so assignment still works.
  console.log('role hierarchy: left as-is (Founder is admin — bypasses channel perms)');

  // give owner the Founder role (tolerate failure — owner has implicit admin;
  // Matt can self-assign the badge in Server Settings → Members if this 403s)
  try {
    const ownerRoles = (await api('GET', `/guilds/${GUILD}/members/${guild.owner_id}`)).roles;
    if (!ownerRoles.includes(roles.Founder.id)) {
      await api('PUT', `/guilds/${GUILD}/members/${guild.owner_id}/roles/${roles.Founder.id}`, {});
      console.log('Founder role assigned to owner');
    } else console.log('owner already has Founder');
  } catch (e) {
    console.log('NOTE: could not assign Founder badge via bot (' + e.message.slice(0, 60) + ') — Matt can self-assign in Server Settings > Members');
  }

  // ---- permission overwrite templates ----
  // (Founder omitted: admin role bypasses channel overwrites anyway, and the bot
  // cannot set overwrites for a role not strictly below its own)
  const locked = [
    { id: everyoneId, type: 0, allow: '0', deny: String(VIEW) },
    { id: roles.Member.id, type: 0, allow: String(VIEW | SEND), deny: '0' },
    { id: roles.Leader.id, type: 0, allow: String(VIEW | SEND), deny: '0' },
  ];
  const welcomeOw = [
    { id: everyoneId, type: 0, allow: String(VIEW), deny: String(SEND) },
    { id: roles.Member.id, type: 0, allow: String(VIEW | SEND), deny: '0' },
    { id: roles.Leader.id, type: 0, allow: String(VIEW | SEND), deny: '0' },
  ];

  // ---- channels ----
  const existingChans = await api('GET', `/guilds/${GUILD}/channels`);
  const chanByName = Object.fromEntries(existingChans.map(c => [c.name, c]));
  const wanted = [
    { name: 'welcome', topic: 'Start here \u2014 rules, how to mint FRDM-ID, how to get verified', ow: welcomeOw },
    { name: 'general', topic: 'Open discussion, questions, vibe', ow: locked },
    { name: 'governance', topic: 'Proposals, Snapshot votes, constitution discussion', ow: locked },
    { name: 'info', topic: 'Announcements and weekly build logs', ow: locked },
    { name: 'memes', topic: 'Community fun', ow: locked },
  ];
  const chans = {};
  for (const w of wanted) {
    if (chanByName[w.name]) {
      chans[w.name] = chanByName[w.name];
      await api('PATCH', `/channels/${chans[w.name].id}`, { topic: w.topic, permission_overwrites: w.ow });
      console.log('configured existing channel:', w.name);
    } else {
      chans[w.name] = await api('POST', `/guilds/${GUILD}/channels`, { name: w.name, type: 0, topic: w.topic, permission_overwrites: w.ow });
      console.log('created channel:', w.name, chans[w.name].id);
    }
    await sleep(500);
  }
  // lock the default voice channel too
  const voice = existingChans.find(c => c.type === 2);
  if (voice) { await api('PATCH', `/channels/${voice.id}`, { permission_overwrites: locked }); console.log('locked voice channel:', voice.name); }

  // ---- posts ----
  const wmsg = await api('POST', `/channels/${chans.welcome.id}/messages`, { content: WELCOME_POST });
  await api('PUT', `/channels/${chans.welcome.id}/pins/${wmsg.id}`, {});
  console.log('welcome post sent + pinned');
  await sleep(600);
  await api('POST', `/channels/${chans.info.id}/messages`, { content: INFO_POST });
  console.log('info post sent');

  // ---- invite (never expires) ----
  const inv = await api('POST', `/channels/${chans.welcome.id}/invites`, { max_age: 0, max_uses: 0, unique: true });
  console.log('');
  console.log('INVITE_URL=https://discord.gg/' + inv.code);
  console.log('SETUP COMPLETE');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
