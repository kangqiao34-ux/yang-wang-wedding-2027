/* Integration checks for the shipped app.js using a small browser-API test double.
 * This is not a rendering engine or an iOS/WeChat device test.
 * Run: node tools/check_interactions.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
const target = Date.parse('2027-01-09T17:08:00+08:00');
const results = [];

function environment(options = {}) {
  let now = target - 3723000;
  let nodes = [];
  let playCount = 0;
  let promptCount = 0;
  const intervals = new Map();
  const clipboard = [];
  let nextTimer = 0;
  class Element {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.attrs = attrs;
      this.id = attrs.id || '';
      this.style = { overflow: '' };
      this.textContent = '';
      this.hidden = 'hidden' in attrs;
      this.inert = false;
      this.events = {};
      this.paused = true;
      this.error = null;
      this.value = '';
      this.classList = {
        add: name => { const c = new Set((this.attrs.class || '').split(' ')); c.add(name); this.attrs.class = [...c].join(' '); },
        remove: name => { this.attrs.class = (this.attrs.class || '').split(' ').filter(x => x !== name).join(' '); },
        contains: name => (this.attrs.class || '').split(' ').includes(name),
      };
    }
    get className() { return this.attrs.class || ''; }
    set className(value) { this.attrs.class = String(value); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    emit(name, event = {}) { for (const fn of this.events[name] || []) fn(event); }
    appendChild(child) { nodes.push(child); }
    focus() { document.activeElement = this; }
    blur() { document.activeElement = null; }
    select() {}
    setSelectionRange() {}
    remove() { nodes = nodes.filter(n => n !== this); }
    load() { this.error = null; }
    play() {
      playCount++;
      if (options.blockAudio) return Promise.reject(new Error('autoplay blocked'));
      this.paused = false;
      this.emit('play');
      return Promise.resolve();
    }
    pause() { this.paused = true; this.emit('pause'); }
  }
  const attrsPattern = /([\w:-]+)(?:="([^"]*)")?/g;
  for (const match of html.matchAll(/<([a-z][\w-]*)(\s[^<>]*?)?\s*>/gi)) {
    const attrs = {};
    for (const attribute of (match[2] || '').matchAll(attrsPattern)) attrs[attribute[1]] = attribute[2] || '';
    nodes.push(new Element(match[1], attrs));
  }
  function matches(node, selector) {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    const m = selector.match(/^(\w+)?\[([\w-]+)="([^"]+)"\]$/);
    return m && (!m[1] || node.tagName === m[1].toUpperCase()) && node.attrs[m[2]] === m[3];
  }
  const document = {
    body: nodes.find(n => n.tagName === 'BODY'),
    documentElement: nodes.find(n => n.tagName === 'HTML'),
    activeElement: null,
    hidden: false,
    events: {},
    querySelector: selector => nodes.find(n => matches(n, selector)) || null,
    querySelectorAll: selector => nodes.filter(n => matches(n, selector)),
    createElement: tag => new Element(tag),
    execCommand: () => !!options.legacyCopyWorks,
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); },
  };
  const window = {
    document,
    isSecureContext: !options.insecure,
    matchMedia: () => ({ matches: !!options.reducedMotion }),
    location: { protocol: 'https:', href: 'https://example.test/wedding/?from=wechat#invitation' },
    setTimeout: () => ++nextTimer,
    clearTimeout() {},
    setInterval: fn => { const id = ++nextTimer; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    scrollTo() {},
    prompt(message, value) { promptCount++; assert.match(value, /北大街199号/); },
  };
  // Observer callbacks are asynchronous in real browsers.
  if (!options.noObserver) {
    window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; }
      observe() {}
      unobserve() {}
    };
  }
  const navigator = options.noClipboard ? {} : {
    clipboard: { writeText: value => {
      if (options.rejectClipboard) return Promise.reject(new Error('permission denied'));
      clipboard.push(value); return Promise.resolve();
    } },
  };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ window, document, navigator, Date: Clock, URL,
    IntersectionObserver: window.IntersectionObserver, console });
  vm.runInContext(config, context, { filename: 'config.js' });
  vm.runInContext(app, context, { filename: 'app.js' });
  return {
    $, document, window, clipboard,
    get playCount() { return playCount; },
    get promptCount() { return promptCount; },
    setTime(value) { now = value; for (const tick of [...intervals.values()]) tick(); },
    petals: () => nodes.filter(n => n.attrs.class === 'petal').length,
  };
  function $(id) { return document.querySelector('#' + id); }
}

async function check(label, fn) {
  await fn();
  results.push({ label, passed: true });
  console.log('PASS ' + label);
}
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  await check('Opening, focus, music, pause/resume and replay without duplicate petals', async () => {
    const e = environment();
    assert.equal(e.$('gate').hidden, false);
    assert.equal(e.document.body.style.overflow, 'hidden');
    assert.equal(e.$('invitationContent').inert, true);
    let tabPrevented = false;
    e.$('gate').emit('keydown', { key: 'Tab', preventDefault() { tabPrevented = true; } });
    assert.equal(tabPrevented, true);
    assert.equal(e.document.activeElement.id, 'open');
    e.$('open').emit('click'); await settle();
    assert.equal(e.$('gate').classList.contains('open'), true);
    assert.equal(e.document.body.style.overflow, '');
    assert.equal(e.$('invitationContent').inert, false);
    assert.equal(e.petals(), 15);
    assert.equal(e.$('bgm').paused, false);
    assert.equal(e.$('bgm').loop, true);
    assert.equal(e.$('musicToggle').textContent, '暂停音乐');
    e.$('musicToggle').emit('click');
    assert.equal(e.$('bgm').paused, true);
    assert.equal(e.$('musicToggle').getAttribute('aria-pressed'), 'false');
    e.$('musicToggle').emit('click'); await settle();
    assert.equal(e.$('bgm').paused, false);
    e.$('replay').emit('click');
    assert.equal(e.$('gate').classList.contains('open'), false);
    e.$('open').emit('click'); await settle();
    assert.equal(e.petals(), 15);
  });
  await check('Countdown uses China 17:08, updates each second and stops at zero', () => {
    const e = environment();
    const field = name => e.document.querySelector('[data-countdown="' + name + '"]').textContent;
    assert.equal(field('hours'), '01'); assert.equal(field('minutes'), '02'); assert.equal(field('seconds'), '03');
    e.setTime(target - 3722000); assert.equal(field('seconds'), '02');
    e.document.hidden = true;
    for (const handler of e.document.events.visibilitychange) handler();
    e.setTime(target - 1000);
    assert.equal(field('seconds'), '02');
    e.document.hidden = false;
    for (const handler of e.document.events.visibilitychange) handler();
    assert.equal(field('seconds'), '01');
    e.setTime(target + 1000);
    for (const name of ['days', 'hours', 'minutes', 'seconds']) assert.equal(field(name), '00');
    assert.equal(e.$('countdown').textContent, '爱与欢喜，如约而至');
    assert.equal(new Date(target).toISOString(), '2027-01-09T09:08:00.000Z');
  });
  await check('Clipboard success and denied/unavailable clipboard fallback', async () => {
    const e = environment(); e.$('copy').emit('click'); await settle();
    assert.match(e.clipboard[0], /南通绿洲国际假日酒店/);
    assert.match(e.$('toast').textContent, /地址已复制/);
    const denied = environment({ rejectClipboard: true }); denied.$('copy').emit('click'); await settle();
    assert.equal(denied.promptCount, 1);
    const insecure = environment({ noClipboard: true, insecure: true, legacyCopyWorks: true });
    insecure.$('copy').emit('click'); assert.match(insecure.$('toast').textContent, /地址已复制/);
  });
  await check('Autoplay denial leaves invitation usable and shows a manual play instruction', async () => {
    const e = environment({ blockAudio: true }); e.$('open').emit('click'); await settle();
    assert.equal(e.$('gate').classList.contains('open'), true);
    assert.match(e.$('toast').textContent, /播放音乐/);
    assert.equal(e.$('musicToggle').textContent, '播放音乐');
  });
  await check('Reduced motion and missing IntersectionObserver keep content accessible', () => {
    const reduced = environment({ reducedMotion: true }); reduced.$('open').emit('click');
    assert.equal(reduced.petals(), 0);
    assert.equal(reduced.document.documentElement.classList.contains('has-reveal'), false);
    const old = environment({ noObserver: true }); old.$('open').emit('click');
    assert.equal(old.$('gate').classList.contains('open'), true);
    assert.equal(old.document.documentElement.classList.contains('has-reveal'), false);
  });
  await check('Share metadata resolves on a new origin and nested deployment path', () => {
    const e = environment();
    assert.equal(e.document.querySelector('meta[property="og:url"]').getAttribute('content'), 'https://example.test/wedding/');
    assert.equal(e.document.querySelector('meta[property="og:image"]').getAttribute('content'), 'https://example.test/wedding/assets/images/share-cover.jpg');
  });
  await check('Music file errors expose a retry message', () => {
    const e = environment(); e.$('bgm').emit('error');
    assert.match(e.$('toast').textContent, /加载失败/);
  });
  await check('No-install share configuration helper sets five static tags and rejects invalid URLs', () => {
    const helper = fs.readFileSync(path.join(root, 'tools/configure-share.html'), 'utf8');
    const script = helper.match(/<script>([\s\S]*?)<\/script>/)[1];
    const context = vm.createContext({ URL, document: { getElementById: () => ({ addEventListener() {} }) } });
    vm.runInContext(script, context);
    const result = context.configureShare(html, 'https://example.test/wedding/');
    assert.equal((result.html.match(/https:\/\/example\.test\/wedding\/assets\/images\/share-cover\.jpg/g) || []).length, 3);
    assert.equal((result.html.match(/"https:\/\/example\.test\/wedding\/"/g) || []).length, 2);
    assert.equal(result.html.match(/<body>[\s\S]*<\/body>/)[0], html.match(/<body>[\s\S]*<\/body>/)[0]);
    for (const invalid of ['javascript:alert(1)', 'https://example.test/?from=wechat', 'https://a:b@example.test/', 'https://example.test/index.html']) {
      assert.throws(() => context.configureShare(html, invalid));
    }
  });
  console.log('\n' + results.length + ' interaction groups passed (browser API test doubles).');
})().catch(error => { console.error(error); process.exitCode = 1; });
