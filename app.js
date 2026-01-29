(function () {
  'use strict';

  const MOODS = ['\u{1F622}', '\u{1F615}', '\u{1F610}', '\u{1F642}', '\u{1F604}'];
  const MOOD_LABELS = ['Très triste', 'Triste', 'Neutre', 'Content', 'Très content'];
  const MONTH_NAMES = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // ── Helpers ──

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // ── DB Module (IndexedDB) ──

  const DB = {
    db: null,

    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('mood-journal', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('entries')) {
            db.createObjectStore('entries', { keyPath: 'date' });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        req.onerror = (e) => reject(e.target.error);
      });
    },

    put(entry) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('entries', 'readwrite');
        const store = tx.objectStore('entries');
        const req = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    },

    get(date) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('entries', 'readonly');
        const store = tx.objectStore('entries');
        const req = store.get(date);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    getAll() {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('entries', 'readonly');
        const store = tx.objectStore('entries');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },

    getByMonth(year, month) {
      return this.getAll().then(entries =>
        entries.filter(e => {
          const [y, m] = e.date.split('-').map(Number);
          return y === year && m === month + 1;
        })
      );
    },

    delete(date) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('entries', 'readwrite');
        const store = tx.objectStore('entries');
        const req = store.delete(date);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    }
  };

  // ── Network Status Module ──

  const NetworkStatus = {
    banner: null,
    hideTimeout: null,
    pendingCount: 0,

    init() {
      this.banner = document.getElementById('network-banner');

      window.addEventListener('online', () => this.onOnline());
      window.addEventListener('offline', () => this.onOffline());

      // Show banner on load if already offline
      if (!navigator.onLine) {
        this.onOffline();
      }
    },

    onOffline() {
      this.showBanner('offline', 'Hors ligne — les données sont sauvegardées localement', null);
    },

    async onOnline() {
      const unsynced = await this.getUnsyncedEntries();
      if (unsynced.length > 0) {
        this.showBanner('syncing', 'Synchronisation en cours…', unsynced.length);
        await this.syncEntries(unsynced);
        this.showBanner('online', `Connexion rétablie — ${unsynced.length} entrée${unsynced.length > 1 ? 's' : ''} synchronisée${unsynced.length > 1 ? 's' : ''}`, null);
      } else {
        this.showBanner('online', 'Connexion rétablie', null);
      }
      this.autoHide(4000);
    },

    showBanner(type, text, count) {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }

      const icons = { offline: '⚡', online: '✓', syncing: '↻' };
      this.banner.hidden = false;
      this.banner.className = 'network-banner ' + type;
      this.banner.innerHTML =
        `<span class="network-banner-icon" aria-hidden="true">${icons[type]}</span>` +
        `<span class="network-banner-text">${text}</span>` +
        (count != null ? `<span class="network-banner-count">${count}</span>` : '');

      // Force reflow then add visible class for animation
      this.banner.offsetHeight;
      this.banner.classList.add('visible');
    },

    autoHide(delay) {
      this.hideTimeout = setTimeout(() => {
        this.banner.classList.remove('visible');
        // Wait for CSS transition to end before hiding
        setTimeout(() => { this.banner.hidden = true; }, 300);
      }, delay);
    },

    async getUnsyncedEntries() {
      const all = await DB.getAll();
      return all.filter(e => e.synced === false);
    },

    async syncEntries(entries) {
      for (const entry of entries) {
        // TODO: Replace with real API call, e.g.:
        // await fetch('/api/entries', { method: 'POST', body: JSON.stringify(entry) });
        await new Promise(r => setTimeout(r, 200)); // simulate network request
        entry.synced = true;
        await DB.put(entry);
      }
    }
  };

  // ── Router ──

  const Router = {
    currentTab: 'add',

    init() {
      document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => this.navigate(btn.dataset.tab));
      });
    },

    navigate(tab, data) {
      this.currentTab = tab;
      document.querySelectorAll('.tab').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      });
      UI.render(tab, data);
    }
  };

  // ── Calendar Module ──

  const Calendar = {
    // Always use the 1st of the month to avoid overflow when navigating
    currentDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    render(entries) {
      const year = this.currentDate.getFullYear();
      const month = this.currentDate.getMonth();

      const entryMap = {};
      entries.forEach(e => { entryMap[e.date] = e; });

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0

      let html = `
        <div class="calendar">
          <div class="calendar-header">
            <button class="cal-nav" id="prev-month" aria-label="Mois précédent">\u25C0</button>
            <h2>${MONTH_NAMES[month]} ${year}</h2>
            <button class="cal-nav" id="next-month" aria-label="Mois suivant">\u25B6</button>
          </div>
          <div class="calendar-grid" role="grid" aria-label="Calendrier mensuel">
            ${DAY_NAMES.map(d => `<div class="cal-day-name" role="columnheader">${d}</div>`).join('')}
      `;

      for (let i = 0; i < startDay; i++) {
        html += '<div class="cal-cell empty" role="gridcell"></div>';
      }

      const todayStr = formatDate(new Date());

      for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const entry = entryMap[dateStr];
        const isToday = dateStr === todayStr;
        const label = `${d} ${MONTH_NAMES[month]}${entry ? ', humeur : ' + MOOD_LABELS[entry.mood - 1] : ''}`;
        html += `
          <div class="cal-cell${entry ? ' has-entry' : ''}${isToday ? ' today' : ''}"
               data-date="${dateStr}" role="gridcell" tabindex="0" aria-label="${label}">
            <span class="cal-date">${d}</span>
            ${entry ? `<span class="cal-mood">${MOODS[entry.mood - 1]}</span>` : ''}
          </div>
        `;
      }

      html += '</div></div>';
      return html;
    }
  };

  // ── Stats Module ──

  const Stats = {
    calculate(entries) {
      if (entries.length === 0) {
        return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0], trend: 'stable' };
      }

      const sum = entries.reduce((acc, e) => acc + e.mood, 0);
      const average = sum / entries.length;

      const distribution = [0, 0, 0, 0, 0];
      entries.forEach(e => distribution[e.mood - 1]++);

      let trend = 'stable';
      if (entries.length >= 4) {
        const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
        const mid = Math.floor(sorted.length / 2);
        if (mid > 0) {
          const avgFirst = sorted.slice(0, mid).reduce((s, e) => s + e.mood, 0) / mid;
          const avgSecond = sorted.slice(mid).reduce((s, e) => s + e.mood, 0) / (sorted.length - mid);
          const diff = avgSecond - avgFirst;
          if (diff > 0.3) trend = 'up';
          else if (diff < -0.3) trend = 'down';
        }
      }

      return { average, count: entries.length, distribution, trend };
    }
  };

  // ── Notifications Module ──

  const Notifications = {
    intervalId: null,

    async requestPermission() {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const result = await Notification.requestPermission();
      return result === 'granted';
    },

    init() {
      const time = localStorage.getItem('reminderTime');
      if (time) this.scheduleCheck(time);
    },

    scheduleCheck(time) {
      if (this.intervalId) clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hh}:${mm}`;
        const today = formatDate(now);
        const lastNotif = localStorage.getItem('lastNotificationDate');

        if (currentTime === time && lastNotif !== today) {
          this.showReminder();
          localStorage.setItem('lastNotificationDate', today);
        }
      }, 30000);
    },

    async showReminder() {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification("Journal d'humeur", {
            body: "N'oubliez pas de noter votre humeur aujourd'hui !",
            icon: 'icons/icon-192.svg',
            tag: 'mood-reminder'
          });
          return;
        } catch (_) { /* fall through */ }
      }

      new Notification("Journal d'humeur", {
        body: "N'oubliez pas de noter votre humeur aujourd'hui !",
        icon: 'icons/icon-192.svg'
      });
    }
  };

  // ── UI Module ──

  const UI = {
    app: null,

    init() {
      this.app = document.getElementById('app');
    },

    render(tab, data) {
      switch (tab) {
        case 'add':      this.renderAdd(data);      break;
        case 'calendar': this.renderCalendar();      break;
        case 'stats':    this.renderStats();         break;
        case 'history':  this.renderHistory();       break;
      }
    },

    // ── Add / Edit view ──

    renderAdd(editDate) {
      const date = editDate || formatDate(new Date());
      let selectedMood = null;

      this.app.innerHTML = `
        <div class="view add-view">
          <h2>Comment vous sentez-vous ?</h2>
          <div class="mood-selector" role="radiogroup" aria-label="Niveau d'humeur">
            ${MOODS.map((emoji, i) => `
              <button class="mood-btn" data-mood="${i + 1}"
                      role="radio" aria-checked="false"
                      aria-label="${MOOD_LABELS[i]}">${emoji}</button>
            `).join('')}
          </div>
          <div class="form-group">
            <label for="entry-date">Date</label>
            <input type="date" id="entry-date" value="${date}">
          </div>
          <div class="form-group">
            <label for="entry-note">Note (optionnel)</label>
            <textarea id="entry-note" placeholder="Comment s'est passée votre journée ?" rows="3"></textarea>
          </div>
          <button id="save-entry" class="btn-primary" disabled>Enregistrer</button>
          <div id="save-feedback" class="feedback" role="status"></div>
        </div>
      `;

      const moodBtns = this.app.querySelectorAll('.mood-btn');
      const dateInput = this.app.querySelector('#entry-date');
      const noteInput = this.app.querySelector('#entry-note');
      const saveBtn = this.app.querySelector('#save-entry');
      const feedback = this.app.querySelector('#save-feedback');

      function selectMood(value) {
        selectedMood = value;
        moodBtns.forEach(b => {
          const isSelected = Number(b.dataset.mood) === value;
          b.classList.toggle('selected', isSelected);
          b.setAttribute('aria-checked', String(isSelected));
        });
        saveBtn.disabled = false;
      }

      function loadEntry(dateStr) {
        DB.get(dateStr).then(entry => {
          moodBtns.forEach(b => {
            b.classList.remove('selected');
            b.setAttribute('aria-checked', 'false');
          });
          selectedMood = null;
          noteInput.value = '';
          saveBtn.disabled = true;

          if (entry) {
            selectMood(entry.mood);
            noteInput.value = entry.note || '';
          }
        });
      }

      loadEntry(date);

      moodBtns.forEach(btn => {
        btn.addEventListener('click', () => selectMood(Number(btn.dataset.mood)));
      });

      dateInput.addEventListener('change', () => loadEntry(dateInput.value));

      saveBtn.addEventListener('click', async () => {
        if (!selectedMood) return;
        const isOnline = navigator.onLine;
        await DB.put({
          date: dateInput.value,
          mood: selectedMood,
          note: noteInput.value.trim(),
          timestamp: Date.now(),
          synced: isOnline
        });
        feedback.textContent = isOnline
          ? 'Humeur enregistrée !'
          : 'Humeur sauvegardée localement (en attente de synchronisation)';
        feedback.classList.add('show');
        setTimeout(() => feedback.classList.remove('show'), 3000);
      });
    },

    // ── Calendar view ──

    async renderCalendar() {
      const year = Calendar.currentDate.getFullYear();
      const month = Calendar.currentDate.getMonth();
      const entries = await DB.getByMonth(year, month);

      this.app.innerHTML = `<div class="view calendar-view">${Calendar.render(entries)}</div>`;

      this.app.querySelector('#prev-month').addEventListener('click', () => {
        Calendar.currentDate = new Date(year, month - 1, 1);
        this.renderCalendar();
      });

      this.app.querySelector('#next-month').addEventListener('click', () => {
        Calendar.currentDate = new Date(year, month + 1, 1);
        this.renderCalendar();
      });

      this.app.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
        cell.addEventListener('click', () => Router.navigate('add', cell.dataset.date));
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            Router.navigate('add', cell.dataset.date);
          }
        });
      });
    },

    // ── Stats view ──

    async renderStats() {
      const year = Calendar.currentDate.getFullYear();
      const month = Calendar.currentDate.getMonth();
      const entries = await DB.getByMonth(year, month);
      const stats = Stats.calculate(entries);

      const trendIcon = stats.trend === 'up' ? '\u2197\uFE0F' : stats.trend === 'down' ? '\u2198\uFE0F' : '\u27A1\uFE0F';
      const trendLabel = stats.trend === 'up' ? 'En hausse' : stats.trend === 'down' ? 'En baisse' : 'Stable';
      const avgIdx = Math.round(stats.average) - 1;
      const avgEmoji = avgIdx >= 0 ? MOODS[avgIdx] : '\u2014';
      const maxDist = Math.max(...stats.distribution, 1);

      this.app.innerHTML = `
        <div class="view stats-view">
          <div class="stats-month-nav">
            <button class="cal-nav" id="stats-prev" aria-label="Mois précédent">\u25C0</button>
            <h2>${MONTH_NAMES[month]} ${year}</h2>
            <button class="cal-nav" id="stats-next" aria-label="Mois suivant">\u25B6</button>
          </div>

          <div class="stats-cards">
            <div class="stat-card">
              <div class="stat-value">${avgEmoji}</div>
              <div class="stat-label">Humeur moyenne</div>
              <div class="stat-detail">${stats.average ? stats.average.toFixed(1) + '/5' : 'Aucune donnée'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.count}</div>
              <div class="stat-label">Entrées</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${trendIcon}</div>
              <div class="stat-label">Tendance</div>
              <div class="stat-detail">${trendLabel}</div>
            </div>
          </div>

          <div class="distribution">
            <h3>Distribution</h3>
            ${MOODS.map((emoji, i) => `
              <div class="dist-row">
                <span class="dist-emoji" aria-hidden="true">${emoji}</span>
                <div class="dist-bar-container" role="progressbar"
                     aria-valuenow="${stats.distribution[i]}" aria-valuemin="0"
                     aria-valuemax="${maxDist}" aria-label="${MOOD_LABELS[i]}">
                  <div class="dist-bar" style="width:${(stats.distribution[i] / maxDist) * 100}%"></div>
                </div>
                <span class="dist-count">${stats.distribution[i]}</span>
              </div>
            `).join('')}
          </div>

          <div class="notification-settings">
            <h3>Rappel quotidien</h3>
            <div class="reminder-row">
              <label for="reminder-time">Heure du rappel :</label>
              <input type="time" id="reminder-time" value="${localStorage.getItem('reminderTime') || '20:00'}">
              <button id="save-reminder" class="btn-secondary">Activer</button>
            </div>
          </div>
        </div>
      `;

      this.app.querySelector('#stats-prev').addEventListener('click', () => {
        Calendar.currentDate = new Date(year, month - 1, 1);
        this.renderStats();
      });

      this.app.querySelector('#stats-next').addEventListener('click', () => {
        Calendar.currentDate = new Date(year, month + 1, 1);
        this.renderStats();
      });

      this.app.querySelector('#save-reminder').addEventListener('click', async () => {
        const time = this.app.querySelector('#reminder-time').value;
        const granted = await Notifications.requestPermission();
        if (granted) {
          localStorage.setItem('reminderTime', time);
          Notifications.scheduleCheck(time);
          const btn = this.app.querySelector('#save-reminder');
          btn.textContent = 'Activé !';
          setTimeout(() => { btn.textContent = 'Activer'; }, 2000);
        } else {
          const old = this.app.querySelector('.notif-denied');
          if (old) old.remove();
          const msg = document.createElement('p');
          msg.className = 'notif-denied';
          msg.setAttribute('role', 'alert');
          msg.textContent = 'Notifications refusées. Activez-les dans les paramètres du navigateur.';
          this.app.querySelector('.notification-settings').appendChild(msg);
          setTimeout(() => msg.remove(), 5000);
        }
      });
    },

    // ── History view ──

    async renderHistory() {
      const entries = await DB.getAll();
      entries.sort((a, b) => b.date.localeCompare(a.date));

      if (entries.length === 0) {
        this.app.innerHTML = `
          <div class="view history-view">
            <h2>Historique</h2>
            <p class="empty-state" role="status">Aucune entrée pour le moment.<br>Commencez par ajouter votre humeur !</p>
          </div>
        `;
        return;
      }

      this.app.innerHTML = `
        <div class="view history-view">
          <h2>Historique</h2>
          <div class="entries-list">
            ${entries.map(e => `
              <div class="entry-card" data-date="${e.date}">
                <div class="entry-mood" aria-hidden="true">${MOODS[e.mood - 1]}</div>
                <div class="entry-info">
                  <div class="entry-date">${formatDateDisplay(e.date)}</div>
                  ${e.note ? `<div class="entry-note">${escapeHtml(e.note)}</div>` : ''}
                </div>
                <button class="entry-delete" data-date="${e.date}" aria-label="Supprimer">\u2715</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      this.app.querySelectorAll('.entry-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.entry-delete')) return;
          Router.navigate('add', card.dataset.date);
        });
      });

      this.app.querySelectorAll('.entry-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Supprimer cette entrée ?')) {
            await DB.delete(btn.dataset.date);
            this.renderHistory();
          }
        });
      });
    }
  };

  // ── Install Prompt Module ──

  const InstallPrompt = {
    deferredPrompt: null,
    isStandalone: false,

    init() {
      // Detect if already installed (standalone mode)
      this.isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

      if (this.isStandalone) return; // Already installed, nothing to do

      // Capture beforeinstallprompt for Chrome/Edge/Android
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e;
        this.showInstallBanner();
      });

      // Track successful installation
      window.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        this.hideInstallBanner();
        localStorage.setItem('pwa-installed', 'true');
      });

      // iOS Safari: show custom instructions if not dismissed recently
      this.checkIOSInstall();

      // Wire up banner buttons
      const dismissBtn = document.getElementById('install-dismiss');
      const acceptBtn = document.getElementById('install-accept');
      if (dismissBtn) dismissBtn.addEventListener('click', () => this.dismissInstall());
      if (acceptBtn) acceptBtn.addEventListener('click', () => this.triggerInstall());

      // Wire up iOS overlay close
      const iosCloseBtn = document.getElementById('ios-install-close');
      if (iosCloseBtn) iosCloseBtn.addEventListener('click', () => this.hideIOSOverlay());
    },

    showInstallBanner() {
      // Don't show if user dismissed recently (within 7 days)
      const dismissed = localStorage.getItem('install-dismissed');
      if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

      const banner = document.getElementById('install-banner');
      if (banner) {
        banner.hidden = false;
        requestAnimationFrame(() => banner.classList.add('visible'));
      }
    },

    hideInstallBanner() {
      const banner = document.getElementById('install-banner');
      if (banner) {
        banner.classList.remove('visible');
        setTimeout(() => { banner.hidden = true; }, 300);
      }
    },

    async triggerInstall() {
      if (!this.deferredPrompt) return;
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        this.deferredPrompt = null;
      }
      this.hideInstallBanner();
    },

    dismissInstall() {
      localStorage.setItem('install-dismissed', String(Date.now()));
      this.hideInstallBanner();
    },

    checkIOSInstall() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

      if (!isIOS || !isSafari) return;

      // Don't show if already dismissed recently
      const dismissed = localStorage.getItem('install-dismissed');
      if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

      // Show after a short delay to not be intrusive
      setTimeout(() => this.showIOSOverlay(), 3000);
    },

    showIOSOverlay() {
      const overlay = document.getElementById('ios-install-overlay');
      if (overlay) {
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('visible'));
      }
    },

    hideIOSOverlay() {
      localStorage.setItem('install-dismissed', String(Date.now()));
      const overlay = document.getElementById('ios-install-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => { overlay.hidden = true; }, 300);
      }
    }
  };

  // ── SW update banner ──

  function showUpdateBanner() {
    if (document.querySelector('.update-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = '<span>Nouvelle version disponible</span><button id="sw-update-btn">Actualiser</button>';
    document.body.prepend(banner);
    document.getElementById('sw-update-btn').addEventListener('click', () => {
      navigator.serviceWorker.ready.then(reg => {
        if (reg.waiting) reg.waiting.postMessage('skipWaiting');
      });
    });
  }

  // ── Bootstrap ──

  async function init() {
    await DB.open();
    UI.init();
    Router.init();

    // Handle tab from URL (for manifest shortcuts)
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    Router.navigate(['add', 'calendar', 'stats', 'history'].includes(urlTab) ? urlTab : 'add');

    Notifications.init();
    NetworkStatus.init();
    InstallPrompt.init();

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');

        // Detect SW updates and show banner
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }

      // Reload when new SW takes over
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }

  init();
})();
