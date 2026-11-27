/**
 * Pastors LMS — Brightspace / UoPeople Course Interactive Engine
 * Handles split-screen syllabus navigation, dynamic lesson loading,
 * search filtering, self-quizzes, assignment submissions, and progress tracking.
 */

document.addEventListener('DOMContentLoaded', () => {
  const courseDataEl = document.getElementById('courseDataJson');
  if (courseDataEl && !window.PASTORS_LMS_COURSE) {
    try {
      const rawJson = courseDataEl.getAttribute('data-json') || courseDataEl.textContent;
      window.PASTORS_LMS_COURSE = JSON.parse(rawJson);
    } catch (e) {
      console.error('Failed to parse course data JSON:', e);
    }
  }

  document.querySelectorAll('.progress-bar[data-percent], .uop-module-progress-bar[data-percent]').forEach(bar => {
    bar.style.width = `${bar.getAttribute('data-percent')}%`;
  });

  initBrightspaceTabs();
  initBrightspaceTopActions();
  initMobileUnitsDrawer();
  initBrightspaceTree();
  initBrightspaceSearch();
  initBrightspaceToolbar();
  initBrightspaceTopicFooter();
  initBrightspaceInteractiveForms();
  initDiscussionForum();
  initExtensionRequestModal();
  initOfflineCourseSave();
  initHomeModuleCards();
  initCourseWorkToDoLinks();
  applyUrlDeepLink();
  fetchMyCourseSubmissions();
});

// State
let currentModuleIndex = 1;
let currentTopicIndex = 0;
let currentModuleId = null;
let currentTopicId = null;
let currentTopicTitle = '';
let cachedCourseSubmissions = [];
let activeExamTimer = null;

/**
 * 1. Secondary Navigation Tabs (Home, Content, Discussions, Grades)
 */
function initBrightspaceTabs() {
  const tabHome = document.getElementById('tabNavHome');
  const tabContent = document.getElementById('tabNavContent');
  const tabDiscussions = document.getElementById('tabNavDiscussions');
  const tabClasslist = document.getElementById('tabNavClasslist');
  const tabGrades = document.getElementById('tabNavGrades');
  const viewHome = document.getElementById('viewHome');
  const viewContent = document.getElementById('viewContent');
  const viewDiscussions = document.getElementById('viewDiscussions');
  const viewClasslist = document.getElementById('viewClasslist');
  const viewGrades = document.getElementById('viewGrades');
  const btnGoContent = document.getElementById('btnGoToContentFromHome');

  if (!tabHome || !tabContent) return;

  function showTab(tabName) {
    const allTabs = [tabHome, tabContent, tabDiscussions, tabClasslist, tabGrades].filter(Boolean);
    allTabs.forEach(t => t.classList.remove('active'));
    [viewHome, viewContent, viewDiscussions, viewClasslist, viewGrades].forEach(v => {
      if (v) {
        v.classList.add('bp-view-hidden');
        v.hidden = true;
      }
    });

    if (tabName === 'home') {
      tabHome.classList.add('active');
      if (viewHome) {
        viewHome.classList.remove('bp-view-hidden');
        viewHome.hidden = false;
      }
    } else if (tabName === 'discussions') {
      if (tabDiscussions) tabDiscussions.classList.add('active');
      const actBtn = document.getElementById('btnActivitiesDropdown');
      if (!tabDiscussions && actBtn) actBtn.classList.add('active');
      if (viewDiscussions) {
        viewDiscussions.classList.remove('bp-view-hidden');
        viewDiscussions.hidden = false;
      }
      const modSelect = document.getElementById('discussionModuleSelect');
      if (modSelect && currentModuleId) modSelect.value = String(currentModuleId);
      loadDiscussionForum();
    } else if (tabName === 'classlist') {
      if (tabClasslist) tabClasslist.classList.add('active');
      if (viewClasslist) {
        viewClasslist.classList.remove('bp-view-hidden');
        viewClasslist.hidden = false;
      }
    } else if (tabName === 'grades') {
      if (tabGrades) tabGrades.classList.add('active');
      if (viewGrades) {
        viewGrades.classList.remove('bp-view-hidden');
        viewGrades.hidden = false;
      }
      fetchMyCourseSubmissions(true);
    } else {
      tabContent.classList.add('active');
      if (viewContent) {
        viewContent.classList.remove('bp-view-hidden');
        viewContent.hidden = false;
      }
    }
  }

  window.switchBrightspaceTab = showTab;

  tabHome.addEventListener('click', () => showTab('home'));
  tabContent.addEventListener('click', () => showTab('content'));
  if (tabDiscussions) tabDiscussions.addEventListener('click', () => showTab('discussions'));
  if (tabClasslist) tabClasslist.addEventListener('click', () => showTab('classlist'));
  if (tabGrades) tabGrades.addEventListener('click', () => showTab('grades'));
  if (btnGoContent) {
    btnGoContent.addEventListener('click', () => showTab('content'));
  }
}

/**
 * 1b. All UoPeople Top-Bar Popovers, Nav Dropdowns, Pinned Courses,
 *     Instant Messages, Notifications & Classlist Search
 */
