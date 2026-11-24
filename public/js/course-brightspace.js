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
  const tabGrades = document.getElementById('tabNavGrades');
  const viewHome = document.getElementById('viewHome');
  const viewContent = document.getElementById('viewContent');
  const viewDiscussions = document.getElementById('viewDiscussions');
  const viewGrades = document.getElementById('viewGrades');
  const btnGoContent = document.getElementById('btnGoToContentFromHome');

  if (!tabHome || !tabContent) return;

  function showTab(tabName) {
    const allTabs = [tabHome, tabContent, tabDiscussions, tabGrades].filter(Boolean);
    allTabs.forEach(t => t.classList.remove('active'));
    [viewHome, viewContent, viewDiscussions, viewGrades].forEach(v => {
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
      if (viewDiscussions) {
        viewDiscussions.classList.remove('bp-view-hidden');
        viewDiscussions.hidden = false;
      }
      const modSelect = document.getElementById('discussionModuleSelect');
      if (modSelect && currentModuleId) modSelect.value = String(currentModuleId);
      loadDiscussionForum();
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
  if (tabGrades) tabGrades.addEventListener('click', () => showTab('grades'));
  if (btnGoContent) {
    btnGoContent.addEventListener('click', () => showTab('content'));
  }
}

/**
 * 1b. Click-Toggleable Activities Dropdown & Top Bar Utility Icons
 */
function initBrightspaceTopActions() {
  const dropWrap = document.getElementById('activitiesDropdownWrap');
  const dropBtn = document.getElementById('btnActivitiesDropdown');
  const dropMenu = document.getElementById('activitiesDropdownMenu');

  function closeActivitiesMenu() {
    if (dropWrap) dropWrap.classList.remove('open');
    if (dropBtn) dropBtn.setAttribute('aria-expanded', 'false');
  }

  if (dropWrap && dropBtn && dropMenu) {
    dropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !dropWrap.classList.contains('open');
      dropWrap.classList.toggle('open', willOpen);
      dropBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    dropMenu.querySelectorAll('[data-activity-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.getAttribute('data-activity-action');
        closeActivitiesMenu();
        if (action === 'discussions') {
          if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('discussions');
        } else if (action) {
          selectTopicByType(action);
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!dropWrap.contains(e.target)) closeActivitiesMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeActivitiesMenu();
    });
  }

  // Top-bar quick actions
  const btnDiscussionsIcon = document.getElementById('bpDiscussionsIconBtn');
  if (btnDiscussionsIcon) {
    btnDiscussionsIcon.addEventListener('click', () => {
      if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('discussions');
    });
  }

  const btnNotifications = document.getElementById('bpNotificationsBtn');
  if (btnNotifications) {
    btnNotifications.addEventListener('click', () => {
      if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('home');
      const wtd = document.getElementById('workToDoWidget') || document.getElementById('homeAnnouncementsWidget');
      if (wtd) wtd.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const btnMessages = document.getElementById('bpMessagesBtn');
  if (btnMessages) {
    btnMessages.addEventListener('click', () => {
      const waSidebar = document.getElementById('btnSidebarWhatsAppInstructor') || document.getElementById('btnSidebarContactMentor');
      if (typeof window.switchBrightspaceTab === 'function') window.switchBrightspaceTab('home');
      if (waSidebar) {
        waSidebar.scrollIntoView({ behavior: 'smooth', block: 'center' });
        waSidebar.focus();
      }
    });
  }
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
    // Re-attach listeners for interactive quizzes and submission forms
    initBrightspaceInteractiveForms();
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

async function setTopicCompletion(targetItem, shouldBeCompleted) {
  if (!targetItem) return;
  const modId = targetItem.getAttribute('data-module-id') || currentModuleId;
  const topId = targetItem.getAttribute('data-topic-id') || currentTopicId;
  const btnComplete = document.getElementById('btnMarkTopicComplete');
  const courseId = (btnComplete && btnComplete.getAttribute('data-course-id')) || '1';
  const direction = shouldBeCompleted ? 'inc' : 'dec';

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

  try {
    await fetch(`/courses/${courseId}/modules/${modId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, topicId: topId })
    });
  } catch (err) {
    console.warn('Could not sync completion to server:', err);
  }
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
      if (selectedItem && !selectedItem.classList.contains('completed')) {
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
function initBrightspaceInteractiveForms() {
  if (activeExamTimer) {
    clearInterval(activeExamTimer);
    activeExamTimer = null;
  }

  const course = window.PASTORS_LMS_COURSE;
  const courseId = course ? course.id : null;

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
    const successMsg = document.getElementById('assignmentSuccessMsg');
    const gradeBox = document.getElementById('assignmentGradeBox');
    const wrap = submitAssignmentBtn.closest('.assignment-submission-box');
    const subType = (wrap && wrap.getAttribute('data-submission-type')) || 'assignment';
    const maxScore = Number((wrap && wrap.getAttribute('data-max-score')) || 100);

    if (existingSub && existingSub.content_text && textarea) {
      textarea.value = existingSub.content_text;
      submitAssignmentBtn.textContent = 'Update Submission';
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
      if (!textarea || textarea.value.trim().length < 10) {
        alert('Please write your pastoral reflection (at least 10 characters) before submitting.');
        if (textarea) textarea.focus();
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
            max_score: maxScore
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

        const completeBtn = document.getElementById('btnMarkTopicComplete');
        if (completeBtn && !completeBtn.classList.contains('is-completed')) {
          completeBtn.click();
        }
      } catch (err) {
        alert(err.message || 'Unable to submit right now. If you are offline, copy your response and try again when connected.');
        submitAssignmentBtn.disabled = false;
        submitAssignmentBtn.textContent = 'Submit to Instructor';
      }
    });
  }

  // Graded Quiz / Timed Exam Engine (saves score & attempt to backend)
  const submitQuizBtn = document.getElementById('btnSubmitQuiz');
  if (submitQuizBtn) {
    const quizWrap = submitQuizBtn.closest('.graded-quiz-wrapper');
    const quizType = (quizWrap && quizWrap.getAttribute('data-quiz-type')) || 'quiz';
    const maxAttempts = Number((quizWrap && quizWrap.getAttribute('data-max-attempts')) || 5);
    const passScore = Number((quizWrap && quizWrap.getAttribute('data-pass-score')) || 60);
    const maxScore = Number((quizWrap && quizWrap.getAttribute('data-max-score')) || 100);
    const timeLimitMin = Number((quizWrap && quizWrap.getAttribute('data-time-limit')) || 0);

    if (timeLimitMin > 0) {
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
          if (!submitQuizBtn.disabled) submitQuizBtn.click();
        }
      }, 1000);
    }

    submitQuizBtn.addEventListener('click', async () => {
      const questionCards = document.querySelectorAll('.quiz-question-card');
      let correctCount = 0;
      const total = questionCards.length || 1;
      const answers = {};

      questionCards.forEach(card => {
        const qNum = card.getAttribute('data-q');
        const correctVal = (card.getAttribute('data-correct') || '').toLowerCase();
        const selectedRadio = card.querySelector(`input[name="q${qNum}"]:checked`);
        const feedbackEl = document.getElementById(`feedback-q${qNum}`);

        if (!selectedRadio) {
          if (feedbackEl) {
            feedbackEl.className = 'quiz-feedback incorrect';
            feedbackEl.textContent = '⚠️ Please select an answer.';
          }
          return;
        }

        answers[`q${qNum}`] = selectedRadio.value;
        if (selectedRadio.value.toLowerCase() === correctVal) {
          correctCount++;
          if (feedbackEl) {
            feedbackEl.className = 'quiz-feedback correct';
            feedbackEl.textContent = '✓ Correct! Sound theological answer.';
          }
        } else {
          if (feedbackEl) {
            feedbackEl.className = 'quiz-feedback incorrect';
            feedbackEl.textContent = `✗ Not quite. The correct answer was (${correctVal.toUpperCase()}).`;
          }
        }
      });

      if (activeExamTimer) {
        clearInterval(activeExamTimer);
        activeExamTimer = null;
      }

      const percent = Math.round((correctCount / total) * 100);
      const scaledScore = Math.round((percent / 100) * maxScore);
      const scoreDisplay = document.getElementById('quizScoreDisplay');
      if (scoreDisplay) {
        scoreDisplay.style.display = 'inline-block';
        scoreDisplay.textContent = `Your Score: ${correctCount}/${total} (${percent}%)`;
      }

      if (courseId) {
        try {
          const res = await fetch(`/api/courses/${courseId}/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              module_id: currentModuleId,
              topic_id: currentTopicId,
              topic_title: currentTopicTitle,
              submission_type: quizType,
              quiz_answers: answers,
              score: scaledScore,
              max_score: maxScore,
              max_attempts: maxAttempts
            })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            if (scoreDisplay) scoreDisplay.textContent += ` — ${data.error || 'Max attempts reached'}`;
          } else {
            if (scoreDisplay) {
              scoreDisplay.textContent = `Recorded: ${correctCount}/${total} (${percent}%) • Attempt #${data.attemptsUsed}`;
            }
            fetchMyCourseSubmissions(false);
          }
        } catch {
          // keep local score visible even if offline
        }
      }

      if (percent >= passScore) {
        const completeBtn = document.getElementById('btnMarkTopicComplete');
        if (completeBtn && !completeBtn.classList.contains('is-completed')) {
          completeBtn.click();
        }
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

      if (tbody) {
        if (!s.items || s.items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5">No graded assessments recorded yet. Submit an assignment, quiz, or discussion post to build your gradebook.</td></tr>';
        } else {
          tbody.innerHTML = s.items.map(item => `
            <tr>
              <td><strong>${escapeUiText(item.title)}</strong></td>
              <td>${escapeUiText(item.type)}</td>
              <td>${item.score} / ${item.max_score} (${item.percent}%)</td>
              <td><strong>${escapeUiText(item.letter)}</strong></td>
              <td>${escapeUiText(item.feedback || '—')}</td>
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
              <div class="peer-review-note"><strong>${escapeUiText(rv.reviewer_name)}</strong> (${rv.rating}/5 ★): ${escapeUiText(rv.feedback)}</div>
            `).join('')}</div>` : ''}
            <form class="peer-review-form" data-sub-id="${escapeUiText(ps.id)}">
              <select class="form-input peer-rating-select" aria-label="Peer rating">
                <option value="5">5 ★ — Strong Biblical Insight</option>
                <option value="4">4 ★ — Encouraging & Clear</option>
                <option value="3">3 ★ — Good Foundation</option>
                <option value="2">2 ★ — Needs More Scripture</option>
              </select>
              <input type="text" class="form-input peer-feedback-input" placeholder="Share encouraging biblical feedback..." required>
              <button type="submit" class="btn btn-primary btn-sm">Send Peer Feedback</button>
            </form>
          </article>
        `).join('');

        peerEl.querySelectorAll('.peer-review-form').forEach(pForm => {
          pForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const subId = pForm.getAttribute('data-sub-id');
            const rating = pForm.querySelector('.peer-rating-select')?.value || '5';
            const fbInput = pForm.querySelector('.peer-feedback-input');
            if (!fbInput || fbInput.value.trim().length < 8) {
              alert('Please write at least 8 characters of encouraging feedback.');
              return;
            }
            const r = await fetch(`/api/courses/${course.id}/submissions/${subId}/peer-review`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rating, feedback: fbInput.value.trim() })
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
