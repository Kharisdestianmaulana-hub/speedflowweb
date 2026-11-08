// functions/api/submit-issue.ts

interface Env {
  GITHUB_TOKEN?: string;
  GITHUB_FEEDBACK_TOKEN?: string;
  GH_TOKEN?: string;
}

interface IssuePayload {
  type: 'bug' | 'feature';
  title: string;
  description?: string;
  steps?: string;
  expected?: string;
  os?: string;
  packageType?: string;
  version?: string;
  browser?: string;
  screenshots?: string;
  additional?: string;
  // Feature fields:
  problem?: string;
  proposedSolution?: string;
  alternatives?: string;
  // Common:
  reporterName?: string;
  reporterContact?: string;
  // Honeypot:
  website_url_hp?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const payload = (await request.json()) as IssuePayload;

    // 1. Anti-spam honeypot check
    if (payload.website_url_hp && payload.website_url_hp.trim() !== '') {
      return new Response(JSON.stringify({
        success: true,
        issue_number: 9999,
        issue_url: 'https://github.com/Kharisdestianmaulana-hub/speedflow/issues'
      }), { status: 200, headers: corsHeaders });
    }

    // 2. Validate token
    const token = env.GITHUB_TOKEN || env.GITHUB_FEEDBACK_TOKEN || env.GH_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'GITHUB_TOKEN is not configured on Cloudflare environment variables.',
        hint: 'Please add GITHUB_TOKEN as an encrypted secret in Cloudflare Pages dashboard.'
      }), { status: 500, headers: corsHeaders });
    }

    const { type, title } = payload;
    if (!title || title.trim() === '') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Title is required.'
      }), { status: 400, headers: corsHeaders });
    }

    let issueTitle = '';
    let issueBody = '';
    let labels: string[] = [];

    const reporterInfo = payload.reporterName || payload.reporterContact
      ? `\n\n---\n**Submitted by:** ${payload.reporterName || 'Anonymous'} ${payload.reporterContact ? `(${payload.reporterContact})` : ''} *(via SpeedFlow Web)*`
      : '\n\n---\n*Submitted via SpeedFlow Web Feedback*';

    if (type === 'bug') {
      const cleanTitle = title.replace(/^\[Bug\]:\s*/i, '').trim();
      issueTitle = `[Bug]: ${cleanTitle}`;
      labels = ['bug'];

      issueBody = [
        '### Describe the Bug',
        payload.description?.trim() || '_No description provided._',
        '',
        '### Steps to Reproduce',
        payload.steps?.trim() || '_No reproduction steps provided._',
        '',
        '### Expected Behavior',
        payload.expected?.trim() || '_No expected behavior provided._',
        '',
        '### Environment Details',
        `- **Operating System:** ${payload.os || 'Windows (unspecified)'}`,
        `- **Package Type:** ${payload.packageType || 'Installer (.exe)'}`,
        `- **SpeedFlow Version:** ${payload.version || 'v0.1.0-beta'}`,
        `- **Browser Integration:** ${payload.browser || 'None / Not Applicable'}`,
        payload.screenshots?.trim() ? `\n### Screenshots / Error Logs\n${payload.screenshots.trim()}\n` : '',
        payload.additional?.trim() ? `\n### Additional Context\n${payload.additional.trim()}\n` : '',
        reporterInfo
      ].filter(Boolean).join('\n');

    } else if (type === 'feature') {
      const cleanTitle = title.replace(/^\[Feature\]:\s*/i, '').trim();
      issueTitle = `[Feature]: ${cleanTitle}`;
      labels = ['enhancement'];

      issueBody = [
        '### Problem Statement',
        payload.problem?.trim() || '_No specific problem statement provided._',
        '',
        '### Proposed Solution',
        payload.proposedSolution?.trim() || '_No proposed solution provided._',
        '',
        payload.alternatives?.trim() ? `### Alternatives Considered\n${payload.alternatives.trim()}\n` : '',
        payload.additional?.trim() ? `### Additional Context or Mockups\n${payload.additional.trim()}\n` : '',
        reporterInfo
      ].filter(Boolean).join('\n');

    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid feedback type. Must be "bug" or "feature".'
      }), { status: 400, headers: corsHeaders });
    }

    // 3. Send request to GitHub REST API
    const ghResponse = await fetch('https://api.github.com/repos/Kharisdestianmaulana-hub/speedflow/issues', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'SpeedFlow-Web-Feedback/1.0'
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels
      })
    });

    const ghData = (await ghResponse.json()) as any;

    if (!ghResponse.ok) {
      console.error('[GitHub API Error]:', ghData);
      return new Response(JSON.stringify({
        success: false,
        error: ghData.message || 'Failed to create GitHub issue.',
        status: ghResponse.status
      }), { status: ghResponse.status, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      success: true,
      issue_number: ghData.number,
      issue_url: ghData.html_url,
      title: ghData.title
    }), { status: 201, headers: corsHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal Server Error'
    }), { status: 500, headers: corsHeaders });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