function initBrightspaceTopActions() {
  function closeAllMenus() {
    document.querySelectorAll('.bp-popover-wrap.open').forEach(w => {
      w.classList.remove('open');
      const btn = w.querySelector('[data-popover-trigger]');
      const pop = w.querySelector('.bp-popover');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (pop) pop.hidden = true;
    });
    document.querySelectorAll('.bp-nav-dropdown-item.open').forEach(d => {
      d.classList.remove('open');
      const btn = d.querySelector('[data-nav-dropdown]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  // Top-bar popovers (9-dot Course Switcher, Messages, Discussion Alerts, Notifications, User Profile)
  document.querySelectorAll('[data-popover-trigger]').forEach(btn => {
    const targetId = btn.getAttribute('data-popover-trigger');
    const popover = targetId ? document.getElementById(targetId) : null;
    const wrap = btn.closest('.bp-popover-wrap');
    if (!popover || !wrap) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !wrap.classList.contains('open');
      closeAllMenus();
      if (willOpen) {
        wrap.classList.add('open');
        popover.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      }
    });

    popover.addEventListener('click', (e) => e.stopPropagation());
  });

  // Secondary nav bar dropdowns (Activities, Course Tools, Learning Resources, Help)
  document.querySelectorAll('[data-nav-dropdown]').forEach(btn => {
    const wrapId = btn.getAttribute('data-nav-dropdown');
    const wrap = wrapId ? document.getElementById(wrapId) : btn.closest('.bp-nav-dropdown-item');
    if (!wrap) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !wrap.classList.contains('open');
      closeAllMenus();
      if (willOpen) {
        wrap.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Activities submenu actions
  document.querySelectorAll('[data-activity-action]').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.getAttribute('data-activity-action');
      closeAllMenus();
      if (action === 'discussions') {
        if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('discussions');
      } else if (action) {
        selectTopicByType(action);
      }
    });
  });

  // Course Tools & Learning Resources button actions
  document.querySelectorAll('[data-tool-action]').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.getAttribute('data-tool-action');
      closeAllMenus();
      if (action === 'announcements') {
        if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('home');
        const el = document.getElementById('homeAnnouncementsWidget');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (action === 'worktodo') {
        if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('home');
        const el = document.getElementById('workToDoWidget');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (action === 'modules') {
        if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('home');
        const el = document.getElementById('homeModulesWidget');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (action === 'offline') {
        if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('home');
        const btnOff = document.getElementById('btnSaveCourseOffline');
        if (btnOff) btnOff.click();
      } else if (action === 'extension') {
        openExtensionRequestModal(currentModuleId);
      }
    });
  });

  // Course Switcher Pinning (persisted in localStorage, sorts pinned courses to top)
  const PIN_KEY = 'pastors_lms_pinned_courses_v1';
  const switcherList = document.getElementById('courseSwitcherList');
  if (switcherList) {
    let pinned = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
      if (Array.isArray(parsed)) pinned = parsed.map(String);
    } catch {
      pinned = [];
    }

    function applyPinnedOrder() {
      const rows = Array.from(switcherList.querySelectorAll('.bp-switcher-row[data-course-id]'));
      const divider = switcherList.querySelector('.bp-switcher-divider');
      rows.forEach(row => {
        const cid = String(row.getAttribute('data-course-id'));
        const isPinned = pinned.includes(cid);
        const btn = row.querySelector('.bp-pin-btn');
        if (btn) {
          btn.classList.toggle('is-pinned', isPinned);
          btn.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
        }
      });
      rows
        .sort((a, b) => {
          const ap = pinned.includes(String(a.getAttribute('data-course-id'))) ? 0 : 1;
          const bp = pinned.includes(String(b.getAttribute('data-course-id'))) ? 0 : 1;
          return ap - bp;
        })
        .forEach(r => {
          if (divider) switcherList.insertBefore(r, divider);
          else switcherList.appendChild(r);
        });
    }

    switcherList.querySelectorAll('.bp-pin-btn[data-pin-course]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cid = String(btn.getAttribute('data-pin-course'));
        if (pinned.includes(cid)) pinned = pinned.filter(x => x !== cid);
        else pinned.unshift(cid);
        try { localStorage.setItem(PIN_KEY, JSON.stringify(pinned)); } catch {}
        applyPinnedOrder();
      });
    });

    applyPinnedOrder();
  }

  // Instant Message Form inside Messages Popover
  const msgForm = document.getElementById('courseInstantMsgForm');
  const msgInput = document.getElementById('instantMsgInput');
  const msgFeed = document.getElementById('courseMessagesFeed');
  if (msgForm && msgInput && msgFeed) {
    msgForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = msgInput.value.trim();
      const cid = msgForm.getAttribute('data-course-id');
      if (body.length < 2 || !cid) return;
      const sendBtn = document.getElementById('btnSendInstantMsg');
      if (sendBtn) sendBtn.disabled = true;

      try {
        const res = await fetch(`/courses/${cid}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body })
        });
        const data = await res.json();
        if (res.ok && data && data.success && data.message) {
          msgInput.value = '';
          const empty = msgFeed.querySelector('.bp-popover-empty');
          if (empty) empty.remove();
          const itemEl = document.createElement('div');
          itemEl.className = 'bp-feed-item';
          itemEl.innerHTML = `<div class="bp-feed-title"><strong>${escapeUiText(data.message.sender)} (${escapeUiText(data.message.senderRole)})</strong> said:</div><p class="bp-feed-text">${escapeUiText(data.message.preview)}</p><span class="bp-feed-time">Just now</span>`;
          msgFeed.prepend(itemEl);
        }
      } catch {
        alert('Could not send message right now. Please check your connection.');
      } finally {
        if (sendBtn) sendBtn.disabled = false;
      }
    });
  }

  // Discussion Alerts popover clicks -> open exact discussion module
  document.querySelectorAll('[data-open-discussion-mod]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modId = btn.getAttribute('data-open-discussion-mod');
      closeAllMenus();
      const modSelect = document.getElementById('discussionModuleSelect');
      if (modSelect && modId) modSelect.value = String(modId);
      if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('discussions');
    });
  });

  const openDiscFooterBtn = document.getElementById('btnPopoverOpenDiscussions');
  if (openDiscFooterBtn) {
    openDiscFooterBtn.addEventListener('click', () => {
      closeAllMenus();
      if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('discussions');
    });
  }

  // Notification Bell item clicks -> deep-link seamlessly if same course
  const currentCourse = window.PASTORS_LMS_COURSE;
  document.querySelectorAll('.bp-notif-item').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetCourseId = link.getAttribute('data-notif-course');
      const action = link.getAttribute('data-notif-action');
      if (!currentCourse || String(targetCourseId) !== String(currentCourse.id)) return;

      e.preventDefault();
      closeAllMenus();
      const modId = link.getAttribute('data-notif-module');
      const topicId = link.getAttribute('data-notif-topic');
      if (action === 'open-grades') {
        if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('grades');
      } else if (action === 'open-discussion') {
        const modSelect = document.getElementById('discussionModuleSelect');
        if (modSelect && modId) modSelect.value = String(modId);
        if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('discussions');
      } else if (modId) {
        openSpecificModuleAndTopic(modId, topicId);
      }
    });
  });

  // Classlist live search
  const classlistSearch = document.getElementById('classlistSearchInput');
  const classlistTable = document.getElementById('classlistStudentsTable');
  if (classlistSearch && classlistTable) {
    classlistSearch.addEventListener('input', () => {
      const q = classlistSearch.value.trim().toLowerCase();
      classlistTable.querySelectorAll('tbody tr.classlist-student-row').forEach(row => {
        const match = !q || row.textContent.toLowerCase().includes(q);
        row.hidden = !match;
      });
    });
  }

  document.addEventListener('click', closeAllMenus);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllMenus();
  });
}

/**
 * 1c. Mobile Collapsible Course Units Drawer (<= 900px)
 */
function initMobileUnitsDrawer() {
  const toggleBtn = document.getElementById('btnMobileUnitsToggle');
  const treeBody = document.getElementById('bpSidebarTreeBody');
  if (!toggleBtn || !treeBody) return;

  toggleBtn.addEventListener('click', () => {
    const willExpand = treeBody.classList.contains('is-collapsed');
    treeBody.classList.toggle('is-collapsed', !willExpand);
    toggleBtn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
  });

  // Auto-collapse drawer after picking a lesson on mobile so pastor reads right away
  document.querySelectorAll('.bp-topic-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        treeBody.classList.add('is-collapsed');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

/**
 * 2. Tree Navigation & Topic Selection
 */
function initBrightspaceTree() {
  const unitNodes = document.querySelectorAll('.bp-unit-node');
  const topicItems = document.querySelectorAll('.bp-topic-item');

  // Accordion Unit Headers
  unitNodes.forEach(node => {
    const header = node.querySelector('.bp-unit-header');
    const sublist = node.querySelector('.bp-topic-sublist');

    if (header && sublist) {
      header.addEventListener('click', (e) => {
        // Toggle this node
        const isExpanded = node.classList.contains('expanded');
        if (isExpanded) {
          node.classList.remove('expanded');
          sublist.style.display = 'none';
        } else {
          node.classList.add('expanded');
          sublist.style.display = 'flex';
        }
      });
    }
  });

  // Topic Item Click
  topicItems.forEach(item => {
    item.addEventListener('click', () => {
      const topicId = item.getAttribute('data-topic-id');
      const moduleId = item.getAttribute('data-module-id');
      loadTopic(moduleId, topicId, item);
    });
  });

  // Load first selected topic if available
  const initialSelected = document.querySelector('.bp-topic-item.selected');
  if (initialSelected) {
    const topicId = initialSelected.getAttribute('data-topic-id');
    const moduleId = initialSelected.getAttribute('data-module-id');
    loadTopic(moduleId, topicId, initialSelected);
  }
}

/**
 * Load and display topic content in the right pane
 */
function loadTopic(moduleId, topicId, topicElement) {
  currentModuleId = moduleId;
  currentTopicId = topicId;

  // 1. Highlight in sidebar
  document.querySelectorAll('.bp-topic-item').forEach(el => el.classList.remove('selected'));
  if (topicElement) {
    topicElement.classList.add('selected');
    const parentUnit = topicElement.closest('.bp-unit-node');
    if (parentUnit) {
      document.querySelectorAll('.bp-unit-node').forEach(u => u.classList.remove('active-unit'));
      parentUnit.classList.add('active-unit');
    }
  }

  // 2. Fetch data from embedded course object
  const course = window.PASTORS_LMS_COURSE;
  if (!course || !course.modulesWithTopics) return;

  const targetMod = course.modulesWithTopics.find(m => String(m.id) === String(moduleId));
  if (!targetMod) return;

  const targetTopic = (targetMod.topics || []).find(t => String(t.id) === String(topicId));
  if (!targetTopic) return;
  currentTopicTitle = targetTopic.title || '';

  // Check if module is locked by weekly unlock_date for students
  if (targetMod.isLocked) {
    const bodyContainer = document.getElementById('topicBodyContent');
    if (bodyContainer) {
      bodyContainer.innerHTML = `<div class="locked-module-notice"><h3>🔒 Unit Unlocks on ${targetMod.unlock_date}</h3><p>This unit is scheduled to open on <strong>${targetMod.unlock_date}</strong> according to the term calendar. Complete your current unit readings and discussions in the meantime.</p></div>`;
    }
    return;
  }

  // 3. Update Breadcrumb & Mobile Units Toggle Label
  const unitBreadcrumb = document.getElementById('toolbarUnitTitle');
  const topicBreadcrumb = document.getElementById('toolbarTopicTitle');
  const mobileLabel = document.getElementById('mobileUnitsToggleLabel');
  if (unitBreadcrumb) unitBreadcrumb.textContent = targetMod.title;
  if (topicBreadcrumb) topicBreadcrumb.textContent = targetTopic.title;
  if (mobileLabel) mobileLabel.textContent = `Units & Lessons — ${targetMod.title}`;

  // 4. Update Amber Banner Badge
  const bannerBadge = document.getElementById('bannerBadgeTitle');
  if (bannerBadge) {
    bannerBadge.textContent = targetTopic.bannerTitle || targetTopic.title;
  }

  // 5. Update Lesson Body Content
  const bodyContainer = document.getElementById('topicBodyContent');
  if (bodyContainer) {
    bodyContainer.innerHTML = targetTopic.contentHtml;
    renderTopicDeadlineBanner(bodyContainer, targetTopic);
    // Re-attach listeners for interactive quizzes and submission forms
    initBrightspaceInteractiveForms(targetTopic);
  }

  // 5b. Update Assigned Module / Course Instructor Card (WhatsApp & Email)
  updateModuleInstructorCard(course, targetMod);

  // 6. Update "Mark Complete" Button Status
  const isComplete = topicElement ? topicElement.classList.contains('completed') : false;
  updateMarkCompleteBtnState(isComplete);

  // Scroll to top of lesson body smoothly
  const mainPane = document.querySelector('.bp-main-pane');
  if (mainPane) {
    mainPane.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * 3. Search Titles & Descriptions Filter
 */
function initBrightspaceSearch() {
  const searchInput = document.getElementById('unitSearchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const unitNodes = document.querySelectorAll('.bp-unit-node');

    unitNodes.forEach(unit => {
      const unitTitle = (unit.querySelector('.bp-unit-title')?.textContent || '').toLowerCase();
      const topicItems = unit.querySelectorAll('.bp-topic-item');
      let unitHasMatch = unitTitle.includes(q);

      topicItems.forEach(topic => {
        const topicTitle = (topic.querySelector('.bp-topic-label')?.textContent || '').toLowerCase();
        if (topicTitle.includes(q) || unitHasMatch || q === '') {
          topic.style.display = 'flex';
          unitHasMatch = true;
        } else {
          topic.style.display = 'none';
        }
      });

      if (unitHasMatch || q === '') {
        unit.style.display = 'block';
        if (q !== '') {
          unit.classList.add('expanded');
          const sublist = unit.querySelector('.bp-topic-sublist');
          if (sublist) sublist.style.display = 'flex';
        }
      } else {
        unit.style.display = 'none';
      }
    });
  });
}

/**
 * 4. Top Toolbar (Prev/Next, Download, Fullscreen, Popout)
 */
function initBrightspaceToolbar() {
  const btnPrev = document.getElementById('btnPrevTopic');
  const btnNext = document.getElementById('btnNextTopic');
  const btnDownload = document.getElementById('btnDownloadTopic');
  const btnPopout = document.getElementById('btnPopoutTopic');
  const btnFullscreen = document.getElementById('btnFullscreenTopic');

  function navigateTopic(direction) {
    const allTopics = Array.from(document.querySelectorAll('.bp-topic-item'));
    if (!allTopics.length) return;

    const currentIndex = allTopics.findIndex(t => t.classList.contains('selected'));
    let targetIndex = currentIndex + direction;

    if (targetIndex >= 0 && targetIndex < allTopics.length) {
      const targetEl = allTopics[targetIndex];
      const parentUnit = targetEl.closest('.bp-unit-node');
      if (parentUnit) {
        parentUnit.classList.add('expanded');
        const sublist = parentUnit.querySelector('.bp-topic-sublist');
        if (sublist) sublist.style.display = 'flex';
      }
      const targetModId = targetEl.getAttribute('data-module-id');
      const targetTopicId = targetEl.getAttribute('data-topic-id');
      loadTopic(targetModId, targetTopicId, targetEl);
    }
  }

  if (btnPrev) btnPrev.addEventListener('click', () => navigateTopic(-1));
  if (btnNext) btnNext.addEventListener('click', () => navigateTopic(1));

  // Download printable study notes
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      const bannerTitle = document.getElementById('bannerBadgeTitle')?.textContent || 'Lesson';
      alert(`Downloading Pastoral Study Guide & Scriptures for: "${bannerTitle}" (Offline PDF format)`);
    });
  }

  // Popout reading view
  if (btnPopout) {
    btnPopout.addEventListener('click', () => {
      window.open(window.location.href, '_blank', 'width=1000,height=700');
    });
  }

  // Fullscreen reading mode
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
      } else {
        document.exitFullscreen().catch(err => console.log(err));
      }
    });
  }
}

function refreshCourseProgressUI() {
  const allTopics = document.querySelectorAll('.bp-topic-item');
  const completedTopics = document.querySelectorAll('.bp-topic-item.completed');
  const totalCount = allTopics.length;
  const completedCount = completedTopics.length;
  const coursePct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const sidebarPct = document.getElementById('courseSidebarPct');
  const sidebarBar = document.getElementById('courseSidebarBar');
  const sidebarCount = document.getElementById('courseSidebarTopicsCount');
  if (sidebarPct) sidebarPct.textContent = `${coursePct}%`;
  if (sidebarBar) sidebarBar.style.width = `${coursePct}%`;
  if (sidebarCount) sidebarCount.textContent = `${completedCount} of ${totalCount} lessons completed`;

  const homePct = document.getElementById('homeCoursePercent');
  const homeVal = document.getElementById('homeTopicsVal');
  const homeBar = document.getElementById('homeOverallBar');
  if (homePct) homePct.textContent = `${coursePct}%`;
  if (homeVal) homeVal.textContent = `${completedCount} / ${totalCount}`;
  if (homeBar) homeBar.style.width = `${coursePct}%`;

  // Sync each Course Home Module Card progress bar + count
  document.querySelectorAll('.bp-unit-node').forEach(unitNode => {
    const modId = unitNode.getAttribute('data-module-id');
    if (!modId) return;
    const modTopics = unitNode.querySelectorAll('.bp-topic-item');
    const modDone = unitNode.querySelectorAll('.bp-topic-item.completed');
    const mPct = modTopics.length > 0 ? Math.round((modDone.length / modTopics.length) * 100) : 0;
    const cardBar = document.getElementById(`homeModBar-${modId}`);
    const cardCount = document.getElementById(`homeModCount-${modId}`);
    if (cardBar) cardBar.style.width = `${mPct}%`;
    if (cardCount) cardCount.textContent = `${modDone.length}/${modTopics.length} Topics Completed`;
  });

  // Hide any completed items in the Work To Do widget
  const course = window.PASTORS_LMS_COURSE;
  if (course && course.id) {
    completedTopics.forEach(item => {
      const mId = item.getAttribute('data-module-id');
      const tId = item.getAttribute('data-topic-id');
      markWorkToDoDone(course.id, mId, tId);
    });
  }
}

function showTopicToast(message, isError = true) {
  const container = document.getElementById('topicBodyContent');
  if (!container) {
    alert(message);
    return;
  }
  const existing = document.getElementById('bpTopicToast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'bpTopicToast';
  toast.className = `bp-topic-toast ${isError ? 'bp-topic-toast-error' : 'bp-topic-toast-ok'}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.prepend(toast);
  toast.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTopicDeadlineBanner(container, topic) {
  if (!container || !topic) return;
  if (topic.examEligibility && !topic.examEligibility.eligible) {
    const elBanner = document.createElement('div');
    elBanner.className = 'exam-locked-banner';
    elBanner.innerHTML = `<strong>🔒 Final Exam Eligibility Requirement:</strong> Complete at least <strong>${Number(topic.examEligibility.requiredPercent)}%</strong> of course units &amp; activities before taking this exam (currently at <strong>${Number(topic.examEligibility.currentPercent)}%</strong>).`;
    container.prepend(elBanner);
    const submitQuiz = container.querySelector('#btnSubmitQuiz');
    if (submitQuiz) {
      submitQuiz.disabled = true;
      submitQuiz.textContent = 'Exam Locked (Complete Coursework First)';
    }
  }
  if (!topic.deadlineInfo) return;
  const info = topic.deadlineInfo;
  if (info.locked) {
    const banner = document.createElement('div');
    banner.className = 'deadline-locked-banner';
    banner.innerHTML = `<div><strong>🔒 Submissions Closed:</strong> The deadline for this unit (<strong>${escapeUiText(info.effectiveDueDate)} at 11:59 PM EAT</strong>) has passed. If you experienced an emergency or pastoral duty, request an extension from your instructor.</div><button type="button" class="btn btn-secondary btn-sm btn-open-ext-modal" id="btnLockedRequestExtension">Request Deadline Extension</button>`;
    container.prepend(banner);
    const reqBtn = banner.querySelector('#btnLockedRequestExtension');
    if (reqBtn) {
      reqBtn.addEventListener('click', () => openExtensionRequestModal(currentModuleId));
    }
    const submitAssign = container.querySelector('#btnSubmitAssignment');
    const submitQuiz = container.querySelector('#btnSubmitQuiz');
    if (submitAssign) {
      submitAssign.disabled = true;
      submitAssign.textContent = 'Deadline Passed (Locked)';
    }
    if (submitQuiz) {
      submitQuiz.disabled = true;
      submitQuiz.textContent = 'Deadline Passed (Locked)';
    }
  } else if (info.hasExtension && info.effectiveDueDate) {
    const banner = document.createElement('div');
    banner.className = 'deadline-extension-banner';
    banner.innerHTML = `<strong>📅 Deadline Extension Active:</strong> Your instructor granted you an extension until <strong>${escapeUiText(info.effectiveDueDate)} at 11:59 PM EAT</strong>.`;
    container.prepend(banner);
  }
}

async function setTopicCompletion(targetItem, shouldBeCompleted) {
  if (!targetItem) return false;
  const modId = targetItem.getAttribute('data-module-id') || currentModuleId;
  const topId = targetItem.getAttribute('data-topic-id') || currentTopicId;
  const btnComplete = document.getElementById('btnMarkTopicComplete');
  const courseId = (btnComplete && btnComplete.getAttribute('data-course-id')) || '1';
  const direction = shouldBeCompleted ? 'inc' : 'dec';

  if (btnComplete) btnComplete.disabled = true;

  try {
    const res = await fetch(`/courses/${courseId}/modules/${modId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, topicId: topId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showTopicToast(data.error || 'Could not update lesson completion status.', true);
      return false;
    }
  } catch (err) {
    console.warn('Could not sync completion to server:', err);
    showTopicToast('Connection required to verify and save completion.', true);
    return false;
  } finally {
    if (btnComplete) btnComplete.disabled = false;
  }

  if (shouldBeCompleted) {
    targetItem.classList.add('completed');
    if (!targetItem.querySelector('.bp-done-check')) {
      const checkSpan = document.createElement('span');
      checkSpan.className = 'bp-done-check';
      checkSpan.title = 'Completed';
      checkSpan.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      `;
      targetItem.appendChild(checkSpan);
    }
  } else {
    targetItem.classList.remove('completed');
    const checkIcon = targetItem.querySelector('.bp-done-check');
    if (checkIcon) checkIcon.remove();
  }

  if (targetItem.classList.contains('selected')) {
    updateMarkCompleteBtnState(shouldBeCompleted);
  }

  const parentUnit = targetItem.closest('.bp-unit-node');
  if (parentUnit) {
    const unitCompleted = parentUnit.querySelectorAll('.bp-topic-item.completed').length;
    const unitTotal = parentUnit.querySelectorAll('.bp-topic-item').length;
    const unitPct = unitTotal > 0 ? Math.round((unitCompleted / unitTotal) * 100) : 0;
    const progressEl = parentUnit.querySelector('.bp-unit-progress-text');
    if (progressEl) {
      progressEl.textContent = `${unitCompleted}/${unitTotal} Completed (${unitPct}%)`;
    }
    const modBar = document.getElementById(`modBar-${modId}`);
    if (modBar) {
      modBar.style.width = `${unitPct}%`;
    }
    parentUnit.classList.toggle('module-complete', unitTotal > 0 && unitCompleted >= unitTotal);
  }

  refreshCourseProgressUI();
  return true;
}

/**
 * 5. Topic Footer Navigation & Interactive Mark Complete
 */
function initBrightspaceTopicFooter() {
  const footerBtnPrev = document.getElementById('footerBtnPrev');
  const footerBtnNext = document.getElementById('footerBtnNext');
  const btnComplete = document.getElementById('btnMarkTopicComplete');

  if (footerBtnPrev) {
    footerBtnPrev.addEventListener('click', () => {
      const btnPrev = document.getElementById('btnPrevTopic');
      if (btnPrev) btnPrev.click();
    });
  }

  if (footerBtnNext) {
    footerBtnNext.addEventListener('click', async () => {
      const selectedItem = document.querySelector('.bp-topic-item.selected');
      const topicType = selectedItem ? selectedItem.getAttribute('data-topic-type') : '';
      if (selectedItem && !selectedItem.classList.contains('completed') && (topicType === 'doc' || topicType === 'reading')) {
        await setTopicCompletion(selectedItem, true);
      }
      const btnNext = document.getElementById('btnNextTopic');
      if (btnNext) btnNext.click();
    });
  }

  if (btnComplete) {
    btnComplete.addEventListener('click', async () => {
      const selectedItem = document.querySelector('.bp-topic-item.selected');
      if (!selectedItem) return;
      const isCompleted = selectedItem.classList.contains('completed');
      await setTopicCompletion(selectedItem, !isCompleted);
    });
  }
}

function updateMarkCompleteBtnState(isCompleted) {
  const btn = document.getElementById('btnMarkTopicComplete');
  const label = document.getElementById('markCompleteBtnLabel');
  if (!btn || !label) return;

  if (isCompleted) {
    btn.classList.add('is-completed');
    btn.classList.remove('btn-accent');
    label.textContent = 'Completed ✓';
  } else {
    btn.classList.remove('is-completed');
    btn.classList.add('btn-accent');
    label.textContent = 'Mark as Completed';
  }
}

/**
 * 6. Interactive Quizzes & Assignment Submissions inside Content Body
 */
function initBrightspaceInteractiveForms(targetTopic = null) {
  if (activeExamTimer) {
    clearInterval(activeExamTimer);
    activeExamTimer = null;
  }

  const course = window.PASTORS_LMS_COURSE;
  const courseId = course ? course.id : null;
  const isDeadlineLocked = Boolean(targetTopic && targetTopic.deadlineInfo && targetTopic.deadlineInfo.locked);

  // Discussion CTA buttons inside custom lessons
  document.querySelectorAll('.btn-open-discussions').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.switchBrightspaceTab) window.switchBrightspaceTab('discussions');
    });
  });

  // Restore any previously saved assignment submission & instructor grade
  const existingSub = cachedCourseSubmissions.find(s => String(s.topic_id) === String(currentTopicId));
  const submitAssignmentBtn = document.getElementById('btnSubmitAssignment');
  if (submitAssignmentBtn) {
    const textarea = document.getElementById('assignmentInput');
    const pledgeCheck = document.getElementById('integrityPledgeCheck');
    const successMsg = document.getElementById('assignmentSuccessMsg');
    const gradeBox = document.getElementById('assignmentGradeBox');
    const wrap = submitAssignmentBtn.closest('.assignment-submission-box, .interactive-submission-area');
    const subType = (wrap && wrap.getAttribute('data-submission-type')) || 'assignment';

    if (existingSub && existingSub.content_text && textarea) {
      textarea.value = existingSub.content_text;
      if (!isDeadlineLocked) submitAssignmentBtn.textContent = 'Update Submission';
      if (successMsg) {
        successMsg.style.display = 'inline-block';
        successMsg.textContent = existingSub.status === 'graded'
          ? `✓ Graded (${existingSub.score}/${existingSub.max_score} — ${existingSub.grade_letter})`
          : '✓ Previously submitted (awaiting instructor grade)';
      }
      if (gradeBox && existingSub.status === 'graded') {
        gradeBox.hidden = false;
        gradeBox.innerHTML = `<strong>Instructor Grade:</strong> ${existingSub.score}/${existingSub.max_score} (${existingSub.grade_letter})`
          + (existingSub.feedback ? `<p><strong>Pastoral Feedback:</strong> ${escapeUiText(existingSub.feedback)}</p>` : '');
      }
    }

    submitAssignmentBtn.addEventListener('click', async () => {
      if (isDeadlineLocked) return;
      if (!textarea || textarea.value.trim().length < 10) {
        alert('Please write your pastoral reflection (at least 10 characters) before submitting.');
        if (textarea) textarea.focus();
        return;
      }
      if (pledgeCheck && !pledgeCheck.checked) {
        alert('Please tick the Academic Honesty Pledge confirming this is your own original work.');
        pledgeCheck.focus();
        return;
      }
      if (!courseId) return;

      submitAssignmentBtn.disabled = true;
      submitAssignmentBtn.textContent = 'Saving...';

      try {
        const res = await fetch(`/api/courses/${courseId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module_id: currentModuleId,
            topic_id: currentTopicId,
            topic_title: currentTopicTitle,
            submission_type: subType,
            content_text: textarea.value.trim(),
            integrity_pledge: pledgeCheck ? pledgeCheck.checked : true
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Could not save submission.');
        }

        if (successMsg) {
          successMsg.style.display = 'inline-block';
          successMsg.textContent = '✓ Saved and sent to your instructor for grading!';
        }
        submitAssignmentBtn.textContent = 'Update Submission ✓';
        submitAssignmentBtn.disabled = false;
        fetchMyCourseSubmissions(false);

        const selectedItem = document.querySelector('.bp-topic-item.selected');
        if (selectedItem && !selectedItem.classList.contains('completed')) {
          await setTopicCompletion(selectedItem, true);
        }
      } catch (err) {
        alert(err.message || 'Unable to submit right now. If you are offline, copy your response and try again when connected.');
        submitAssignmentBtn.disabled = false;
        submitAssignmentBtn.textContent = 'Submit to Instructor';
      }
    });
  }

  // Server-Graded Quiz / Timed Exam Engine (answer keys stay strictly on backend)
  const submitQuizBtn = document.getElementById('btnSubmitQuiz');
  if (submitQuizBtn) {
    const quizWrap = submitQuizBtn.closest('.graded-quiz-wrapper');
    const quizType = (quizWrap && quizWrap.getAttribute('data-quiz-type')) || 'quiz';
    const timeLimitMin = Number((quizWrap && quizWrap.getAttribute('data-time-limit')) || 0);
    let timedOut = false;

    if (timeLimitMin > 0 && !isDeadlineLocked) {
      let remainingSec = timeLimitMin * 60;
      const timerDisplay = document.getElementById('quizTimerDisplay');
      activeExamTimer = setInterval(() => {
        remainingSec -= 1;
        if (timerDisplay) {
          const m = Math.max(0, Math.floor(remainingSec / 60));
          const s = Math.max(0, remainingSec % 60);
          timerDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`;
        }
        if (remainingSec <= 0) {
          clearInterval(activeExamTimer);
          activeExamTimer = null;
          timedOut = true;
          if (!submitQuizBtn.disabled) submitQuizBtn.click();
        }
      }, 1000);
    }

    submitQuizBtn.addEventListener('click', async () => {
      if (isDeadlineLocked || !courseId) return;
      const questionCards = document.querySelectorAll('.quiz-question-card');
      const answers = {};
      let firstMissingEl = null;

      questionCards.forEach(card => {
        const qNum = card.getAttribute('data-q');
        const selectedRadio = card.querySelector(`input[name="q${qNum}"]:checked`);
        const feedbackEl = document.getElementById(`feedback-q${qNum}`);

        if (!selectedRadio) {
          if (!firstMissingEl) firstMissingEl = card;
          if (feedbackEl) {
            feedbackEl.className = 'quiz-feedback incorrect';
            feedbackEl.textContent = '⚠️ Please select an answer before submitting.';
          }
          return;
        }
        if (feedbackEl) {
          feedbackEl.className = 'quiz-feedback';
          feedbackEl.textContent = '';
        }
        answers[`q${qNum}`] = selectedRadio.value;
      });

      if (firstMissingEl && !timedOut) {
        firstMissingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (activeExamTimer) {
        clearInterval(activeExamTimer);
        activeExamTimer = null;
      }

      const originalLabel = submitQuizBtn.textContent;
      submitQuizBtn.disabled = true;
      submitQuizBtn.textContent = 'Grading on server...';

      const scoreDisplay = document.getElementById('quizScoreDisplay');
      try {
        const res = await fetch(`/api/courses/${courseId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module_id: currentModuleId,
            topic_id: currentTopicId,
            topic_title: currentTopicTitle,
            submission_type: quizType,
            quiz_answers: answers
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (scoreDisplay) {
            scoreDisplay.style.display = 'inline-block';
            scoreDisplay.textContent = data.error || 'Could not grade quiz.';
          }
          submitQuizBtn.disabled = false;
          submitQuizBtn.textContent = originalLabel;
          return;
        }

        const results = data.results || {};
        questionCards.forEach(card => {
          const qNum = card.getAttribute('data-q');
          const r = results[`q${qNum}`];
          const feedbackEl = document.getElementById(`feedback-q${qNum}`);
          if (!feedbackEl || !r) return;
          if (r.correct) {
            feedbackEl.className = 'quiz-feedback correct';
            feedbackEl.textContent = '✓ Correct! Sound theological answer.';
          } else {
            feedbackEl.className = 'quiz-feedback incorrect';
            feedbackEl.textContent = r.correctOption
              ? `✗ Not quite. The correct answer was (${String(r.correctOption).toUpperCase()}).`
              : '✗ Incorrect answer.';
          }
        });

        if (scoreDisplay) {
          scoreDisplay.style.display = 'inline-block';
          if (data.isPractice) {
            scoreDisplay.textContent = `Practice Score: ${data.correctCount}/${data.totalQuestions} (${data.percent}%) • Unlimited Practice (Ungraded)`;
          } else {
            const statusWord = data.passed ? 'Passed' : `Pass requires ${data.passScore || 60}%`;
            scoreDisplay.textContent = `Recorded: ${data.correctCount}/${data.totalQuestions} (${data.percent}%) • ${statusWord} • Attempt #${data.attemptsUsed} (${data.attemptsRemaining} left)`;
          }
        }

        fetchMyCourseSubmissions(false);

        if (data.passed) {
          const selectedItem = document.querySelector('.bp-topic-item.selected');
          if (selectedItem && !selectedItem.classList.contains('completed')) {
            await setTopicCompletion(selectedItem, true);
          }
        }
        const outOfAttempts = !data.isPractice && typeof data.attemptsRemaining === 'number' && data.attemptsRemaining <= 0;
        submitQuizBtn.disabled = outOfAttempts;
        submitQuizBtn.textContent = outOfAttempts ? 'Max Attempts Reached' : originalLabel;
      } catch {
        alert('Quiz grading requires an internet connection. Please try again when connected.');
        submitQuizBtn.disabled = false;
        submitQuizBtn.textContent = originalLabel;
      }
    });
  }
}

