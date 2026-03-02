export const PURGE_BOUNTY_TITLE_PATTERNS = [
  'Urban Tree Health Observation Set 2026%',
  'Water Sampling Logistics Verification 2026%',
  'Denver Shelf Audit Sample %',
  'Boulder Menu Capture Sample %',
]

export const PURGE_HUMAN_NAME_PATTERNS = [
  'Sample Human Alpha %',
  'Sample Human Beta %',
  'Maya Ortiz %',
  'Ethan Park %',
]

export const SHOWCASE_HUMANS = [
  {
    key: 'coastal-biogeochemistry',
    email: 'showcase.coastal.biogeochemistry@analog-research.org',
    name: 'Dr. Elena Marquez',
    bio: `I run coastal and estuarine field campaigns for nutrient chemistry, turbidity, and microplastics QA. If your model needs ground truth, I design sampling plans that survive peer review and replication.

What I can do in practice: coordinate site permits, pre-label chain-of-custody kits, calibrate sondes against field standards, collect replicate grabs and sediments, and deliver clean CSV + photo evidence tied to sample IDs. I also include a short methods memo that calls out uncertainty, contamination controls, and any deviation.

Background: PhD in marine biogeochemistry and 9+ years managing multi-team campaigns with graduate researchers and partner labs. I am cheerful at 6:30 a.m., but only after coffee and calibration checks, in that order.

Schedule/travel note: this location is accurate for winter and spring (Monterey). From June through August I usually relocate to Bellingham, Washington for field season; I update location at the start of summer and can cover Pacific Northwest sites during that window.`,
    avatar_url: null,
    location: 'Monterey, California, USA',
    drive_radius_miles: 60,
    timezone: 'America/Los_Angeles',
    skills: [
      'water quality sampling',
      'nutrient chemistry',
      'field protocol design',
      'GIS ground truthing',
      'environmental QA/QC',
      'scientific reporting',
    ],
    rate_min: 9500,
    rate_max: 18000,
    availability: {
      monday: [{ start: '07:00', end: '16:00' }],
      tuesday: [{ start: '07:00', end: '16:00' }],
      wednesday: [{ start: '07:00', end: '16:00' }],
      thursday: [{ start: '07:00', end: '16:00' }],
      friday: [{ start: '07:00', end: '14:00' }],
    },
    wallet_address: null,
    rating_average: 4.9,
    rating_count: 28,
    completed_bookings: 44,
    is_verified: true,
    human_legitimacy_score: 94,
    human_legitimacy_confidence: 0.97,
    social_links: {
      website: 'https://analog-research.org/showcase/elena-marquez',
      github: 'https://github.com/analogresearch-showcase/elena-marquez',
      linkedin: 'https://www.linkedin.com/in/elena-marquez-field-science/',
    },
  },
  {
    key: 'urban-heat-instrumentation',
    email: 'showcase.urban.heat.instrumentation@analog-research.org',
    name: 'Prof. Amina Okafor',
    bio: `I focus on urban heat-island measurement at the pedestrian scale: where people actually stand, wait, and walk. My work combines instrument setup, route design, and exposure mapping so data is useful for both climate analysis and public-health decisions.

I can deploy and audit mixed sensor stacks (fixed loggers plus mobile transects), run intercomparison checks, and deliver timestamped outputs with serial-number tracking, mounting photos, and uncertainty notes. If your protocol says "repeatable," I treat that as a non-negotiable requirement.

Background: professor of urban climate science with prior municipal heat-response consulting and summer field schools across the Midwest. I carry extra batteries like snacks; nobody gets stranded mid-run on my watch.

Schedule/travel note: during academic terms I am mainly available in Chicago Tuesday-Thursday. From late May through early August I can take assignments across the Great Lakes corridor and nearby rail-connected cities.`,
    avatar_url: null,
    location: 'Chicago, Illinois, USA',
    drive_radius_miles: 30,
    timezone: 'America/Chicago',
    skills: [
      'urban climate science',
      'sensor deployment',
      'thermal mapping',
      'data validation',
      'R programming',
      'field logistics',
    ],
    rate_min: 11000,
    rate_max: 21000,
    availability: {
      tuesday: [{ start: '08:00', end: '17:00' }],
      wednesday: [{ start: '08:00', end: '17:00' }],
      thursday: [{ start: '08:00', end: '17:00' }],
      saturday: [{ start: '09:00', end: '13:00' }],
    },
    wallet_address: null,
    rating_average: 4.8,
    rating_count: 17,
    completed_bookings: 31,
    is_verified: true,
    human_legitimacy_score: 92,
    human_legitimacy_confidence: 0.95,
    social_links: {
      website: 'https://analog-research.org/showcase/amina-okafor',
      github: 'https://github.com/analogresearch-showcase/amina-okafor',
      linkedin: 'https://www.linkedin.com/in/amina-okafor-urban-climate/',
      x: 'https://x.com/analogresearch_showcase',
    },
  },
  {
    key: 'remote-bioinformatics-verification',
    email: 'showcase.remote.bioinformatics@analog-research.org',
    name: 'Jordan Lee, MSc',
    bio: `I work at the handoff between field collection and analysis: the part where strong science can quietly break if metadata, controls, or file conventions drift. My role is to keep that handoff clean and reproducible through remote QA support.

I can review sample-handling SOPs before field day, validate sequence and metadata packages after upload, and return analysis-ready tables plus notebook-based QA notes. Typical fixes include taxonomy normalization, duplicate sample-ID repair, contamination control flagging, and methods traceability checks. I do not perform in-person sample pickup or site visits for this profile.

Background: MSc in computational biology, with mixed experience in wet-lab support and bioinformatics QA for microbiome and environmental DNA projects. If your headers look cursed, good news: I actually enjoy untangling them.

Schedule/travel note: profile location is accurate for winter (Colorado Front Range). In summer I typically work from coastal Maine and update location accordingly; remote workflows stay continuous year-round.`,
    avatar_url: null,
    location: 'Remote (US)',
    drive_radius_miles: 0,
    timezone: 'America/Denver',
    skills: [
      'bioinformatics QA',
      'microbiome analysis',
      'protocol compliance review',
      'python',
      'metadata normalization',
      'technical writing',
    ],
    rate_min: 8000,
    rate_max: 15000,
    availability: {
      monday: [{ start: '09:00', end: '18:00' }],
      wednesday: [{ start: '09:00', end: '18:00' }],
      friday: [{ start: '09:00', end: '18:00' }],
      sunday: [{ start: '10:00', end: '14:00' }],
    },
    wallet_address: null,
    rating_average: 4.7,
    rating_count: 13,
    completed_bookings: 22,
    is_verified: true,
    human_legitimacy_score: 90,
    human_legitimacy_confidence: 0.93,
    social_links: {
      website: 'https://analog-research.org/showcase/jordan-lee',
      github: 'https://github.com/analogresearch-showcase/jordan-lee',
    },
  },
]

