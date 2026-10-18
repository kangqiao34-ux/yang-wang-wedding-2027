/* Yang & Wang wedding invitation — standalone, dependency-free JavaScript. */
(function () {
  "use strict";

  var config = window.WEDDING_CONFIG;
  var select = function (selector) { return document.querySelector(selector); };
  var gate = select("#gate");
  var openButton = select("#open");
  var replayButton = select("#replay");
  var content = select("#invitationContent");
  var musicControls = select("#musicControls");
  var musicButton = select("#musicToggle");
  var music = select("#bgm");
  var status = select("#toast");
  var targetTime = Date.parse(config.signInAt);
  var reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var petalsCreated = false;
  var toastTimeout;
  var secondTimer;
  var scrollOverflow = document.body.style.overflow;
  var fullAddress = config.venueName + "，" + config.venueAddress;

  function showMessage(message) {
    window.clearTimeout(toastTimeout);
    status.textContent = message;
    status.classList.add("show");
    toastTimeout = window.setTimeout(function () {
      status.classList.remove("show");
    }, 3200);
  }

  // This runs on an explicit tap: supported mobile browsers can play audio
  // without relying on autoplay or a third-party music player.
  function startMusic() {
    try {
      if (music.error) { music.load(); }
      var result = music.play();
      if (result && typeof result.catch === "function") {
        result.catch(function () {
          showMessage("点击左下角“播放音乐”开始播放");
        });
      }
    } catch (error) {
      showMessage("点击左下角“播放音乐”开始播放");
    }
  }

  function updateMusicButton() {
    var playing = !music.paused;
    musicButton.textContent = playing ? "暂停音乐" : "播放音乐";
    musicButton.setAttribute("aria-label", playing ? "暂停背景音乐" : "播放背景音乐");
    musicButton.setAttribute("aria-pressed", String(playing));
  }

  function setCoverVisible(visible) {
    if (visible) {
      gate.hidden = false;
      gate.classList.remove("open");
      gate.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    } else {
      gate.classList.add("open");
      gate.setAttribute("aria-hidden", "true");
      document.body.style.overflow = scrollOverflow;
    }
    // Use inert where available and a keyboard trap below on older browsers.
    [content, musicControls, replayButton].forEach(function (element) {
      if ("inert" in element) { element.inert = visible; }
    });
  }

  function addPetals() {
    if (petalsCreated || reducedMotion) { return; }
    petalsCreated = true;
    for (var i = 0; i < config.petalCount; i += 1) {
      var petal = document.createElement("i");
      petal.className = "petal";
      petal.setAttribute("aria-hidden", "true");
      petal.style.cssText =
        "left:" + (Math.random() * 95) + "%;" +
        "width:" + (5 + Math.random() * 7) + "px;" +
        "height:" + (10 + Math.random() * 10) + "px;" +
        "animation-duration:" + (10 + Math.random() * 10) + "s;" +
        "animation-delay:" + (Math.random() * 12) + "s;" +
        "opacity:" + (0.3 + Math.random() * 0.4);
      document.body.appendChild(petal);
    }
  }

  function openInvitation() {
    startMusic();
    setCoverVisible(false);
    addPetals();
    openButton.blur();
    content.setAttribute("tabindex", "-1");
    try { content.focus({ preventScroll: true }); }
    catch (error) { content.focus(); }
  }

  // The event time is evaluated from the clock on every tick; background tabs
  // do not accumulate drift and all visitor time zones share the same target.
  function updateCountdowns() {
    var difference = targetTime - Date.now();
    select("#countdown").textContent = difference > 0 ?
      "距离相聚，还有 " + Math.ceil(difference / 86400000) + " 天" :
      "爱与欢喜，如约而至";
    var seconds = Math.max(0, Math.floor(difference / 1000));
    var values = {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60,
    };
    Object.keys(values).forEach(function (key) {
      var value = String(values[key]);
      select('[data-countdown="' + key + '"]').textContent =
        value.length < 2 ? "0" + value : value;
    });
  }

  function startCountdowns() {
    window.clearInterval(secondTimer);
    updateCountdowns();
    secondTimer = window.setInterval(updateCountdowns, 1000);
  }

  function setupReveals() {
    var sections = document.querySelectorAll(".reveal");
    if (reducedMotion || !("IntersectionObserver" in window)) { return; }
    try {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("shown");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      sections.forEach(function (section) { observer.observe(section); });
      document.documentElement.classList.add("has-reveal");
    } catch (error) {
      // Content stays visible if an older WebView does not support observers.
      document.documentElement.classList.remove("has-reveal");
    }
  }

  function legacyCopyAddress() {
    var activeElement = document.activeElement;
    var field = document.createElement("textarea");
    field.value = fullAddress;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
    var copied = false;
    try { copied = document.execCommand("copy"); } catch (error) { /* manual fallback */ }
    field.remove();
    if (activeElement && activeElement.focus) {
      try { activeElement.focus({ preventScroll: true }); } catch (error) { /* optional */ }
    }
    if (copied) {
      showMessage("地址已复制，期待与你相见");
    } else {
      // A selectable native field remains useful on restricted WeChat clients.
      window.prompt("请长按选择并复制酒店地址", fullAddress);
    }
  }

  function copyAddress() {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullAddress).then(function () {
        showMessage("地址已复制，期待与你相见");
      }).catch(legacyCopyAddress);
    } else {
      legacyCopyAddress();
    }
  }

  // Absolute share metadata is best set before deployment for non-JS crawlers.
  // This improves browser-generated shares when no deployment URL was configured.
  function updateRelativeShareMetadata() {
    if (!/^https?:$/.test(window.location.protocol)) { return; }
    var pageUrl = new URL("./", window.location.href).href;
    var imageUrl = new URL("./assets/images/share-cover.jpg", pageUrl).href;
    var fields = [
      ['meta[property="og:url"]', "content", pageUrl],
      ['meta[property="og:image"]', "content", imageUrl],
      ['meta[name="twitter:image"]', "content", imageUrl],
      ['link[rel="image_src"]', "href", imageUrl],
      ['link[rel="canonical"]', "href", pageUrl],
    ];
    fields.forEach(function (field) {
      var element = select(field[0]);
      var previous = element.getAttribute(field[1]);
      if (!/^https?:\/\//i.test(previous)) { element.setAttribute(field[1], field[2]); }
    });
  }

  music.volume = config.musicVolume;
  music.loop = true;
  music.addEventListener("play", updateMusicButton);
  music.addEventListener("pause", updateMusicButton);
  music.addEventListener("error", function () {
    showMessage("音乐加载失败，请刷新后重试");
  });
  musicButton.addEventListener("click", function () {
    if (music.paused) { startMusic(); } else { music.pause(); }
  });
  openButton.addEventListener("click", openInvitation);
  replayButton.addEventListener("click", function () {
    window.scrollTo(0, 0);
    setCoverVisible(true);
    openButton.focus();
  });
  select("#copy").addEventListener("click", copyAddress);
  gate.addEventListener("keydown", function (event) {
    if (!gate.classList.contains("open") && event.key === "Tab") {
      event.preventDefault();
      openButton.focus();
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { window.clearInterval(secondTimer); }
    else { startCountdowns(); }
  });

  updateRelativeShareMetadata();
  setupReveals();
  startCountdowns();
  updateMusicButton();
  setCoverVisible(true);
})();