function escapeUiText(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fetch logged-in student's saved submissions & refresh Gradebook tab
 */
async function fetchMyCourseSubmissions(renderGradebook = false) {
  const course = window.PASTORS_LMS_COURSE;
  if (!course || !course.id) return;
  try {
    const res = await fetch(`/api/courses/${course.id}/submissions`);
    const data = await res.json();
    if (!data || !data.success) return;
    cachedCourseSubmissions = data.submissions || [];

    if (renderGradebook && data.summary) {
      const s = data.summary;
      const gCount = document.getElementById('gbGradedCount');
      const gAvg = document.getElementById('gbAveragePct');
      const gLet = document.getElementById('gbLetterGrade');
      const tbody = document.getElementById('gradebookTableBody');
      if (gCount) gCount.textContent = String(s.gradedCount || 0);
      if (gAvg) gAvg.textContent = s.averagePercent !== null ? `${s.averagePercent}%` : '—';
      if (gLet) gLet.textContent = s.letterGrade || 'IP';

      const weightsGrid = document.getElementById('gradebookWeightsGrid');
      if (weightsGrid && Array.isArray(s.categoryBreakdown)) {
        weightsGrid.innerHTML = s.categoryBreakdown.map(cat => `
          <div class="gb-weight-card">
            <span class="gb-weight-label">${escapeUiText(cat.label)} (${cat.weight}%)</span>
            <strong class="gb-weight-val">${cat.averagePercent !== null ? `${cat.averagePercent}%` : '—'}</strong>
          </div>
        `).join('');
      }

      if (tbody) {
        if (!s.items || s.items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5">No graded assessments recorded yet. Submit an assignment, quiz, or discussion post to build your gradebook.</td></tr>';
        } else {
          tbody.innerHTML = s.items.map(item => `
            <tr>
              <td>
                <strong>${escapeUiText(item.title)}</strong>
                ${item.integrity_flagged ? `<span class="integrity-flag-pill">⚠️ Integrity Review</span>` : ''}
              </td>
              <td>${escapeUiText(item.type)}</td>
              <td>${item.score} / ${item.max_score} (${item.percent}%)</td>
              <td><strong>${escapeUiText(item.letter)}</strong></td>
              <td>${escapeUiText(item.feedback || '—')}${item.integrity_flagged && item.integrity_flag_reason ? ` — Flag note: ${escapeUiText(item.integrity_flag_reason)}` : ''}</td>
            </tr>
          `).join('');
        }
      }
    }
  } catch {
    // offline fallback
  }
}

/**
 * Cohort Discussion Forum & Peer Feedback Controller
 */
function initDiscussionForum() {
  const modSelect = document.getElementById('discussionModuleSelect');
  const form = document.getElementById('newDiscussionForm');
  if (modSelect) {
    modSelect.addEventListener('change', loadDiscussionForum);
  }
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const course = window.PASTORS_LMS_COURSE;
      const bodyEl = document.getElementById('discussionPostBody');
      const statusEl = document.getElementById('discussionPostStatus');
      const moduleId = modSelect ? modSelect.value : (currentModuleId || 1);
      if (!course || !bodyEl || bodyEl.value.trim().length < 5) return;

      try {
        const res = await fetch(`/api/courses/${course.id}/modules/${moduleId}/discussions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: bodyEl.value.trim() })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Could not post.');
        bodyEl.value = '';
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = '✓ Posted to your cohort discussion!';
        }
        markWorkToDoDone(course.id, moduleId, 'discussion');
        loadDiscussionForum();
      } catch (err) {
        alert(err.message || 'Unable to post discussion right now.');
      }
    });
  }
}

async function loadDiscussionForum() {
  const course = window.PASTORS_LMS_COURSE;
  const modSelect = document.getElementById('discussionModuleSelect');
  const listEl = document.getElementById('discussionThreadsList');
  const peerEl = document.getElementById('peerSubmissionsList');
  if (!course || !listEl) return;

  const moduleId = modSelect ? modSelect.value : (currentModuleId || 1);
  try {
    const res = await fetch(`/api/courses/${course.id}/modules/${moduleId}/discussions`);
    const data = await res.json();
    if (!data || !data.success) return;

    const posts = data.posts || [];
    const topPosts = posts.filter(p => !p.parent_id);
    const repliesByParent = {};
    posts.filter(p => p.parent_id).forEach(r => {
      repliesByParent[r.parent_id] = repliesByParent[r.parent_id] || [];
      repliesByParent[r.parent_id].push(r);
    });

    if (topPosts.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Be the first pastor to share a reflection in this unit\'s cohort forum!</p></div>';
    } else {
      listEl.innerHTML = topPosts.map(p => {
        const isStaff = ['teacher', 'admin', 'super_admin'].includes(p.author_role);
        const replies = repliesByParent[p.id] || [];
        return `
          <article class="discussion-post-card">
            <div class="discussion-post-meta">
              <strong>${escapeUiText(p.author_name)}</strong>
              ${isStaff ? '<span class="lecturer-scope-tag lecturer-scope-module">Instructor</span>' : '<span class="lecturer-scope-tag lecturer-scope-course">Cohort Pastor</span>'}
              <span class="discussion-post-date">${new Date(p.created_at).toLocaleString()}</span>
              ${p.grade_score !== null && p.grade_score !== undefined ? `<span class="discussion-grade-pill">Score: ${p.grade_score}/100</span>` : ''}
            </div>
            <p class="discussion-post-body">${escapeUiText(p.body)}</p>
            ${replies.length ? `<div class="discussion-replies">${replies.map(r => `
              <div class="discussion-reply-item">
                <strong>${escapeUiText(r.author_name)}</strong>
                ${['teacher', 'admin', 'super_admin'].includes(r.author_role) ? '<span class="lecturer-scope-tag lecturer-scope-module">Instructor</span>' : ''}
                <span class="discussion-post-date">${new Date(r.created_at).toLocaleString()}</span>
                <p>${escapeUiText(r.body)}</p>
              </div>
            `).join('')}</div>` : ''}
            <form class="discussion-reply-form" data-parent-id="${escapeUiText(p.id)}">
              <input type="text" class="form-input discussion-reply-input" placeholder="Reply to ${escapeUiText(p.author_name)}..." required>
              <button type="submit" class="btn btn-secondary btn-sm">Reply</button>
            </form>
          </article>
        `;
      }).join('');

      listEl.querySelectorAll('.discussion-reply-form').forEach(rForm => {
        rForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const input = rForm.querySelector('.discussion-reply-input');
          const parentId = rForm.getAttribute('data-parent-id');
          if (!input || input.value.trim().length < 5) return;
          await fetch(`/api/courses/${course.id}/modules/${moduleId}/discussions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id: parentId, body: input.value.trim() })
          });
          loadDiscussionForum();
        });
      });
    }

    // Peer Feedback List
    if (peerEl) {
      const peers = data.peerSubmissions || [];
      if (peers.length === 0) {
        peerEl.innerHTML = '<p class="lecturer-subtitle">No fellow pastors\' written submissions in this unit yet. Check back once your cohort submits.</p>';
      } else {
        peerEl.innerHTML = peers.map(ps => `
          <article class="peer-card">
            <div class="discussion-post-meta">
              <strong>${escapeUiText(ps.student_name)}</strong> &mdash; <span>${escapeUiText(ps.topic_title || 'Reflection')}</span>
            </div>
            <p class="discussion-post-body">${escapeUiText(ps.content_text)}</p>
            ${ps.reviews && ps.reviews.length ? `<div class="peer-reviews-existing">${ps.reviews.map(rv => `
              <div class="peer-review-note">
                <strong>${escapeUiText(rv.reviewer_name)}</strong>
                (${rv.rubric_percent ? `Rubric: ${rv.rubric_percent}%` : `${rv.rating}/5 ★`}):
                ${escapeUiText(rv.feedback)}
              </div>
            `).join('')}</div>` : ''}
            <form class="peer-review-form" data-sub-id="${escapeUiText(ps.id)}">
              <div class="peer-rubric-grid">
                <label class="peer-rubric-field">
                  <span>Biblical Exegesis</span>
                  <select class="form-input peer-rubric-scripture" aria-label="Biblical Exegesis rating">
                    <option value="5">5 — Scripture-rich</option>
                    <option value="4">4 — Clear Scriptural basis</option>
                    <option value="3">3 — Adequate</option>
                    <option value="2">2 — Needs more text</option>
                    <option value="1">1 — Lacking text</option>
                  </select>
                </label>
                <label class="peer-rubric-field">
                  <span>Pastoral Application</span>
                  <select class="form-input peer-rubric-application" aria-label="Pastoral Application rating">
                    <option value="5">5 — Wise &amp; practical</option>
                    <option value="4">4 — Helpful ministry fit</option>
                    <option value="3">3 — General</option>
                    <option value="2">2 — Needs application</option>
                    <option value="1">1 — Off-topic</option>
                  </select>
                </label>
                <label class="peer-rubric-field">
                  <span>Clarity &amp; Shepherd Tone</span>
                  <select class="form-input peer-rubric-clarity" aria-label="Clarity rating">
                    <option value="5">5 — Clear &amp; gracious</option>
                    <option value="4">4 — Well-structured</option>
                    <option value="3">3 — Understandable</option>
                    <option value="2">2 — Needs clarity</option>
                    <option value="1">1 — Unclear</option>
                  </select>
                </label>
              </div>
              <div class="peer-review-submit-row">
                <input type="text" class="form-input peer-feedback-input" placeholder="Share encouraging biblical feedback..." required>
                <button type="submit" class="btn btn-primary btn-sm">Submit Rubric Feedback</button>
              </div>
            </form>
          </article>
        `).join('');

        peerEl.querySelectorAll('.peer-review-form').forEach(pForm => {
          pForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const subId = pForm.getAttribute('data-sub-id');
            const rScripture = pForm.querySelector('.peer-rubric-scripture')?.value || '5';
            const rApplication = pForm.querySelector('.peer-rubric-application')?.value || '5';
            const rClarity = pForm.querySelector('.peer-rubric-clarity')?.value || '5';
            const fbInput = pForm.querySelector('.peer-feedback-input');
            if (!fbInput || fbInput.value.trim().length < 8) {
              alert('Please write at least 8 characters of encouraging feedback.');
              return;
            }
            const r = await fetch(`/api/courses/${course.id}/submissions/${subId}/peer-review`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rubric_scripture: rScripture,
                rubric_application: rApplication,
                rubric_clarity: rClarity,
                feedback: fbInput.value.trim()
              })
            });
            const j = await r.json();
            if (!j.success) alert(j.error || 'Could not save peer review.');
            else loadDiscussionForum();
          });
        });
      }
    }
  } catch {
    listEl.innerHTML = '<p class="lecturer-subtitle">Discussions require an internet connection to load new posts.</p>';
  }
}

