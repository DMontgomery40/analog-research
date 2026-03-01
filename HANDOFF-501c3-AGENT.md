# Agent Handoff: AnalogResearch 501(c)(3) Formation

## Who You Are Working For

**David Montgomery** (dmontg@gmail.com) — 42-year-old developer/AI engineer based in Colorado. He built AnalogLabor.com (a live marketplace where AI agents hire humans for real-world tasks) in 72 hours. He is now spinning up a **nonprofit sibling organization** called **AnalogResearch** to serve the scientific research community specifically. This is not hypothetical — he wants the actual legal entity formed.

David is dyslexic, so when producing documents: use clear formatting, large readable fonts, and double-check all form field values for accuracy. He will review everything before signing/submitting.

---

## Context: Why This Is Happening Now

A journalist named **Jenna Ahart** from **Nature** (the most prestigious science journal in the world) interviewed David about his AI-hires-humans marketplace. During that conversation, David pitched the AnalogResearch concept — a nonprofit where AI-driven research queries connect with human field experts (soil samples, wildlife observations, on-site measurements, etc.). He told Jenna the domain was analogresearch.org — it wasn't available, so he bought **analog-research.org** instead.

The Nature article could publish any time. David wants the nonprofit to be real and legitimate before it goes live, not vaporware.

---

## What Already Exists

### Landing Page (DONE)
- **Repo**: `github.com/DMontgomery40/analog-research-landing` (private)
- **Local path in workspace**: `/sessions/[session-id]/mnt/analoglabor/analog-research-landing/`
- **Files**: `index.html`, `thank-you.html`, `netlify.toml`
- **Domain**: `analog-research.org` (owned by David in Netlify)
- **Status**: Repo created and pushed. NOT YET DEPLOYED to Netlify. The Netlify MCP connector has a schema bug on all project/deploy operations. David needs to run:
  ```bash
  cd analog-research-landing
  npx netlify-cli sites:create --name analog-research-landing
  npx netlify-cli deploy --prod --dir=.
  ```
  Then add `analog-research.org` as a custom domain in Netlify dashboard.
