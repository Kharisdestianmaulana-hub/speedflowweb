// src/scripts/github-release.ts

interface ReleaseAsset {
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  prerelease: boolean;
  published_at: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
}

interface CachePayload {
  timestamp: number;
  latest: GitHubRelease;
  all: GitHubRelease[];
}

const CACHE_KEY = 'speedflow_github_releases_v2';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedReleases: GitHubRelease[] = [];

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return 'Recent';
  }
}

function parseMarkdownToHtml(markdown: string): string {
  if (!markdown) return '<p>No release notes provided.</p>';
  
  const lines = markdown.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('# ')) {
      // Skip the redundant top title
      continue;
    }

    if (line.startsWith('### ') || line.startsWith('## ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      const title = line.replace(/^#{2,3}\s+/, '');
      htmlLines.push(`<h5 class="notes-heading">${escapeHtml(title)}</h5>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        htmlLines.push('<ul class="notes-list">');
        inList = true;
      }
      const itemContent = line.replace(/^[-*]\s+/, '');
      htmlLines.push(`<li>${formatInlineMarkdown(itemContent)}</li>`);
    } else if (line.startsWith('---')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push('<hr class="notes-divider" />');
    } else if (line === '') {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<p class="notes-para">${formatInlineMarkdown(line)}</p>`);
    }
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

function formatInlineMarkdown(text: string): string {
  let safe = escapeHtml(text);
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return safe;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function applyLatestReleaseToDom(release: GitHubRelease) {
  const isPre = Boolean(release.prerelease);
  const tag = release.tag_name || 'v0.1.0-beta';
  const pubDate = formatDate(release.published_at);

  const assets = release.assets || [];
  const setupAsset = assets.find(a => 
    a.name.toLowerCase().includes('setup') && a.name.toLowerCase().endsWith('.exe')
  ) || assets.find(a => a.name.toLowerCase().endsWith('.exe'));

  const portableAsset = assets.find(a => 
    a.name.toLowerCase().includes('portable') && a.name.toLowerCase().endsWith('.zip')
  ) || assets.find(a => a.name.toLowerCase().endsWith('.zip') && !a.name.toLowerCase().includes('extension'));

  const extensionAsset = assets.find(a => 
    a.name.toLowerCase().includes('extension') && a.name.toLowerCase().endsWith('.zip')
  );

  const totalDownloads = assets.reduce((acc, cur) => acc + (cur.download_count || 0), 0);

  // 1. Navbar elements
  const navBadge = document.getElementById('nav-version-badge');
  if (navBadge) navBadge.textContent = tag;

  const navDownloadBtn = document.getElementById('nav-download-btn') as HTMLAnchorElement | null;
  if (navDownloadBtn && setupAsset) {
    navDownloadBtn.href = setupAsset.browser_download_url;
  }

  const mobileNavDownloadBtn = document.getElementById('mobile-nav-download-btn') as HTMLAnchorElement | null;
  if (mobileNavDownloadBtn && setupAsset) {
    mobileNavDownloadBtn.href = setupAsset.browser_download_url;
  }

  // 2. Hero Section elements
  const heroTagText = document.getElementById('hero-tag-text');
  if (heroTagText) heroTagText.textContent = tag;

  const heroStatusText = document.getElementById('hero-status-text');
  if (heroStatusText) {
    heroStatusText.textContent = isPre ? 'Pre-release' : 'Stable';
  }

  const heroDownloadBtn = document.getElementById('hero-download-btn') as HTMLAnchorElement | null;
  if (heroDownloadBtn && setupAsset) {
    heroDownloadBtn.href = setupAsset.browser_download_url;
  }

  const heroExtensionBtn = document.getElementById('hero-extension-btn') as HTMLAnchorElement | null;
  if (heroExtensionBtn && extensionAsset) {
    heroExtensionBtn.href = extensionAsset.browser_download_url;
  }

  // 3. Download Section elements
  const releaseTagBadge = document.getElementById('release-tag-badge');
  if (releaseTagBadge) releaseTagBadge.textContent = tag;

  const releaseStatusBadge = document.getElementById('release-status-badge');
  if (releaseStatusBadge) {
    releaseStatusBadge.textContent = isPre ? 'Pre-release' : 'Stable';
    if (isPre) {
      releaseStatusBadge.className = 'badge badge-warning';
    } else {
      releaseStatusBadge.className = 'badge badge-brand';
    }
  }

  const releaseDateText = document.getElementById('release-date-text');
  if (releaseDateText) {
    releaseDateText.textContent = `Published: ${pubDate}`;
  }

  const btnInstaller = document.getElementById('btn-download-installer') as HTMLAnchorElement | null;
  const installerSizeTag = document.getElementById('installer-size-tag');
  if (btnInstaller && setupAsset) {
    btnInstaller.href = setupAsset.browser_download_url;
    if (installerSizeTag) {
      installerSizeTag.textContent = formatBytes(setupAsset.size);
    }
  }

  const btnPortable = document.getElementById('btn-download-portable') as HTMLAnchorElement | null;
  const portableSizeTag = document.getElementById('portable-size-tag');
  if (btnPortable && portableAsset) {
    btnPortable.href = portableAsset.browser_download_url;
    if (portableSizeTag) {
      portableSizeTag.textContent = formatBytes(portableAsset.size);
    }
  }

  const downloadsCountEl = document.getElementById('total-downloads-count');
  if (downloadsCountEl) {
    downloadsCountEl.textContent = `${totalDownloads.toLocaleString()} downloads`;
  }

  const ghReleaseLink = document.getElementById('release-github-link') as HTMLAnchorElement | null;
  if (ghReleaseLink && release.html_url) {
    ghReleaseLink.href = release.html_url;
  }

  // 4. Release Notes / Changelog Accordion
  const notesTagLabel = document.getElementById('notes-tag-label');
  if (notesTagLabel) notesTagLabel.textContent = tag;

  const notesBody = document.getElementById('release-notes-body');
  if (notesBody && release.body) {
    notesBody.innerHTML = parseMarkdownToHtml(release.body);
  }

  // 5. Browser Extension Section
  const bridgeExtensionBtn = document.getElementById('bridge-extension-btn') as HTMLAnchorElement | null;
  const bridgeExtSizeTag = document.getElementById('bridge-ext-size-tag');
  if (bridgeExtensionBtn && extensionAsset) {
    bridgeExtensionBtn.href = extensionAsset.browser_download_url;
    if (bridgeExtSizeTag) {
      const kb = Math.round(extensionAsset.size / 1024);
      bridgeExtSizeTag.textContent = `${kb} KB`;
    }
  }
}

function renderArchiveModalContent(allReleases: GitHubRelease[]) {
  const container = document.getElementById('archive-modal-content');
  if (!container) return;

  const olderReleases = allReleases.slice(1);
  const latestTag = allReleases[0]?.tag_name || 'v0.1.0-beta';

  if (olderReleases.length === 0) {
    // EMPTY STATE: No older versions exist yet
    container.innerHTML = `
      <div class="archive-empty-state">
        <div class="empty-icon-wrap" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <div class="empty-badge">
          <span class="badge badge-brand font-mono">Initial Public Release</span>
        </div>
        <h4 class="empty-title">No Previous Versions Yet</h4>
        <p class="empty-desc">
          <code>${escapeHtml(latestTag)}</code> is the very first public release of SpeedFlow. Older versions and past release archives will automatically appear here as future updates are published.
        </p>
        <div class="empty-action">
          <a href="https://github.com/Kharisdestianmaulana-hub/speedflow/releases" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm font-mono">
            <span>View Releases on GitHub ↗</span>
          </a>
        </div>
      </div>
    `;
    return;
  }

  // POPULATED STATE: When past releases exist
  container.innerHTML = `
    <div class="archive-list">
      ${olderReleases.map(rel => {
        const assets = rel.assets || [];
        const setupAsset = assets.find(a => 
          a.name.toLowerCase().includes('setup') && a.name.toLowerCase().endsWith('.exe')
        ) || assets.find(a => a.name.toLowerCase().endsWith('.exe'));

        const portableAsset = assets.find(a => 
          a.name.toLowerCase().includes('portable') && a.name.toLowerCase().endsWith('.zip')
        ) || assets.find(a => a.name.toLowerCase().endsWith('.zip'));

        return `
          <div class="archive-item">
            <div class="archive-item-head">
              <div class="archive-item-tag">
                <span class="archive-tag-name font-mono font-bold">${escapeHtml(rel.tag_name)}</span>
                <span class="badge ${rel.prerelease ? 'badge-warning' : 'badge-brand'}">
                  ${rel.prerelease ? 'Pre-release' : 'Stable'}
                </span>
              </div>
              <span class="archive-item-date font-mono text-tertiary">${formatDate(rel.published_at)}</span>
            </div>
            <div class="archive-item-actions">
              ${setupAsset ? `
                <a href="${setupAsset.browser_download_url}" class="btn btn-primary btn-sm font-mono" download>
                  Installer (${formatBytes(setupAsset.size)})
                </a>
              ` : ''}
              ${portableAsset ? `
                <a href="${portableAsset.browser_download_url}" class="btn btn-secondary btn-sm font-mono" download>
                  Portable (${formatBytes(portableAsset.size)})
                </a>
              ` : ''}
              <a href="${rel.html_url}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm font-mono">
                Notes ↗
              </a>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function initArchiveModalListeners() {
  const openBtn = document.getElementById('btn-open-archive-modal');
  const closeBtn = document.getElementById('btn-close-archive-modal');
  const backdrop = document.getElementById('archive-modal-backdrop');

  const openModal = () => {
    if (!backdrop) return;
    renderArchiveModalContent(cachedReleases);
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop && backdrop.classList.contains('is-open')) {
      closeModal();
    }
  });
}

export async function initGitHubRelease() {
  initArchiveModalListeners();

  // 1. Try Cache First for zero-latency rendering
  try {
    const rawCache = localStorage.getItem(CACHE_KEY);
    if (rawCache) {
      const parsed: CachePayload = JSON.parse(rawCache);
      if (parsed && parsed.latest && (Date.now() - parsed.timestamp < CACHE_TTL_MS)) {
        cachedReleases = parsed.all || [parsed.latest];
        applyLatestReleaseToDom(parsed.latest);
      }
    }
  } catch (err) {
    console.warn('[SpeedFlow] Local release cache read failed:', err);
  }

  // 2. Fetch Fresh Data from GitHub Releases API
  const API_URL = 'https://api.github.com/repos/Kharisdestianmaulana-hub/speedflow/releases';
  try {
    const response = await fetch(API_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const releases: GitHubRelease[] = await response.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      return; // No published releases yet
    }

    cachedReleases = releases;
    const latestRelease = releases[0];

    applyLatestReleaseToDom(latestRelease);

    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      latest: latestRelease,
      all: releases
    }));
  } catch (err) {
    console.warn('[SpeedFlow] Could not fetch latest release from GitHub:', err);
  }

  // 3. Fetch Live Repo Stars Count
  fetchGitHubRepoStars();
}

async function fetchGitHubRepoStars() {
  const REPO_API = 'https://api.github.com/repos/Kharisdestianmaulana-hub/speedflow';
  try {
    const response = await fetch(REPO_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (response.ok) {
      const data = await response.json();
      const stars = data.stargazers_count ?? 0;
      const navStarCount = document.getElementById('nav-star-count');
      if (navStarCount) {
        navStarCount.textContent = stars.toString();
      }
      const mobileNavStarCount = document.getElementById('mobile-nav-star-count');
      if (mobileNavStarCount) {
        mobileNavStarCount.textContent = stars.toString();
      }
    }
  } catch (err) {
    console.warn('[SpeedFlow] Could not fetch repo stars:', err);
  }
}

// Auto-run on DOM ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGitHubRelease);
  } else {
    initGitHubRelease();
  }
}