/**
 * Offline Course Caching Button (PWA)
 */
function initOfflineCourseSave() {
  const btn = document.getElementById('btnSaveCourseOffline');
  const statusEl = document.getElementById('offlineSaveStatus');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const courseUrl = btn.getAttribute('data-course-url') || window.location.pathname;
    if (!('caches' in window)) {
      if (statusEl) statusEl.textContent = 'Offline saving is not supported by this browser.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Saving for offline reading...';
    try {
      const cache = await caches.open('pastors-lms-lessons-v2');
      await cache.addAll([
        courseUrl,
        '/courses',
        '/css/global.css',
        '/css/course.css',
        '/css/dashboard.css',
        '/css/footer.css',
        '/js/course-brightspace.js',
        '/js/app.js'
      ]);
      btn.textContent = '✓ Saved for Offline Reading';
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = '✓ This course and all its unit readings are saved on your device! You can open it even without internet.';
      }
    } catch {
      btn.disabled = false;
      btn.textContent = '📥 Save for Offline';
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = 'Could not save right now. Check your connection and try again.';
      }
    }
  });
}

/**
 * Filter topics by type (invoked from top activities submenu)
 */
function selectTopicByType(type) {
  const firstMatch = document.querySelector(`.bp-topic-item[data-topic-type="${type}"]`);
  if (firstMatch) {
    const topicId = firstMatch.getAttribute('data-topic-id');
    const moduleId = firstMatch.getAttribute('data-module-id');
    loadTopic(moduleId, topicId, firstMatch);
    
    // Switch to content tab if on home
    const tabContent = document.getElementById('tabNavContent');
    if (tabContent) tabContent.click();
  } else {
    alert(`No ${type} activities found in this current unit.`);
  }
}