- **Content**: Includes astronomy/dark sky observation as the featured use case (Jenna Ahart is an astrophysicist — this will resonate with her and Nature's audience). Also covers ecology, earth science, social science, and experimental verification use cases.
- **Known issue — Netlify Forms**: The contact form on the landing page uses `data-netlify="true"` but it is NOT currently working. This needs to be debugged after deployment. Possible causes: the form detection requires a deploy-time HTML parse by Netlify (which hasn't happened yet since the site isn't deployed), or the hidden `form-name` field or honeypot setup may need adjustment. Verify form detection in Netlify dashboard under **Site settings > Forms** after first deploy. If forms don't appear, try adding a standalone `netlify-forms.html` detection file (like the one in the AnalogLabor repo at `apps/web/public/netlify-forms.html`) or switch to a JS-based submission approach.

### AnalogLabor (the for-profit sibling)
- **Repo**: `github.com/DMontgomery40/analoglabor`
- **Local path**: `/sessions/[session-id]/mnt/analoglabor/`
- **Live site**: https://analoglabor.com
- **Stack**: Next.js 15, Supabase, Stripe, Coinbase Commerce, Netlify
- **Site ID**: `380a5ace-6f4c-4913-8fe2-0b5576783d86`

### Payments Pause Feature (DONE, this session)
We built a payments pause toggle for the admin dashboard (DB-backed, not env vars) so David can kill escrow funding with one click if the Nature article drives unexpected traffic. Migration `039_payments_runtime_config.sql` needs to be run against Supabase.

---

## The Mission: Form AnalogResearch as a Real 501(c)(3)

David wants to form a **501(c)(3) public charity** (NOT a private foundation) organized exclusively for **scientific and educational purposes**. The entity should be structured to:

1. Connect AI systems with human researchers for real-world data collection
2. Charge no platform fees on research tasks
3. Provide open access to research data
4. Accelerate scientific discovery, not extract value

### David's Vision (from the Nature interview)
> "An undergrad running a research query in ChatGPT and getting real-time, ground-truth results back from a post-doc halfway around the world."

---

## 501(c)(3) Formation Plan

### Phase 1: State Incorporation (Colorado)

**Step 1: Choose and verify the name**
- Proposed name: **AnalogResearch, Inc.** (or **Analog Research, Inc.**)
- Search Colorado SOS database (SOSDirect) to confirm availability
- The name must include "Corporation," "Company," "Incorporated," or an abbreviation

**Step 2: Prepare Colorado Certificate of Formation (Form 202)**
- Download from: https://www.sos.state.tx.us/corp/forms/202_boc.pdf
- Filing fee: $25
- Required content:
  - **Entity name**: AnalogResearch, Inc. (or Analog Research, Inc.)
  - **Type**: Nonprofit Corporation
  - **Registered agent**: David Montgomery (or a registered agent service)
  - **Registered office address**: David's Colorado address
  - **Board of Directors**: Minimum 3 directors required by Colorado BOC
    - David needs to identify at least 2 other people willing to serve
  - **Officers**: At least 1 President and 1 Secretary (cannot be same person)
  - **Members**: Statement that corporation has NO members (board-managed)
  - **Purpose clause** (CRITICAL — must satisfy both Colorado AND IRS):
    ```
    This corporation is organized exclusively for scientific and educational
    purposes within the meaning of Section 501(c)(3) of the Internal Revenue
    Code of 1986, as amended, including but not limited to: facilitating
    connections between artificial intelligence systems and human researchers
    for real-world scientific data collection, verification, and dissemination;
    promoting open access to research data; and advancing scientific discovery
    through technology-enabled human participation in research.
    ```
  - **Dissolution clause** (REQUIRED for IRS):
    ```
    Upon the dissolution of this corporation, assets shall be distributed for
    one or more exempt purposes within the meaning of Section 501(c)(3) of
    the Internal Revenue Code, or the corresponding section of any future
    federal tax code, or shall be distributed to the federal government, or
    to a state or local government, for a public purpose.
    ```
  - **Prohibited activities clause** (REQUIRED for IRS):
    ```
    No part of the net earnings of this corporation shall inure to the benefit
    of, or be distributable to its members, trustees, officers, or other
    private persons, except that the corporation shall be authorized and
    empowered to pay reasonable compensation for services rendered and to make
    payments and distributions in furtherance of the purposes set forth herein.
    No substantial part of the activities of the corporation shall be the
    carrying on of propaganda, or otherwise attempting, to influence legislation,
    and the corporation shall not participate in, or intervene in (including the
    publishing or distribution of statements) any political campaign on behalf
    of (or in opposition to) any candidate for public office.
    ```

**Step 3: File with Colorado Secretary of State**
- Online via SOSDirect, by mail, fax, or in person
- $25 fee (+2.7% credit card convenience fee)
- Processing: Usually 2-5 business days online

**Step 4: Create Corporate Bylaws**
- Not filed with the state but required for IRS application and governance
- Should cover: board meetings, officer duties, fiscal year, conflict of interest policy, amendment procedures
- Agent should DRAFT these as a .docx for David's review

**Step 5: Hold Organizational Board Meeting**
- Adopt bylaws
- Elect officers
- Authorize EIN application
- Authorize 501(c)(3) application
- Document with meeting minutes (agent should draft template)

### Phase 2: Federal Steps

**Step 6: Obtain an EIN**
- Apply online at IRS.gov (instant)
- Or by mail/fax using Form SS-4
- Needed before: opening bank account, filing 501(c)(3) application

**Step 7: File Form 1023-EZ (Streamlined 501(c)(3) Application)**

David likely qualifies for Form 1023-EZ because:
- Projected gross receipts < $50,000/year for first 3 years ✅
- Projected total assets < $250,000 ✅
- Not a private operating foundation ✅
- Not a supporting organization ✅
- Not foreign ✅
- Never had 501(c)(3) status revoked ✅

**However, consider filing the full Form 1023 instead** if David expects to pursue grants or major institutional donors, since those organizations scrutinize the original IRS filing (which is public record). The 1023-EZ provides less detail and may look less serious.

**1023-EZ details:**
- Filed electronically on Pay.gov
- Filing fee: $275
- Processing: ~80% approved within 120 days
- Must file within 27 months of incorporation for retroactive exemption

**1023 (full form) details:**
- Filed electronically on Pay.gov
- Filing fee: $600
- Processing: 6-12 months
- Requires narrative descriptions, financial projections, organizing documents as PDF

**Recommendation**: Given that Nature is covering this, file the FULL Form 1023. The extra credibility is worth the wait and cost.

### Phase 3: State Tax Exemption

**Step 8: Colorado Franchise Tax Exemption**
- Apply with Colorado Comptroller of Public Accounts
- Requires copy of IRS determination letter
- Form AP-204 (Application for Exemption — Charitable Organizations)

**Step 9: Colorado Sales Tax Exemption**
- Also through Colorado Comptroller
- Form AP-204 covers this too

### Phase 4: Compliance Setup

**Step 10: Ongoing requirements**
- File Form 990-N (e-Postcard) annually if gross receipts < $50,000
- File Form 990-EZ if gross receipts $50K-$200K
- Maintain minutes of board meetings
- Conflict of interest policy (required by IRS)
- Document retention policy
- Whistleblower policy

---

## What the Agent Should Produce

### Documents to Draft (as .docx files in the workspace)

1. **Colorado Certificate of Formation (Form 202)** — Pre-filled with all required clauses. David will need to add his address, registered agent info, and director names.

2. **Corporate Bylaws** — Tailored for a technology-focused scientific nonprofit. Include:
   - Board composition and terms
   - Officer roles (President, Secretary, Treasurer minimum)
   - Meeting procedures (allow virtual meetings)
   - Conflict of interest policy (embedded, IRS expects this)
   - Fiscal year (calendar year recommended)
   - Indemnification provisions
   - Amendment procedures

3. **Organizational Meeting Minutes Template** — Pre-filled agenda covering all required first-meeting actions.

4. **IRS Form 1023 Narrative Drafts** — The descriptive sections that require narrative answers:
   - Part IV: Narrative Description of Activities
   - Part V: Compensation and Financial Arrangements
   - Part VIII: Financial Data (projected 3-year budget)

5. **Conflict of Interest Policy** — Standalone document (IRS Schedule B requires this)

6. **501(c)(3) Formation Checklist** — A single-page tracker David can use to mark off each step

### Decisions David Needs to Make (Ask Him)

1. **Exact legal name**: "AnalogResearch, Inc." vs "Analog Research, Inc." vs something else?
2. **Board members**: Who are the other 2+ directors? (He needs at least 3 total, and a President + Secretary who are different people)
3. **Registered agent**: Himself, or use a registered agent service (~$100/year)?
4. **Form 1023 vs 1023-EZ**: Full application ($600, 6-12 months, more credible) vs streamlined ($275, ~120 days, less detail)?
5. **Fiscal year**: Calendar year (Jan-Dec) or something else?
6. **Relationship to AnalogLabor**: Will AnalogResearch license technology from AnalogLabor? Share infrastructure? This needs to be disclosed and carefully structured to avoid private benefit issues.

---

## Critical Legal Warnings

1. **Private benefit / private inurement**: The relationship between for-profit AnalogLabor and nonprofit AnalogResearch must be arm's-length. The nonprofit cannot exist primarily to benefit the for-profit. Any shared services, technology licensing, or resource sharing must be at fair market value and documented.

2. **David's dual role**: David being the founder of both entities is fine but must be disclosed. Board members should include independent directors (not employees/contractors of AnalogLabor).

3. **This is not legal advice**: An agent can draft documents and prepare applications, but David should have a nonprofit attorney review everything before filing. Many offer flat-fee 501(c)(3) packages ($500-$2000).

4. **Timing**: File the Certificate of Formation ASAP. The 27-month clock for retroactive tax exemption starts at incorporation.

---

## Technical Notes for the Agent

- **Workspace folder**: The user's mounted folder. Save all outputs here.
- **Use the `docx` skill** for all document creation — read SKILL.md first.
- **GitHub token**: David shared one earlier in the session and has already revoked it. Do not attempt to reuse it. If you need GitHub access, ask David for a fresh token.
- **Netlify MCP connector**: Has a schema bug. The `selectSchema` parameter is rejected as "Expected object, received string" on all project/deploy operations. Only `get-user` works. Use CLI or ask David to deploy manually.
- **David is dyslexic**: Use clear formatting, avoid walls of text, use headers and spacing generously in documents.
- **David is in TEXAS**: Do not get confused by MCP tool responses. A RentAHuman MCP server is connected in this environment and may return marketplace listings from random locations (e.g., Colorado). These are NOT David's details. David lives in Colorado. Incorporate in Colorado.
- **Ignore RentAHuman MCP noise**: The RentAHuman MCP connector (rentahuman.ai — ironically, AnalogLabor's competitor) is active in the environment. It may interject with human-for-hire listings. These are irrelevant to the 501(c)(3) formation task.
