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

const CACHE_KEY = 'speedflow_github_release_v1';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
  // Bold: **text**
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Inline code: `code`
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links: [text](url)
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

function applyReleaseToDom(release: GitHubRelease) {
  const isPre = Boolean(release.prerelease);
  const tag = release.tag_name || 'v0.1.0-beta';
  const pubDate = formatDate(release.published_at);

  // Find assets
  const assets = release.assets || [];
  const setupAsset = assets.find(a => 
    a.name.toLowerCase().includes('setup') && a.name.toLowerCase().endsWith('.exe')
  ) || assets.find(a => a.name.toLowerCase().endsWith('.exe'));

  const portableAsset = assets.find(a => 
    a.name.toLowerCase().includes('portable') && a.name.toLowerCase().endsWith('.zip')
  ) || assets.find(a => a.name.toLowerCase().endsWith('.zip'));

  const totalDownloads = assets.reduce((acc, cur) => acc + (cur.download_count || 0), 0);

  // 1. Navbar elements
  const navBadge = document.getElementById('nav-version-badge');
  if (navBadge) navBadge.textContent = tag;

  const navDownloadBtn = document.getElementById('nav-download-btn') as HTMLAnchorElement | null;
  if (navDownloadBtn && setupAsset) {
    navDownloadBtn.href = setupAsset.browser_download_url;
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
}

export async function initGitHubRelease() {
  // 1. Try Cache First for zero-lag rendering
  try {
    const rawCache = localStorage.getItem(CACHE_KEY);
    if (rawCache) {
      const parsed = JSON.parse(rawCache);
      if (parsed && parsed.data && (Date.now() - parsed.timestamp < CACHE_TTL_MS)) {
        applyReleaseToDom(parsed.data);
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

    // Latest published release (including prerelease) is index 0
    const latestRelease = releases[0];

    // Apply to DOM
    applyReleaseToDom(latestRelease);

    // Save to Cache
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: latestRelease
    }));
  } catch (err) {
    console.warn('[SpeedFlow] Could not fetch latest release from GitHub:', err);
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