/**
 * Update the Module / Course Instructor Contact Card (WhatsApp & Email)
 */
function updateModuleInstructorCard(course, targetMod) {
  const card = document.getElementById('moduleInstructorCard');
  if (!card) return;

  const instructor = (targetMod && targetMod.instructor) || (course && course.courseInstructor) || null;
  if (!instructor) {
    card.hidden = true;
    return;
  }

  const avatarEl = document.getElementById('instructorAvatar');
  const scopeEl = document.getElementById('instructorScopeLabel');
  const nameEl = document.getElementById('instructorName');
  const waBtn = document.getElementById('btnWhatsAppInstructor');
  const emailBtn = document.getElementById('btnEmailInstructor');

  if (avatarEl) avatarEl.textContent = instructor.initials || 'T';
  if (scopeEl) {
    scopeEl.textContent = instructor.scope === 'module'
      ? `Module Lecturer • ${course.code || ''}`
      : `Course Lecturer • ${course.code || ''}`;
  }
  if (nameEl) nameEl.textContent = instructor.full_name || 'Instructor';

  const studentName = (course && course.studentFullName) || 'a student';
  const modTitle = (targetMod && targetMod.title) || (course && course.title) || '';
  const courseCode = (course && course.code) || 'Pastors LMS';

  if (waBtn) {
    if (instructor.whatsapp_digits) {
      const msg = encodeURIComponent(
        `Hello ${instructor.full_name}, I am ${studentName} studying ${courseCode} (${modTitle}). I have a question about this lesson.`
      );
      waBtn.href = `https://wa.me/${instructor.whatsapp_digits}?text=${msg}`;
      waBtn.hidden = false;
    } else {
      waBtn.hidden = true;
    }
  }

  if (emailBtn) {
    if (instructor.email) {
      const subject = encodeURIComponent(`${courseCode} - ${modTitle} | Question from ${studentName}`);
      const body = encodeURIComponent(
        `Dear ${instructor.full_name},\n\nI am ${studentName}, enrolled in ${courseCode} (${modTitle}).\n\nMy question:\n`
      );
      emailBtn.href = `mailto:${instructor.email}?subject=${subject}&body=${body}`;
      emailBtn.hidden = false;
    } else {
      emailBtn.hidden = true;
    }
  }

  card.hidden = false;
}

