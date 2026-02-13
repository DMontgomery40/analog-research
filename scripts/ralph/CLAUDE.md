# Ralph Agent Instructions — analog-research.org SEO

---

## Context

This is the **analog-research.org** landing page — a static HTML site deployed on Netlify.
It is NOT the AnalogLabor monorepo. There is no Next.js, no build step, no TypeScript.

**Stack:** Static HTML + CSS, Netlify hosting, Netlify Forms.

**Repo:** `github.com/DMontgomery40/analog-research-landing` (private)

**Live site:** https://analog-research.org

**What the site is:** A coming-soon landing page for AnalogResearch, a planned 501(c)(3) nonprofit
where AI agents autonomously post bounties for human researchers to do real-world fieldwork
(dark sky observations, soil sampling, glacier photography, etc.). The AI does the desk work,
the human does the boots-on-the-ground part.

---

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Verify your changes (see Quality Requirements below)
7. Commit ALL changes with message: `feat: [Story ID] - [Story Title]`
8. Update the PRD to set `passes: true` for the completed story
9. Append your progress to `progress.txt`

## Quality Requirements

This is a static HTML site. There is no typecheck or lint. Quality gates are:

1. **Valid HTML** — `npx html-validate index.html` or manual inspection
2. **All files present** — `ls` confirms no missing referenced files
3. **No broken links** — All hrefs and srcs resolve
4. **Deploy succeeds** — Files can be served as static content

## Progress Report Format

APPEND to progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
---
```

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally.

## Important

- Work on ONE story per iteration
- Commit frequently
- This is a STATIC site — no build step, no npm, no framework
- All changes go directly to HTML/CSS files or new static files
- Test by opening index.html in browser or inspecting source
