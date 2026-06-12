// services/outreachService.js
// The intelligence behind personalized investor outreach:
//   researchTarget — Claude with web search digs up the person's fund,
//   investments and public footprint.
//   draftEmail — Claude writes a short, specific cold/warm email connecting
//   the org's business write-up to that person's history.
// Both require ANTHROPIC_API_KEY in the server environment.

const MODEL = process.env.OUTREACH_MODEL || process.env.CHIEF_OF_STAFF_MODEL || 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

function available() {
    return !!process.env.ANTHROPIC_API_KEY;
}

async function callClaude(payload) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('Outreach LLM call failed:', res.status, errBody.slice(0, 300));
        throw new Error(`LLM request failed (${res.status})`);
    }
    return res.json();
}

/**
 * Research a person on the web. Returns { summary, sources[] }.
 */
async function researchTarget(target) {
    if (!available()) return { available: false };

    const who = [
        `Name: ${target.name}`,
        target.linkedinUrl ? `LinkedIn: ${target.linkedinUrl}` : null,
        target.email ? `Email domain (may indicate firm): ${String(target.email).split('@')[1] || ''}` : null,
        (target.otherLinks || []).length ? `Other links: ${target.otherLinks.join(', ')}` : null,
        target.notes ? `What we already know: ${target.notes}` : null,
    ].filter(Boolean).join('\n');

    const data = await callClaude({
        model: MODEL,
        max_tokens: 2500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        system: `You are a fundraising researcher for a startup founder. Research the person described by the user using web search. Find: who they are, their current firm/fund and role, investment stages and sectors, NAMED portfolio companies or deals (especially anything in education, edtech, SaaS, consumer or India), recent news, interviews, talks or writing, and anything that reveals what they care about. If you cannot confidently identify the person, say so explicitly rather than guessing.

Then write a tight research brief in plain text (no markdown headers) with short labelled paragraphs: IDENTITY, FUND & FOCUS, NOTABLE INVESTMENTS, RECENT ACTIVITY, HOOKS FOR OUTREACH (2-3 specific angles a founder could reference). Keep it under 450 words. Only state facts you found; mark anything uncertain as (unverified).`,
        messages: [{ role: 'user', content: `Research this person:\n${who}` }],
    });

    let summary = '';
    const sources = [];
    const seen = new Set();
    for (const block of data.content || []) {
        if (block.type === 'text') {
            summary += block.text;
            for (const c of block.citations || []) {
                if (c.url && !seen.has(c.url)) {
                    seen.add(c.url);
                    sources.push({ title: (c.title || c.url).slice(0, 300), url: c.url.slice(0, 1000) });
                }
            }
        }
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
            for (const r of block.content) {
                if (r.type === 'web_search_result' && r.url && !seen.has(r.url)) {
                    seen.add(r.url);
                    sources.push({ title: (r.title || r.url).slice(0, 300), url: r.url.slice(0, 1000) });
                }
            }
        }
    }

    return { available: true, summary: summary.trim().slice(0, 20000), sources: sources.slice(0, 12) };
}

/**
 * Draft (or redraft) the personalized email.
 * Returns { subject, body }.
 */
async function draftEmail({ target, businessWriteup, senderName, orgName, feedback, previousDraft }) {
    if (!available()) return { available: false };

    const context = [
        `SENDER: ${senderName}, founder of ${orgName}`,
        `\nBUSINESS WRITE-UP:\n${businessWriteup}`,
        `\nRECIPIENT: ${target.name}${target.email ? ` <${target.email}>` : ''}`,
        target.notes ? `Founder's notes on recipient: ${target.notes}` : null,
        target.research?.summary ? `\nRESEARCH BRIEF ON RECIPIENT:\n${target.research.summary}` : '\n(No research available — write a strong but less personalized email.)',
        previousDraft?.body ? `\nPREVIOUS DRAFT (to improve, not repeat):\nSubject: ${previousDraft.subject}\n${previousDraft.body}` : null,
        feedback ? `\nFOUNDER'S FEEDBACK ON THE PREVIOUS DRAFT: ${feedback}` : null,
    ].filter(Boolean).join('\n');

    const data = await callClaude({
        model: MODEL,
        max_tokens: 1200,
        system: `You write cold/warm investor outreach emails for startup founders. Rules:
- Under 160 words of body. Investors skim; brevity is respect.
- Open with the single most specific, genuine connection between the recipient's history (from the research) and this business — a named portfolio company, a quote, a thesis they've stated. Never generic flattery ("I'm a big fan of your work").
- Then 2-3 tight sentences on the business: what it does, the sharpest traction or proof point from the write-up, why now.
- Close with one low-friction ask (a short call or permission to send a deck). No "I know you're busy".
- Plain text. No bullet points, no markdown, no emojis. Sign off with the sender's first name.
- Sound like a sharp founder typing a personal email, not a marketer. No buzzwords ("revolutionary", "disrupting", "synergy").
- If the research brief says the person could not be identified, do NOT invent facts about them.
Respond with ONLY a JSON object: {"subject": "...", "body": "..."} — subject under 9 words, specific, lowercase-natural (not Title Case Spam).`,
        messages: [{ role: 'user', content: context }],
    });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Draft response was not valid JSON');
    const parsed = JSON.parse(match[0]);
    if (!parsed.subject || !parsed.body) throw new Error('Draft missing subject or body');
    return {
        available: true,
        subject: String(parsed.subject).slice(0, 300),
        body: String(parsed.body).slice(0, 10000),
    };
}

module.exports = { researchTarget, draftEmail, available };