/**
 * Mark a completed activity hidden in the right-rail Work To Do widget
 */
function markWorkToDoDone(courseId, moduleId, topicId) {
  const selector = `.wtd-item[data-course-id="${CSS.escape(String(courseId))}"][data-module-id="${CSS.escape(String(moduleId))}"][data-topic-id="${CSS.escape(String(topicId))}"]`;
  document.querySelectorAll(selector).forEach(el => {
    el.hidden = true;
  });
  if (typeof window.syncWorkToDoCounts === 'function') {
    window.syncWorkToDoCounts();
  }
}

/**
 * Jump directly to a specific module (and optional topic) inside Content tab
 */
function openSpecificModuleAndTopic(moduleId, topicId) {
  const unitNode = document.querySelector(`.bp-unit-node[data-module-id="${CSS.escape(String(moduleId))}"]`);
  if (unitNode) {
    // Expand that module in the syllabus tree
    document.querySelectorAll('.bp-unit-node').forEach(u => {
      u.classList.remove('active-unit', 'expanded');
      const list = u.querySelector('.bp-topic-sublist');
      if (list) list.style.display = 'none';
    });
    unitNode.classList.add('active-unit', 'expanded');
    const sublist = unitNode.querySelector('.bp-topic-sublist');
    if (sublist) sublist.style.display = 'flex';
  }

  let targetItem = null;
  if (topicId) {
    targetItem = document.querySelector(`.bp-topic-item[data-module-id="${CSS.escape(String(moduleId))}"][data-topic-id="${CSS.escape(String(topicId))}"]`)
      || document.querySelector(`.bp-topic-item[data-topic-id="${CSS.escape(String(topicId))}"]`);
  }
  if (!targetItem && unitNode) {
    targetItem = unitNode.querySelector('.bp-topic-item');
  }

  if (typeof window.switchBrightspaceTab === 'function') {
    window.switchBrightspaceTab('content');
  }
  if (targetItem) {
    loadTopic(
      targetItem.getAttribute('data-module-id'),
      targetItem.getAttribute('data-topic-id'),
      targetItem
    );
    targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Make every Course Home Module Card clickable to jump straight into that unit
 */
function initHomeModuleCards() {
  document.querySelectorAll('.uop-module-card[data-open-module]').forEach(card => {
    const modId = card.getAttribute('data-open-module');
    if (!modId) return;
    card.addEventListener('click', () => openSpecificModuleAndTopic(modId, null));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openSpecificModuleAndTopic(modId, null);
      }
    });
  });
}

