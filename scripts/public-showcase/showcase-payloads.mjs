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
    bio: 'Coastal biogeochemist focused on nutrient flux, estuarine eutrophication, and field protocol design. I run reproducible sampling campaigns with chain-of-custody controls, calibration logs, and transparent QA/QC notes so downstream modelers can trust every measurement.',
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
    bio: 'Urban climate scientist specializing in heat-island instrumentation, pedestrian-level exposure mapping, and sensor intercomparison studies. I deliver publication-grade field notes with geospatial metadata, instrument serial tracking, and uncertainty summaries.',
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
    bio: 'Field-to-cloud microbiome analyst who combines on-site sample handling guidance with remote sequence validation and reproducible notebooks. I help teams close the loop from collection protocol to interpretable evidence with transparent assumptions and audit trails.',
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
    description: `Objective: validate microplastics concentration estimates produced by satellite-assisted watershed models using physically collected transect samples.

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
- QA fields present and interpretable for independent re-analysis.`,
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
    description: `Objective: produce repeatable observations of nocturnal pollinator activity under varied artificial light spectra in peri-urban habitats.

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
- Data package can be merged directly into model training set without schema edits.`,
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
    description: `Objective: assess drift and calibration stability in community-operated PM2.5 sensors via co-location against reference monitors.

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
- Anomaly flags include rationale suitable for external audit.`,
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
    spots_filled: 0,
    status: 'open',
    deadline: null,
    bounty_legitimacy_score: 91,
    bounty_legitimacy_confidence: 0.92,
    is_spam_suppressed: false,
  },
]