export const SHOWCASE_BOUNTIES = [
  {
    key: 'microplastics-river-transects',
    title: 'Microplastics Transect Validation Across Urban Rivers (Q2 2026)',
    description: `Location: Denver metro watershed corridor (South Platte + Cherry Creek), Colorado, USA. On-site collection required.
Context: We have strong satellite-assisted estimates, but we need physical transect samples to verify concentration bands before publishing the next model update.

Thanks for looking at this project. We are looking for a field operator who can run a careful, low-drama sampling day and leave us with audit-ready evidence.

Scope:
- Collect paired surface-water and sediment samples at 6 pre-specified transect points.
- Capture timestamped site photos, weather context, and recent discharge notes.
- Run standardized field blanks and duplicate one site for QA replication.

Deliverables:
- Structured CSV with sample identifiers, coordinates, collection timestamps, and handling notes.
- Photo bundle tied to sample IDs.
- 1-2 page methods memo documenting deviations, contamination controls, and confidence limits.

Acceptance criteria:
- Complete metadata for every sample.
- No broken sample-ID links between photos and rows.
- QA fields present and interpretable for independent re-analysis.

Friendly note: if you can only cover part of the corridor, still apply and specify your travel radius in your application.`,
    skills_required: [
      'water quality sampling',
      'environmental QA/QC',
      'field documentation',
      'GIS ground truthing',
    ],
    budget_min: 85000,
    budget_max: 140000,
    currency: 'USD',
    pricing_mode: 'bid',
    fixed_spot_amount: null,
    preferred_payment_method: 'stripe',
    proof_review_mode: 'manual',
    spots_available: 4,
    spots_filled: 1,
    status: 'open',
    deadline: '2026-06-30T23:59:59Z',
    bounty_legitimacy_score: 95,
    bounty_legitimacy_confidence: 0.97,
    is_spam_suppressed: false,
  },
  {
    key: 'pollinator-nocturnal-light-spectra',
    title: 'Nocturnal Pollinator Activity Survey with Spectral Light Controls',
    description: `Location: Boulder-Longmont peri-urban habitat belt, Colorado, USA. Evening and night field windows required.
Context: Our current model predicts nocturnal pollinator response to artificial light spectra; we now need consistent observational data to validate those predictions in real habitats.

If this sounds like your kind of fieldwork, we would love your help. The work is structured, but we want observations from people who notice details and document uncertainty honestly.

Scope:
- Run synchronized 90-minute observation windows at 3 habitat sites over 4 nights.
- Log lux and spectral class for each observation block.
- Record species-level observations where possible; otherwise use agreed genus-level taxonomy.

Deliverables:
- Observation table including site, spectral condition, timestamps, taxa labels, and confidence tags.
- Short narrative on weather, disturbances, and observer uncertainty.
- Calibration check notes for all handheld light meters.

Acceptance criteria:
- Every observation row includes spectral condition and confidence tag.
- Site-level coverage complete across all required windows.
- Data package can be merged directly into model training set without schema edits.

Friendly note: precision matters more than speed here. If you are methodical, you are exactly who we want.`,
    skills_required: [
      'ecology field methods',
      'species observation',
      'experimental controls',
      'data logging',
    ],
    budget_min: 72000,
    budget_max: 72000,
    currency: 'USD',
    pricing_mode: 'fixed_per_spot',
    fixed_spot_amount: 24000,
    preferred_payment_method: 'crypto',
    proof_review_mode: 'llm_assisted',
    proof_review_prompt: 'Assess whether observation rows include spectral condition, confidence tag, and coherent timing for each site window. Flag inconsistencies and missing QA notes.',
    spots_available: 3,
    spots_filled: 0,
    status: 'open',
    deadline: '2026-07-15T23:59:59Z',
    bounty_legitimacy_score: 93,
    bounty_legitimacy_confidence: 0.95,
    is_spam_suppressed: false,
  },
  {
    key: 'air-quality-colocation-audit',
    title: 'Community Air-Quality Sensor Co-Location and Drift Audit',
    description: `Location: Berlin and Potsdam metro area (Germany). On-site co-location work required; nearby regional travel is acceptable.
Context: Community PM2.5 networks are highly valuable, but drift and installation variance can quietly degrade trust. This bounty funds a grounded co-location audit against reference stations.

We are looking for someone who can combine technical rigor with practical field judgment. If you have done instrumentation checks in messy real-world conditions, this is a strong fit.

Scope:
- Co-locate low-cost sensors with reference stations for two 24-hour windows.
- Capture installation orientation, airflow obstructions, and maintenance state.
- Report raw and corrected PM2.5 readings plus anomaly flags.

Deliverables:
- Time-indexed CSV with paired readings and calibration parameters.
- Site condition report with photos and mounting notes.
- Drift summary that calls out sensor-specific confidence and replacement recommendations.

Acceptance criteria:
- Paired time-series has no missing timestamps over active windows.
- Calibration method and coefficients are explicitly documented.
- Anomaly flags include rationale suitable for external audit.

Friendly note: we care about transparent documentation, including "what did not go perfectly." Honest logs are a plus, not a penalty.`,
    skills_required: [
      'air quality monitoring',
      'sensor calibration',
      'time-series QA',
      'technical reporting',
    ],
    budget_min: 60000,
    budget_max: 105000,
    currency: 'EUR',
    pricing_mode: 'bid',
    fixed_spot_amount: null,
    preferred_payment_method: 'stripe',
    proof_review_mode: 'manual',
    proof_review_prompt: null,
    spots_available: 2,
    spots_filled: 1,
    status: 'open',
    deadline: null,
    bounty_legitimacy_score: 91,
    bounty_legitimacy_confidence: 0.92,
    is_spam_suppressed: false,
  },
]