/**
 * Intercept Work To Do clicks on the Course Home page for instant tab/topic navigation
 */
function initCourseWorkToDoLinks() {
  const widget = document.getElementById('workToDoWidget');
  if (!widget || widget.getAttribute('data-course-context') !== 'true') return;

  const course = window.PASTORS_LMS_COURSE;
  if (!course) return;

  widget.querySelectorAll('.wtd-item-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetCourseId = link.getAttribute('data-course-id');
      if (String(targetCourseId) !== String(course.id)) return; // let normal link navigate to other course

      e.preventDefault();
      const action = link.getAttribute('data-wtd-action');
      const modId = link.getAttribute('data-module-id');
      const topicId = link.getAttribute('data-topic-id');

      if (action === 'open-discussion') {
        const modSelect = document.getElementById('discussionModuleSelect');
        if (modSelect && modId) modSelect.value = String(modId);
        if (typeof window.switchBrightspaceTab === 'function') {
          window.switchBrightspaceTab('discussions');
        }
      } else {
        openSpecificModuleAndTopic(modId, topicId);
      }
    });
  });
}

/**
 * Honor URL deep links from Dashboard Work To Do (?openModule=...&openTopic=..., ?tab=discussions&module=...)
 */
function applyUrlDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const openModule = params.get('openModule') || params.get('module');
  const openTopic = params.get('openTopic');

  if (tab === 'discussions') {
    const modSelect = document.getElementById('discussionModuleSelect');
    if (modSelect && openModule) modSelect.value = String(openModule);
    if (typeof window.switchBrightspaceTab === 'function') {
      window.switchBrightspaceTab('discussions');
    }
    return;
  }

  if (tab === 'classlist') {
    if (typeof window.switchBrightspaceTab === 'function') {
      window.switchBrightspaceTab('classlist');
    }
    return;
  }

  if (tab === 'grades') {
    if (typeof window.switchBrightspaceTab === 'function') {
      window.switchBrightspaceTab('grades');
    }
    return;
  }

  if (openModule || openTopic) {
    openSpecificModuleAndTopic(openModule || currentModuleId || '1', openTopic);
    return;
  }

  if (tab === 'content' && typeof window.switchBrightspaceTab === 'function') {
    window.switchBrightspaceTab('content');
  }
}

