/**
 * Pastors LMS — Digital Library Interactive Engine
 * Handles in-app video/audio/PDF playback modal, personal study bookmarks,
 * course filtering, study guide printing/offline saving, and teacher file uploads.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    initLibraryCourseAutoFilter();
    initLibraryBookmarks();
    initLibraryPreviewModal();
    initStudyGuideReaderTools();
    initTeacherLibraryManager();
    initTeacherLibraryFileUpload();
  });

  // 1. Auto-submit filter form when switching Course dropdown
  function initLibraryCourseAutoFilter() {
    const courseSelect = document.getElementById('libraryCourseSelect');
    const form = document.getElementById('libraryFilterForm');
    if (courseSelect && form) {
      courseSelect.addEventListener('change', () => form.submit());
    }
  }

  // 2. Persistent Personal Bookmarks ("Saved ★") in localStorage
  function initLibraryBookmarks() {
    const STORAGE_KEY = 'pastors_lms_saved_library_v1';
    const bookmarkBtns = document.querySelectorAll('.library-bookmark-btn[data-bookmark-id]');
    const savedTabBtn = document.getElementById('libraryTabSaved');
    const savedCountEl = document.getElementById('savedCountBadge');
    const grid = document.getElementById('libraryGrid');
    const savedEmptyEl = document.getElementById('librarySavedEmpty');
    const exitSavedBtn = document.getElementById('btnExitSavedFilter');

    if (!bookmarkBtns.length && !savedTabBtn) return;

    let savedIds = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) savedIds = parsed;
    } catch {
      savedIds = [];
    }

    let showingSavedOnly = false;

    function saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedIds));
      } catch {}
    }

    function syncBookmarkUI() {
      bookmarkBtns.forEach(btn => {
        const id = btn.getAttribute('data-bookmark-id');
        const isSaved = savedIds.includes(id);
        btn.classList.toggle('is-saved', isSaved);
        btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isSaved ? 'currentColor' : 'none');
      });

      if (savedCountEl) savedCountEl.textContent = String(savedIds.length);

      if (grid) {
        let visibleCount = 0;
        grid.querySelectorAll('.library-card[data-material-id]').forEach(card => {
          const id = card.getAttribute('data-material-id');
          const show = !showingSavedOnly || savedIds.includes(id);
          card.hidden = !show;
          if (show) visibleCount += 1;
        });
        if (savedEmptyEl) {
          savedEmptyEl.hidden = !(showingSavedOnly && visibleCount === 0);
        }
      }
    }

    bookmarkBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-bookmark-id');
        if (!id) return;
        if (savedIds.includes(id)) {
          savedIds = savedIds.filter(x => x !== id);
        } else {
          savedIds.push(id);
        }
        saveToStorage();
        syncBookmarkUI();
      });
    });

    if (savedTabBtn) {
      savedTabBtn.addEventListener('click', () => {
        showingSavedOnly = !showingSavedOnly;
        savedTabBtn.classList.toggle('active', showingSavedOnly);
        savedTabBtn.setAttribute('aria-pressed', showingSavedOnly ? 'true' : 'false');
        syncBookmarkUI();
      });
    }

    if (exitSavedBtn && savedTabBtn) {
      exitSavedBtn.addEventListener('click', () => {
        showingSavedOnly = false;
        savedTabBtn.classList.remove('active');
        savedTabBtn.setAttribute('aria-pressed', 'false');
        syncBookmarkUI();
      });
    }

    syncBookmarkUI();
  }

  // 3. In-App Accessible Media Preview Modal (YouTube, Vimeo, MP3 Audio, PDF)
  function initLibraryPreviewModal() {
    const backdrop = document.getElementById('libraryPreviewModal');
    const titleEl = document.getElementById('libraryModalTitle');
    const container = document.getElementById('libraryModalPlayerContainer');
    const externalBtn = document.getElementById('btnModalOpenExternal');
    const closeBtn = document.getElementById('btnCloseLibraryModal');

    if (!backdrop || !container) return;

    let lastFocusedTrigger = null;

    function closeModal() {
      backdrop.hidden = true;
      container.innerHTML = ''; // stops video/audio playback immediately
      document.body.style.overflow = '';
      if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
        lastFocusedTrigger.focus();
      }
    }

    function openModal(trigger) {
      lastFocusedTrigger = trigger;
      const mode = trigger.getAttribute('data-mode');
      const title = trigger.getAttribute('data-title') || 'Library Material';
      const embedUrl = trigger.getAttribute('data-embed-url') || '';
      const externalUrl = trigger.getAttribute('data-external-url') || embedUrl;

      if (titleEl) titleEl.textContent = title;
      if (externalBtn) externalBtn.href = externalUrl;
      container.innerHTML = '';

      if (mode === 'video-embed' && embedUrl) {
        const wrap = document.createElement('div');
        wrap.className = 'library-video-wrap';
        const iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.title = title;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        wrap.appendChild(iframe);
        container.appendChild(wrap);
      } else if (mode === 'audio-player' && embedUrl) {
        const box = document.createElement('div');
        box.className = 'library-audio-box';
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.autoplay = true;
        audio.src = embedUrl;
        box.appendChild(audio);
        container.appendChild(box);
      } else if (mode === 'pdf-embed' && embedUrl) {
        const iframe = document.createElement('iframe');
        iframe.className = 'library-pdf-frame';
        iframe.src = embedUrl;
        iframe.title = title;
        container.appendChild(iframe);
      }

      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }

    document.querySelectorAll('.btn-preview-material').forEach(btn => {
      btn.addEventListener('click', () => openModal(btn));
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !backdrop.hidden) closeModal();
    });
  }

  // 4. Study Guide Reader Print & Offline Save Buttons (/library/read/:id)
  function initStudyGuideReaderTools() {
    const printBtn = document.getElementById('btnPrintStudyGuide');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }

    const offlineBtn = document.getElementById('btnSaveGuideOffline');
    if (offlineBtn) {
      offlineBtn.addEventListener('click', async () => {
        const guideUrl = offlineBtn.getAttribute('data-guide-url') || window.location.pathname;
        if (!('caches' in window)) {
          offlineBtn.textContent = 'Offline storage not supported';
          return;
        }
        offlineBtn.disabled = true;
        offlineBtn.textContent = 'Saving...';
        try {
          const cache = await caches.open('pastors-lms-lessons-v2');
          await cache.addAll([guideUrl, '/library']);
          offlineBtn.textContent = 'Saved for Offline Reading';
        } catch {
          offlineBtn.disabled = false;
          offlineBtn.textContent = 'Save for Offline';
        }
      });
    }
  }

  // 5. Admin / Teacher Library 3-Mode Switcher, Smart URL Auto-Detect & Live Table Filter
  function initTeacherLibraryManager() {
    const modeTabs = document.querySelectorAll('.lib-mode-btn[data-lib-mode]');
    const modeInput = document.getElementById('libraryInputMode');
    const panels = document.querySelectorAll('.lib-mode-section[data-mode-panel]');
    const typeSelect = document.getElementById('materialType');
    const urlInput = document.getElementById('materialUrl');
    const urlHint = document.getElementById('urlAutoDetectHint');

    if (modeTabs.length && modeInput) {
      function setMode(nextMode) {
        modeInput.value = nextMode;
        modeTabs.forEach(btn => {
          const active = btn.getAttribute('data-lib-mode') === nextMode;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach(panel => {
          const show = panel.getAttribute('data-mode-panel') === nextMode;
          panel.classList.toggle('lib-mode-hidden', !show);
        });
        if (nextMode === 'notes' && typeSelect) {
          typeSelect.value = 'document';
        }
      }

      modeTabs.forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.getAttribute('data-lib-mode')));
      });
    }

    // Smart auto-detection when pasting a YouTube/Vimeo/PDF/MP3 link
    if (urlInput && typeSelect) {
      urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        if (/(youtube\.com|youtu\.be|vimeo\.com)/i.test(val)) {
          typeSelect.value = 'video';
          if (urlHint) urlHint.textContent = 'Detected Video Link — will play directly inside the Pastors Library video player!';
        } else if (/\.(mp3|m4a|wav|ogg)(\?.*)?$/i.test(val)) {
          typeSelect.value = 'audio';
          if (urlHint) urlHint.textContent = 'Detected Audio File — will play directly inside the audio player!';
        } else if (/(\.pdf(\?.*)?$|drive\.google\.com|docs\.google\.com)/i.test(val)) {
          typeSelect.value = 'document';
          if (urlHint) urlHint.textContent = 'Detected Document / Study Guide link.';
        }
      });
    }

    // Live search + category filter on the Published Materials table
    const searchInput = document.getElementById('adminLibSearch');
    const typeFilter = document.getElementById('adminLibTypeFilter');
    const rows = document.querySelectorAll('#materialsTable tbody tr.lib-admin-row');
    if (rows.length && (searchInput || typeFilter)) {
      function filterRows() {
        const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const t = typeFilter ? typeFilter.value : 'all';
        rows.forEach(row => {
          const matchesType = t === 'all' || row.getAttribute('data-type') === t;
          const matchesText = !q || row.textContent.toLowerCase().includes(q);
          row.hidden = !(matchesType && matchesText);
        });
      }
      if (searchInput) searchInput.addEventListener('input', filterRows);
      if (typeFilter) typeFilter.addEventListener('change', filterRows);
    }
  }

  // 6. Teacher Library Direct File Upload (reads file to base64 safely up to 4 MB)
  function initTeacherLibraryFileUpload() {
    const fileInput = document.getElementById('materialFileUpload');
    const nameInput = document.getElementById('uploadedFileName');
    const dataInput = document.getElementById('uploadedFileData');
    const statusEl = document.getElementById('materialFileStatus');
    const typeSelect = document.getElementById('materialType');
    const titleInput = document.getElementById('materialTitle');

    if (!fileInput || !nameInput || !dataInput) return;

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        nameInput.value = '';
        dataInput.value = '';
        return;
      }

      if (file.size > 4 * 1024 * 1024) {
        if (statusEl) statusEl.textContent = 'File is larger than 4 MB. Please switch to "1. Paste a Link or Video" and paste a Google Drive or YouTube link.';
        fileInput.value = '';
        nameInput.value = '';
        dataInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        nameInput.value = file.name;
        dataInput.value = String(reader.result || '');
        if (statusEl) {
          const kb = Math.max(1, Math.round(file.size / 1024));
          statusEl.textContent = `Ready to publish: ${file.name} (${kb} KB)`;
        }
        if (titleInput && !titleInput.value.trim()) {
          titleInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        }
        if (typeSelect) {
          if (/\.(mp3|m4a|wav|ogg)$/i.test(file.name)) typeSelect.value = 'audio';
          else typeSelect.value = 'document';
        }
      };
      reader.readAsDataURL(file);
    });
  }
})();