/**
 * Student Deadline Extension Request Modal Controller
 */
function openExtensionRequestModal(defaultModuleId = null) {
  const modal = document.getElementById('extensionRequestModal');
  if (!modal) return;
  const modSelect = document.getElementById('extReqModuleSelect');
  const dateInput = document.getElementById('extReqDateInput');
  const feedbackEl = document.getElementById('extReqFeedbackMsg');
  if (modSelect && defaultModuleId) {
    modSelect.value = String(defaultModuleId);
  }
  if (dateInput && !dateInput.value) {
    const plusFourDays = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    dateInput.value = plusFourDays;
  }
  if (feedbackEl) feedbackEl.hidden = true;
  modal.hidden = false;
}

function initExtensionRequestModal() {
  const modal = document.getElementById('extensionRequestModal');
  const form = document.getElementById('extensionRequestForm');
  const btnClose = document.getElementById('btnCloseExtModal');
  const btnCancel = document.getElementById('btnCancelExtModal');
  const listEl = document.getElementById('myExtRequestsList');
  const feedbackEl = document.getElementById('extReqFeedbackMsg');
  const course = window.PASTORS_LMS_COURSE;
  if (!modal) return;

  function closeExtModal() {
    modal.hidden = true;
  }

  if (btnClose) btnClose.addEventListener('click', closeExtModal);
  if (btnCancel) btnCancel.addEventListener('click', closeExtModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeExtModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeExtModal();
  });

  async function refreshExtensionRequests() {
    if (!course || !course.id || !listEl) return;
    try {
      const res = await fetch(`/api/courses/${course.id}/extension-requests`);
      const data = await res.json();
      if (!data || !data.success) return;
      const reqs = data.requests || [];
      if (reqs.length === 0) {
        listEl.innerHTML = '<p class="lecturer-subtitle">No extension requests submitted for this course yet.</p>';
        return;
      }
      listEl.innerHTML = reqs.map(r => `
        <div class="ext-req-row">
          <div>
            <strong>Until ${escapeUiText(r.requested_until)}</strong> &mdash; ${escapeUiText(r.reason)}
            ${r.reviewer_note ? `<div class="ext-reviewer-note">Instructor note: ${escapeUiText(r.reviewer_note)}</div>` : ''}
          </div>
          <span class="ext-status-pill ext-status-${escapeUiText(r.status)}">${escapeUiText(r.status)}</span>
        </div>
      `).join('');
    } catch {
      // ignore offline
    }
  }

  if (form && course && course.id) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const modId = document.getElementById('extReqModuleSelect')?.value;
      const reqDate = document.getElementById('extReqDateInput')?.value;
      const reasonEl = document.getElementById('extReqReasonInput');
      const reason = (reasonEl ? reasonEl.value : '').trim();
      const submitBtn = document.getElementById('btnSubmitExtReq');
      if (reason.length < 6) {
        alert('Please briefly describe your reason (at least 6 characters).');
        if (reasonEl) reasonEl.focus();
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch(`/api/courses/${course.id}/extension-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module_id: modId,
            requested_until: reqDate,
            reason
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Could not submit request.');
        }
        if (reasonEl) reasonEl.value = '';
        if (feedbackEl) {
          feedbackEl.hidden = false;
          feedbackEl.textContent = '✓ Request sent to your instructor for review.';
        }
        await refreshExtensionRequests();
      } catch (err) {
        alert(err.message || 'Unable to send request right now.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}
